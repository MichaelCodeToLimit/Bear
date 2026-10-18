import { createBitmap, intersectRect, readRect, type Rect } from '../model/bitmap'
import { layerBounds } from '../model/doc'
import type { Mask } from '../model/mask'
import type { PhotoEditor } from '../model/editor'
import type { Tool, ToolContext, ToolPointer } from './types'

/** The part of `m` inside `r`, as a mask of r's size; null when nothing in it is selected. */
function cropMask(m: Mask, r: Rect): Mask | null {
  const out = new Uint8Array(r.width * r.height)
  for (let y = 0; y < r.height; y++) out.set(m.data.subarray((r.y + y) * m.width + r.x, (r.y + y) * m.width + r.x + r.width), y * r.width)
  return out.some((v) => v > 0) ? { width: r.width, height: r.height, data: out } : null
}

/**
 * Crop the document to `rect` as one "Crop" step. Layers shift so `rect`'s corner becomes the origin.
 * With `deleteCropped`, raster layers also lose the pixels outside the new canvas; otherwise those
 * stay in the layer, off-canvas, and come back if the canvas grows again.
 */
export function applyCrop(editor: PhotoEditor, rect: Rect, deleteCropped: boolean): boolean {
  const c = intersectRect(rect, { x: 0, y: 0, width: editor.doc.width, height: editor.doc.height })
  if (!c) return false
  editor.editStructure('Crop', (doc) => {
    for (const l of doc.layers) {
      // Text layers keep their pixels whole: they are redrawn from their text.
      if (!deleteCropped || l.kind === 'text') {
        l.x -= c.x
        l.y -= c.y
        continue
      }
      const keep = intersectRect(layerBounds(l), c)
      l.pixels = keep ? readRect(l.pixels, { x: keep.x - l.x, y: keep.y - l.y, width: keep.width, height: keep.height }) : createBitmap(1, 1)
      l.x = keep ? keep.x - c.x : 0
      l.y = keep ? keep.y - c.y : 0
    }
    doc.selection = doc.selection && cropMask(doc.selection, c)
    doc.width = c.width
    doc.height = c.height
  })
  return true
}

/** Width / height for a ratio choice, or null for free. */
function ratioOf(ctx: ToolContext): number | null {
  const r = String(ctx.options.ratio ?? 'Free')
  if (r === 'Original') return ctx.editor.doc.width / ctx.editor.doc.height
  const m = /^(\d+):(\d+)$/.exec(r)
  return m ? Number(m[1]) / Number(m[2]) : null
}

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Action = { kind: 'new'; ax: number; ay: number } | { kind: 'move'; x0: number; y0: number; start: Rect } | { kind: 'edge'; handle: Handle; start: Rect }

let rect: Rect | null = null
let action: Action | null = null
/** The editor the pending box belongs to; a box never carries over to another document. */
let owner: PhotoEditor | null = null

function own(ctx: ToolContext): void {
  if (owner === ctx.editor) return
  owner = ctx.editor
  rect = null
  action = null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The box between a fixed corner and the pointer, shrunk to the ratio, in whole pixels. */
function fromAnchor(ax: number, ay: number, px: number, py: number, ratio: number | null): Rect {
  let w = px - ax
  let h = py - ay
  if (ratio) {
    const aw = Math.abs(w)
    const ah = Math.abs(h)
    if (ah === 0 || aw / ah > ratio) w = Math.sign(w) * ah * ratio
    else h = Math.sign(h) * (aw / ratio)
  }
  const x1 = Math.round(ax + w)
  const y1 = Math.round(ay + h)
  return { x: Math.min(ax, x1), y: Math.min(ay, y1), width: Math.abs(x1 - ax), height: Math.abs(y1 - ay) }
}

/** Which handle of the box is under the pointer. The grab zone shrinks for small boxes so the inside stays draggable. */
function handleAt(ctx: ToolContext, r: Rect, p: ToolPointer): Handle | null {
  const { zoom, panX, panY } = ctx.view
  const L = r.x * zoom + panX
  const T = r.y * zoom + panY
  const R = L + r.width * zoom
  const B = T + r.height * zoom
  const H = Math.min(8, (R - L) / 4, (B - T) / 4)
  const inX = p.sx >= L - H && p.sx <= R + H
  const inY = p.sy >= T - H && p.sy <= B + H
  let v = ''
  let h = ''
  if (inX && Math.abs(p.sy - T) <= H) v = 'n'
  else if (inX && Math.abs(p.sy - B) <= H) v = 's'
  if (inY && Math.abs(p.sx - L) <= H) h = 'w'
  else if (inY && Math.abs(p.sx - R) <= H) h = 'e'
  return (v + h || null) as Handle | null
}

function show(ctx: ToolContext): void {
  ctx.setOverlay(rect ? { kind: 'crop', rect } : null)
}

export const crop: Tool = {
  id: 'crop',
  label: 'Crop',
  key: 'C',
  cursor: 'crosshair',
  options: [
    { id: 'ratio', label: 'Ratio', type: 'select', choices: ['Free', '1:1', '4:3', '16:9', 'Original'], default: 'Free' },
    { id: 'deleteCropped', label: 'Delete cropped pixels', type: 'toggle', default: true }
  ],
  down(ctx, p) {
    own(ctx)
    const { width: W, height: H } = ctx.editor.doc
    const x = clamp(Math.round(p.x), 0, W)
    const y = clamp(Math.round(p.y), 0, H)
    const handle = rect && handleAt(ctx, rect, p)
    // With a fixed ratio only the corners resize; an edge would have to move the opposite one too.
    if (rect && handle && (handle.length === 2 || !ratioOf(ctx))) {
      action = { kind: 'edge', handle, start: rect }
    } else if (rect && p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height) {
      action = { kind: 'move', x0: p.x, y0: p.y, start: rect }
    } else {
      action = { kind: 'new', ax: x, ay: y }
    }
  },
  move(ctx, p) {
    if (!action) return
    const { width: W, height: H } = ctx.editor.doc
    const px = clamp(p.x, 0, W)
    const py = clamp(p.y, 0, H)
    if (action.kind === 'new') {
      rect = fromAnchor(action.ax, action.ay, px, py, ratioOf(ctx))
    } else if (action.kind === 'move') {
      const s = action.start
      rect = { ...s, x: clamp(s.x + Math.round(p.x - action.x0), 0, W - s.width), y: clamp(s.y + Math.round(p.y - action.y0), 0, H - s.height) }
    } else {
      const s = action.start
      const hd = action.handle
      if (hd.length === 2) {
        // Corner: the opposite corner stays put.
        const ax = hd.includes('w') ? s.x + s.width : s.x
        const ay = hd.includes('n') ? s.y + s.height : s.y
        rect = fromAnchor(ax, ay, px, py, ratioOf(ctx))
      } else {
        let [x0, y0, x1, y1] = [s.x, s.y, s.x + s.width, s.y + s.height]
        if (hd === 'n') y0 = Math.round(py)
        if (hd === 's') y1 = Math.round(py)
        if (hd === 'w') x0 = Math.round(px)
        if (hd === 'e') x1 = Math.round(px)
        rect = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) }
      }
    }
    show(ctx)
  },
  up(ctx, p) {
    if (!action) return
    const fresh = action.kind === 'new'
    crop.move(ctx, p)
    action = null
    if (rect && (rect.width < 1 || rect.height < 1)) rect = null
    show(ctx)
    if (rect && fresh) ctx.status('Press Enter to crop, or Esc to cancel')
  },
  onKey(ctx, e) {
    own(ctx)
    if (!rect) return false
    if (e.key === 'Enter') {
      const r = rect
      crop.cancel!(ctx)
      applyCrop(ctx.editor, r, ctx.options.deleteCropped !== false)
      return true
    }
    if (e.key === 'Escape') {
      crop.cancel!(ctx)
      return true
    }
    return false
  },
  cancel(ctx) {
    rect = null
    action = null
    ctx.setOverlay(null)
  }
}
