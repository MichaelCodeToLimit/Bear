import { describe, expect, it } from 'vitest'
import { createBitmap, type Bitmap, type RGBA } from '../model/bitmap'
import { resample } from './resample'

const px = (b: Bitmap, x: number, y: number): number[] => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))
function bitmapOf(w: number, h: number, colors: RGBA[]): Bitmap {
  const b = createBitmap(w, h)
  colors.forEach((c, i) => b.data.set(c, i * 4))
  return b
}

describe('resample', () => {
  it('bilinear 2x2 -> 4x4 keeps the corner values', () => {
    const src = bitmapOf(2, 2, [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 255, 255]
    ])
    const out = resample(src, 4, 4, 'bilinear')
    expect(out.width).toBe(4)
    expect(out.height).toBe(4)
    expect(px(out, 0, 0)).toEqual([255, 0, 0, 255])
    expect(px(out, 3, 0)).toEqual([0, 255, 0, 255])
    expect(px(out, 0, 3)).toEqual([0, 0, 255, 255])
    expect(px(out, 3, 3)).toEqual([255, 255, 255, 255])
    // In between is a mix.
    const mid = px(out, 1, 0)
    expect(mid[0]).toBeGreaterThan(0)
    expect(mid[0]).toBeLessThan(255)
  })

  it('nearest 1x1 -> 3x3 copies the pixel', () => {
    const out = resample(bitmapOf(1, 1, [[10, 20, 30, 40]]), 3, 3, 'nearest')
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) expect(px(out, x, y)).toEqual([10, 20, 30, 40])
  })

  it('nearest downscale picks source pixels', () => {
    const src = bitmapOf(4, 1, [
      [1, 0, 0, 255],
      [2, 0, 0, 255],
      [3, 0, 0, 255],
      [4, 0, 0, 255]
    ])
    const out = resample(src, 2, 1, 'nearest')
    expect([px(out, 0, 0)[0], px(out, 1, 0)[0]]).toEqual([2, 4])
  })

  it('bilinear does not darken next to transparent pixels', () => {
    const src = bitmapOf(2, 1, [
      [255, 255, 255, 255],
      [0, 0, 0, 0]
    ])
    const out = resample(src, 4, 1, 'bilinear')
    const p = px(out, 1, 0)
    expect(p.slice(0, 3)).toEqual([255, 255, 255])
    expect(p[3]).toBeGreaterThan(0)
    expect(p[3]).toBeLessThan(255)
  })
})
