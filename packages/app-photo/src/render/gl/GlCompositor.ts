import { intersectRect, type Bitmap, type Rect } from '../../model/bitmap'
import type { Layer, PhotoDoc } from '../../model/doc'
import type { Mask } from '../../model/mask'
import { brightnessContrastLut } from '../../ops/adjust'
import { BLEND_MODES } from '../../ops/blend'
import type { Compositor, Preview } from '../compositor'
import { compositeSignature } from '../signature'
import { tileRects } from '../tiles'
import type { ViewState } from '../view'
import { ADJUST_KIND, COMPOSITE_FS, SCREEN_FS, VERTEX_SHADER } from './shaders'

interface TexTile {
  /** Rect within the layer (layer tiles) or document (doc tiles). */
  rect: Rect
  tex: WebGLTexture
}

interface LayerTex {
  pixels: Bitmap
  width: number
  height: number
  tiles: TexTile[]
}

interface DocTile {
  rect: Rect
  /** Ping-pong pair; `front` holds the composite so far. */
  tex: [WebGLTexture, WebGLTexture]
  front: 0 | 1
  /** R8 copy of the preview mask covering this tile. */
  mask: WebGLTexture | null
}

type Uniforms = Record<string, WebGLUniformLocation | null>

const COMPOSITE_UNIFORMS = [
  'u_rect',
  'u_target',
  'u_backdrop',
  'u_layer',
  'u_layerOrigin',
  'u_layerSize',
  'u_opacity',
  'u_mode',
  'u_adjust',
  'u_lut',
  'u_hsl',
  'u_hasMask',
  'u_mask'
]
const SCREEN_UNIFORMS = ['u_rect', 'u_target', 'u_comp', 'u_pan', 'u_zoom', 'u_viewSize', 'u_tile', 'u_grid']

// Texture units. The composite target is never bound to any of them while it is drawn into.
const UNIT_BACKDROP = 0
const UNIT_LAYER = 1
const UNIT_LUT = 2
const UNIT_MASK = 3
/** Used for creating and uploading textures, so no sampler unit is disturbed. */
const UNIT_SCRATCH = 4

/**
 * WebGL2 compositor. Layers live in RGBA8 textures (split into tiles past MAX_TEXTURE_SIZE). The visible
 * layers are composited bottom to top in DOCUMENT space into document-sized targets (also tiled),
 * ping-ponging between two RGBA16F textures per tile so precision matches the CPU's float accumulation
 * (RGBA8 when EXT_color_buffer_float is missing). The blend is done in the shader from the backdrop
 * texture, not with fixed-function blending. The result is then drawn to the canvas through the view.
 * Compositing only reruns when layers or the preview change; pan/zoom just redraws the final pass.
 */
export class GlCompositor implements Compositor {
  readonly kind = 'gl' as const
  /** True when composite targets are RGBA16F (false: RGBA8 fallback). */
  readonly floatTargets: boolean
  readonly maxTile: number
  private readonly compositeProg: WebGLProgram
  private readonly screenProg: WebGLProgram
  private readonly cu: Uniforms
  private readonly su: Uniforms
  private readonly vao: WebGLVertexArrayObject
  private readonly quad: WebGLBuffer
  private readonly fbo: WebGLFramebuffer
  private readonly lutTex: WebGLTexture
  private readonly layers = new Map<string, LayerTex>()
  private docTiles: DocTile[] = []
  private docW = -1
  private docH = -1
  private maskRef: Mask | null = null
  private version = 0
  private compositeKey = ''

  constructor(
    private readonly gl: WebGL2RenderingContext,
    opts: { maxTileSize?: number } = {}
  ) {
    const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array
    this.maxTile = Math.min(
      opts.maxTileSize ?? Infinity,
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      vp[0],
      vp[1]
    )
    this.compositeProg = program(gl, VERTEX_SHADER, COMPOSITE_FS)
    this.screenProg = program(gl, VERTEX_SHADER, SCREEN_FS)
    this.cu = uniforms(gl, this.compositeProg, COMPOSITE_UNIFORMS)
    this.su = uniforms(gl, this.screenProg, SCREEN_UNIFORMS)
    gl.useProgram(this.compositeProg)
    gl.uniform1i(this.cu.u_backdrop, UNIT_BACKDROP)
    gl.uniform1i(this.cu.u_layer, UNIT_LAYER)
    gl.uniform1i(this.cu.u_lut, UNIT_LUT)
    gl.uniform1i(this.cu.u_mask, UNIT_MASK)
    gl.useProgram(this.screenProg)
    gl.uniform1i(this.su.u_comp, UNIT_BACKDROP)

    this.quad = gl.createBuffer()!
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    this.fbo = gl.createFramebuffer()!
    this.floatTargets = this.probeFloatTargets()
    this.lutTex = this.newTexture()
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.SCISSOR_TEST)
  }

  syncLayer(layer: Layer, dirty?: Rect): void {
    const gl = this.gl
    if (gl.isContextLost()) return
    this.version++
    const px = layer.pixels
    const old = this.layers.get(layer.id)
    if (!old || old.width !== px.width || old.height !== px.height) {
      if (old) this.freeLayer(old)
      const tiles = tileRects(px.width, px.height, this.maxTile).map((rect) => {
        const tex = this.newTexture()
        this.uploadRgba(px, rect, rect, true)
        return { rect, tex }
      })
      this.layers.set(layer.id, { pixels: px, width: px.width, height: px.height, tiles })
      return
    }
    old.pixels = px
    const full = { x: 0, y: 0, width: px.width, height: px.height }
    const area = dirty ? intersectRect(dirty, full) : full
    if (!area) return
    for (const t of old.tiles) {
      const sub = intersectRect(area, t.rect)
      if (!sub) continue
      gl.activeTexture(gl.TEXTURE0 + UNIT_SCRATCH)
      gl.bindTexture(gl.TEXTURE_2D, t.tex)
      this.uploadRgba(px, sub, t.rect, false)
    }
  }

  dropLayer(id: string): void {
    const l = this.layers.get(id)
    if (!l) return
    this.freeLayer(l)
    this.layers.delete(id)
    this.version++
  }

  render(doc: PhotoDoc, view: ViewState, preview?: Preview): void {
    const gl = this.gl
    if (gl.isContextLost()) return
    // Pick up layers the caller never synced, or whose bitmap was swapped (undo, crop…), and drop strays.
    const present = new Set<string>()
    for (const l of doc.layers) {
      present.add(l.id)
      if (this.layers.get(l.id)?.pixels !== l.pixels) this.syncLayer(l)
    }
    for (const id of [...this.layers.keys()]) if (!present.has(id)) this.dropLayer(id)
    this.ensureDocTiles(doc.width, doc.height)

    const key = compositeSignature(doc, preview, this.version)
    if (key !== this.compositeKey) {
      this.composite(doc, preview)
      this.compositeKey = key
    }
    this.drawScreen(view)
  }

  dispose(): void {
    const gl = this.gl
    for (const l of this.layers.values()) this.freeLayer(l)
    this.layers.clear()
    this.freeDocTiles()
    gl.deleteTexture(this.lutTex)
    gl.deleteFramebuffer(this.fbo)
    gl.deleteBuffer(this.quad)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.compositeProg)
    gl.deleteProgram(this.screenProg)
  }

  // ---- compositing ----

  private composite(doc: PhotoDoc, preview: Preview | undefined): void {
    const gl = this.gl
    const u = this.cu
    gl.useProgram(this.compositeProg)
    gl.bindVertexArray(this.vao)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)

    const adjust = this.prepareAdjust(doc, preview)
    gl.uniform1i(u.u_hasMask, adjust.mask ? 1 : 0)

    for (const tile of this.docTiles) {
      const { width: tw, height: th } = tile.rect
      gl.viewport(0, 0, tw, th)
      gl.uniform4f(u.u_rect, 0, 0, tw, th)
      gl.uniform2f(u.u_target, tw, th)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tile.tex[tile.front], 0)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (adjust.mask) {
        gl.activeTexture(gl.TEXTURE0 + UNIT_MASK)
        gl.bindTexture(gl.TEXTURE_2D, tile.mask)
      }

      for (const layer of doc.layers) {
        if (!layer.visible || layer.opacity <= 0) continue
        const lt = this.layers.get(layer.id)
        if (!lt) continue
        gl.uniform1f(u.u_opacity, layer.opacity)
        gl.uniform1i(u.u_mode, BLEND_MODES.indexOf(layer.blend))
        gl.uniform1i(u.u_adjust, layer.id === adjust.layerId ? adjust.kind : ADJUST_KIND.none)
        for (const part of lt.tiles) {
          const docRect = { x: layer.x + part.rect.x, y: layer.y + part.rect.y, width: part.rect.width, height: part.rect.height }
          if (!intersectRect(docRect, tile.rect)) continue
          const dst = tile.front === 0 ? 1 : 0
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tile.tex[dst], 0)
          gl.activeTexture(gl.TEXTURE0 + UNIT_BACKDROP)
          gl.bindTexture(gl.TEXTURE_2D, tile.tex[tile.front])
          gl.activeTexture(gl.TEXTURE0 + UNIT_LAYER)
          gl.bindTexture(gl.TEXTURE_2D, part.tex)
          gl.uniform2i(u.u_layerOrigin, docRect.x - tile.rect.x, docRect.y - tile.rect.y)
          gl.uniform2i(u.u_layerSize, docRect.width, docRect.height)
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
          tile.front = dst
        }
      }
    }
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindVertexArray(null)
  }

  /** Upload the LUT / mask the preview needs and set its uniforms. */
  private prepareAdjust(doc: PhotoDoc, preview: Preview | undefined): { layerId: string | null; kind: number; mask: boolean } {
    const gl = this.gl
    const target = preview && doc.layers.find((l) => l.id === preview.layerId)
    if (!preview || !target) return { layerId: null, kind: ADJUST_KIND.none, mask: false }
    let kind: number
    switch (preview.kind) {
      case 'lut':
      case 'bc': {
        kind = ADJUST_KIND.lut
        const lut = preview.kind === 'lut' ? preview.lut : brightnessContrastLut(preview)
        gl.activeTexture(gl.TEXTURE0 + UNIT_LUT)
        gl.bindTexture(gl.TEXTURE_2D, this.lutTex)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, lut.subarray(0, 256))
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
        break
      }
      case 'hsl':
        kind = ADJUST_KIND.hsl
        // Same derived values as hueSaturation in ops/adjust.ts.
        gl.uniform3f(this.cu.u_hsl, preview.hue / 360, 1 + preview.saturation / 100, preview.lightness / 100)
        break
      case 'invert':
        kind = ADJUST_KIND.invert
        break
      case 'bw':
        kind = ADJUST_KIND.bw
        break
    }
    const mask = preview.mask ?? null
    if (mask && mask !== this.maskRef) this.uploadMask(mask)
    return { layerId: preview.layerId, kind, mask: !!mask }
  }

  /** Copy the mask into one R8 texture per document tile; cells outside the mask are 0. */
  private uploadMask(mask: Mask): void {
    const gl = this.gl
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    for (const tile of this.docTiles) {
      const { x, y, width: w, height: h } = tile.rect
      const buf = new Uint8Array(w * h)
      const cols = Math.min(w, mask.width - x)
      if (cols > 0) {
        for (let row = 0; row < h && y + row < mask.height; row++) {
          const s = (y + row) * mask.width + x
          buf.set(mask.data.subarray(s, s + cols), row * w)
        }
      }
      tile.mask ??= this.newTexture()
      gl.activeTexture(gl.TEXTURE0 + UNIT_SCRATCH)
      gl.bindTexture(gl.TEXTURE_2D, tile.mask)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, buf)
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    this.maskRef = mask
  }

  // ---- final pass ----

  private drawScreen(view: ViewState): void {
    const gl = this.gl
    const canvas = gl.canvas
    const vw = Math.max(1, Math.round(view.viewW))
    const vh = Math.max(1, Math.round(view.viewH))
    if (canvas.width !== vw) canvas.width = vw
    if (canvas.height !== vh) canvas.height = vh
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, vw, vh)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const u = this.su
    const z = view.zoom
    gl.useProgram(this.screenProg)
    gl.bindVertexArray(this.vao)
    gl.uniform2f(u.u_target, vw, vh)
    gl.uniform2f(u.u_viewSize, vw, vh)
    gl.uniform2f(u.u_pan, view.panX, view.panY)
    gl.uniform1f(u.u_zoom, z)
    gl.uniform1i(u.u_grid, z >= 8 ? 1 : 0)
    const filter = z >= 1 ? gl.NEAREST : gl.LINEAR
    gl.activeTexture(gl.TEXTURE0 + UNIT_BACKDROP)
    for (const tile of this.docTiles) {
      const r = tile.rect
      const sx = view.panX + r.x * z
      const sy = view.panY + r.y * z
      const sw = r.width * z
      const sh = r.height * z
      if (sx >= vw || sy >= vh || sx + sw <= 0 || sy + sh <= 0) continue
      gl.bindTexture(gl.TEXTURE_2D, tile.tex[tile.front])
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
      gl.uniform4f(u.u_tile, r.x, r.y, r.width, r.height)
      gl.uniform4f(u.u_rect, sx, sy, sw, sh)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    gl.bindVertexArray(null)
  }

  // ---- resources ----

  private ensureDocTiles(w: number, h: number): void {
    if (w === this.docW && h === this.docH) return
    const gl = this.gl
    this.freeDocTiles()
    this.docW = w
    this.docH = h
    this.compositeKey = ''
    const fmt = this.floatTargets ? ([gl.RGBA16F, gl.HALF_FLOAT] as const) : ([gl.RGBA8, gl.UNSIGNED_BYTE] as const)
    this.docTiles = tileRects(w, h, this.maxTile).map((rect) => {
      const make = () => {
        const t = this.newTexture()
        gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], rect.width, rect.height, 0, gl.RGBA, fmt[1], null)
        return t
      }
      return { rect, tex: [make(), make()], front: 0, mask: null }
    })
  }

  private freeDocTiles(): void {
    const gl = this.gl
    for (const t of this.docTiles) {
      gl.deleteTexture(t.tex[0])
      gl.deleteTexture(t.tex[1])
      if (t.mask) gl.deleteTexture(t.mask)
    }
    this.docTiles = []
    this.maskRef = null
  }

  private freeLayer(l: LayerTex): void {
    for (const t of l.tiles) this.gl.deleteTexture(t.tex)
  }

  /** New NEAREST, clamped 2D texture, left bound to TEXTURE_2D on the scratch unit (now active). */
  private newTexture(): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0 + UNIT_SCRATCH)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  /**
   * Upload `sub` (layer coordinates) of `px` into the texture bound to TEXTURE_2D, whose texel (0,0)
   * is layer pixel (tile.x, tile.y). `alloc` (re)defines the texture as sub's size.
   */
  private uploadRgba(px: Bitmap, sub: Rect, tile: Rect, alloc: boolean): void {
    const gl = this.gl
    const data = new Uint8Array(px.data.buffer, px.data.byteOffset, px.data.length)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, px.width)
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, sub.x)
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, sub.y)
    if (alloc) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sub.width, sub.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, sub.x - tile.x, sub.y - tile.y, sub.width, sub.height, gl.RGBA, gl.UNSIGNED_BYTE, data)
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0)
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0)
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0)
  }

  /** RGBA16F render targets need EXT_color_buffer_float and a complete framebuffer. */
  private probeFloatTargets(): boolean {
    const gl = this.gl
    if (!gl.getExtension('EXT_color_buffer_float')) return false
    const t = this.newTexture()
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteTexture(t)
    return ok
  }
}

function shader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s)
    gl.deleteShader(s)
    throw new Error(`Shader compile failed: ${log}`)
  }
  return s
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!
  const v = shader(gl, gl.VERTEX_SHADER, vs)
  const f = shader(gl, gl.FRAGMENT_SHADER, fs)
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.bindAttribLocation(p, 0, 'a_pos')
  gl.linkProgram(p)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p)
    gl.deleteProgram(p)
    throw new Error(`Shader link failed: ${log}`)
  }
  return p
}

function uniforms(gl: WebGL2RenderingContext, p: WebGLProgram, names: string[]): Uniforms {
  const out: Uniforms = {}
  for (const n of names) out[n] = gl.getUniformLocation(p, n)
  return out
}
