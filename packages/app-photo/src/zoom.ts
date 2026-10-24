import { fitView, zoomAt, type ViewState } from './render/view'

/** Zoom levels for Zoom in/out, as fractions (1 = 100%). */
export const ZOOM_STEPS = [
  0.01, 0.02, 0.03, 0.04, 0.05, 0.0625, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32
]

export type ZoomCommand = 'in' | 'out' | 'fit' | 'actual'

/** Apply a View › Zoom command around the centre of the viewport. */
export function zoomCommand(view: ViewState, cmd: ZoomCommand, docW: number, docH: number): ViewState {
  const cx = view.viewW / 2
  const cy = view.viewH / 2
  if (cmd === 'fit') return fitView(docW, docH, view.viewW, view.viewH)
  if (cmd === 'actual') {
    const v = zoomAt(view, 1 / view.zoom, cx, cy)
    return { ...v, panX: Math.round(v.panX), panY: Math.round(v.panY) }
  }
  return zoomAt(view, nextZoomStep(view.zoom, cmd) / view.zoom, cx, cy)
}

/** The next level in `ZOOM_STEPS` above ('in') or below ('out') `zoom`, stopping at the ends. */
export function nextZoomStep(zoom: number, dir: 'in' | 'out'): number {
  return dir === 'in'
    ? ZOOM_STEPS.find((z) => z > zoom * 1.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
    : [...ZOOM_STEPS].reverse().find((z) => z < zoom / 1.001) ?? ZOOM_STEPS[0]
}

/** "66.7%", "100%", "0.5%". */
export function formatZoom(zoom: number): string {
  const pct = zoom * 100
  return `${pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10}%`
}
