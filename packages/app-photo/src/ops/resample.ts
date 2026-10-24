import { createBitmap, type Bitmap } from '../model/bitmap'
import { words } from './transform'

export type ResampleMethod = 'bilinear' | 'nearest'

/**
 * Scale `b` to `w` x `h`. Pixel centres are aligned (output pixel x samples source x' = (x + 0.5) * sw / w - 0.5),
 * so corners keep their colour when enlarging. Bilinear weights each tap by its alpha, so colour
 * doesn't darken next to transparent pixels (straight alpha). Nearest copies the source pixel whose
 * centre is closest.
 */
export function resample(b: Bitmap, w: number, h: number, method: ResampleMethod): Bitmap {
  const out = createBitmap(w, h)
  if (!b.width || !b.height || !w || !h) return out
  return method === 'nearest' ? nearest(b, out) : bilinear(b, out)
}

function nearest(b: Bitmap, out: Bitmap): Bitmap {
  const { width: sw, height: sh } = b
  const src = words(b)
  const dst = words(out)
  const cols = new Int32Array(out.width)
  for (let x = 0; x < out.width; x++) cols[x] = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / out.width))
  for (let y = 0; y < out.height; y++) {
    const row = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / out.height)) * sw
    const o = y * out.width
    for (let x = 0; x < out.width; x++) dst[o + x] = src[row + cols[x]]
  }
  return out
}

/** For each output position: the two source indices to blend and the weight of the second. */
function taps(n: number, sn: number): { i0: Int32Array; i1: Int32Array; t: Float32Array } {
  const i0 = new Int32Array(n)
  const i1 = new Int32Array(n)
  const t = new Float32Array(n)
  const s = sn / n
  for (let k = 0; k < n; k++) {
    const f = Math.max(0, Math.min(sn - 1, (k + 0.5) * s - 0.5))
    const a = Math.floor(f)
    i0[k] = a
    i1[k] = Math.min(sn - 1, a + 1)
    t[k] = f - a
  }
  return { i0, i1, t }
}

function bilinear(b: Bitmap, out: Bitmap): Bitmap {
  const { width: sw } = b
  const d = b.data
  const o = out.data
  const cx = taps(out.width, b.width)
  const cy = taps(out.height, b.height)
  let p = 0
  for (let y = 0; y < out.height; y++) {
    const r0 = cy.i0[y] * sw
    const r1 = cy.i1[y] * sw
    const ty = cy.t[y]
    for (let x = 0; x < out.width; x++, p += 4) {
      const tx = cx.t[x]
      const a = (r0 + cx.i0[x]) * 4
      const bb = (r0 + cx.i1[x]) * 4
      const c = (r1 + cx.i0[x]) * 4
      const e = (r1 + cx.i1[x]) * 4
      const wa = (1 - tx) * (1 - ty) * d[a + 3]
      const wb = tx * (1 - ty) * d[bb + 3]
      const wc = (1 - tx) * ty * d[c + 3]
      const we = tx * ty * d[e + 3]
      const alpha = wa + wb + wc + we
      if (alpha > 0) {
        o[p] = (d[a] * wa + d[bb] * wb + d[c] * wc + d[e] * we) / alpha
        o[p + 1] = (d[a + 1] * wa + d[bb + 1] * wb + d[c + 1] * wc + d[e + 1] * we) / alpha
        o[p + 2] = (d[a + 2] * wa + d[bb + 2] * wb + d[c + 2] * wc + d[e + 2] * we) / alpha
      }
      o[p + 3] = alpha
    }
  }
  return out
}
