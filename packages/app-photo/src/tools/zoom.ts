import { zoomAt } from '../render/view'
import { nextZoomStep } from '../zoom'
import type { Tool } from './types'

export const zoom: Tool = {
  id: 'zoom',
  label: 'Zoom',
  key: 'Z',
  cursor: 'zoom-in',
  options: [],
  /** Click zooms in one step around the point; Alt+click zooms out. */
  down(ctx, p) {
    const target = nextZoomStep(ctx.view.zoom, p.alt ? 'out' : 'in')
    ctx.setView(zoomAt(ctx.view, target / ctx.view.zoom, p.sx, p.sy))
  },
  move() {},
  up() {}
}
