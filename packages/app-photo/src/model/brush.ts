import { intersectRect, readRect, unionRect, type Bitmap, type Rect, type RGBA } from './bitmap'
import type { Mask } from './mask'

/** A square brush footprint: `size` × `size` alpha values 0..1, row-major. */
export interface Dab {
  size: number
  alpha: Float32Array
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * A round dab `size` px across. `hardness` 1 is a solid disc with a one-pixel anti-aliased edge;
 * lower values fade smoothly from radius·hardness out to the edge (0 fades from the centre).
 */
export function brushDab(size: number, hardness: number): Dab {
  const n = Math.max(1, Math.ceil(size))
  const r = Math.max(0.5, size / 2)
  const c = n / 2
  const h = clamp01(hardness)
  const alpha = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dist = Math.hypot(x + 0.5 - c, y + 0.5 - c)
      const edge = clamp01(r - dist + 0.5)
      let soft = 1
      const d = dist / r
      if (h < 1 && d > h) {
        const t = clamp01((d - h) / (1 - h))
        soft = 1 - t * t * (3 - 2 * t)
      }
      alpha[y * n + x] = Math.min(edge, soft)
    }
  }
  return { size: n, alpha }
}

/**
 * Points along `from`→`to`, `spacing` px apart. `carry` is the distance still to go before the next
 * point (0 = a point at `from`); the returned carry continues the spacing into the next segment.
 */
export function stampPoints(from: [number, number], to: [number, number], spacing: number, carry: number): { points: [number, number][]; carry: number } {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const len = Math.hypot(dx, dy)
  const step = Math.max(1e-3, spacing)
  const points: [number, number][] = []
  let d = Math.max(0, carry)
  for (; d <= len + 1e-9; d += step) {
    const t = len ? d / len : 0
    points.push([from[0] + dx * t, from[1] + dy * t])
  }
  return { points, carry: d - len }
}

/**
 * Source-over in straight alpha: `color` at coverage `a` (0..1, already including the colour's own
 * alpha) over the pixel at `src[si]`, written to `dst[di]`. `src` and `dst` may be the same array.
 */
export function paintOver(dst: Uint8ClampedArray, di: number, src: Uint8ClampedArray, si: number, r: number, g: number, b: number, a: number): void {
  const sr = src[si]
  const sg = src[si + 1]
  const sb = src[si + 2]
  const da = src[si + 3] / 255
  const keep = da * (1 - a)
  const oa = a + keep
  if (oa <= 0) {
    dst[di] = sr
    dst[di + 1] = sg
    dst[di + 2] = sb
    dst[di + 3] = 0
    return
  }
  dst[di] = (r * a + sr * keep) / oa
  dst[di + 1] = (g * a + sg * keep) / oa
  dst[di + 2] = (b * a + sb * keep) / oa
  dst[di + 3] = oa * 255
}

/** Remove coverage `a` (0..1) of the pixel's alpha. A pixel erased to nothing becomes [0,0,0,0]. */
export function eraseOver(dst: Uint8ClampedArray, di: number, src: Uint8ClampedArray, si: number, a: number): void {
  const oa = src[si + 3] * (1 - a)
  if (oa < 0.5) {
    dst[di] = dst[di + 1] = dst[di + 2] = dst[di + 3] = 0
    return
  }
  dst[di] = src[si]
  dst[di + 1] = src[si + 1]
  dst[di + 2] = src[si + 2]
  dst[di + 3] = oa
}

export interface StrokeOptions {
  /** Diameter in px at full pressure. */
  size: number
  /** 0..1 */
  hardness: number
  /** 0..1: the most the whole stroke can cover. */
  opacity: number
  /** 0..1: how much each dab adds. */
  flow: number
  color: RGBA
  erase: boolean
  /** Document-sized selection, or null for everything. */
  mask: Mask | null
  /** The target layer's position in the document. */
  offset: { x: number; y: number }
}

/** Tile side for the stroke's saved original and coverage; a power of two. */
const T = 64
const SHIFT = 6

interface Tile {
  /** The layer's pixels in this tile before the stroke (T×T, edge tiles partly unused). */
  orig: Uint8ClampedArray
  /** Stroke coverage 0..1 per pixel. */
  cov: Float32Array
}

/**
 * One brush or eraser stroke painted live onto `target`. Each dab only touches its own rect. The
 * stroke keeps, per 64 px tile it touches, the original pixels and a coverage buffer
 * (`cov = cov + (1 − cov)·dab·flow`); each pixel is recomputed as `original ⊕ color` at alpha
 * `cov·opacity·mask`, so overlapping dabs never pass the stroke's opacity. Dabs are clipped to the
 * target bitmap (the layer does not grow).
 *
 * Coordinates given to `add` are DOCUMENT coordinates; returned rects are in the target's
 * (layer-local) coordinates and already clipped to it.
 */
export class Stroke {
  private tiles: (Tile | undefined)[]
  private tilesX: number
  private last: [number, number] | null = null
  private carry = 0
  private dirty: Rect | null = null
  private dabs = new Map<number, Dab>()

  constructor(
    private target: Bitmap,
    private o: StrokeOptions
  ) {
    this.tilesX = Math.ceil(target.width / T)
    this.tiles = new Array(this.tilesX * Math.ceil(target.height / T))
  }

  /** Continue the stroke to (x, y). Returns the area changed by this call, or null. */
  add(x: number, y: number, pressure: number | null): Rect | null {
    const lx = x - this.o.offset.x
    const ly = y - this.o.offset.y
    const size = pressure == null ? this.o.size : Math.max(1, this.o.size * pressure)
    const spacing = Math.max(1, size * 0.25)
    const { points, carry } = stampPoints(this.last ?? [lx, ly], [lx, ly], spacing, this.last ? this.carry : 0)
    this.last = [lx, ly]
    this.carry = carry
    let changed: Rect | null = null
    for (const p of points) {
      const r = this.stamp(p[0], p[1], size)
      if (r) changed = changed ? unionRect(changed, r) : r
    }
    if (changed) this.dirty = this.dirty ? unionRect(this.dirty, changed) : changed
    return changed
  }

  /** Everything the stroke changed (layer-local), or null if it never touched the layer. */
  end(): Rect | null {
    return this.dirty
  }

  /** The pixels of `r` (layer-local, inside the target) as they were before the stroke. */
  original(r: Rect): Bitmap {
    const out = readRect(this.target, r)
    this.eachTile((tile, tr) => {
      const c = intersectRect(tr, r)
      if (!c) return
      for (let y = c.y; y < c.y + c.height; y++) {
        const s = ((y - tr.y) * T + (c.x - tr.x)) * 4
        out.data.set(tile.orig.subarray(s, s + c.width * 4), ((y - r.y) * out.width + (c.x - r.x)) * 4)
      }
    })
    return out
  }

  /** Put the original pixels back (cancel). Returns the area restored. */
  restore(): Rect | null {
    const w = this.target.width
    this.eachTile((tile, tr) => {
      for (let y = tr.y; y < tr.y + tr.height; y++) {
        const s = (y - tr.y) * T * 4
        this.target.data.set(tile.orig.subarray(s, s + tr.width * 4), (y * w + tr.x) * 4)
      }
    })
    return this.dirty
  }

  /** Each saved tile with its valid area in layer coordinates. */
  private eachTile(fn: (tile: Tile, r: Rect) => void): void {
    const { width, height } = this.target
    this.tiles.forEach((tile, i) => {
      if (!tile) return
      const tx = (i % this.tilesX) * T
      const ty = Math.floor(i / this.tilesX) * T
      fn(tile, { x: tx, y: ty, width: Math.min(T, width - tx), height: Math.min(T, height - ty) })
    })
  }

  private dab(size: number): Dab {
    const key = Math.max(1, Math.round(size))
    let d = this.dabs.get(key)
    if (!d) {
      d = brushDab(key, this.o.hardness)
      this.dabs.set(key, d)
    }
    return d
  }

  /** Save the original of every tile `r` touches that isn't saved yet. */
  private ensureTiles(r: Rect): void {
    const { width, height, data } = this.target
    for (let ty = r.y >> SHIFT; ty <= (r.y + r.height - 1) >> SHIFT; ty++) {
      for (let tx = r.x >> SHIFT; tx <= (r.x + r.width - 1) >> SHIFT; tx++) {
        const i = ty * this.tilesX + tx
        if (this.tiles[i]) continue
        const orig = new Uint8ClampedArray(T * T * 4)
        const x0 = tx * T
        const w = Math.min(T, width - x0)
        for (let y = ty * T, row = 0; y < Math.min(height, ty * T + T); y++, row++) {
          const s = (y * width + x0) * 4
          orig.set(data.subarray(s, s + w * 4), row * T * 4)
        }
        this.tiles[i] = { orig, cov: new Float32Array(T * T) }
      }
    }
  }

  private stamp(cx: number, cy: number, size: number): Rect | null {
    const dab = this.dab(size)
    const n = dab.size
    const x0 = Math.round(cx - n / 2)
    const y0 = Math.round(cy - n / 2)
    const r = intersectRect({ x: x0, y: y0, width: n, height: n }, { x: 0, y: 0, width: this.target.width, height: this.target.height })
    if (!r) return null
    this.ensureTiles(r)
    const { mask, offset, flow, opacity, color, erase } = this.o
    const ca = (color[3] / 255) * opacity
    const D = this.target.data
    const W = this.target.width
    for (let y = r.y; y < r.y + r.height; y++) {
      const tileRow = (y >> SHIFT) * this.tilesX
      const iy = (y & (T - 1)) * T
      const my = y + offset.y
      const mrow = mask && my >= 0 && my < mask.height ? my * mask.width : -1
      const arow = (y - y0) * n - x0
      for (let x = r.x; x < r.x + r.width; x++) {
        const a = dab.alpha[arow + x]
        if (a === 0) continue
        let m = 255
        if (mask) {
          const mx = x + offset.x
          m = mrow < 0 || mx < 0 || mx >= mask.width ? 0 : mask.data[mrow + mx]
          if (m === 0) continue
        }
        const tile = this.tiles[tileRow + (x >> SHIFT)]!
        const ti = iy + (x & (T - 1))
        const c = tile.cov[ti] + (1 - tile.cov[ti]) * a * flow
        tile.cov[ti] = c
        const k = (c * m) / 255
        const di = (y * W + x) * 4
        if (erase) eraseOver(D, di, tile.orig, ti * 4, k * opacity)
        else paintOver(D, di, tile.orig, ti * 4, color[0], color[1], color[2], k * ca)
      }
    }
    return r
  }
}
