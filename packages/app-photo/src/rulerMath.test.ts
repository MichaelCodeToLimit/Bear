import { describe, expect, it } from 'vitest'
import { gridSpacing, gridValues, niceStep, rulerStep, rulerTicks } from './rulerMath'

describe('niceStep', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(1)).toBe(1)
    expect(niceStep(1.1)).toBe(2)
    expect(niceStep(2.1)).toBe(5)
    expect(niceStep(5.1)).toBe(10)
    expect(niceStep(160)).toBe(200)
    expect(niceStep(0)).toBe(1)
  })
})

describe('rulerTicks', () => {
  it('keeps labels at least 50 screen px apart', () => {
    for (const zoom of [0.05, 0.1, 0.3, 1, 2.5, 8, 32]) {
      expect(rulerStep(zoom) * zoom).toBeGreaterThanOrEqual(50 - 1e-6)
    }
  })
  it('labels every 100 at 50% zoom', () => {
    const majors = rulerTicks(0, 500, 0.5).filter((t) => t.major).map((t) => t.value)
    expect(majors).toEqual([0, 100, 200, 300, 400, 500])
  })
  it('adds minor ticks between labels when there is room', () => {
    const t = rulerTicks(0, 200, 1)
    expect(t.some((x) => !x.major)).toBe(true)
    expect(t.filter((x) => !x.major).every((x) => x.value % 100 !== 0)).toBe(true)
  })
  it('covers a negative start and never goes below one unit', () => {
    const t = rulerTicks(-130, 30, 1)
    expect(t[0].value).toBeGreaterThanOrEqual(-130)
    expect(t.some((x) => x.major && x.value === -100)).toBe(true)
    const hi = rulerTicks(10, 14, 32)
    expect(hi.every((x) => Number.isInteger(x.value))).toBe(true)
  })
  it('is bounded for huge ranges', () => {
    expect(rulerTicks(0, 1e9, 1).length).toBeLessThan(5000)
  })
})

describe('grid', () => {
  it('uses 100 px unless that is under 16 screen px', () => {
    expect(gridSpacing(1)).toBe(100)
    expect(gridSpacing(0.16)).toBe(100)
    expect(gridSpacing(0.1)).toBe(200)
    expect(gridSpacing(0.01)).toBe(2000)
    expect(gridSpacing(0.1) * 0.1).toBeGreaterThanOrEqual(16)
  })
  it('lists the multiples inside the range', () => {
    expect(gridValues(-50, 450, 100)).toEqual([0, 100, 200, 300, 400])
    expect(gridValues(0, 0, 100)).toEqual([0])
    expect(gridValues(150, 160, 100)).toEqual([])
  })
})
