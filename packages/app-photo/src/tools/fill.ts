import { paintOver } from '../model/brush'
import { wandMask } from '../model/mask'
import { editableLayer } from './guard'
import type { Tool } from './types'

/**
 * Paint bucket. Fills the pixels that match the clicked one (within the tolerance, alpha included)
 * with the foreground colour: the connected area when Contiguous is on, otherwise every match on
 * the layer. Only the selected part is filled, weighted by the selection mask.
 */
export const fill: Tool = {
  id: 'fill',
  label: 'Fill',
  key: 'G',
  cursor: 'crosshair',
  options: [
    { id: 'tolerance', label: 'Tolerance', type: 'range', min: 0, max: 255, step: 1, default: 32 },
    { id: 'contiguous', label: 'Contiguous', type: 'toggle', default: true }
  ],
  down(ctx, p) {
    const layer = editableLayer(ctx)
    if (!layer) return
    const { pixels, x: ox, y: oy } = layer
    const lx = Math.floor(p.x) - ox
    const ly = Math.floor(p.y) - oy
    if (lx < 0 || ly < 0 || lx >= pixels.width || ly >= pixels.height) return
    // In layer space, so pixels of a layer reaching past the canvas can be filled too.
    const match = wandMask(pixels, lx, ly, Number(ctx.options.tolerance ?? 32), ctx.options.contiguous !== false)
    const sel = ctx.editor.doc.selection
    const W = pixels.width
    // The weight of each pixel (match × selection), and the box around the non-zero ones.
    let x0 = W
    let y0 = pixels.height
    let x1 = -1
    let y1 = -1
    const md = match.data
    for (let y = 0; y < pixels.height; y++) {
      const sy = y + oy
      const srow = sel && sy >= 0 && sy < sel.height ? sy * sel.width : -1
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (!md[i]) continue
        if (sel) {
          const sx = x + ox
          const s = srow < 0 || sx < 0 || sx >= sel.width ? 0 : sel.data[srow + sx]
          md[i] = Math.round((md[i] * s) / 255)
          if (!md[i]) continue
        }
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    if (x1 < 0) return
    const [r, g, b, a] = ctx.colors.fg
    ctx.editor.editPixels('Fill', layer.id, { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }, (px) => {
      const D = px.data
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const m = md[y * W + x]
          if (m) paintOver(D, (y * W + x) * 4, D, (y * W + x) * 4, r, g, b, (m / 255) * (a / 255))
        }
      }
    })
  },
  move() {},
  up() {}
}
