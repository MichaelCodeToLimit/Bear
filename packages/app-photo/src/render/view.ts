import { intersectRect, type Rect } from '../model/bitmap'

/**
 * How the document maps onto the canvas. All values are in canvas (backing-store) pixels:
 * screen = doc * zoom + pan. `viewW`/`viewH` are the canvas size the compositor renders at.
 */
export interface ViewState {
  zoom: number
  panX: number
  panY: number
  viewW: number
  viewH: number
}

export interface Point {
  x: number
  y: number
}

export const MIN_ZOOM = 0.01
export const MAX_ZOOM = 32

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export function docToScreen(view: ViewState, p: Point): Point {
  return { x: p.x * view.zoom + view.panX, y: p.y * view.zoom + view.panY }
}

export function screenToDoc(view: ViewState, p: Point): Point {
  return { x: (p.x - view.panX) / view.zoom, y: (p.y - view.panY) / view.zoom }
}

/** Multiply the zoom by `factor` (clamped to 0.01..32), keeping the doc point under (screenX, screenY) in place. */
export function zoomAt(view: ViewState, factor: number, screenX: number, screenY: number): ViewState {
  const zoom = clampZoom(view.zoom * factor)
  const d = screenToDoc(view, { x: screenX, y: screenY })
  return { ...view, zoom, panX: screenX - d.x * zoom, panY: screenY - d.y * zoom }
}

/** Visible part of the document under `view`, in whole document pixels, or null when none of it is on screen. */
export function visibleDocRect(docW: number, docH: number, view: ViewState): Rect | null {
  const x0 = Math.floor(-view.panX / view.zoom)
  const y0 = Math.floor(-view.panY / view.zoom)
  const x1 = Math.ceil((view.viewW - view.panX) / view.zoom)
  const y1 = Math.ceil((view.viewH - view.panY) / view.zoom)
  return intersectRect({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, { x: 0, y: 0, width: docW, height: docH })
}

/** Largest zoom (clamped to 0.01..32) that shows the whole document, centred. Pan is rounded to whole pixels. */
export function fitView(docW: number, docH: number, viewW: number, viewH: number): ViewState {
  const zoom = docW > 0 && docH > 0 ? clampZoom(Math.min(viewW / docW, viewH / docH)) : 1
  return { zoom, panX: Math.round((viewW - docW * zoom) / 2), panY: Math.round((viewH - docH * zoom) / 2), viewW, viewH }
}
