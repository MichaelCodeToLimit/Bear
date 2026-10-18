import type { BlendMode } from '../model/doc'

/**
 * The 16 blend modes in one fixed order, identical to the `BlendMode` union.
 * Task 10's GLSL `u_mode` indices MUST follow this order (index = position in this list).
 */
export const BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity'
]

export type Vec3 = [number, number, number]

const NON_SEPARABLE: ReadonlySet<BlendMode> = new Set(['hue', 'saturation', 'color', 'luminosity'])

export function isSeparable(mode: BlendMode): boolean {
  return !NON_SEPARABLE.has(mode)
}

function hardLight(cb: number, cs: number): number {
  return cs <= 0.5 ? cb * 2 * cs : cb + (2 * cs - 1) - cb * (2 * cs - 1) // multiply(cb, 2cs) : screen(cb, 2cs-1)
}

/** W3C Compositing 1 separable blend function B(cb, cs); all values 0..1. */
export function blendChannel(mode: BlendMode, cb: number, cs: number): number {
  switch (mode) {
    case 'normal':
      return cs
    case 'multiply':
      return cb * cs
    case 'screen':
      return cb + cs - cb * cs
    case 'overlay':
      return hardLight(cs, cb)
    case 'darken':
      return Math.min(cb, cs)
    case 'lighten':
      return Math.max(cb, cs)
    case 'color-dodge':
      if (cb === 0) return 0
      if (cs >= 1) return 1
      return Math.min(1, cb / (1 - cs))
    case 'color-burn':
      if (cb >= 1) return 1
      if (cs <= 0) return 0
      return 1 - Math.min(1, (1 - cb) / cs)
    case 'hard-light':
      return hardLight(cb, cs)
    case 'soft-light': {
      if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb)
      const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb)
      return cb + (2 * cs - 1) * (d - cb)
    }
    case 'difference':
      return Math.abs(cb - cs)
    case 'exclusion':
      return cb + cs - 2 * cb * cs
    default:
      throw new Error(`blendChannel: '${mode}' is not a separable mode; use blendPixel`)
  }
}

const lum = (c: Vec3): number => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]

function clipColor(c: Vec3): Vec3 {
  const l = lum(c)
  const n = Math.min(c[0], c[1], c[2])
  const x = Math.max(c[0], c[1], c[2])
  let [r, g, b] = c
  if (n < 0) {
    const d = l - n
    r = l + ((r - l) * l) / d
    g = l + ((g - l) * l) / d
    b = l + ((b - l) * l) / d
  }
  if (x > 1) {
    const d = x - l
    r = l + ((r - l) * (1 - l)) / d
    g = l + ((g - l) * (1 - l)) / d
    b = l + ((b - l) * (1 - l)) / d
  }
  return [r, g, b]
}

function setLum(c: Vec3, l: number): Vec3 {
  const d = l - lum(c)
  return clipColor([c[0] + d, c[1] + d, c[2] + d])
}

const sat = (c: Vec3): number => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])

function setSat(c: Vec3, s: number): Vec3 {
  const out: Vec3 = [0, 0, 0]
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b]) // min, mid, max
  const [iMin, iMid, iMax] = idx
  if (c[iMax] > c[iMin]) {
    out[iMid] = ((c[iMid] - c[iMin]) * s) / (c[iMax] - c[iMin])
    out[iMax] = s
  }
  out[iMin] = 0
  return out
}

/** Blend two RGB triples (0..1 floats) with any of the 16 modes. `backdrop` is Cb, `source` is Cs. */
export function blendPixel(mode: BlendMode, backdrop: Vec3, source: Vec3): Vec3 {
  switch (mode) {
    case 'hue':
      return setLum(setSat(source, sat(backdrop)), lum(backdrop))
    case 'saturation':
      return setLum(setSat(backdrop, sat(source)), lum(backdrop))
    case 'color':
      return setLum(source, lum(backdrop))
    case 'luminosity':
      return setLum(backdrop, lum(source))
    default:
      return [blendChannel(mode, backdrop[0], source[0]), blendChannel(mode, backdrop[1], source[1]), blendChannel(mode, backdrop[2], source[2])]
  }
}
