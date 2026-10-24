import { intersectRect, type Rect } from '../model/bitmap'
import { paintOver } from '../model/brush'
import type { Layer } from '../model/doc'
import type { PhotoEditor } from '../model/editor'
import { ellipseMask, polygonMask, type Mask } from '../model/mask'
import { editableLayer } from './guard'
import type { Tool, ToolContext, ToolPointer } from './types'

type Kind = 'Rectangle' | 'Ellipse' | 'Line'

interface Drag {
  editor: PhotoEditor
  layer: Layer
  kind: Kind
  x0: number
  y0: number
}

let drag: Drag | null = null

/** The box from the press to `p` in whole pixels; Shift keeps it square. */
function boxTo(d: Drag, p: ToolPointer): Rect {
  let x1 = Math.round(p.x)
  let y1 = Math.round(p.y)
  if (p.shift) {
    const side = Math.max(Math.abs(x1 - d.x0), Math.abs(y1 - d.y0))
    x1 = d.x0 + Math.sign(x1 - d.x0 || 1) * side
    y1 = d.y0 + Math.sign(y1 - d.y0 || 1) * side
  }
  return { x: Math.min(d.x0, x1), y: Math.min(d.y0, y1), width: Math.abs(x1 - d.x0), height: Math.abs(y1 - d.y0) }
}

/** The line's end; Shift snaps it to the nearest 45°. */
function lineTo(d: Drag, p: ToolPointer): [number, number] {
  const dx = p.x - d.x0
  const dy = p.y - d.y0
  if (!p.shift) return [p.x, p.y]
  const oct = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
  if (oct % 2 === 0) return Math.abs(oct) % 4 === 0 ? [p.x, d.y0] : [d.x0, p.y]
  const n = Math.max(Math.abs(dx), Math.abs(dy))
  return [d.x0 + Math.sign(dx) * n, d.y0 + Math.sign(dy) * n]
}

interface Coverage {
  /** Document rect the masks cover; mask cell (0, 0) is its top-left. */
  frame: Rect
  /** Painted with the foreground. */
  fill: Mask | null
  /** Painted with the background, over the fill: `outer − fill`. */
  outer: Mask | null
}

const shift = (pts: [number, number][], f: Rect): [number, number][] => pts.map(([x, y]) => [x - f.x, y - f.y])
const corners = (r: Rect): [number, number][] => [[r.x, r.y], [r.x + r.width, r.y], [r.x + r.width, r.y + r.height], [r.x, r.y + r.height]]

/** Anti-aliased coverage of a rectangle or ellipse with an inside stroke `sw` px wide (0 = none). */
function boxCoverage(kind: Kind, box: Rect, sw: number, filled: boolean): Coverage {
  const frame = box
  const local: Rect = { x: 0, y: 0, width: box.width, height: box.height }
  const mask = (r: Rect): Mask =>
    kind === 'Ellipse' ? ellipseMask(frame.width, frame.height, r) : polygonMask(frame.width, frame.height, corners(r))
  const outer = mask(local)
  if (sw <= 0) return { frame, fill: filled ? outer : null, outer: null }
  const iw = box.width - 2 * sw
  const ih = box.height - 2 * sw
  const inner = iw > 0 && ih > 0 ? mask({ x: sw, y: sw, width: iw, height: ih }) : null
  return { frame, fill: filled ? inner : null, outer: inner ? subtract(outer, inner) : outer }
}

function subtract(a: Mask, b: Mask): Mask {
  const d = new Uint8Array(a.data.length)
  for (let i = 0; i < d.length; i++) d[i] = Math.max(0, a.data[i] - b.data[i])
  return { width: a.width, height: a.height, data: d }
}

/** A straight line `w` px wide with square ends, as foreground coverage. */
function lineCoverage(a: [number, number], b: [number, number], w: number): Coverage | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len < 0.5) return null
  const nx = (-(b[1] - a[1]) / len) * (w / 2)
  const ny = ((b[0] - a[0]) / len) * (w / 2)
  const pts: [number, number][] = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]
  const x = Math.floor(Math.min(...pts.map((p) => p[0])))
  const y = Math.floor(Math.min(...pts.map((p) => p[1])))
  const frame = { x, y, width: Math.ceil(Math.max(...pts.map((p) => p[0]))) - x, height: Math.ceil(Math.max(...pts.map((p) => p[1]))) - y }
  return { frame, fill: polygonMask(frame.width, frame.height, shift(pts, frame)), outer: null }
}

/** Paint the coverage onto the layer (fill in fg, stroke in bg), weighted by the selection. One step. */
function rasterize(ctx: ToolContext, layer: Layer, cov: Coverage): void {
  const { frame, fill: fm, outer: om } = cov
  if (!fm && !om) return
  const area = intersectRect({ ...frame, x: frame.x - layer.x, y: frame.y - layer.y }, { x: 0, y: 0, width: layer.pixels.width, height: layer.pixels.height })
  if (!area) return
  const sel = ctx.editor.doc.selection
  const { fg, bg } = ctx.colors
  ctx.editor.editPixels('Shape', layer.id, area, (px) => {
    const D = px.data
    for (let y = area.y; y < area.y + area.height; y++) {
      const docY = y + layer.y
      for (let x = area.x; x < area.x + area.width; x++) {
        const docX = x + layer.x
        let m = 255
        if (sel) m = docX < 0 || docY < 0 || docX >= sel.width || docY >= sel.height ? 0 : sel.data[docY * sel.width + docX]
        if (!m) continue
        const ci = (docY - frame.y) * frame.width + (docX - frame.x)
        const i = (y * px.width + x) * 4
        const f = fm ? fm.data[ci] : 0
        const s = om ? om.data[ci] : 0
        if (f) paintOver(D, i, D, i, fg[0], fg[1], fg[2], (f / 255) * (m / 255) * (fg[3] / 255))
        if (s) paintOver(D, i, D, i, bg[0], bg[1], bg[2], (s / 255) * (m / 255) * (bg[3] / 255))
      }
    }
  })
}

const kindOf = (ctx: ToolContext): Kind => (ctx.options.shape as Kind) ?? 'Rectangle'
const strokeWidth = (ctx: ToolContext) => Math.max(0, Number(ctx.options.stroke) || 0)

/**
 * Rectangle, ellipse or line, rasterised onto the active layer when the drag ends. Rectangles and
 * ellipses are filled with the foreground colour (Fill option) and get an inside stroke in the
 * background colour (Stroke width, 0 = none). A line is drawn in the foreground colour, Stroke
 * width wide (at least 1 px). Shift keeps boxes square and snaps lines to 45°.
 */
export const shape: Tool = {
  id: 'shape',
  label: 'Shape',
  key: 'U',
  cursor: 'crosshair',
  options: [
    { id: 'shape', label: 'Shape', type: 'select', choices: ['Rectangle', 'Ellipse', 'Line'], default: 'Rectangle' },
    { id: 'fill', label: 'Fill', type: 'toggle', default: true },
    { id: 'stroke', label: 'Stroke', type: 'range', min: 0, max: 100, step: 1, default: 0 }
  ],
  down(ctx, p) {
    const layer = editableLayer(ctx)
    const kind = kindOf(ctx)
    const line = kind === 'Line'
    drag = layer && { editor: ctx.editor, layer, kind, x0: line ? p.x : Math.round(p.x), y0: line ? p.y : Math.round(p.y) }
  },
  move(ctx, p) {
    const d = drag
    if (!d || d.editor !== ctx.editor) return
    if (d.kind === 'Line') ctx.setOverlay({ kind: 'path', points: [[d.x0, d.y0], lineTo(d, p)] })
    else ctx.setOverlay({ kind: 'marquee', rect: boxTo(d, p), ellipse: d.kind === 'Ellipse' })
  },
  up(ctx, p) {
    const d = drag
    drag = null
    if (!d || d.editor !== ctx.editor) return
    ctx.setOverlay(null)
    const sw = strokeWidth(ctx)
    if (d.kind === 'Line') {
      const cov = lineCoverage([d.x0, d.y0], lineTo(d, p), Math.max(1, sw))
      if (cov) rasterize(ctx, d.layer, cov)
      return
    }
    const box = boxTo(d, p)
    if (box.width < 1 || box.height < 1) return
    rasterize(ctx, d.layer, boxCoverage(d.kind, box, sw, ctx.options.fill !== false))
  },
  cancel(ctx) {
    drag = null
    ctx.setOverlay(null)
  }
}
