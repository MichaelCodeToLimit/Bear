import { polygonMask, type SelectMode } from '../model/mask'
import { applySelection, clickDeselect, selectMode } from './selection'
import type { PhotoEditor } from '../model/editor'
import type { Tool, ToolContext, ToolPointer } from './types'

type Pt = [number, number]

/** Points of the outline being drawn, and how it combines with the selection. */
let path: { points: Pt[]; mode: SelectMode; polygonal: boolean; lastDown: number; editor: PhotoEditor } | null = null
let pressed = false

/** Screen distance (CSS pixels) under which a click closes the polygon on its first point. */
const CLOSE_DIST = 8
const DOUBLE_CLICK_MS = 350

/** Distance between two document points on screen, in CSS pixels. */
const dist = (ctx: ToolContext, a: Pt, b: Pt) => (Math.hypot(a[0] - b[0], a[1] - b[1]) * ctx.view.zoom) / ctx.dpr

function finish(ctx: ToolContext): void {
  if (!path) return
  const { points, mode } = path
  path = null
  ctx.setOverlay(null)
  if (points.length < 3) return clickDeselect(ctx, mode)
  const { width, height } = ctx.editor.doc
  const m = polygonMask(width, height, points)
  if (!m.data.some((v) => v > 0) && mode === 'replace') return clickDeselect(ctx, mode)
  applySelection(ctx, m, mode)
}

const pt = (p: ToolPointer): Pt => [p.x, p.y]

export const lasso: Tool = {
  id: 'lasso',
  label: 'Lasso',
  key: 'L',
  cursor: 'crosshair',
  options: [{ id: 'mode', label: 'Type', type: 'select', choices: ['Freehand', 'Polygonal'], default: 'Freehand' }],
  down(ctx, p) {
    pressed = true
    const polygonal = ctx.options.mode === 'Polygonal'
    const now = Date.now()
    if (!path || !path.polygonal || !polygonal || path.editor !== ctx.editor) {
      path = { points: [pt(p)], mode: selectMode(p), polygonal, lastDown: now, editor: ctx.editor }
      ctx.setOverlay({ kind: 'path', points: path.points })
      return
    }
    const pts = path.points
    const nearFirst = pts.length >= 3 && dist(ctx, pts[0], pt(p)) <= CLOSE_DIST
    const double = now - path.lastDown < DOUBLE_CLICK_MS && dist(ctx, pts[pts.length - 1], pt(p)) <= CLOSE_DIST
    path.lastDown = now
    if (nearFirst || double) return finish(ctx)
    pts.push(pt(p))
    ctx.setOverlay({ kind: 'path', points: [...pts] })
  },
  move(ctx, p) {
    if (!path) return
    if (path.polygonal) return ctx.setOverlay({ kind: 'path', points: [...path.points, pt(p)] })
    if (!pressed) return
    const last = path.points[path.points.length - 1]
    if (dist(ctx, last, pt(p)) < 1) return
    path.points.push(pt(p))
    ctx.setOverlay({ kind: 'path', points: [...path.points] })
  },
  up(ctx, p) {
    pressed = false
    if (!path || path.polygonal) return
    const last = path.points[path.points.length - 1]
    if (dist(ctx, last, pt(p)) > 0) path.points.push(pt(p))
    finish(ctx)
  },
  onKey(ctx, e) {
    if (!path?.polygonal || path.editor !== ctx.editor) return false
    if (e.key === 'Enter') {
      finish(ctx)
      return true
    }
    if (e.key === 'Escape') {
      lasso.cancel!(ctx)
      return true
    }
    if (e.key === 'Backspace' && path.points.length > 1) {
      path.points.pop()
      ctx.setOverlay({ kind: 'path', points: [...path.points] })
      return true
    }
    return false
  },
  cancel(ctx) {
    path = null
    pressed = false
    ctx.setOverlay(null)
  }
}
