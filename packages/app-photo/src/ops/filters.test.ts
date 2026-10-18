import { describe, expect, it } from 'vitest'
import { createBitmap, type Bitmap } from '../model/bitmap'
import type { Mask } from '../model/mask'
import { applyFilter, type FilterId } from './filters'

const PARAMS: Record<FilterId, Record<string, number>> = {
  gaussian: { radius: 4 },
  box: { radius: 2 },
  motion: { angle: 30, distance: 7 },
  sharpen: { amount: 80 },
  unsharp: { amount: 100, radius: 3, threshold: 0 },
  noise: { amount: 0, seed: 1, mono: 0 },
  pixelate: { size: 3 },
}
const IDS = Object.keys(PARAMS) as FilterId[]
const px = (b: Bitmap, x: number, y: number) =>
  Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))

/** Opaque-red square in the left half of an 8x4 transparent bitmap. */
const redBesideTransparent = (): Bitmap => {
  const b = createBitmap(8, 4)
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) b.data.set([255, 0, 0, 255], (y * 8 + x) * 4)
  return b
}

describe('applyFilter', () => {
  it.each(IDS)('%s leaves a uniform opaque image unchanged and does not mutate input', (id) => {
    const b = createBitmap(9, 7, [10, 120, 250, 255])
    const before = Array.from(b.data)
    const out = applyFilter(id, b, PARAMS[id])
    expect(out).not.toBe(b)
    expect(Array.from(out.data)).toEqual(before)
    expect(Array.from(b.data)).toEqual(before)
  })

  it('gaussian radius 3 of one white pixel: sum preserved, symmetric', () => {
    const n = 21
    const c = 10
    const b = createBitmap(n, n, [0, 0, 0, 255])
    b.data.set([255, 255, 255, 255], (c * n + c) * 4)
    const out = applyFilter('gaussian', b, { radius: 3 })
    let sum = 0
    for (let p = 0; p < n * n; p++) sum += out.data[p * 4] + out.data[p * 4 + 1] + out.data[p * 4 + 2]
    // The float result conserves energy exactly; 8-bit rounding drops the sub-0.5 tail (about 2.4% here),
    // so the bound is 3% of 255*3 rather than 1%.
    expect(Math.abs(sum - 255 * 3)).toBeLessThanOrEqual(255 * 3 * 0.03)
    for (let d = 1; d <= 6; d++) {
      expect(px(out, c - d, c)).toEqual(px(out, c + d, c))
      expect(px(out, c, c - d)).toEqual(px(out, c, c + d))
      expect(px(out, c - d, c - d)).toEqual(px(out, c + d, c + d))
    }
    expect(out.data[(c * n + c) * 4]).toBeLessThan(255)
    expect(out.data[(c * n + c + 1) * 4]).toBeGreaterThan(0)
  })

  it('gaussian does not darken colour next to transparency (premultiplied)', () => {
    const out = applyFilter('gaussian', redBesideTransparent(), { radius: 2 })
    let seen = 0
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i + 3] > 0) {
        seen++
        expect(Math.abs(out.data[i] - 255)).toBeLessThanOrEqual(1)
        expect(out.data[i + 1]).toBeLessThanOrEqual(1)
        expect(out.data[i + 2]).toBeLessThanOrEqual(1)
      }
    }
    expect(seen).toBeGreaterThan(16)
    expect(out.data[4 * 4 + 3]).toBeGreaterThan(0) // alpha bled into the transparent side
  })

  it('box and motion blur are premultiplied too', () => {
    const cases: [FilterId, Record<string, number>][] = [
      ['box', { radius: 2 }],
      ['motion', { angle: 0, distance: 5 }],
    ]
    for (const [id, p] of cases) {
      const out = applyFilter(id, redBesideTransparent(), p)
      let seen = 0
      for (let i = 0; i < out.data.length; i += 4) {
        if (out.data[i + 3] > 0) {
          seen++
          expect(Math.abs(out.data[i] - 255)).toBeLessThanOrEqual(1)
        }
      }
      expect(seen).toBeGreaterThan(16)
    }
  })

  it('motion blur at angle 0 smears horizontally only', () => {
    const b = createBitmap(11, 5, [0, 0, 0, 255])
    b.data.set([255, 255, 255, 255], (2 * 11 + 5) * 4)
    const out = applyFilter('motion', b, { angle: 0, distance: 5 })
    expect(out.data[(2 * 11 + 3) * 4]).toBeGreaterThan(0)
    expect(out.data[(2 * 11 + 7) * 4]).toBeGreaterThan(0)
    expect(out.data[(1 * 11 + 5) * 4]).toBe(0)
  })

  it('sharpen boosts an edge and keeps alpha', () => {
    const b = createBitmap(6, 3, [100, 100, 100, 255])
    for (let y = 0; y < 3; y++) for (let x = 3; x < 6; x++) b.data.set([200, 200, 200, 255], (y * 6 + x) * 4)
    const out = applyFilter('sharpen', b, { amount: 100 })
    expect(out.data[(1 * 6 + 2) * 4]).toBeLessThan(100)
    expect(out.data[(1 * 6 + 3) * 4]).toBeGreaterThan(200)
    expect(out.data[(1 * 6 + 3) * 4 + 3]).toBe(255)
  })

  it('unsharp threshold suppresses small differences', () => {
    const b = createBitmap(6, 3, [100, 100, 100, 255])
    for (let y = 0; y < 3; y++) for (let x = 3; x < 6; x++) b.data.set([110, 110, 110, 255], (y * 6 + x) * 4)
    const hi = applyFilter('unsharp', b, { amount: 200, radius: 2, threshold: 50 })
    expect(Array.from(hi.data)).toEqual(Array.from(b.data))
    const lo = applyFilter('unsharp', b, { amount: 200, radius: 2, threshold: 0 })
    expect(Array.from(lo.data)).not.toEqual(Array.from(b.data))
  })

  it('pixelate 2 on a 2x2 averages to one colour', () => {
    const b = createBitmap(2, 2)
    ;[0, 100, 200, 255].forEach((v, i) => b.data.set([v, v, v, 255], i * 4))
    const out = applyFilter('pixelate', b, { size: 2 })
    const first = px(out, 0, 0)
    expect(Math.abs(first[0] - 138.75)).toBeLessThanOrEqual(1)
    for (let i = 1; i < 4; i++) expect(px(out, i % 2, i >> 1)).toEqual(first)
  })

  it('noise is deterministic per seed', () => {
    const b = createBitmap(16, 16, [128, 128, 128, 255])
    const a1 = applyFilter('noise', b, { amount: 50, seed: 7, mono: 0 })
    const a2 = applyFilter('noise', b, { amount: 50, seed: 7, mono: 0 })
    const a3 = applyFilter('noise', b, { amount: 50, seed: 8, mono: 0 })
    expect(Array.from(a1.data)).toEqual(Array.from(a2.data))
    expect(Array.from(a1.data)).not.toEqual(Array.from(a3.data))
    expect(Array.from(a1.data)).not.toEqual(Array.from(b.data))
  })

  it('mono noise gives equal channels', () => {
    const b = createBitmap(8, 8, [128, 128, 128, 255])
    const out = applyFilter('noise', b, { amount: 60, seed: 3, mono: 1 })
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(out.data[i + 1])
      expect(out.data[i]).toBe(out.data[i + 2])
      expect(out.data[i + 3]).toBe(255)
    }
  })

  it.each(IDS)('%s: unmasked pixels are unchanged, partial mask blends', (id) => {
    const w = 10
    const h = 6
    const b = createBitmap(w, h)
    for (let i = 0; i < w * h; i++) b.data.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4)
    const params = id === 'noise' ? { amount: 80, seed: 5, mono: 0 } : PARAMS[id]
    const full = applyFilter(id, b, params)
    const mask: Mask = { width: w, height: h, data: new Uint8Array(w * h) }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask.data[y * w + x] = x < 4 ? 0 : x < 7 ? 128 : 255
    const out = applyFilter(id, b, params, mask)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = px(out, x, y)
        const i = px(b, x, y)
        const f = px(full, x, y)
        if (x < 4) expect(o).toEqual(i)
        else if (x >= 7) expect(o).toEqual(f)
        else o.forEach((v, k) => expect(Math.abs(v - (i[k] + (f[k] - i[k]) * (128 / 255)))).toBeLessThanOrEqual(1))
      }
    }
  })

  it('respects layer offset into the document mask', () => {
    const b = createBitmap(4, 1, [10, 20, 30, 255])
    const mask: Mask = { width: 10, height: 1, data: new Uint8Array(10) }
    mask.data[6] = 255 // document x 6 = layer x 1 with offset 5
    const out = applyFilter('noise', b, { amount: 100, seed: 2, mono: 0 }, mask, { x: 5, y: 0 })
    expect(px(out, 0, 0)).toEqual([10, 20, 30, 255])
    expect(px(out, 2, 0)).toEqual([10, 20, 30, 255])
    expect(px(out, 1, 0)).not.toEqual([10, 20, 30, 255])
  })
})
