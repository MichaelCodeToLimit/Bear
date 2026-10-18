import { describe, expect, it } from 'vitest'
import { intersectRect, type Rect } from '../model/bitmap'
import { tileRects } from './tiles'

const area = (rs: Rect[]) => rs.reduce((s, r) => s + r.width * r.height, 0)
const noOverlap = (rs: Rect[]) => {
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(intersectRect(rs[i], rs[j])).toBeNull()
}

describe('tileRects', () => {
  it('splits 10000x300 at 4096 into 3 non-overlapping tiles covering the area', () => {
    const rs = tileRects(10000, 300, 4096)
    expect(rs).toHaveLength(3)
    expect(area(rs)).toBe(3_000_000)
    noOverlap(rs)
    expect(rs.map((r) => r.width)).toEqual([4096, 4096, 1808])
  })

  it('returns one tile when the area fits', () => {
    expect(tileRects(800, 600, 4096)).toEqual([{ x: 0, y: 0, width: 800, height: 600 }])
  })

  it('splits both axes and stays inside the area', () => {
    const rs = tileRects(9000, 5000, 4096)
    expect(rs).toHaveLength(6)
    expect(area(rs)).toBe(45_000_000)
    noOverlap(rs)
    for (const r of rs) {
      expect(r.width).toBeLessThanOrEqual(4096)
      expect(r.height).toBeLessThanOrEqual(4096)
      expect(r.x + r.width).toBeLessThanOrEqual(9000)
      expect(r.y + r.height).toBeLessThanOrEqual(5000)
    }
  })

  it('returns nothing for an empty area', () => {
    expect(tileRects(0, 100, 4096)).toEqual([])
    expect(tileRects(100, 0, 4096)).toEqual([])
  })
})
