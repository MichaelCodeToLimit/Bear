import { intersectRect, unionRect, type Bitmap, type Rect } from './bitmap'
import { layerBounds, type Layer, type PhotoDoc } from './doc'
import { resample } from '../ops/resample'
import { flip, rotate90, trimBounds } from '../ops/transform'

/**
 * Whole-document transforms behind the Image commands. Each `plan*` function computes every new
 * bitmap and offset first, without touching `doc`, and returns a change that only assigns them.
 * If an allocation fails while planning, the plan throws and the document is unchanged. The change
 * runs inside `PhotoEditor.editStructure`, which snapshots layer props (including `pixels`) so one
 * undo restores everything. Layer bitmaps are replaced, never edited in place.
 */

export type Turns = 1 | 2 | 3
export const ROTATE_LABELS: Record<Turns, string> = { 1: 'Rotate 90° Right', 2: 'Rotate 180°', 3: 'Rotate 90° Left' }
export const FLIP_LABELS = { h: 'Flip Horizontal', v: 'Flip Vertical' } as const

/** Applies a computed transform; cannot fail. */
export type DocChange = (doc: PhotoDoc) => void

interface Placed {
  layer: Layer
  pixels: Bitmap
  x: number
  y: number
}

/**
 * Assign the planned layers and canvas size. A text layer whose pixels are resampled or turned no
 * longer matches its text, so it becomes plain pixels. The selection is cleared.
 */
function commit(placed: Placed[], width: number, height: number): DocChange {
  return (doc) => {
    for (const p of placed) {
      p.layer.pixels = p.pixels
      p.layer.x = p.x
      p.layer.y = p.y
      p.layer.kind = 'raster'
      p.layer.text = undefined
    }
    doc.width = width
    doc.height = height
    doc.selection = null
  }
}

/** Resample every layer to the new canvas size; offsets and sizes scale with it (edges are rounded, never below 1 px). */
export function planResize(doc: PhotoDoc, w: number, h: number): DocChange {
  const sx = w / doc.width
  const sy = h / doc.height
  const placed = doc.layers.map((l): Placed => {
    const x = Math.round(l.x * sx)
    const y = Math.round(l.y * sy)
    const lw = Math.max(1, Math.round((l.x + l.pixels.width) * sx) - x)
    const lh = Math.max(1, Math.round((l.y + l.pixels.height) * sy) - y)
    const pixels = l.pixels.width && l.pixels.height ? resample(l.pixels, lw, lh, 'bilinear') : l.pixels
    return { layer: l, pixels, x, y }
  })
  return commit(placed, w, h)
}

/** Turn the document `turns` quarter turns clockwise: pixels, offsets and (for 90°) the canvas size. */
export function planRotate(doc: PhotoDoc, turns: Turns): DocChange {
  const W = doc.width
  const H = doc.height
  const placed = doc.layers.map((l): Placed => {
    const { x, y, width: w, height: h } = layerBounds(l)
    // Doc point (px, py) goes to (H - py, px) clockwise, (W - px, H - py) for 180°, (py, W - px) counter-clockwise.
    const [nx, ny] = turns === 1 ? [H - y - h, x] : turns === 2 ? [W - x - w, H - y - h] : [y, W - x - w]
    return { layer: l, pixels: rotate90(l.pixels, turns), x: nx, y: ny }
  })
  return turns === 2 ? commit(placed, W, H) : commit(placed, H, W)
}

/** Mirror the whole document left-right ('h') or top-bottom ('v'). */
export function planFlip(doc: PhotoDoc, axis: 'h' | 'v'): DocChange {
  const placed = doc.layers.map((l): Placed => ({
    layer: l,
    pixels: flip(l.pixels, axis),
    x: axis === 'h' ? doc.width - l.x - l.pixels.width : l.x,
    y: axis === 'v' ? doc.height - l.y - l.pixels.height : l.y
  }))
  return commit(placed, doc.width, doc.height)
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
