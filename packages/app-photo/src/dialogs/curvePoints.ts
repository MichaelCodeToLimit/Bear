export type CurvePoint = [number, number]

export const MAX_CURVE_POINTS = 16

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Move point `i` of the sorted list to (x, y), keeping the order: inner points stay strictly
 * between their neighbours; the end points keep their x (0 and 255) and only move up and down.
 */
export function movePoint(points: CurvePoint[], i: number, x: number, y: number): CurvePoint[] {
  const last = points.length - 1
  const nx = i === 0 ? points[0][0] : i === last ? points[last][0] : clamp(Math.round(x), points[i - 1][0] + 1, points[i + 1][0] - 1)
  const out = points.slice()
  out[i] = [nx, clamp(Math.round(y), 0, 255)]
  return out
}

/** Insert a point at (x, y), or null when it can't be added (too many, or an existing point has that x). */
export function addPoint(points: CurvePoint[], x: number, y: number): { points: CurvePoint[]; index: number } | null {
  const nx = clamp(Math.round(x), 0, 255)
  if (points.length >= MAX_CURVE_POINTS || points.some(([px]) => px === nx)) return null
  const index = points.findIndex(([px]) => px > nx)
  if (index <= 0) return null // outside the end points
  const out = points.slice()
  out.splice(index, 0, [nx, clamp(Math.round(y), 0, 255)])
  return { points: out, index }
}
