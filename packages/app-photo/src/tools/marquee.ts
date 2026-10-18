import type { Rect } from '../model/bitmap'
import { ellipseMask, featherMask, rectMask, type SelectMode } from '../model/mask'
import { applySelection, clickDeselect, selectMode } from './selection'
import type { Tool, ToolContext, ToolPointer } from './types'

interface Drag {
  x0: number
  y0: number
  mode: SelectMode
  rect: Rect
}

let drag: Drag | null = null

/**
 * The box from the press point to `p`, snapped to whole pixels. Holding Shift after the press
 * (when Shift didn't start an "add") keeps it square.
 */
function boxTo(d: Drag, p: ToolPointer): Rect {
  let x1 = Math.round(p.x)
  let y1 = Math.round(p.y)
  if (p.shift && d.mode !== 'add' && d.mode !== 'intersect') {
    const side = Math.max(Math.abs(x1 - d.x0), Math.abs(y1 - d.y0))
    x1 = d.x0 + Math.sign(x1 - d.x0 || 1) * side
    y1 = d.y0 + Math.sign(y1 - d.y0 || 1) * side
  }
  return { x: Math.min(d.x0, x1), y: Math.min(d.y0, y1), width: Math.abs(x1 - d.x0), height: Math.abs(y1 - d.y0) }
}

const isEllipse = (ctx: ToolContext) => ctx.options.shape === 'Ellipse'

export const marquee: Tool = {
  id: 'marquee',
  label: 'Marquee',
  key: 'M',
  cursor: 'crosshair',
  options: [
    { id: 'shape', label: 'Shape', type: 'select', choices: ['Rectangle', 'Ellipse'], default: 'Rectangle' },
    { id: 'feather', label: 'Feather', type: 'range', min: 0, max: 100, step: 1, default: 0 }
  ],
  down(ctx, p) {
    const x0 = Math.round(p.x)
    const y0 = Math.round(p.y)
    drag = { x0, y0, mode: selectMode(p), rect: { x: x0, y: y0, width: 0, height: 0 } }
  },
  move(ctx, p) {
    if (!drag) return
    drag.rect = boxTo(drag, p)
    ctx.setOverlay({ kind: 'marquee', rect: drag.rect, ellipse: isEllipse(ctx) })
  },
  up(ctx, p) {
    if (!drag) return
    const d = drag
    drag = null
    ctx.setOverlay(null)
    const r = boxTo(d, p)
    if (r.width < 1 || r.height < 1) return clickDeselect(ctx, d.mode)
    const { width: w, height: h } = ctx.editor.doc
    let m = isEllipse(ctx) ? ellipseMask(w, h, r) : rectMask(w, h, r)
    const feather = Number(ctx.options.feather) || 0
    if (feather > 0) m = featherMask(m, feather)
    applySelection(ctx, m, d.mode)
  },
  cancel(ctx) {
    drag = null
    ctx.setOverlay(null)
  }
}
