import { intersectRect, unionRect, type Rect } from './bitmap'
import { layerBounds, type Layer, type PhotoDoc } from './doc'
import { resample } from '../ops/resample'
import { flip, rotate90, trimBounds } from '../ops/transform'

/**
 * Whole-document transforms behind the Image commands. Each mutates `doc` in place and is meant
 * to run inside `PhotoEditor.editStructure`, which snapshots layer props (including `pixels`) so
 * one undo restores everything. Layer bitmaps are replaced, never edited in place.
 */

export type Turns = 1 | 2 | 3
export const ROTATE_LABELS: Record<Turns, string> = { 1: 'Rotate 90° Right', 2: 'Rotate 180°', 3: 'Rotate 90° Left' }
export const FLIP_LABELS = { h: 'Flip Horizontal', v: 'Flip Vertical' } as const

/** A text layer whose pixels are resampled or turned no longer matches its text, so it becomes plain pixels. */
function toRaster(l: Layer): void {
  l.kind = 'raster'
  l.text = undefined
}

/** Resample every layer to the new canvas size; offsets and sizes scale with it (edges are rounded, never below 1 px). */
export function resizeDoc(doc: PhotoDoc, w: number, h: number): void {
  const sx = w / doc.width
  const sy = h / doc.height
  for (const l of doc.layers) {
    const x = Math.round(l.x * sx)
    const y = Math.round(l.y * sy)
    const lw = Math.max(1, Math.round((l.x + l.pixels.width) * sx) - x)
    const lh = Math.max(1, Math.round((l.y + l.pixels.height) * sy) - y)
    if (l.pixels.width && l.pixels.height) l.pixels = resample(l.pixels, lw, lh, 'bilinear')
    l.x = x
    l.y = y
    toRaster(l)
  }
  doc.width = w
  doc.height = h
  doc.selection = null
}

/** Turn the document `turns` quarter turns clockwise: pixels, offsets and (for 90°) the canvas size. */
export function rotateDocInPlace(doc: PhotoDoc, turns: Turns): void {
  const W = doc.width
  const H = doc.height
  for (const l of doc.layers) {
    const { x, y, width: w, height: h } = layerBounds(l)
    // Doc point (px, py) goes to (H - py, px) clockwise, (W - px, H - py) for 180°, (py, W - px) counter-clockwise.
    const [nx, ny] = turns === 1 ? [H - y - h, x] : turns === 2 ? [W - x - w, H - y - h] : [y, W - x - w]
    l.pixels = rotate90(l.pixels, turns)
    l.x = nx
    l.y = ny
    toRaster(l)
  }
  if (turns !== 2) {
    doc.width = H
    doc.height = W
  }
  doc.selection = null
}

/** Mirror the whole document left-right ('h') or top-bottom ('v'). */
export function flipDocInPlace(doc: PhotoDoc, axis: 'h' | 'v'): void {
  for (const l of doc.layers) {
    l.pixels = flip(l.pixels, axis)
    if (axis === 'h') l.x = doc.width - l.x - l.pixels.width
    else l.y = doc.height - l.y - l.pixels.height
    toRaster(l)
  }
  doc.selection = null
}

/**
 * The canvas rect Trim would keep: the union of the non-transparent on-canvas pixels of all visible
 * layers. Null when there is nothing visible, or when it already is the whole canvas.
 */
export function trimRect(doc: PhotoDoc): Rect | null {
  const canvas = { x: 0, y: 0, width: doc.width, height: doc.height }
  let u: Rect | null = null
  for (const l of doc.layers) {
    if (!l.visible) continue
    const on = intersectRect(layerBounds(l), canvas)
    if (!on) continue
    const b = trimBounds(l.pixels, { ...on, x: on.x - l.x, y: on.y - l.y })
    if (!b) continue
    const r = { ...b, x: b.x + l.x, y: b.y + l.y }
    u = u ? unionRect(u, r) : r
  }
  if (!u || (u.x === 0 && u.y === 0 && u.width === doc.width && u.height === doc.height)) return null
  return u
}

/** Make `r` the canvas, without touching pixels: layers shift so r's corner becomes the origin. */
export function cropCanvas(doc: PhotoDoc, r: Rect): void {
  for (const l of doc.layers) {
    l.x -= r.x
    l.y -= r.y
  }
  doc.width = r.width
  doc.height = r.height
  doc.selection = null
}
