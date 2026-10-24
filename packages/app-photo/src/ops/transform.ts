import { createBitmap, intersectRect, type Bitmap, type Rect } from '../model/bitmap'

/** The pixels as 32-bit words (one per pixel), sharing memory; copies first if the bytes aren't 4-aligned. */
export function words(b: Bitmap): Uint32Array {
  const d = b.data.byteOffset % 4 ? b.data.slice() : b.data
  return new Uint32Array(d.buffer, d.byteOffset, b.width * b.height)
}

/** Rotate by `turns` quarter turns clockwise (3 = one turn counter-clockwise). */
export function rotate90(b: Bitmap, turns: 1 | 2 | 3): Bitmap {
  const { width: w, height: h } = b
  const out = turns === 2 ? createBitmap(w, h) : createBitmap(h, w)
  const src = words(b)
  const dst = words(out)
  if (turns === 2) {
    for (let i = 0, n = w * h; i < n; i++) dst[n - 1 - i] = src[i]
    return out
  }
  // Clockwise: source (x, y) -> (h - 1 - y, x). Counter-clockwise: (x, y) -> (y, w - 1 - x). Output width is h.
  for (let y = 0; y < h; y++) {
    const row = y * w
    if (turns === 1) for (let x = 0; x < w; x++) dst[x * h + (h - 1 - y)] = src[row + x]
    else for (let x = 0; x < w; x++) dst[(w - 1 - x) * h + y] = src[row + x]
  }
  return out
}

/** Mirror left-right ('h') or top-bottom ('v'). */
export function flip(b: Bitmap, axis: 'h' | 'v'): Bitmap {
  const { width: w, height: h } = b
  const out = createBitmap(w, h)
  const src = words(b)
  const dst = words(out)
  for (let y = 0; y < h; y++) {
    if (axis === 'v') {
      dst.set(src.subarray(y * w, y * w + w), (h - 1 - y) * w)
      continue
    }
    const row = y * w
    for (let x = 0; x < w; x++) dst[row + w - 1 - x] = src[row + x]
  }
  return out
}

/** Bounds of the pixels with alpha > 0, looking only inside `region` (default: the whole bitmap). Null when there are none. */
export function trimBounds(b: Bitmap, region?: Rect): Rect | null {
  const r = intersectRect(region ?? { x: 0, y: 0, width: b.width, height: b.height }, { x: 0, y: 0, width: b.width, height: b.height })
  if (!r) return null
  const d = b.data
  let x0 = Infinity
  let x1 = -1
  let y0 = -1
  let y1 = -1
  for (let y = r.y; y < r.y + r.height; y++) {
    const row = y * b.width
    let first = -1
    for (let x = r.x; x < r.x + r.width; x++) {
      if (d[(row + x) * 4 + 3]) {
        first = x
        break
      }
    }
    if (first < 0) continue
    let last = first
    for (let x = r.x + r.width - 1; x > first; x--) {
      if (d[(row + x) * 4 + 3]) {
        last = x
        break
      }
    }
    if (y0 < 0) y0 = y
    y1 = y
    if (first < x0) x0 = first
    if (last > x1) x1 = last
  }
  return y0 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}
