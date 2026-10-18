import { describe, expect, it } from 'vitest'
import { addPoint, MAX_CURVE_POINTS, movePoint, type CurvePoint } from './curvePoints'

const ends: CurvePoint[] = [
  [0, 0],
  [255, 255]
]

describe('curve points', () => {
  it('adds a point in x order, rounded and clamped', () => {
    expect(addPoint(ends, 100.4, 300)).toEqual({ points: [[0, 0], [100, 255], [255, 255]], index: 1 })
  })

  it('refuses a duplicate x, a point past the ends, or a 17th point', () => {
    const three = addPoint(ends, 100, 50)!.points
    expect(addPoint(three, 100, 10)).toBeNull()
    expect(addPoint(ends, -5, 10)).toBeNull()
    let pts = ends
    for (let i = 1; pts.length < MAX_CURVE_POINTS; i++) pts = addPoint(pts, i * 10, 10)!.points
    expect(pts.length).toBe(16)
    expect(addPoint(pts, 251, 10)).toBeNull()
  })

  it('moves inner points between their neighbours, and end points only up and down', () => {
    const pts: CurvePoint[] = [
      [0, 0],
      [100, 100],
      [150, 150],
      [255, 255]
    ]
    expect(movePoint(pts, 1, 200, 20)[1]).toEqual([149, 20])
    expect(movePoint(pts, 2, 10, 20)[2]).toEqual([101, 20])
    expect(movePoint(pts, 0, 50, 40)[0]).toEqual([0, 40])
    expect(movePoint(pts, 3, 50, -40)[3]).toEqual([255, 0])
    expect(pts[1]).toEqual([100, 100]) // not mutated
  })
})
