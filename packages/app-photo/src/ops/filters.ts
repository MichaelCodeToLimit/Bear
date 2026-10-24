import type { Bitmap } from '../model/bitmap'
import type { Mask } from '../model/mask'
import { forEachMasked, type Offset } from './maskIter'

/**
 * Pixel filters. `applyFilter` never mutates its input; it returns a new bitmap.
 * Edges clamp (the border pixel repeats). Blurs work on premultiplied alpha so colour does not
 * bleed from transparent pixels, then un-premultiply. Sharpen, unsharp and noise change RGB only.
 * `mask` / `offset` follow the adjustments' convention (see maskIter.ts):
 * out = in + (filtered - in) * m / 255, where the mask is document-sized and layer pixel
 * (lx, ly) is document pixel (lx + offset.x, ly + offset.y).
 *
 * Parameters:
 *   gaussian {radius}            sigma = radius / 2, three box passes (same maths as featherMask)
 *   box      {radius}            one box of half-width radius
 *   motion   {angle, distance}   angle in degrees (0 = right, 90 = up), distance in px
 *   sharpen  {amount}            0..100, 3x3 kernel [0 -k 0; -k 1+4k -k; 0 -k 0], k = amount / 100
 *   unsharp  {amount, radius, threshold}  amount in percent, threshold 0..255
 *   noise    {amount, seed, mono}  amount 0..100 (100 = +-128 uniform), mono 0|1
 *   pixelate {size}              block size >= 1, blocks anchored at the layer's top-left
 */
export type FilterId = 'gaussian' | 'box' | 'motion' | 'sharpen' | 'unsharp' | 'noise' | 'pixelate'

export function applyFilter(
  id: FilterId,
  b: Bitmap,
  params: Record<string, number>,
  mask?: Mask | null,
  offset?: Offset,
): Bitmap {
  const p = (k: string): number => {
    const v = params[k]
    return Number.isFinite(v) ? v : 0
  }
  let out: Uint8ClampedArray
  switch (id) {
    case 'gaussian':
      out = blurPremultiplied(b, gaussianBoxRadius(p('radius')), 3)
      break
    case 'box':
      out = blurPremultiplied(b, Math.round(p('radius')), 1)
      break
    case 'motion':
      out = motionBlur(b, p('angle'), p('distance'))
      break
    case 'sharpen':
      out = sharpen(b, p('amount') / 100)
      break
    case 'unsharp':
      out = unsharp(b, p('amount') / 100, gaussianBoxRadius(p('radius')), p('threshold'))
      break
    case 'noise':
      out = noise(b, (p('amount') / 100) * 128, p('seed'), p('mono') !== 0)
      break
    case 'pixelate':
      out = pixelate(b, Math.max(1, Math.round(p('size'))))
      break
    default:
      throw new Error(`Unknown filter: ${String(id)}`)
  }
  return { width: b.width, height: b.height, data: mask ? blendThroughMask(b, out, mask, offset) : out }
}

/** Result for a masked filter: the input, with `filtered` blended in by mask weight. */
function blendThroughMask(
  b: Bitmap,
  filtered: Uint8ClampedArray,
  mask: Mask,
  offset: Offset | undefined,
): Uint8ClampedArray {
  const src = b.data
  const out = src.slice()
  forEachMasked(b.width, b.height, mask, offset, (i, m) => {
    if (m === 255) {
      out[i] = filtered[i]
      out[i + 1] = filtered[i + 1]
      out[i + 2] = filtered[i + 2]
      out[i + 3] = filtered[i + 3]
      return
    }
    for (let k = i; k < i + 4; k++) out[k] = src[k] + ((filtered[k] - src[k]) * m) / 255
  })
  return out
}

// ---------------------------------------------------------------------------------------------
// Box / gaussian blur

/** Half-width of each of three equal box passes whose combined variance is sigma^2 = (radius/2)^2. */
function gaussianBoxRadius(radius: number): number {
  if (radius <= 0) return 0
  const sigma = radius / 2
  let box = Math.floor(Math.sqrt(4 * sigma * sigma + 1))
  if (box % 2 === 0) box++
  return Math.max(1, (box - 1) / 2)
}

/** Horizontal box blur, window [x-r, x+r] with clamped edges. */
function boxRows(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const inv = 1 / (2 * r + 1)
  const last = w - 1
  for (let y = 0; y < h; y++) {
    const o = y * w
    let sum = (r + 1) * src[o]
    for (let k = 1; k <= r; k++) sum += src[o + (k < last ? k : last)]
    for (let x = 0; x < w; x++) {
      dst[o + x] = sum * inv
      const add = x + r + 1
      const sub = x - r
      sum += src[o + (add < last ? add : last)] - src[o + (sub > 0 ? sub : 0)]
    }
  }
}

/** Vertical box blur, window [y-r, y+r] with clamped edges; walks rows for cache friendliness. */
function boxCols(src: Float32Array, dst: Float32Array, w: number, h: number, r: number): void {
  const inv = 1 / (2 * r + 1)
  const last = h - 1
  const acc = new Float64Array(w)
  for (let x = 0; x < w; x++) acc[x] = (r + 1) * src[x]
  for (let k = 1; k <= r; k++) {
    const o = (k < last ? k : last) * w
    for (let x = 0; x < w; x++) acc[x] += src[o + x]
  }
  for (let y = 0; y < h; y++) {
    const o = y * w
    const add = (y + r + 1 < last ? y + r + 1 : last) * w
    const sub = (y - r > 0 ? y - r : 0) * w
    for (let x = 0; x < w; x++) {
      dst[o + x] = acc[x] * inv
      acc[x] += src[add + x] - src[sub + x]
    }
  }
}

/** Blurs `plane` in place with `passes` box passes (`tmp` is scratch of the same size). */
function boxBlurPlane(plane: Float32Array, tmp: Float32Array, w: number, h: number, r: number, passes: number): void {
  for (let i = 0; i < passes; i++) {
    boxRows(plane, tmp, w, h, r)
    boxCols(tmp, plane, w, h, r)
  }
}

/** Premultiplied box blur (r = 0 is a copy). Returns straight RGBA. */
function blurPremultiplied(b: Bitmap, r: number, passes: number): Uint8ClampedArray {
  const { width: w, height: h, data: d } = b
  if (r <= 0 || w === 0 || h === 0) return d.slice()
  const n = w * h
  const out = new Uint8ClampedArray(n * 4)
  const alpha = new Float32Array(n)
  const plane = new Float32Array(n)
  const tmp = new Float32Array(n)
  for (let i = 0; i < n; i++) alpha[i] = d[i * 4 + 3]
  boxBlurPlane(alpha, tmp, w, h, r, passes)
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) plane[i] = (d[i * 4 + c] * d[i * 4 + 3]) / 255
    boxBlurPlane(plane, tmp, w, h, r, passes)
    for (let i = 0; i < n; i++) out[i * 4 + c] = alpha[i] > 0 ? (plane[i] * 255) / alpha[i] : 0
  }
  for (let i = 0; i < n; i++) out[i * 4 + 3] = alpha[i]
  return out
}

// ---------------------------------------------------------------------------------------------
// Motion blur

function motionBlur(b: Bitmap, angleDeg: number, distance: number): Uint8ClampedArray {
  const { width: w, height: h, data: d } = b
  const n = Math.max(1, Math.round(distance))
  if (n === 1) return d.slice()
  const rad = (angleDeg * Math.PI) / 180
  const cx = Math.cos(rad)
  const cy = -Math.sin(rad) // y grows downwards
  const dxs = new Int32Array(n)
  const dys = new Int32Array(n)
  for (let k = 0; k < n; k++) {
    const t = k - (n - 1) / 2
    dxs[k] = Math.round(t * cx)
    dys[k] = Math.round(t * cy)
  }
  const out = new Uint8ClampedArray(d.length)
  const maxX = w - 1
  const maxY = h - 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sa = 0
      let sr = 0
      let sg = 0
      let sb = 0
      for (let k = 0; k < n; k++) {
        let sx = x + dxs[k]
        let sy = y + dys[k]
        sx = sx < 0 ? 0 : sx > maxX ? maxX : sx
        sy = sy < 0 ? 0 : sy > maxY ? maxY : sy
        const j = (sy * w + sx) * 4
        const a = d[j + 3]
        sa += a
        sr += d[j] * a
        sg += d[j + 1] * a
        sb += d[j + 2] * a
      }
      const i = (y * w + x) * 4
      if (sa > 0) {
        out[i] = sr / sa
        out[i + 1] = sg / sa
        out[i + 2] = sb / sa
      }
      out[i + 3] = sa / n
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Sharpen / unsharp

function sharpen(b: Bitmap, k: number): Uint8ClampedArray {
  const { width: w, height: h, data: d } = b
  const out = d.slice()
  if (k === 0) return out
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : 0) * w
    const dn = (y < h - 1 ? y + 1 : y) * w
    const row = y * w
    for (let x = 0; x < w; x++) {
      const l = x > 0 ? x - 1 : 0
      const r = x < w - 1 ? x + 1 : x
      const i = (row + x) * 4
      const iu = (up + x) * 4
      const id = (dn + x) * 4
      const il = (row + l) * 4
      const ir = (row + r) * 4
      for (let c = 0; c < 3; c++) {
        out[i + c] = d[i + c] + k * (4 * d[i + c] - d[iu + c] - d[id + c] - d[il + c] - d[ir + c])
      }
    }
  }
  return out
}

function unsharp(b: Bitmap, amount: number, r: number, threshold: number): Uint8ClampedArray {
  const d = b.data
  const blurred = blurPremultiplied(b, r, 3)
  const out = d.slice()
  for (let i = 0; i < d.length; i += 4) {
    for (let c = i; c < i + 3; c++) {
      const diff = d[c] - blurred[c]
      if (Math.abs(diff) >= threshold) out[c] = d[c] + amount * diff
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Noise / pixelate

/** mulberry32: small, fast, seedable PRNG returning [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function noise(b: Bitmap, amp: number, seed: number, mono: boolean): Uint8ClampedArray {
  const d = b.data
  const out = d.slice()
  if (amp === 0) return out
  const rand = mulberry32(seed)
  for (let i = 0; i < d.length; i += 4) {
    if (mono) {
      const v = (rand() * 2 - 1) * amp
      out[i] = d[i] + v
      out[i + 1] = d[i + 1] + v
      out[i + 2] = d[i + 2] + v
    } else {
      out[i] = d[i] + (rand() * 2 - 1) * amp
      out[i + 1] = d[i + 1] + (rand() * 2 - 1) * amp
      out[i + 2] = d[i + 2] + (rand() * 2 - 1) * amp
    }
  }
  return out
}

function pixelate(b: Bitmap, size: number): Uint8ClampedArray {
  const { width: w, height: h, data: d } = b
  const out = new Uint8ClampedArray(d.length)
  for (let by = 0; by < h; by += size) {
    const y1 = Math.min(h, by + size)
    for (let bx = 0; bx < w; bx += size) {
      const x1 = Math.min(w, bx + size)
      let sa = 0
      let sr = 0
      let sg = 0
      let sb = 0
      for (let y = by; y < y1; y++) {
        for (let x = bx; x < x1; x++) {
          const i = (y * w + x) * 4
          const a = d[i + 3]
          sa += a
          sr += d[i] * a
          sg += d[i + 1] * a
          sb += d[i + 2] * a
        }
      }
      const count = (y1 - by) * (x1 - bx)
      const a = sa / count
      const r = sa > 0 ? sr / sa : 0
      const g = sa > 0 ? sg / sa : 0
      const bl = sa > 0 ? sb / sa : 0
      for (let y = by; y < y1; y++) {
        for (let x = bx; x < x1; x++) {
          const i = (y * w + x) * 4
          out[i] = r
          out[i + 1] = g
          out[i + 2] = bl
          out[i + 3] = a
        }
      }
    }
  }
  return out
}
