import type { Rect } from '../model/bitmap'

/**
 * Split a w x h area into a row-major grid of rects no larger than maxSize on either side.
 * The rects cover the area exactly, without overlap. Empty areas give no rects.
 */
export function tileRects(w: number, h: number, maxSize: number): Rect[] {
  const out: Rect[] = []
  if (w <= 0 || h <= 0) return out
  const size = Math.max(1, Math.floor(maxSize))
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) out.push({ x, y, width: Math.min(size, w - x), height: Math.min(size, h - y) })
  }
  return out
}
