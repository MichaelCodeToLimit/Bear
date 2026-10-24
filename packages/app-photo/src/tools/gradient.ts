import { intersectRect, type Rect } from '../model/bitmap'
import { paintOver } from '../model/brush'
import type { Layer } from '../model/doc'
import type { PhotoEditor } from '../model/editor'
import { maskBounds } from '../model/mask'
import { editableLayer } from './guard'
import type { Tool, ToolContext } from './types'

interface Drag {
  editor: PhotoEditor
  layer: Layer
  from: [number, number]
  to: [number, number]
}

let drag: Drag | null = null

/**
 * Fill `layer` with a foreground→background gradient from `from` to `to` (document coordinates),
 * linear or radial (distance from `from`), weighted by the selection. One "Gradient" step.
 * Pixels are sampled at their integer coordinates, so the start pixel is exactly the foreground.
 */
function apply(ctx: ToolContext, layer: Layer, from: [number, number], to: [number, number]): void {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const len2 = dx * dx + dy * dy
  if (len2 < 1) return
  const len = Math.sqrt(len2)
  const radial = ctx.options.type === 'Radial'
  const sel = ctx.editor.doc.selection
  const lb: Rect = { x: 0, y: 0, width: layer.pixels.width, height: layer.pixels.height }
  const sb = sel && maskBounds(sel)
  const area = sel ? sb && intersectRect({ ...sb, x: sb.x - layer.x, y: sb.y - layer.y }, lb) : lb
  if (!area) return
  const { fg, bg } = ctx.colors
  const ox = layer.x
  const oy = layer.y
  ctx.editor.editPixels('Gradient', layer.id, area, (px) => {
    const D = px.data
    const W = px.width
    for (let y = area.y; y < area.y + area.height; y++) {
      const docY = y + oy
      const srow = sel ? docY * sel.width : 0
      for (let x = area.x; x < area.x + area.width; x++) {
        const docX = x + ox
        let m = 255
        if (sel) {
          m = docX < 0 || docX >= sel.width || docY < 0 || docY >= sel.height ? 0 : sel.data[srow + docX]
          if (!m) continue
        }
        const ux = docX - from[0]
        const uy = docY - from[1]
        let t = radial ? Math.sqrt(ux * ux + uy * uy) / len : (ux * dx + uy * dy) / len2
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const a = (fg[3] + (bg[3] - fg[3]) * t) / 255
        const i = (y * W + x) * 4
        paintOver(D, i, D, i, fg[0] + (bg[0] - fg[0]) * t, fg[1] + (bg[1] - fg[1]) * t, fg[2] + (bg[2] - fg[2]) * t, (a * m) / 255)
      }
    }
  })
}

/** Drag from start to end; the gradient goes foreground → background. Shown as a line while dragging. */
export const gradient: Tool = {
  id: 'gradient',
  label: 'Gradient',
  key: 'G',
  cursor: 'crosshair',
  options: [{ id: 'type', label: 'Type', type: 'select', choices: ['Linear', 'Radial'], default: 'Linear' }],
  down(ctx, p) {
    const layer = editableLayer(ctx)
    drag = layer && { editor: ctx.editor, layer, from: [p.x, p.y], to: [p.x, p.y] }
  },
  move(ctx, p) {
    if (!drag || drag.editor !== ctx.editor) return
    drag.to = [p.x, p.y]
    ctx.setOverlay({ kind: 'path', points: [drag.from, drag.to] })
  },
  up(ctx, p) {
    const d = drag
    drag = null
    if (!d || d.editor !== ctx.editor) return
    ctx.setOverlay(null)
    apply(ctx, d.layer, d.from, [p.x, p.y])
  },
  cancel(ctx) {
    drag = null
    ctx.setOverlay(null)
  }
}
