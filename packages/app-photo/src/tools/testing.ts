import { createBitmap } from '../model/bitmap'
import { createDoc, type PhotoDoc } from '../model/doc'
import { PhotoEditor } from '../model/editor'
import type { ViewState } from '../render/view'
import { defaultOptions } from './index'
import type { Overlay, Tool, ToolColors, ToolContext, ToolPointer } from './types'

export interface FakeContext extends ToolContext {
  statuses: string[]
  overlay: Overlay | null
  refreshes: number
}

/**
 * A ToolContext for Node tests: a real PhotoEditor over `doc` (default 20×20 transparent), a 1:1 view
 * (screen = doc coordinates), and recorders for status messages, overlays and refreshes.
 */
export function fakeContext(doc: PhotoDoc = createDoc(20, 20, 'transparent'), tool?: Tool, options: Record<string, unknown> = {}): FakeContext {
  const ctx: FakeContext = {
    editor: new PhotoEditor(doc),
    options: { ...(tool ? defaultOptions(tool) : {}), ...options },
    colors: { fg: [0, 0, 0, 255], bg: [255, 255, 255, 255] },
    setColors(c: ToolColors) {
      ctx.colors = c
    },
    view: { zoom: 1, panX: 0, panY: 0, viewW: 200, viewH: 200 } as ViewState,
    setView(v: ViewState) {
      ctx.view = v
    },
    statuses: [],
    overlay: null,
    refreshes: 0,
    setOverlay(o) {
      ctx.overlay = o
    },
    status(msg) {
      ctx.statuses.push(msg)
    },
    refresh() {
      ctx.refreshes++
    },
    rasterizeText: () => createBitmap(1, 1)
  }
  return ctx
}

/** A pointer at document (x, y); the screen position follows the context's view. */
export function at(ctx: ToolContext, x: number, y: number, mods: Partial<ToolPointer> = {}): ToolPointer {
  const { zoom, panX, panY } = ctx.view
  return { x, y, sx: x * zoom + panX, sy: y * zoom + panY, shift: false, alt: false, ctrl: false, pressure: null, ...mods }
}

/** Press at `from`, move through `via` and `to`, release at `to`. */
export function drag(tool: Tool, ctx: ToolContext, from: [number, number], to: [number, number], mods: Partial<ToolPointer> = {}, via: [number, number][] = []): void {
  tool.down(ctx, at(ctx, from[0], from[1], mods))
  for (const v of via) tool.move(ctx, at(ctx, v[0], v[1], mods))
  tool.move(ctx, at(ctx, to[0], to[1], mods))
  tool.up(ctx, at(ctx, to[0], to[1], mods))
}

export function key(k: string, mods: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) {
  return { key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods }
}
