import { describe, expect, it } from 'vitest'
import { createBitmap, type Bitmap, type RGBA } from '../model/bitmap'
import { createLayer } from '../model/doc'
import { BLEND_MODES, blendChannel, blendPixel } from './blend'
import { compositeLayers } from './composite'

const solid = (w: number, h: number, c: RGBA): Bitmap => createBitmap(w, h, c)
const px = (b: Bitmap, x = 0, y = 0) => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))
const near = (got: number[], want: number[], tol = 1) => {
  expect(got).toHaveLength(want.length)
  got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(tol))
}

/** One-pixel composite of a source layer (with props) over an opaque backdrop. */
function over(backdrop: RGBA, src: RGBA, extra: Partial<ReturnType<typeof createLayer>> = {}) {
  const layers = [createLayer('b', solid(1, 1, backdrop)), createLayer('s', solid(1, 1, src), extra)]
  return px(compositeLayers(layers, 1, 1))
}

describe('BLEND_MODES', () => {
  it('lists all 16 modes in order, unique', () => {
    expect(BLEND_MODES).toHaveLength(16)
    expect(new Set(BLEND_MODES).size).toBe(16)
    expect(BLEND_MODES[0]).toBe('normal')
    expect(BLEND_MODES[15]).toBe('luminosity')
  })
})

describe('blendChannel', () => {
  it('matches W3C separable formulas', () => {
    expect(blendChannel('normal', 0.3, 0.8)).toBeCloseTo(0.8)
    expect(blendChannel('multiply', 0.5, 0.5)).toBeCloseTo(0.25)
    expect(blendChannel('screen', 0.5, 0.5)).toBeCloseTo(0.75)
    // overlay = hard-light with the layers swapped: cb=0.25 <= 0.5 -> multiply(cs, 2cb)
    expect(blendChannel('overlay', 0.25, 0.5)).toBeCloseTo(0.25)
    expect(blendChannel('darken', 0.3, 0.8)).toBeCloseTo(0.3)
    expect(blendChannel('lighten', 0.3, 0.8)).toBeCloseTo(0.8)
    expect(blendChannel('color-dodge', 0, 0.5)).toBe(0)
    expect(blendChannel('color-dodge', 0.5, 1)).toBe(1)
    expect(blendChannel('color-dodge', 0.25, 0.5)).toBeCloseTo(0.5)
    expect(blendChannel('color-burn', 1, 0.5)).toBe(1)
    expect(blendChannel('color-burn', 0.5, 0)).toBe(0)
    expect(blendChannel('color-burn', 0.75, 0.5)).toBeCloseTo(0.5)
    expect(blendChannel('hard-light', 0.5, 0.25)).toBeCloseTo(0.25)
    expect(blendChannel('hard-light', 0.5, 0.75)).toBeCloseTo(0.75)
    expect(blendChannel('soft-light', 0.5, 0.5)).toBeCloseTo(0.5)
    expect(blendChannel('difference', 0.2, 0.7)).toBeCloseTo(0.5)
    expect(blendChannel('exclusion', 0.5, 0.5)).toBeCloseTo(0.5)
  })
  it('soft-light uses the sqrt branch for bright backdrops', () => {
    // cs=1, cb=0.5 -> cb + (2cs-1)(sqrt(cb)-cb)
    expect(blendChannel('soft-light', 0.5, 1)).toBeCloseTo(Math.sqrt(0.5))
    // cs=1, cb=0.2 -> D = ((16*.2-12)*.2+4)*.2
    expect(blendChannel('soft-light', 0.2, 1)).toBeCloseTo(((16 * 0.2 - 12) * 0.2 + 4) * 0.2)
  })
})

describe('blendPixel', () => {
  it('hue of red over gray stays gray', () => {
    near(blendPixel('hue', [0.5, 0.5, 0.5], [1, 0, 0]).map((v) => v * 255), [127.5, 127.5, 127.5], 0.001)
  })
  it('separable modes apply per channel', () => {
    near(blendPixel('multiply', [0.4, 0.8, 1], [0.5, 0.5, 0.5]).map((v) => v * 100), [20, 40, 50], 0.01)
  })
  it('color keeps backdrop luminance; luminosity takes source luminance', () => {
    const lum = (c: number[]) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
    const cb: [number, number, number] = [0.2, 0.5, 0.7]
    const cs: [number, number, number] = [0.9, 0.1, 0.3]
    expect(lum(blendPixel('color', cb, cs))).toBeCloseTo(lum(cb), 5)
    expect(lum(blendPixel('luminosity', cb, cs))).toBeCloseTo(lum(cs), 5)
    expect(lum(blendPixel('saturation', cb, cs))).toBeCloseTo(lum(cb), 5)
    expect(lum(blendPixel('hue', cb, cs))).toBeCloseTo(lum(cb), 5)
    for (const mode of BLEND_MODES)
      for (const v of blendPixel(mode, cb, cs)) {
        expect(v).toBeGreaterThanOrEqual(-1e-9)
        expect(v).toBeLessThanOrEqual(1 + 1e-9)
      }
  })
})

describe('compositeLayers', () => {
  const B: RGBA = [100, 200, 250, 255]
  const S: RGBA = [200, 100, 50, 255]
  it('multiply', () => near(over(B, S, { blend: 'multiply' }), [78, 78, 49, 255]))
  it('screen', () => near(over(B, S, { blend: 'screen' }), [222, 222, 251, 255]))
  it('normal at opacity 0.5', () => near(over(B, S, { opacity: 0.5 }), [150, 150, 150, 255]))
  it('difference', () => near(over([250, 50, 30, 255], [10, 200, 30, 255], { blend: 'difference' }), [240, 150, 0, 255]))
  it('hue of red over gray is gray; color keeps luminance', () => {
    near(over([128, 128, 128, 255], [255, 0, 0, 255], { blend: 'hue' }), [128, 128, 128, 255])
    const c = over([128, 128, 128, 255], [255, 0, 0, 255], { blend: 'color' })
    expect(Math.abs(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] - 128)).toBeLessThanOrEqual(1)
  })
  it('alpha-0 source leaves backdrop unchanged for every mode', () => {
    for (const blend of BLEND_MODES) near(over(B, [255, 0, 0, 0], { blend }), B, 0)
  })
  it('skips hidden layers', () => near(over(B, S, { visible: false }), B, 0))
  it('transparent backdrop takes the source as-is, and the background option applies', () => {
    const l = createLayer('s', solid(1, 1, [10, 20, 30, 128]))
    near(px(compositeLayers([l], 1, 1)), [10, 20, 30, 128])
    near(px(compositeLayers([l], 1, 1, undefined, { background: [255, 255, 255, 255] })), [132, 137, 142, 255])
  })
  it('a region equals the same rect of the full composite', () => {
    const a = createBitmap(6, 5)
    for (let i = 0; i < a.data.length; i++) a.data[i] = (i * 37 + 11) % 256
    const b = createBitmap(4, 4)
    for (let i = 0; i < b.data.length; i++) b.data[i] = (i * 91 + 5) % 256
    const layers = [createLayer('a', a), createLayer('b', b, { x: 2, y: 1, blend: 'overlay', opacity: 0.7 })]
    const full = compositeLayers(layers, 6, 5)
    const reg = compositeLayers(layers, 6, 5, { x: 1, y: 2, width: 4, height: 2 })
    expect(reg.width).toBe(4)
    expect(reg.height).toBe(2)
    for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) expect(px(reg, x, y)).toEqual(px(full, x + 1, y + 2))
  })
  it('a layer at x=-2 contributes exactly its on-canvas part', () => {
    const src = createBitmap(4, 1)
    for (let x = 0; x < 4; x++) src.data.set([x * 10, 0, 0, 255], x * 4)
    const out = compositeLayers([createLayer('s', src, { x: -2 })], 4, 1)
    expect(px(out, 0)).toEqual([20, 0, 0, 255])
    expect(px(out, 1)).toEqual([30, 0, 0, 255])
    expect(px(out, 2)).toEqual([0, 0, 0, 0])
    expect(px(out, 3)).toEqual([0, 0, 0, 0])
  })
})
