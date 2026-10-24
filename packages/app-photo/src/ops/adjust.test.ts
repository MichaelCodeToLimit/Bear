import { describe, expect, it } from 'vitest'
import { createBitmap, type Bitmap, type RGBA } from '../model/bitmap'
import type { Mask } from '../model/mask'
import {
  applyLut,
  blackAndWhite,
  brightnessContrast,
  brightnessContrastLut,
  curvesLut,
  hueSaturation,
  invert,
  levelsLut,
} from './adjust'

const solid = (w: number, h: number, c: RGBA): Bitmap => createBitmap(w, h, c)
const px = (b: Bitmap, x = 0, y = 0) => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))
const near = (got: number[], want: number[], tol = 1) => {
  expect(got).toHaveLength(want.length)
  got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(tol))
}
const identity = () => Uint8Array.from({ length: 256 }, (_, i) => i)
const maskOf = (w: number, h: number, f: (x: number, y: number) => number): Mask => {
  const data = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y)
  return { width: w, height: h, data }
}

describe('curvesLut', () => {
  it('identity for [[0,0],[255,255]]', () => {
    expect(Array.from(curvesLut([[0, 0], [255, 255]]))).toEqual(Array.from(identity()))
  })
  it('passes through control points and stays monotone', () => {
    const lut = curvesLut([[0, 0], [64, 128], [255, 255]])
    expect(lut[64]).toBe(128)
    for (let i = 1; i < 256; i++) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1])
  })
  it('extrapolates flat and handles duplicates (last wins) and unsorted input', () => {
    const lut = curvesLut([[200, 250], [50, 10], [50, 20]])
    expect(lut[0]).toBe(20)
    expect(lut[50]).toBe(20)
    expect(lut[255]).toBe(250)
  })
})

describe('levelsLut', () => {
  const base = { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 }
  it('identity', () => {
    expect(Array.from(levelsLut(base))).toEqual(Array.from(identity()))
  })
  it('inWhite 128 maps 128->255 and 64->128', () => {
    const lut = levelsLut({ ...base, inWhite: 128 })
    expect(lut[128]).toBe(255)
    expect(Math.abs(lut[64] - 128)).toBeLessThanOrEqual(1)
  })
  it('guards inWhite <= inBlack', () => {
    const lut = levelsLut({ ...base, inBlack: 100, inWhite: 100 })
    expect(lut).toHaveLength(256)
    expect(lut[0]).toBe(0)
    expect(lut[255]).toBe(255)
  })
})

describe('simple adjustments', () => {
  it('invert 10 -> 245, alpha untouched', () => {
    const b = solid(1, 1, [10, 20, 30, 77])
    invert(b)
    expect(px(b)).toEqual([245, 235, 225, 77])
  })
  it('brightness 100 on 100 -> 255; zero params are identity', () => {
    const b = solid(1, 1, [100, 100, 100, 255])
    brightnessContrast(b, { brightness: 100, contrast: 0 })
    expect(px(b)).toEqual([255, 255, 255, 255])
    const c = solid(1, 1, [100, 50, 200, 255])
    brightnessContrast(c, { brightness: 0, contrast: 0 })
    expect(px(c)).toEqual([100, 50, 200, 255])
  })
  it('brightnessContrastLut is the table brightnessContrast applies', () => {
    const p = { brightness: 13, contrast: -27 }
    const ramp = createBitmap(256, 1)
    for (let v = 0; v < 256; v++) ramp.data.set([v, v, v, 255], v * 4)
    brightnessContrast(ramp, p)
    const lut = brightnessContrastLut(p)
    expect(Array.from({ length: 256 }, (_, v) => ramp.data[v * 4])).toEqual(Array.from(lut))
  })
  it('hue +180 on red -> cyan', () => {
    const b = solid(1, 1, [255, 0, 0, 255])
    hueSaturation(b, { hue: 180, saturation: 0, lightness: 0 })
    near(px(b), [0, 255, 255, 255])
  })
  it('saturation -100 on red -> gray', () => {
    const b = solid(1, 1, [255, 0, 0, 255])
    hueSaturation(b, { hue: 0, saturation: -100, lightness: 0 })
    const [r, g, bl] = px(b)
    expect(g).toBe(r)
    expect(bl).toBe(r)
    near([r], [128])
  })
  it('lightness +100 -> white, -100 -> black', () => {
    const b = solid(1, 1, [200, 50, 50, 255])
    hueSaturation(b, { hue: 0, saturation: 0, lightness: 100 })
    near(px(b), [255, 255, 255, 255])
    const c = solid(1, 1, [200, 50, 50, 255])
    hueSaturation(c, { hue: 0, saturation: 0, lightness: -100 })
    near(px(c), [0, 0, 0, 255])
  })
  it('blackAndWhite uses Rec. 709 luma', () => {
    const b = solid(1, 1, [255, 0, 0, 255])
    blackAndWhite(b)
    near(px(b), [54, 54, 54, 255])
  })
  it('applyLut maps channels, alpha untouched', () => {
    const lut = identity().map((v) => 255 - v)
    const b = solid(1, 1, [1, 2, 3, 9])
    applyLut(b, lut)
    expect(px(b)).toEqual([254, 253, 252, 9])
  })
})

describe('masking', () => {
  const run = (m: number) => {
    const b = solid(1, 1, [100, 100, 100, 255])
    invert(b, maskOf(1, 1, () => m))
    return px(b)
  }
  it('0 unchanged, 255 full, 128 halfway', () => {
    expect(run(0)).toEqual([100, 100, 100, 255])
    expect(run(255)).toEqual([155, 155, 155, 255])
    near(run(128), [128, 128, 128, 255])
  })
  it('respects layer offset: mask on doc column 5 changes only layer column 0', () => {
    const b = solid(3, 1, [100, 100, 100, 255])
    const m = maskOf(10, 1, (x) => (x === 5 ? 255 : 0))
    invert(b, m, { x: 5, y: 0 })
    expect(px(b, 0)).toEqual([155, 155, 155, 255])
    expect(px(b, 1)).toEqual([100, 100, 100, 255])
    expect(px(b, 2)).toEqual([100, 100, 100, 255])
  })
  it('pixels outside the mask are unchanged (offset y, out of range)', () => {
    const b = solid(1, 2, [100, 100, 100, 255])
    invert(b, maskOf(1, 1, () => 255), { x: 0, y: -1 })
    expect(px(b, 0, 0)).toEqual([100, 100, 100, 255])
    expect(px(b, 0, 1)).toEqual([155, 155, 155, 255])
  })
})
