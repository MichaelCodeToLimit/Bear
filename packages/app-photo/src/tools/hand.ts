import type { ViewState } from '../render/view'
import type { Tool } from './types'

let drag: { sx: number; sy: number; view: ViewState } | null = null

export const hand: Tool = {
  id: 'hand',
  label: 'Hand',
  key: 'H',
  cursor: 'grab',
  options: [],
  down(ctx, p) {
    drag = { sx: p.sx, sy: p.sy, view: ctx.view }
  },
  move(ctx, p) {
    if (!drag) return
    // Screen deltas, so the image follows the pointer exactly at any zoom.
    ctx.setView({ ...ctx.view, panX: drag.view.panX + p.sx - drag.sx, panY: drag.view.panY + p.sy - drag.sy })
  },
  up(ctx, p) {
    hand.move(ctx, p)
    drag = null
  },
  cancel() {
    drag = null
  }
}
