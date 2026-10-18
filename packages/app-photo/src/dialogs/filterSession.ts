import { readRect, writeRect, type Bitmap } from '../model/bitmap'
import type { Layer } from '../model/doc'
import type { PhotoEditor } from '../model/editor'
import type { Mask } from '../model/mask'
import type { FilterId } from '../ops/filters'
import { editArea } from './adjustOps'

export const FILTER_FAILED = "The filter stopped unexpectedly. Your image wasn't changed."
export const PREVIEW_DELAY = 150

/** `runFilter`'s shape (injected so the session can be tested without a Worker). */
export type FilterRunner = (
  id: FilterId,
  b: Bitmap,
  params: Record<string, number>,
  mask: Mask | null,
  offset: { x: number; y: number },
  signal: AbortSignal
) => Promise<Bitmap>

/** Hands out request tokens; only the newest one is current, so late results can be told apart. */
export class Latest {
  private n = 0
  next(): number {
    return ++this.n
  }
  current(token: number): boolean {
    return token === this.n
  }
  /** Make every token handed out so far stale. */
  invalidate(): void {
    this.n++
  }
}

export interface FilterSessionOptions {
  editor: PhotoEditor
  layer: Layer
  id: FilterId
  /** History label. */
  title: string
  run: FilterRunner
  /** Redraw after the layer's pixels were swapped (no history step). */
  refresh: () => void
  onError: (message: string) => void
  /** True while Apply waits for the filter. */
  onBusy?: (busy: boolean) => void
}

const keyOf = (p: Record<string, number>): string => JSON.stringify(Object.entries(p).sort(([a], [b]) => a.localeCompare(b)))

/**
 * One open filter dialog. Previews run (debounced) off the main thread and are shown by swapping
 * the layer's `pixels` for the result, outside history; the original bitmap is never written until
 * Apply, which writes the result into it as ONE step over the selection's bounds (or the whole
 * layer). A newer request supersedes an older one: the older run is aborted and its result ignored.
 * Cancel puts the original bitmap back. The selection and the layer offset are fixed for the session.
 */
export class FilterSession {
  readonly original: Bitmap
  private readonly mask: Mask | null
  private readonly offset: { x: number; y: number }
  private readonly latest = new Latest()
  private timer: ReturnType<typeof setTimeout> | undefined
  private abort: AbortController | null = null
  private shown: { key: string; result: Bitmap } | null = null
  private closed = false

  constructor(private readonly o: FilterSessionOptions) {
    this.original = o.layer.pixels
    this.mask = o.editor.doc.selection
    this.offset = { x: o.layer.x, y: o.layer.y }
  }

  /** The layer's real pixels, also while a preview is shown (for saving). */
  get originalPixels(): Bitmap {
    return this.original
  }

  get layerId(): string {
    return this.o.layer.id
  }

  /** True while the layer shows a preview instead of its own pixels. */
  get previewing(): boolean {
    return this.o.layer.pixels !== this.original
  }

  /** New settings: preview them after PREVIEW_DELAY ms unless more arrive first. */
  update(params: Record<string, number>): void {
    if (this.closed) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.preview(params), PREVIEW_DELAY)
  }

  /** Run the filter for `params` as the newest request; null when it was superseded, cancelled or failed. */
  private async compute(params: Record<string, number>): Promise<Bitmap | null> {
    const key = keyOf(params)
    if (this.shown?.key === key) return this.shown.result
    const token = this.latest.next()
    this.abort?.abort()
    const ac = new AbortController()
    this.abort = ac
    try {
      const result = await this.o.run(this.o.id, this.original, params, this.mask, this.offset, ac.signal)
      if (this.closed || !this.latest.current(token)) return null
      this.shown = { key, result }
      return result
    } catch {
      if (this.closed || !this.latest.current(token)) return null
      this.restore()
      this.o.onError(FILTER_FAILED)
      return null
    } finally {
      if (this.abort === ac) this.abort = null
    }
  }

  private async preview(params: Record<string, number>): Promise<void> {
    const result = await this.compute(params)
    if (!result || this.closed) return
    this.o.layer.pixels = result
    this.o.refresh()
  }

  /**
   * Commit `params` as one history step. Resolves true when the session is finished (the step was
   * recorded, or the selection misses the layer so there was nothing to change), false when it was
   * cancelled, superseded or failed (the dialog stays open after a failure).
   */
  async apply(params: Record<string, number>): Promise<boolean> {
    if (this.closed) return false
    clearTimeout(this.timer)
    this.o.onBusy?.(true)
    let result: Bitmap | null
    try {
      result = await this.compute(params)
    } finally {
      this.o.onBusy?.(false)
    }
    if (!result || this.closed) return false
    this.closed = true
    // A preview still in flight for other settings is no longer wanted.
    this.latest.invalidate()
    this.abort?.abort()
    this.o.layer.pixels = this.original
    const area = editArea(this.o.editor.doc, this.o.layer)
    if (!area) {
      this.o.refresh()
      return true
    }
    const out = result
    this.o.editor.editPixels(this.o.title, this.o.layer.id, area, (px) => writeRect(px, area, readRect(out, area)))
    return true
  }

  /** Close without changing anything: stop work in flight and put the original pixels back. */
  cancel(): void {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.timer)
    this.latest.invalidate()
    this.abort?.abort()
    this.abort = null
    this.restore()
  }

  private restore(): void {
    if (this.o.layer.pixels === this.original) return
    this.o.layer.pixels = this.original
    this.o.refresh()
  }
}
