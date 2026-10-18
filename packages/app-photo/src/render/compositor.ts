import type { Rect } from '../model/bitmap'
import type { Layer, PhotoDoc } from '../model/doc'
import type { Mask } from '../model/mask'
import { CpuCompositor } from './CpuCompositor'
import { GlCompositor } from './gl/GlCompositor'
import type { ViewState } from './view'

/**
 * A live adjustment shown on one layer while its dialog is open, without touching the layer's pixels.
 * `mask` is document-sized (usually the selection); without it the whole layer is adjusted.
 * Curves and levels arrive as `lut` (from curvesLut / levelsLut).
 */
export type Preview = { layerId: string; mask?: Mask | null } & (
  | { kind: 'lut'; lut: Uint8Array }
  | { kind: 'bc'; brightness: number; contrast: number }
  | { kind: 'hsl'; hue: number; saturation: number; lightness: number }
  | { kind: 'invert' }
  | { kind: 'bw' }
)

export interface Compositor {
  /**
   * Tell the compositor a layer's pixels changed (or the layer is new). `dirty` is in the layer's own
   * pixel coordinates; without it the whole layer is re-read. A layer whose `pixels` object was
   * replaced is noticed by `render` on its own; in-place edits need this call.
   */
  syncLayer(layer: Layer, dirty?: Rect): void
  /** Forget a layer's cached pixels (GPU texture). Layers missing from the doc are also dropped on render. */
  dropLayer(id: string): void
  /**
   * Draw `doc` into the canvas through `view`. The canvas backing store is resized to view.viewW x viewH.
   * Re-composites only when layers or the preview changed; a pan/zoom-only change just redraws.
   */
  render(doc: PhotoDoc, view: ViewState, preview?: Preview): void
  dispose(): void
  readonly kind: 'gl' | 'cpu'
}

/** What `createCompositor` returns: a Compositor plus the canvas currently showing the picture. */
export interface ManagedCompositor extends Compositor {
  /**
   * The canvas on screen right now. It is the caller's canvas, except while drawing falls back to the
   * CPU after a WebGL context was already acquired on it (a canvas cannot switch context type): then
   * it is a stand-in canvas inserted right after the caller's one, with the same class, style and
   * data-testid, while the caller's canvas is hidden. Attach pointer handlers to a wrapping element,
   * not to the canvas, so they keep working across the swap.
   */
  readonly canvas: HTMLCanvasElement
}

export const CONTEXT_LOST_MESSAGE =
  'The graphics card stopped responding, so Photo switched to a slower drawing mode. Your work is safe.'
export const NO_WEBGL_MESSAGE = "Photo couldn't use the graphics card, so it is using a slower drawing mode. Your work is safe."

const GL_OPTIONS: WebGLContextAttributes = { preserveDrawingBuffer: true, premultipliedAlpha: false }

/**
 * WebGL2 compositor when `canvas.getContext('webgl2', …)` works, CPU (Canvas 2D) otherwise.
 * On `webglcontextlost` it swaps in a CPU compositor on a stand-in canvas (see ManagedCompositor.canvas)
 * and calls `onFallback(CONTEXT_LOST_MESSAGE)`; on `webglcontextrestored` it rebuilds GL on the original
 * canvas, re-syncs every known layer and redraws the last frame.
 * If WebGL2 is unavailable from the start, `onFallback(NO_WEBGL_MESSAGE)` is called once, synchronously.
 */
export function createCompositor(canvas: HTMLCanvasElement, onFallback: (reason: string) => void): ManagedCompositor {
  return new SwitchingCompositor(canvas, onFallback)
}

const MIRRORED_ATTRS = ['class', 'style', 'data-testid']

class SwitchingCompositor implements ManagedCompositor {
  private impl: Compositor
  private standIn: HTMLCanvasElement | null = null
  private standInActive = false
  private savedDisplay = ''
  private readonly layers = new Map<string, Layer>()
  private last: { doc: PhotoDoc; view: ViewState; preview?: Preview } | null = null
  private disposed = false

  constructor(
    private readonly original: HTMLCanvasElement,
    private readonly onFallback: (reason: string) => void
  ) {
    const gl = original.getContext('webgl2', GL_OPTIONS)
    let impl: Compositor | null = null
    if (gl) {
      try {
        impl = new GlCompositor(gl)
      } catch (e) {
        console.warn('Photo: WebGL2 compositor failed to start', e)
      }
    }
    if (impl) {
      this.impl = impl
    } else {
      // A canvas that handed out a WebGL context can't give a 2D one.
      this.impl = new CpuCompositor(gl ? this.showStandIn() : original)
      onFallback(NO_WEBGL_MESSAGE)
    }
    original.addEventListener('webglcontextlost', this.onLost)
    original.addEventListener('webglcontextrestored', this.onRestored)
  }

  get kind(): 'gl' | 'cpu' {
    return this.impl.kind
  }

  get canvas(): HTMLCanvasElement {
    return this.standIn && this.standInActive ? this.standIn : this.original
  }

  syncLayer(layer: Layer, dirty?: Rect): void {
    this.layers.set(layer.id, layer)
    this.impl.syncLayer(layer, dirty)
  }

  dropLayer(id: string): void {
    this.layers.delete(id)
    this.impl.dropLayer(id)
  }

  render(doc: PhotoDoc, view: ViewState, preview?: Preview): void {
    if (this.disposed) return
    this.last = { doc, view, preview }
    // The layers to re-sync if the GL context comes back: exactly the document's.
    this.layers.clear()
    for (const l of doc.layers) this.layers.set(l.id, l)
    this.impl.render(doc, view, preview)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.original.removeEventListener('webglcontextlost', this.onLost)
    this.original.removeEventListener('webglcontextrestored', this.onRestored)
    this.impl.dispose()
    this.hideStandIn()
    this.standIn?.remove()
    this.standIn = null
    this.layers.clear()
    this.last = null
  }

  private readonly onLost = (e: Event): void => {
    e.preventDefault() // lets the browser restore the context later
    if (this.disposed || this.impl.kind !== 'gl') return
    this.impl.dispose()
    this.impl = new CpuCompositor(this.showStandIn())
    this.onFallback(CONTEXT_LOST_MESSAGE)
    this.redraw()
  }

  private readonly onRestored = (): void => {
    if (this.disposed) return
    const gl = this.original.getContext('webgl2', GL_OPTIONS)
    if (!gl) return
    let next: GlCompositor
    try {
      next = new GlCompositor(gl)
    } catch (e) {
      console.warn('Photo: WebGL2 compositor failed to restart', e)
      return
    }
    for (const l of this.layers.values()) next.syncLayer(l)
    this.impl.dispose()
    this.impl = next
    this.hideStandIn()
    this.redraw()
  }

  private redraw(): void {
    if (this.last) this.impl.render(this.last.doc, this.last.view, this.last.preview)
  }

  /** Show the 2D stand-in canvas in place of the original (created on first use). */
  private showStandIn(): HTMLCanvasElement {
    const o = this.original
    if (!this.standIn) {
      this.standIn = o.ownerDocument.createElement('canvas')
      o.after(this.standIn)
    }
    const s = this.standIn
    if (this.standInActive) return s
    for (const a of MIRRORED_ATTRS) {
      const v = o.getAttribute(a)
      if (v === null) s.removeAttribute(a)
      else s.setAttribute(a, v)
    }
    // Move the test id so exactly one element carries it.
    if (o.dataset.testid !== undefined) {
      o.dataset.glTestid = o.dataset.testid
      delete o.dataset.testid
    }
    s.width = o.width
    s.height = o.height
    // Inline display (not the `hidden` attribute) so author CSS can't override it.
    this.savedDisplay = o.style.display
    o.style.display = 'none'
    this.standInActive = true
    return s
  }

  private hideStandIn(): void {
    const o = this.original
    if (!this.standIn || !this.standInActive) return
    this.standInActive = false
    this.standIn.style.display = 'none'
    this.standIn.removeAttribute('data-testid')
    if (o.dataset.glTestid !== undefined) {
      o.dataset.testid = o.dataset.glTestid
      delete o.dataset.glTestid
    }
    o.style.display = this.savedDisplay
  }
}
