import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MIX,
  MIX_KEY,
  clampMix,
  contrastRatio,
  isReadable,
  mixToCss,
  mixedPalette,
  parseSavedMix,
  surprise
} from './themeMixer'

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })
  it('keeps the cozy ink readable on cream', () => {
    expect(contrastRatio('#3b2a1a', '#fbf4ea')).toBeGreaterThan(4.5)
  })
})

describe('isReadable', () => {
  it('holds for every hue in 15 degree steps, in both themes', () => {
    for (let hue = -180; hue <= 180; hue += 15) {
      expect(isReadable({ ...DEFAULT_MIX, hue })).toBe(true)
    }
  })
  it('leaves the default palette alone and rotates others', () => {
    expect(mixedPalette(DEFAULT_MIX, false)).toEqual({ bg: '#fbf4ea', ink: '#3b2a1a' })
    expect(mixedPalette({ ...DEFAULT_MIX, hue: 120 }, false).bg).not.toBe('#fbf4ea')
  })
})

describe('clampMix / mixToCss', () => {
  it('fills missing and NaN fields with defaults and clamps ranges', () => {
    expect(clampMix({})).toEqual(DEFAULT_MIX)
    expect(clampMix({ hue: NaN, round: 5, speed: -1 })).toEqual({ hue: 0, round: 2, speed: 0.25 })
  })
  it('writes css values', () => {
    expect(mixToCss(DEFAULT_MIX)['--motion-speed']).toBe('1')
    expect(mixToCss({ hue: 30, round: 1.5, speed: 2 })).toEqual({
      '--hue-shift': '30deg',
      '--round': '1.5',
      '--motion-speed': '2'
    })
  })
})

describe('parseSavedMix', () => {
  it('uses the storage key bear-mix', () => {
    expect(MIX_KEY).toBe('bear-mix')
  })
  it.each([null, 'garbage', '[]', '{"hue":"x"}', '{"theme":"old"}'])('falls back to defaults for %s', (raw) => {
    expect(parseSavedMix(raw)).toEqual(DEFAULT_MIX)
  })
  it('clamps out of range values', () => {
    expect(parseSavedMix('{"hue":999,"speed":0}')).toEqual({ hue: 180, round: 1, speed: 0.25 })
  })
})

describe('surprise', () => {
  it('always returns a readable mix', () => {
    for (let i = 1; i <= 50; i++) expect(isReadable(surprise(seeded(i)))).toBe(true)
  })
})
