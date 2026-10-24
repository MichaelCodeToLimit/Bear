import { intersectRect, readRect, type Rect } from '../model/bitmap'
import type { Layer, PhotoDoc } from '../model/doc'
import { applyLut, blackAndWhite, brightnessContrast, hueSaturation, invert } from '../ops/adjust'
import { compositeLayers } from '../ops/composite'
import type { Compositor, Preview } from './compositor'
import { compositeSignature } from './signature'
import { visibleDocRect, type ViewState } from './view'

export const CHECKER_LIGHT = '#ffffff'
export const CHECKER_DARK = '#cccccc'
export const GRID_COLOR = 'rgba(128, 128, 128, 0.35)'

const contains = (a: Rect, b: Rect) => b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height

/**
 * Canvas 2D fallback. Composites with the CPU reference (`compositeLayers`) into an ImageData for the
 * visible document region (padded by half a view each side so small pans reuse it), caches that until
 * the layers or the preview change, then draws it through the view over the checkerboard.
 */
export class CpuCompositor implements Compositor {
  readonly kind = 'cpu' as const
  private readonly ctx: CanvasRenderingContext2D
  private readonly buffer: HTMLCanvasElement
  private version = 0
  private cache: { key: string; region: Rect } | null = null
  private pattern: CanvasPattern | null = null

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    this.ctx = ctx
    this.buffer = canvas.ownerDocument.createElement('canvas')
  }

  syncLayer(_layer: Layer, _dirty?: Rect): void {
    this.version++
  }

  dropLayer(_id: string): void {
    this.version++
  }

  render(doc: PhotoDoc, view: ViewState, preview?: Preview): void {
    const { canvas, ctx } = this
    const vw = Math.max(1, Math.round(view.viewW))
    const vh = Math.max(1, Math.round(view.viewH))
    if (canvas.width !== vw) canvas.width = vw
    if (canvas.height !== vh) canvas.height = vh
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, vw, vh)

    const visible = visibleDocRect(doc.width, doc.height, view)
    if (!visible) return
    const key = compositeSignature(doc, preview, this.version)
    if (!this.cache || this.cache.key !== key || !contains(this.cache.region, visible)) {
      const padX = Math.ceil(visible.width / 2)
      const padY = Math.ceil(visible.height / 2)
      const region = intersectRect(
        { x: visible.x - padX, y: visible.y - padY, width: visible.width + 2 * padX, height: visible.height + 2 * padY },
        { x: 0, y: 0, width: doc.width, height: doc.height }
      )!
      const bmp = compositeLayers(withPreview(doc.layers, region, preview), doc.width, doc.height, region)
      this.buffer.width = region.width
      this.buffer.height = region.height
      this.buffer.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(bmp.data.buffer as ArrayBuffer), region.width, region.height), 0, 0)
      this.cache = { key, region }
    }

    // Checkerboard under the visible document, anchored to the canvas so it stays put while panning.
    const z = view.zoom
    const sx0 = Math.max(0, view.panX)
    const sy0 = Math.max(0, view.panY)
    const sx1 = Math.min(vw, view.panX + doc.width * z)
    const sy1 = Math.min(vh, view.panY + doc.height * z)
    ctx.fillStyle = this.checker()
    ctx.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0)

    const r = this.cache.region
    ctx.imageSmoothingEnabled = z < 1
    ctx.drawImage(this.buffer, view.panX + r.x * z, view.panY + r.y * z, r.width * z, r.height * z)

    if (z >= 8) {
      ctx.fillStyle = GRID_COLOR
      for (let x = visible.x; x <= visible.x + visible.width; x++) ctx.fillRect(Math.floor(view.panX + x * z), sy0, 1, sy1 - sy0)
      for (let y = visible.y; y <= visible.y + visible.height; y++) ctx.fillRect(sx0, Math.floor(view.panY + y * z), sx1 - sx0, 1)
    }
  }

  dispose(): void {
    this.cache = null
    this.buffer.width = 0
    this.buffer.height = 0
  }

  private checker(): CanvasPattern {
    if (!this.pattern) {
      const tile = this.canvas.ownerDocument.createElement('canvas')
      tile.width = 16
      tile.height = 16
      const t = tile.getContext('2d')!
      t.fillStyle = CHECKER_LIGHT
      t.fillRect(0, 0, 16, 16)
      t.fillStyle = CHECKER_DARK
      t.fillRect(8, 0, 8, 8)
      t.fillRect(0, 8, 8, 8)
      this.pattern = this.ctx.createPattern(tile, 'repeat')!
    }
    return this.pattern
  }
}

/**
 * The layers to composite for `region`. The preview layer is replaced by an adjusted copy of just the
 * part of it inside the region (the adjustment never touches the real pixels).
 */
function withPreview(layers: Layer[], region: Rect, preview: Preview | undefined): Layer[] {
  if (!preview) return layers
  return layers.map((l) => {
    if (l.id !== preview.layerId || !l.visible || l.opacity <= 0) return l
    const local = intersectRect({ x: region.x - l.x, y: region.y - l.y, width: region.width, height: region.height }, {
      x: 0,
      y: 0,
      width: l.pixels.width,
      height: l.pixels.height
    })
    if (!local) return l
    const pixels = readRect(l.pixels, local)
    const offset = { x: l.x + local.x, y: l.y + local.y }
    const mask = preview.mask ?? null
    switch (preview.kind) {
      case 'lut':
        applyLut(pixels, preview.lut, mask, offset)
        break
      case 'bc':
        brightnessContrast(pixels, preview, mask, offset)
        break
      case 'hsl':
        hueSaturation(pixels, preview, mask, offset)
        break
      case 'invert':
        invert(pixels, mask, offset)
        break
      case 'bw':
        blackAndWhite(pixels, mask, offset)
        break
    }
    return { ...l, x: offset.x, y: offset.y, pixels }
  })
}
