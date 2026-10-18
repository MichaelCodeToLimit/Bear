import { createBitmap, intersectRect, unionRect, writeRect, type Bitmap, type Rect } from '../model/bitmap'
import { activeLayer, layerBounds, type Layer } from '../model/doc'
import { maskBounds, type Mask } from '../model/mask'
import type { Tool, ToolContext, ToolKeyEvent } from './types'

/** Where a moved layer ends up: its new pixels and offset, and the moved selection. */
export interface Moved {
  pixels: Bitmap
  x: number
  y: number
  selection: Mask | null
}

/** `m` shifted by whole pixels; cells pushed off the document are dropped. */
export function shiftMask(m: Mask, dx: number, dy: number): Mask {
  const out = new Uint8Array(m.data.length)
  for (let y = Math.max(0, dy); y < Math.min(m.height, m.height + dy); y++) {
    const src = (y - dy) * m.width
    const x0 = Math.max(0, dx)
    const x1 = Math.min(m.width, m.width + dx)
    if (x1 > x0) out.set(m.data.subarray(src + x0 - dx, src + x1 - dx), y * m.width + x0)
  }
  return { width: m.width, height: m.height, data: out }
}

/**
 * Lift the selected pixels of `layer` (weighted by the mask) and drop them `dx, dy` whole pixels
 * away, over what is left behind. The layer grows to hold pixels moved past its edge, as long as they
 * land on the document. Returns new objects; `layer` is not changed.
 */
export function moveSelected(layer: Layer, sel: Mask, dx: number, dy: number): Moved {
  const lb = layerBounds(layer)
  const selection = shiftMask(sel, dx, dy)
  const sb = maskBounds(sel)
  const src = sb && intersectRect(sb, lb)
  if (!src) return { pixels: layer.pixels, x: layer.x, y: layer.y, selection }
  const doc: Rect = { x: 0, y: 0, width: sel.width, height: sel.height }
  const dst = intersectRect({ ...src, x: src.x + dx, y: src.y + dy }, doc)
  const nb = dst ? unionRect(lb, dst) : lb
  const out = createBitmap(nb.width, nb.height)
  writeRect(out, { x: lb.x - nb.x, y: lb.y - nb.y, width: lb.width, height: lb.height }, layer.pixels)

  // Lift: copy the selected part out, and leave (1 - mask) of it behind.
  const lifted = new Uint8ClampedArray(src.width * src.height * 4)
  const P = layer.pixels.data
  const O = out.data
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const m = sel.data[(src.y + y) * sel.width + src.x + x]
      if (!m) continue
      const si = ((src.y + y - layer.y) * lb.width + src.x + x - layer.x) * 4
      const oi = ((src.y + y - nb.y) * nb.width + src.x + x - nb.x) * 4
      const li = (y * src.width + x) * 4
      lifted[li] = P[si]
      lifted[li + 1] = P[si + 1]
      lifted[li + 2] = P[si + 2]
      lifted[li + 3] = Math.round((P[si + 3] * m) / 255)
      O[oi + 3] = Math.round((P[si + 3] * (255 - m)) / 255)
      if (!O[oi + 3]) O[oi] = O[oi + 1] = O[oi + 2] = 0 // fully lifted: leave clean transparency
    }
  }
  // Drop: composite the lifted pixels over the result (straight alpha, source-over).
  if (dst) {
    for (let y = dst.y; y < dst.y + dst.height; y++) {
      for (let x = dst.x; x < dst.x + dst.width; x++) {
        const li = ((y - dy - src.y) * src.width + x - dx - src.x) * 4
        const sa = lifted[li + 3] / 255
        if (!sa) continue
        const oi = ((y - nb.y) * nb.width + x - nb.x) * 4
        const da = O[oi + 3] / 255
        const a = sa + da * (1 - sa)
        for (let c = 0; c < 3; c++) O[oi + c] = Math.round((lifted[li + c] * sa + O[oi + c] * da * (1 - sa)) / a)
        O[oi + 3] = Math.round(a * 255)
      }
    }
  }
  return { pixels: out, x: nb.x, y: nb.y, selection }
}

/** What a drag (or nudge) moves: the selected pixels, or the whole layer when nothing is selected. */
function target(layer: Layer, sel: Mask | null, dx: number, dy: number): Moved {
  // Text layers move whole: lifting part of one would leave its text out of step with its pixels.
  if (sel && layer.kind !== 'text') return moveSelected(layer, sel, dx, dy)
  return { pixels: layer.pixels, x: layer.x + dx, y: layer.y + dy, selection: sel }
}

function commit(ctx: ToolContext, layer: Layer, dx: number, dy: number): void {
  if (!dx && !dy) return
  const moved = target(layer, ctx.editor.doc.selection, dx, dy)
  ctx.editor.editStructure('Move', (doc) => {
    layer.pixels = moved.pixels
    layer.x = moved.x
    layer.y = moved.y
    doc.selection = moved.selection
  })
}

/** The active layer, unless it is locked (then the user is told and nothing moves). */
function movable(ctx: ToolContext): Layer | null {
  const layer = activeLayer(ctx.editor.doc)
  if (!layer.locked) return layer
  ctx.status('This layer is locked')
  return null
}

interface Drag {
  layer: Layer
  x0: number
  y0: number
  orig: { pixels: Bitmap; x: number; y: number }
  dx: number
  dy: number
}

let drag: Drag | null = null

/** Put the layer back as it was before the live preview. */
function restore(d: Drag): void {
  d.layer.pixels = d.orig.pixels
  d.layer.x = d.orig.x
  d.layer.y = d.orig.y
}

const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

export const move: Tool = {
  id: 'move',
  label: 'Move',
  key: 'V',
  cursor: 'move',
  options: [],
  down(ctx, p) {
    const layer = movable(ctx)
    if (!layer) return
    drag = { layer, x0: p.x, y0: p.y, orig: { pixels: layer.pixels, x: layer.x, y: layer.y }, dx: 0, dy: 0 }
  },
  move(ctx, p) {
    if (!drag) return
    // Layer offsets must stay whole numbers (the file format requires it).
    const dx = Math.round(p.x - drag.x0)
    const dy = Math.round(p.y - drag.y0)
    if (dx === drag.dx && dy === drag.dy) return
    drag.dx = dx
    drag.dy = dy
    restore(drag)
    // Live preview outside history: swap in the moved pixels and shift the outline.
    const moved = target(drag.layer, ctx.editor.doc.selection, dx, dy)
    drag.layer.pixels = moved.pixels
    drag.layer.x = moved.x
    drag.layer.y = moved.y
    if (ctx.editor.doc.selection) ctx.setOverlay({ kind: 'move', dx, dy })
    ctx.refresh()
  },
  up(ctx, p) {
    if (!drag) return
    move.move(ctx, p)
    const d = drag
    drag = null
    restore(d)
    ctx.setOverlay(null)
    if (!d.dx && !d.dy) return ctx.refresh()
    commit(ctx, d.layer, d.dx, d.dy)
  },
  onKey(ctx, e: ToolKeyEvent) {
    const dir = NUDGE[e.key]
    if (!dir || e.ctrlKey || e.metaKey || e.altKey || drag) return false
    const layer = movable(ctx)
    const step = e.shiftKey ? 10 : 1
    if (layer) commit(ctx, layer, dir[0] * step, dir[1] * step)
    return true
  },
  cancel(ctx) {
    if (!drag) return
    restore(drag)
    drag = null
    ctx.setOverlay(null)
    ctx.refresh()
  }
}
