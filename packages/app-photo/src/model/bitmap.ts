/** RGBA, straight (non-premultiplied) alpha, row-major. */
export interface Bitmap {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type RGBA = [number, number, number, number]

export function createBitmap(width: number, height: number, fill?: RGBA): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4)
  if (fill && (fill[0] || fill[1] || fill[2] || fill[3])) {
    for (let i = 0; i < data.length; i += 4) data.set(fill, i)
  }
  return { width, height, data }
}

export function cloneBitmap(b: Bitmap): Bitmap {
  return { width: b.width, height: b.height, data: b.data.slice() }
}

/** Copy a rect out of a bitmap. The rect is clamped to the bitmap; out-of-range areas are dropped. */
export function readRect(b: Bitmap, r: Rect): Bitmap {
  const c = intersectRect(r, { x: 0, y: 0, width: b.width, height: b.height })
  if (!c) return createBitmap(0, 0)
  const out = createBitmap(c.width, c.height)
  for (let row = 0; row < c.height; row++) {
    const s = ((c.y + row) * b.width + c.x) * 4
    out.data.set(b.data.subarray(s, s + c.width * 4), row * c.width * 4)
  }
  return out
}

/** Write `src` into `b` with its top-left at (r.x, r.y). Anything outside `b` is clipped. */
export function writeRect(b: Bitmap, r: Rect, src: Bitmap): void {
  const c = intersectRect({ x: r.x, y: r.y, width: src.width, height: src.height }, { x: 0, y: 0, width: b.width, height: b.height })
  if (!c) return
  for (let row = 0; row < c.height; row++) {
    const s = ((c.y - r.y + row) * src.width + (c.x - r.x)) * 4
    b.data.set(src.data.subarray(s, s + c.width * 4), ((c.y + row) * b.width + c.x) * 4)
  }
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.width, b.x + b.width)
  const y2 = Math.max(a.y + a.height, b.y + b.height)
  return { x, y, width: x2 - x, height: y2 - y }
}

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  if (x2 <= x || y2 <= y) return null
  return { x, y, width: x2 - x, height: y2 - y }
}
