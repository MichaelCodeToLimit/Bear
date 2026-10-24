import { describe, expect, it } from 'vitest'
import { DAMAGED_SIZE, PSD_TOO_LARGE, checkDecodedImage, checkImageSize, flatDecodePath, planOpen } from './openPlan'

const GB = 2 ** 30
const BUDGET = 4 * GB // memoryBudget() on an 8 GB machine

describe('flatDecodePath', () => {
  it('decodes PNG at full size with fast-png (exact bytes)', () => {
    expect(flatDecodePath('png', 1, true)).toBe('fast-png')
    expect(flatDecodePath('png', 1, false)).toBe('fast-png')
  })

  it('decodes PNG at a smaller scale with the browser, scaled as it decodes', () => {
    expect(flatDecodePath('png', 0.5, true)).toBe('browser-scaled')
  })

  it('uses the browser for the other formats, scaled as it decodes when the header gave the size', () => {
    expect(flatDecodePath('jpg', 1, true)).toBe('browser')
    expect(flatDecodePath('webp', 0.25, true)).toBe('browser-scaled')
    expect(flatDecodePath('avif', 0.25, false)).toBe('browser-then-scale')
    expect(flatDecodePath('png', 0.25, false)).toBe('browser-then-scale')
  })
})

describe('checkImageSize', () => {
  it('passes the usual checks through', () => {
    expect(checkImageSize(100, 100, BUDGET)).toEqual({ ok: true })
    expect(checkImageSize(40000, 100, 1e12)).toEqual({ ok: false, reason: 'dimensions', scale: 0.75 })
  })

  it('calls a side over a million pixels damaged', () => {
    expect(checkImageSize(1_000_001, 10, BUDGET)).toEqual({ ok: false, reason: 'damaged' })
    expect(checkImageSize(10, 4_000_000_000, BUDGET)).toEqual({ ok: false, reason: 'damaged' })
  })

  it('calls a size that would need a scale under 0.1% damaged, instead of offering "Open at 0%"', () => {
    // 900,000 x 900,000 is under the side limit, but would have to be opened at 0.0%.
    expect(checkImageSize(900_000, 900_000, 1e6)).toEqual({ ok: false, reason: 'damaged' })
  })
})

describe('planOpen', () => {
  const png = (w: number, h: number) => ({ width: w, height: h })

  it('opens a small PNG with fast-png at full size', () => {
    expect(planOpen('png', png(800, 600), BUDGET)).toEqual({ kind: 'decode', path: 'fast-png', scale: 1 })
  })

  it('asks before a PNG too large, then decodes it scaled by the browser', () => {
    const ask = planOpen('png', png(40000, 30000), BUDGET)
    expect(ask).toMatchObject({ kind: 'ask', reason: 'dimensions' })
    const scale = ask.kind === 'ask' ? ask.scale : 1
    expect(planOpen('png', png(40000, 30000), BUDGET, scale)).toEqual({ kind: 'decode', path: 'browser-scaled', scale })
  })

  it('refuses a damaged header, and never offers to open it scaled', () => {
    expect(planOpen('png', png(2_000_000, 2_000_000), BUDGET)).toEqual({ kind: 'refuse', message: DAMAGED_SIZE })
    expect(planOpen('png', png(2_000_000, 2_000_000), BUDGET, 0.001)).toEqual({ kind: 'refuse', message: DAMAGED_SIZE })
    expect(planOpen('psd', png(2_000_000, 10), BUDGET)).toEqual({ kind: 'refuse', message: DAMAGED_SIZE })
  })

  it('refuses a .psd whose full read would not fit in memory (ag-psd cannot decode it scaled)', () => {
    expect(planOpen('psd', png(20000, 20000), BUDGET)).toEqual({ kind: 'refuse', message: PSD_TOO_LARGE })
    expect(planOpen('psd', png(20000, 20000), BUDGET, 0.5)).toEqual({ kind: 'refuse', message: PSD_TOO_LARGE })
  })

  it('reads a .psd that fits in memory but is too wide in full, then scales it', () => {
    const ask = planOpen('psd', png(40000, 100), BUDGET)
    expect(ask).toMatchObject({ kind: 'ask', reason: 'dimensions' })
    expect(planOpen('psd', png(40000, 100), BUDGET, 0.75)).toEqual({ kind: 'decode', path: 'psd', scale: 0.75 })
  })

  it('reads .bearphoto without a header check', () => {
    expect(planOpen('bearphoto', null, BUDGET)).toEqual({ kind: 'decode', path: 'bearphoto', scale: 1 })
    expect(planOpen('bearphoto', null, BUDGET, 0.5)).toEqual({ kind: 'decode', path: 'bearphoto', scale: 0.5 })
  })

  it('decodes an image whose header it cannot read, to check the decoded size', () => {
    expect(planOpen('avif', null, BUDGET)).toEqual({ kind: 'decode', path: 'browser', scale: 1 })
    expect(planOpen('avif', null, BUDGET, 0.5)).toEqual({ kind: 'decode', path: 'browser-then-scale', scale: 0.5 })
  })
})

describe('checkDecodedImage', () => {
  it('keeps a decoded image that fits', () => {
    expect(checkDecodedImage({ width: 2000, height: 1000 }, BUDGET)).toEqual({ ok: true })
  })

  it('asks again when the header understated the size (an AVIF grid whose first size box is one tile)', () => {
    // The header said 512 x 512 (one tile); the decoded grid is 40,960 x 20,480.
    expect(checkDecodedImage({ width: 40960, height: 20480 }, BUDGET)).toMatchObject({ ok: false, reason: 'dimensions' })
  })

  it('refuses a decoded size that can only be damage', () => {
    expect(checkDecodedImage({ width: 1_500_000, height: 1 }, BUDGET)).toEqual({ ok: false, reason: 'damaged' })
  })
})
