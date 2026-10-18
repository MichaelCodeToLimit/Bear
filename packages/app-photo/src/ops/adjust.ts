import type { Bitmap } from '../model/bitmap'
import type { Mask } from '../model/mask'

/**
 * Tonal / colour adjustments. All mutate the bitmap in place and leave alpha alone.
 * `offset` is the layer's position in document space: layer pixel (lx, ly) is document
 * pixel (lx + offset.x, ly + offset.y), which is where the (document-sized) mask is sampled.
 * Masked result: out = in + (adjusted - in) * m / 255.
 *
 * The formulas below are mirrored by the WebGL preview shaders; keep them in sync.
 */

type Offset = { x: number; y: number }
const ZERO: Offset = { x: 0, y: 0 }

/**
 * Drives `adjust` over every pixel the mask lets through. `adjust(d, i)` rewrites the RGB at
 * d[i..i+2] in place; for partial mask values the original is restored and blended.
 * No per-pixel allocations.
 */
function run(
  b: Bitmap,
  mask: Mask | null | undefined,
  offset: Offset | undefined,
  adjust: (d: Uint8ClampedArray, i: number) => void,
): void {
  const d = b.data
  const w = b.width
  if (!mask) {
    for (let i = 0, n = w * b.height * 4; i < n; i += 4) adjust(d, i)
    return
  }
  const { x: ox, y: oy } = offset ?? ZERO
  // Layer columns whose document x falls inside the mask.
  const lx0 = Math.max(0, -ox)
  const lx1 = Math.min(w, mask.width - ox)
  const md = mask.data
  for (let y = 0; y < b.height; y++) {
    const dy = y + oy
    if (dy < 0 || dy >= mask.height) continue
    const mrow = dy * mask.width + ox // mask index of layer column 0
    let i = (y * w + lx0) * 4
    for (let x = lx0; x < lx1; x++, i += 4) {
      const m = md[mrow + x]
      if (m === 0) continue
      if (m === 255) {
        adjust(d, i)
        continue
      }
      const r = d[i]
      const g = d[i + 1]
      const bl = d[i + 2]
      adjust(d, i)
      d[i] = r + ((d[i] - r) * m) / 255
      d[i + 1] = g + ((d[i + 1] - g) * m) / 255
      d[i + 2] = bl + ((d[i + 2] - bl) * m) / 255
    }
  }
}

/** Maps R, G and B through a 256-entry lookup table. */
export function applyLut(b: Bitmap, lut: Uint8Array, mask?: Mask | null, offset?: Offset): void {
  run(b, mask, offset, (d, i) => {
    d[i] = lut[d[i]]
    d[i + 1] = lut[d[i + 1]]
    d[i + 2] = lut[d[i + 2]]
  })
}

/**
 * Curves LUT: Fritsch-Carlson monotone cubic Hermite through the control points.
 * Points are sorted by x (duplicate x: last wins). Flat outside the first/last point.
 */
export function curvesLut(points: [number, number][]): Uint8Array {
  const lut = new Uint8Array(256)
  const byX = new Map<number, number>()
  for (const [x, y] of points) byX.set(x, y)
  const xs = [...byX.keys()].sort((a, b) => a - b)
  const n = xs.length
  if (n === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i
    return lut
  }
  const ys = xs.map((x) => byX.get(x)!)
  // Secants and tangents.
  const delta: number[] = []
  for (let k = 0; k < n - 1; k++) delta.push((ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]))
  const m: number[] = new Array(n).fill(0)
  if (n > 1) {
    m[0] = delta[0]
    m[n - 1] = delta[n - 2]
    for (let k = 1; k < n - 1; k++) m[k] = delta[k - 1] * delta[k] <= 0 ? 0 : (delta[k - 1] + delta[k]) / 2
    // Fritsch-Carlson limiter to guarantee monotonicity.
    for (let k = 0; k < n - 1; k++) {
      if (delta[k] === 0) {
        m[k] = 0
        m[k + 1] = 0
        continue
      }
      const a = m[k] / delta[k]
      const bb = m[k + 1] / delta[k]
      const s = a * a + bb * bb
      if (s > 9) {
        const t = 3 / Math.sqrt(s)
        m[k] = t * a * delta[k]
        m[k + 1] = t * bb * delta[k]
      }
    }
  }
  let seg = 0
  for (let v = 0; v < 256; v++) {
    let y: number
    if (v <= xs[0]) y = ys[0]
    else if (v >= xs[n - 1]) y = ys[n - 1]
    else {
      while (xs[seg + 1] < v) seg++
      const h = xs[seg + 1] - xs[seg]
      const t = (v - xs[seg]) / h
      const t2 = t * t
      const t3 = t2 * t
      y =
        (2 * t3 - 3 * t2 + 1) * ys[seg] +
        (t3 - 2 * t2 + t) * h * m[seg] +
        (-2 * t3 + 3 * t2) * ys[seg + 1] +
        (t3 - t2) * h * m[seg + 1]
    }
    lut[v] = Math.round(Math.min(255, Math.max(0, y)))
  }
  return lut
}

/**
 * Levels LUT: out = outBlack + (outWhite - outBlack) * clamp((v - inBlack)/(inWhite - inBlack), 0, 1)^(1/gamma)
 * inWhite <= inBlack is treated as a hard threshold at inBlack.
 */
export function levelsLut(p: {
  inBlack: number
  inWhite: number
  gamma: number
  outBlack: number
  outWhite: number
}): Uint8Array {
  const lut = new Uint8Array(256)
  const range = p.inWhite - p.inBlack
  const inv = 1 / (p.gamma > 0 ? p.gamma : 1)
  for (let v = 0; v < 256; v++) {
    const t = range > 0 ? Math.min(1, Math.max(0, (v - p.inBlack) / range)) : v > p.inBlack ? 1 : 0
    lut[v] = Math.round(p.outBlack + (p.outWhite - p.outBlack) * Math.pow(t, inv))
  }
  return lut
}

/**
 * Brightness/contrast (fixed formula): B = brightness*2.55, C = contrast*2.55,
 * f = 259*(C+255) / (255*(259-C)), out = clamp(f*(v-128) + 128 + B).
 */
export function brightnessContrast(
  b: Bitmap,
  p: { brightness: number; contrast: number },
  mask?: Mask | null,
  offset?: Offset,
): void {
  const B = p.brightness * 2.55
  const C = p.contrast * 2.55
  const f = (259 * (C + 255)) / (255 * (259 - C))
  const lut = new Uint8Array(256)
  for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.min(255, Math.max(0, f * (v - 128) + 128 + B)))
  applyLut(b, lut, mask, offset)
}

/** out = 255 - v. */
export function invert(b: Bitmap, mask?: Mask | null, offset?: Offset): void {
  run(b, mask, offset, (d, i) => {
    d[i] = 255 - d[i]
    d[i + 1] = 255 - d[i + 1]
    d[i + 2] = 255 - d[i + 2]
  })
}

/** Grayscale using Rec. 709 luma: Y = 0.2126 R + 0.7152 G + 0.0722 B. */
export function blackAndWhite(b: Bitmap, mask?: Mask | null, offset?: Offset): void {
  run(b, mask, offset, (d, i) => {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    d[i] = y
    d[i + 1] = y
    d[i + 2] = y
  })
}

/**
 * Hue / saturation / lightness, via HSL:
 *   h += hue (degrees, wraps); s *= 1 + saturation/100 (clamped 0..1);
 *   lightness > 0: l = l + (1 - l) * lightness/100, else l = l * (1 + lightness/100).
 * saturation -100 therefore yields gray at the pixel's HSL lightness.
 */
export function hueSaturation(
  b: Bitmap,
  p: { hue: number; saturation: number; lightness: number },
  mask?: Mask | null,
  offset?: Offset,
): void {
  const hShift = p.hue / 360
  const sMul = 1 + p.saturation / 100
  const lAmt = p.lightness / 100
  run(b, mask, offset, (d, i) => {
    const r = d[i] / 255
    const g = d[i + 1] / 255
    const bl = d[i + 2] / 255
    const mx = Math.max(r, g, bl)
    const mn = Math.min(r, g, bl)
    const c = mx - mn
    let l = (mx + mn) / 2
    let h = 0
    let s = 0
    if (c > 0) {
      s = c / (1 - Math.abs(2 * l - 1))
      if (mx === r) h = (g - bl) / c + (g < bl ? 6 : 0)
      else if (mx === g) h = (bl - r) / c + 2
      else h = (r - g) / c + 4
      h /= 6
    }
    h = (((h + hShift) % 1) + 1) % 1
    s = Math.min(1, Math.max(0, s * sMul))
    l = lAmt > 0 ? l + (1 - l) * lAmt : l * (1 + lAmt)
    // HSL -> RGB
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const pp = 2 * l - q
    d[i] = 255 * hue2rgb(pp, q, h + 1 / 3)
    d[i + 1] = 255 * hue2rgb(pp, q, h)
    d[i + 2] = 255 * hue2rgb(pp, q, h - 1 / 3)
  })
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}
