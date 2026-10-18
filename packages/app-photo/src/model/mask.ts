import type { Bitmap, Rect } from './bitmap'

/** Single-channel 8-bit image the size of the document. 0 = unselected, 255 = fully selected. */
export interface Mask {
  width: number
  height: number
  data: Uint8Array
}

export type SelectMode = 'replace' | 'add' | 'subtract' | 'intersect'

function emptyMask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) }
}

/** Rectangular selection, clipped to the document. Fractional rects are rounded to whole cells. */
export function rectMask(w: number, h: number, r: Rect): Mask {
  const m = emptyMask(w, h)
  const x0 = Math.max(0, Math.round(r.x))
  const y0 = Math.max(0, Math.round(r.y))
  const x1 = Math.min(w, Math.round(r.x + r.width))
  const y1 = Math.min(h, Math.round(r.y + r.height))
  if (x1 <= x0) return m
  for (let y = y0; y < y1; y++) m.data.fill(255, y * w + x0, y * w + x1)
  return m
}

const SS = 4

/** Elliptical selection inscribed in `r`, anti-aliased on the edge by 4x4 supersampling. */
export function ellipseMask(w: number, h: number, r: Rect): Mask {
  const m = emptyMask(w, h)
  if (r.width <= 0 || r.height <= 0) return m
  const rx = r.width / 2
  const ry = r.height / 2
  const cx = r.x + rx
  const cy = r.y + ry
  const x0 = Math.max(0, Math.floor(r.x))
  const y0 = Math.max(0, Math.floor(r.y))
  const x1 = Math.min(w, Math.ceil(r.x + r.width))
  const y1 = Math.min(h, Math.ceil(r.y + r.height))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let n = 0
      for (let sy = 0; sy < SS; sy++) {
        const dy = (y + (sy + 0.5) / SS - cy) / ry
        for (let sx = 0; sx < SS; sx++) {
          const dx = (x + (sx + 0.5) / SS - cx) / rx
          if (dx * dx + dy * dy <= 1) n++
        }
      }
      m.data[y * w + x] = Math.round((n * 255) / (SS * SS))
    }
  }
  return m
}

/** Even-odd polygon fill, anti-aliased by 4x supersampling. Points are in document pixel coordinates. */
export function polygonMask(w: number, h: number, pts: [number, number][]): Mask {
  const m = emptyMask(w, h)
  const n = pts.length
  if (n < 3 || w <= 0 || h <= 0) return m
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p[1] < minY) minY = p[1]
    if (p[1] > maxY) maxY = p[1]
  }
  const rowStart = Math.max(0, Math.floor(minY))
  const rowEnd = Math.min(h, Math.ceil(maxY))
  const counts = new Uint8Array(w)
  const xs: number[] = []
  for (let y = rowStart; y < rowEnd; y++) {
    counts.fill(0)
    let any = false
    for (let sy = 0; sy < SS; sy++) {
      const ys = y + (sy + 0.5) / SS
      xs.length = 0
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = pts[i]
        const [xj, yj] = pts[j]
        if (yi <= ys !== yj <= ys) xs.push(xi + ((ys - yi) / (yj - yi)) * (xj - xi))
      }
      if (xs.length < 2) continue
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // Sub-samples sit at (s + 0.5) / SS; take those inside [xs[k], xs[k+1]).
        const s0 = Math.max(0, Math.ceil(xs[k] * SS - 0.5))
        const s1 = Math.min(w * SS, Math.ceil(xs[k + 1] * SS - 0.5))
        for (let s = s0; s < s1; s++) counts[(s / SS) | 0]++
        if (s1 > s0) any = true
      }
    }
    if (any) {
      const o = y * w
      for (let x = 0; x < w; x++) m.data[o + x] = Math.round((counts[x] * 255) / (SS * SS))
    }
  }
  return m
}

/**
 * Magic wand. `src` is a layer bitmap whose top-left sits at `offset` (default 0,0) in document space;
 * `x, y` are DOCUMENT coordinates. The result is a document-sized mask (`docSize`, default = src size).
 * A pixel matches when its max per-channel difference (alpha included) from the seed pixel is <= `tolerance`.
 * Contiguous mode flood-fills 4-connected; otherwise every matching pixel in the layer is selected.
 * Pixels outside the layer are never selected.
 */
export function wandMask(
  src: Bitmap,
  x: number,
  y: number,
  tolerance: number,
  contiguous: boolean,
  offset: { x: number; y: number } = { x: 0, y: 0 },
  docSize: { w: number; h: number } = { w: src.width, h: src.height },
): Mask {
  const m = emptyMask(docSize.w, docSize.h)
  const sx = Math.floor(x) - offset.x
  const sy = Math.floor(y) - offset.y
  const sw = src.width
  const sh = src.height
  if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) return m
  const d = src.data
  const si = (sy * sw + sx) * 4
  const r0 = d[si]
  const g0 = d[si + 1]
  const b0 = d[si + 2]
  const a0 = d[si + 3]
  const tol = Math.max(0, tolerance)
  const matches = (px: number, py: number): boolean => {
    const i = (py * sw + px) * 4
    return (
      Math.abs(d[i] - r0) <= tol && Math.abs(d[i + 1] - g0) <= tol && Math.abs(d[i + 2] - b0) <= tol && Math.abs(d[i + 3] - a0) <= tol
    )
  }
  // Layer-space selected flags; cells that fall outside the document are dropped on copy-out.
  const sel = new Uint8Array(sw * sh)
  if (!contiguous) {
    for (let py = 0; py < sh; py++) for (let px = 0; px < sw; px++) if (matches(px, py)) sel[py * sw + px] = 1
  } else {
    const stack: number[] = [sx, sy]
    while (stack.length) {
      const py = stack.pop()!
      const px = stack.pop()!
      if (sel[py * sw + px] || !matches(px, py)) continue
      let l = px
      while (l > 0 && !sel[py * sw + l - 1] && matches(l - 1, py)) l--
      let r = px
      while (r < sw - 1 && !sel[py * sw + r + 1] && matches(r + 1, py)) r++
      sel.fill(1, py * sw + l, py * sw + r + 1)
      for (const ny of [py - 1, py + 1]) {
        if (ny < 0 || ny >= sh) continue
        let inSpan = false
        for (let nx = l; nx <= r; nx++) {
          const ok = !sel[ny * sw + nx] && matches(nx, ny)
          if (ok && !inSpan) stack.push(nx, ny)
          inSpan = ok
        }
      }
    }
  }
  for (let py = 0; py < sh; py++) {
    const dy = py + offset.y
    if (dy < 0 || dy >= docSize.h) continue
    for (let px = 0; px < sw; px++) {
      const dx = px + offset.x
      if (sel[py * sw + px] && dx >= 0 && dx < docSize.w) m.data[dy * docSize.w + dx] = 255
    }
  }
  return m
}

function isEmpty(m: Mask): boolean {
  const d = m.data
  for (let i = 0; i < d.length; i++) if (d[i] !== 0) return false
  return true
}

/**
 * Combine the current selection with a new one. Returns `null` when the result selects nothing.
 * `current === null` means "no selection" here (not "everything"): add/replace yield `next`,
 * while subtract and intersect have nothing to work on and yield `null`.
 * Add is a union (max), intersect is min, subtract removes `next` coverage from `current`.
 */
export function combineMask(current: Mask | null, next: Mask, mode: SelectMode): Mask | null {
  if (mode === 'replace' || (current === null && mode === 'add')) return isEmpty(next) ? null : next
  if (current === null) return null
  const out = emptyMask(current.width, current.height)
  const a = current.data
  const b = next.data
  const o = out.data
  let any = 0
  for (let i = 0; i < o.length; i++) {
    let v: number
    if (mode === 'add') v = a[i] > b[i] ? a[i] : b[i]
    else if (mode === 'intersect') v = a[i] < b[i] ? a[i] : b[i]
    else v = Math.round((a[i] * (255 - b[i])) / 255)
    o[i] = v
    any |= v
  }
  return any ? out : null
}

/** Edge-clamped box blur (half-width `r`) over rows, in place. */
function boxRows(d: Uint8Array, w: number, h: number, r: number): void {
  const line = new Uint8Array(w)
  const div = 2 * r + 1
  for (let y = 0; y < h; y++) {
    const o = y * w
    line.set(d.subarray(o, o + w))
    let sum = line[0] * (r + 1)
    for (let k = 1; k <= r; k++) sum += line[Math.min(k, w - 1)]
    for (let x = 0; x < w; x++) {
      d[o + x] = Math.round(sum / div)
      sum += line[Math.min(x + r + 1, w - 1)] - line[Math.max(x - r, 0)]
    }
  }
}

/** Edge-clamped box blur over columns, src -> dst, walking rows for cache friendliness. */
function boxCols(src: Uint8Array, dst: Uint8Array, w: number, h: number, r: number): void {
  const div = 2 * r + 1
  const col = new Int32Array(w)
  for (let k = -r; k <= r; k++) {
    const o = Math.min(Math.max(k, 0), h - 1) * w
    for (let x = 0; x < w; x++) col[x] += src[o + x]
  }
  for (let y = 0; y < h; y++) {
    const o = y * w
    for (let x = 0; x < w; x++) dst[o + x] = Math.round(col[x] / div)
    const add = Math.min(y + r + 1, h - 1) * w
    const sub = Math.max(y - r, 0) * w
    for (let x = 0; x < w; x++) col[x] += src[add + x] - src[sub + x]
  }
}

/**
 * Soften the selection edge. Approximates a Gaussian (sigma = radius / 2) with three separable
 * box blurs; edges are clamped so a selection touching the border stays solid there.
 * Returns a new mask of the same size.
 */
export function featherMask(m: Mask, radius: number): Mask {
  const out: Mask = { width: m.width, height: m.height, data: m.data.slice() }
  if (radius <= 0 || m.width === 0 || m.height === 0) return out
  const sigma = radius / 2
  let box = Math.floor(Math.sqrt(4 * sigma * sigma + 1))
  if (box % 2 === 0) box++
  const r = Math.max(1, (box - 1) / 2)
  let a: Uint8Array<ArrayBuffer> = new Uint8Array(m.data)
  let b = new Uint8Array(a.length)
  for (let pass = 0; pass < 3; pass++) {
    boxRows(a, m.width, m.height, r)
    boxCols(a, b, m.width, m.height, r)
    const t = a
    a = b
    b = t
  }
  out.data = a
  return out
}

/** Selection with 255 - value everywhere. Returns a new mask. */
export function invertMask(m: Mask): Mask {
  const d = new Uint8Array(m.data.length)
  for (let i = 0; i < d.length; i++) d[i] = 255 - m.data[i]
  return { width: m.width, height: m.height, data: d }
}

/** Bounding box of all non-zero cells, or null when nothing is selected. */
export function maskBounds(m: Mask): Rect | null {
  let x0 = m.width
  let y0 = m.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < m.height; y++) {
    const o = y * m.width
    for (let x = 0; x < m.width; x++) {
      if (m.data[o + x]) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}

/** Mask value at document coordinates. A null mask means "everything selected" (255); out of range is 0. */
export function maskValueAt(m: Mask | null, x: number, y: number): number {
  if (!m) return 255
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  if (xi < 0 || yi < 0 || xi >= m.width || yi >= m.height) return 0
  return m.data[yi * m.width + xi]
}

/**
 * Closed outlines along the 50% threshold (cells >= 128 are inside). Points are integer pixel corners;
 * the first point is not repeated at the end, and collinear points are dropped. Outer loops run
 * clockwise (screen coordinates) and holes counter-clockwise.
 */
export function traceEdges(m: Mask): [number, number][][] {
  const { width: w, height: h, data } = m
  const vw = w + 1
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] >= 128
  const from: number[] = []
  const to: number[] = []
  const edge = (a: number, b: number) => {
    from.push(a)
    to.push(b)
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] < 128) continue
      if (!inside(x, y - 1)) edge(y * vw + x, y * vw + x + 1)
      if (!inside(x + 1, y)) edge(y * vw + x + 1, (y + 1) * vw + x + 1)
      if (!inside(x, y + 1)) edge((y + 1) * vw + x + 1, (y + 1) * vw + x)
      if (!inside(x - 1, y)) edge((y + 1) * vw + x, y * vw + x)
    }
  }
  // Outgoing edges per start vertex (at most two, at saddle corners).
  const first = new Map<number, number>()
  const second = new Map<number, number>()
  for (let e = 0; e < from.length; e++) {
    if (first.has(from[e])) second.set(from[e], e)
    else first.set(from[e], e)
  }
  const used = new Uint8Array(from.length)
  const loops: [number, number][][] = []
  for (let e0 = 0; e0 < from.length; e0++) {
    if (used[e0]) continue
    const pts: [number, number][] = []
    let e = e0
    while (e >= 0 && !used[e]) {
      used[e] = 1
      pts.push([from[e] % vw, Math.floor(from[e] / vw)])
      const v = to[e]
      const a = first.get(v)
      const b = second.get(v)
      e = a !== undefined && !used[a] ? a : b !== undefined && !used[b] ? b : -1
    }
    const n = pts.length
    loops.push(
      pts.filter((p, i) => {
        const q = pts[(i + n - 1) % n]
        const r = pts[(i + 1) % n]
        return (p[0] - q[0]) * (r[1] - p[1]) - (p[1] - q[1]) * (r[0] - p[0]) !== 0
      }),
    )
  }
  return loops
}
