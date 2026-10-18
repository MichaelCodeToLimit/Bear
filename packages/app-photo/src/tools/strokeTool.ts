import { Stroke } from '../model/brush'
import type { Rect } from '../model/bitmap'
import type { Layer } from '../model/doc'
import type { PhotoEditor } from '../model/editor'
import { editableLayer } from './guard'
import type { OptionSpec, Tool, ToolContext, ToolId, ToolPointer } from './types'

export const MIN_BRUSH = 1
export const MAX_BRUSH = 2000

/** `[` (dir −1) and `]` (dir +1): 1 px steps under 10, 5 px under 50, 10 px above. */
export function nextBrushSize(size: number, dir: 1 | -1): number {
  const s = Math.round(size)
  const step = dir > 0 ? (s < 10 ? 1 : s < 50 ? 5 : 10) : s <= 10 ? 1 : s <= 50 ? 5 : 10
  return Math.min(MAX_BRUSH, Math.max(MIN_BRUSH, s + dir * step))
}

export const STROKE_OPTIONS: OptionSpec[] = [
  { id: 'size', label: 'Size', type: 'range', min: MIN_BRUSH, max: MAX_BRUSH, step: 1, default: 20 },
  { id: 'hardness', label: 'Hardness', type: 'range', min: 0, max: 100, step: 1, default: 80 },
  { id: 'opacity', label: 'Opacity', type: 'range', min: 1, max: 100, step: 1, default: 100 },
  { id: 'flow', label: 'Flow', type: 'range', min: 1, max: 100, step: 1, default: 100 }
]

interface Active {
  editor: PhotoEditor
  layer: Layer
  stroke: Stroke
}

const toDoc = (layer: Layer, r: Rect): Rect => ({ ...r, x: r.x + layer.x, y: r.y + layer.y })
const pct = (v: unknown, d: number) => Math.min(1, Math.max(0, (Number(v ?? d) || 0) / 100))

/**
 * A brush-like tool. A drag paints one `Stroke` live onto the active layer (refreshing just the
 * dabs' area) and records it on release as ONE `editPixels` step over the union of the dirty
 * rects, with the stroke's saved original as the "before" pixels. Strokes are clipped to the
 * layer's bitmap; it does not grow.
 */
export function strokeTool(id: ToolId, label: string, key: string, erase: boolean): Tool {
  let active: Active | null = null
  const size = (ctx: ToolContext) => Math.max(MIN_BRUSH, Number(ctx.options.size) || 20)
  const cursor = (ctx: ToolContext, p: ToolPointer) => ctx.setOverlay({ kind: 'brush', x: p.x, y: p.y, size: size(ctx) })
  const paint = (ctx: ToolContext, p: ToolPointer) => {
    if (!active || active.editor !== ctx.editor) return
    const r = active.stroke.add(p.x, p.y, p.pressure)
    if (r) ctx.refresh(toDoc(active.layer, r))
  }

  const tool: Tool = {
    id,
    label,
    key,
    cursor: 'crosshair',
    options: STROKE_OPTIONS,
    down(ctx, p) {
      cursor(ctx, p)
      const layer = editableLayer(ctx)
      if (!layer) return
      const doc = ctx.editor.doc
      const stroke = new Stroke(layer.pixels, {
        size: size(ctx),
        hardness: pct(ctx.options.hardness, 80),
        opacity: pct(ctx.options.opacity, 100),
        flow: pct(ctx.options.flow, 100),
        color: ctx.colors.fg,
        erase,
        mask: doc.selection,
        offset: { x: layer.x, y: layer.y }
      })
      active = { editor: ctx.editor, layer, stroke }
      paint(ctx, p)
    },
    move(ctx, p) {
      cursor(ctx, p)
      paint(ctx, p)
    },
    up(ctx, p) {
      paint(ctx, p)
      const a = active
      active = null
      if (!a || a.editor !== ctx.editor) return
      const r = a.stroke.end()
      if (r) ctx.editor.editPixels(label, a.layer.id, r, () => {}, { before: a.stroke.original(r) })
    },
    onKey(ctx, e) {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== '[' && e.key !== ']')) return false
      ctx.setOption('size', nextBrushSize(size(ctx), e.key === ']' ? 1 : -1))
      return true
    },
    cancel(ctx) {
      const a = active
      active = null
      ctx.setOverlay(null)
      if (!a || a.editor !== ctx.editor) return
      const r = a.stroke.restore()
      if (r) ctx.refresh(toDoc(a.layer, r))
    }
  }
  return tool
}
