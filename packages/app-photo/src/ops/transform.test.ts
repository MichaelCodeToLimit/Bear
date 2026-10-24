import { describe, expect, it } from 'vitest'
import { createBitmap, type Bitmap, type RGBA } from '../model/bitmap'
import { flip, rotate90, trimBounds } from './transform'

const A: RGBA = [255, 0, 0, 255]
const B: RGBA = [0, 0, 255, 255]
const px = (b: Bitmap, x: number, y: number): number[] => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))
function random(w: number, h: number): Bitmap {
  const b = createBitmap(w, h)
  for (let i = 0; i < b.data.length; i++) b.data[i] = (i * 37 + 11) % 256
  return b
}

describe('rotate90', () => {
  const ab = (): Bitmap => {
    const b = createBitmap(2, 1)
    b.data.set(A, 0)
    b.data.set(B, 4)
    return b
  }

  it('one clockwise turn of a 2x1 [A,B] gives a 1x2 [A;B]', () => {
    const r = rotate90(ab(), 1)
    expect([r.width, r.height]).toEqual([1, 2])
    expect(px(r, 0, 0)).toEqual(A)
    expect(px(r, 0, 1)).toEqual(B)
  })

  it('three turns is one counter-clockwise turn: [B;A]', () => {
    const r = rotate90(ab(), 3)
    expect([r.width, r.height]).toEqual([1, 2])
    expect(px(r, 0, 0)).toEqual(B)
    expect(px(r, 0, 1)).toEqual(A)
  })

  it('two turns reverses the row', () => {
    const r = rotate90(ab(), 2)
    expect([r.width, r.height]).toEqual([2, 1])
    expect(px(r, 0, 0)).toEqual(B)
  })

  it('four single turns is the identity', () => {
    const src = random(5, 3)
    let r = src
    for (let i = 0; i < 4; i++) r = rotate90(r, 1)
    expect(r).toEqual(src)
  })
})

describe('flip', () => {
  it('flipping twice is the identity, on both axes', () => {
    const src = random(4, 3)
    expect(flip(flip(src, 'h'), 'h')).toEqual(src)
    expect(flip(flip(src, 'v'), 'v')).toEqual(src)
  })

  it("'h' mirrors left-right and 'v' top-bottom", () => {
    const src = random(3, 2)
    expect(px(flip(src, 'h'), 0, 0)).toEqual(px(src, 2, 0))
    expect(px(flip(src, 'v'), 1, 0)).toEqual(px(src, 1, 1))
  })
})

describe('trimBounds', () => {
  it('finds a single opaque pixel', () => {
    const b = createBitmap(8, 8)
    b.data.set(A, (4 * 8 + 3) * 4)
    expect(trimBounds(b)).toEqual({ x: 3, y: 4, width: 1, height: 1 })
  })

  it('is null for a fully transparent image', () => {
    expect(trimBounds(createBitmap(5, 5))).toBeNull()
  })

  it('spans every non-transparent pixel, within an optional region', () => {
    const b = createBitmap(10, 10)
    b.data[(1 * 10 + 2) * 4 + 3] = 1
    b.data[(7 * 10 + 8) * 4 + 3] = 255
    expect(trimBounds(b)).toEqual({ x: 2, y: 1, width: 7, height: 7 })
    expect(trimBounds(b, { x: 5, y: 5, width: 5, height: 5 })).toEqual({ x: 8, y: 7, width: 1, height: 1 })
    expect(trimBounds(b, { x: 0, y: 3, width: 5, height: 3 })).toBeNull()
  })
})
