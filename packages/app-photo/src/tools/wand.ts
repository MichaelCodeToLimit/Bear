import { activeLayer } from '../model/doc'
import { wandMask } from '../model/mask'
import { compositeLayers } from '../ops/composite'
import { applySelection, clickDeselect, selectMode } from './selection'
import type { Tool } from './types'

export const wand: Tool = {
  id: 'wand',
  label: 'Magic wand',
  key: 'W',
  cursor: 'crosshair',
  options: [
    { id: 'tolerance', label: 'Tolerance', type: 'range', min: 0, max: 255, step: 1, default: 32 },
    { id: 'contiguous', label: 'Contiguous', type: 'toggle', default: true },
    { id: 'sample', label: 'Sample', type: 'select', choices: ['This layer', 'All layers'], default: 'This layer' }
  ],
  down(ctx, p) {
    const doc = ctx.editor.doc
    const mode = selectMode(p)
    const tolerance = Number(ctx.options.tolerance ?? 32)
    const contiguous = ctx.options.contiguous !== false
    const all = ctx.options.sample === 'All layers'
    const layer = activeLayer(doc)
    const src = all ? compositeLayers(doc.layers, doc.width, doc.height) : layer.pixels
    const offset = all ? { x: 0, y: 0 } : { x: layer.x, y: layer.y }
    const m = wandMask(src, p.x, p.y, tolerance, contiguous, offset, { w: doc.width, h: doc.height })
    // A click outside the layer (or the document) selects nothing.
    if (!m.data.some((v) => v > 0) && mode === 'replace') return clickDeselect(ctx, mode)
    applySelection(ctx, m, mode)
  },
  move() {},
  up() {}
}
