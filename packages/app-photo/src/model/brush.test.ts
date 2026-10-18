import { describe, expect, it } from 'vitest'
import { createBitmap, type Bitmap, type RGBA } from './bitmap'
import { createDoc } from './doc'
import { PhotoEditor } from './editor'
import { brushDab, DAB_CACHE, quantizeSize, stampPoints, Stroke, type StrokeOptions } from './brush'

const BLACK: RGBA = [0, 0, 0, 255]
const opts = (o: Partial<StrokeOptions> = {}): StrokeOptions => ({
  size: 9,
  hardness: 1,
  opacity: 1,
  flow: 1,
  color: BLACK,
  erase: false,
  mask: null,
  offset: { x: 0, y: 0 },
  ...o
})
const alphaAt = (b: Bitmap, x: number, y: number) => b.data[(y * b.width + x) * 4 + 3]

describe('brushDab', () => {
  it('a hard dab is 1 in the centre and 0 in the corners', () => {
    const d = brushDab(9, 1)
    expect(d.size).toBe(9)
    expect(d.alpha[4 * 9 + 4]).toBe(1)
    for (const i of [0, 8, 8 * 9, 8 * 9 + 8]) expect(d.alpha[i]).toBe(0)
  })
  it('a soft dab fades outwards from the centre', () => {
    const d = brushDab(9, 0)
    const row = Array.from(d.alpha.subarray(4 * 9 + 4, 4 * 9 + 9))
    expect(row[0]).toBe(1)
    for (let i = 1; i < row.length; i++) expect(row[i]).toBeLessThan(row[i - 1])
  })
})

describe('stampPoints', () => {
  it('spaces points evenly along the segment', () => {
    const { points } = stampPoints([0, 0], [10, 0], 2, 0)
    expect(points.map((p) => p[0])).toEqual([0, 2, 4, 6, 8, 10])
    expect(points.every((p) => p[1] === 0)).toBe(true)
  })
  it('carries the spacing over to the next segment', () => {
    const a = stampPoints([0, 0], [3, 0], 2, 0)
    expect(a.points.map((p) => p[0])).toEqual([0, 2])
    expect(a.carry).toBeCloseTo(1)
    const b = stampPoints([3, 0], [6, 0], 2, a.carry)
    expect(b.points.map((p) => p[0])).toEqual([4, 6])
  })
})

describe('Stroke', () => {
  it('overlapping dabs never pass the stroke opacity', () => {
    const b = createBitmap(30, 30)
    const s = new Stroke(b, opts({ opacity: 0.5, flow: 0.5 }))
    for (let i = 0; i < 20; i++) s.add(15 + (i % 3) * 0.3, 15, null)
    let max = 0
    for (let i = 3; i < b.data.length; i += 4) max = Math.max(max, b.data[i])
    expect(max).toBeGreaterThan(100)
    expect(max).toBeLessThanOrEqual(128)
  })
  it('the eraser at opacity 1 clears painted pixels', () => {
    const b = createBitmap(20, 20, [255, 0, 0, 255])
    const s = new Stroke(b, opts({ erase: true }))
    s.add(5, 10, null)
    s.add(15, 10, null)
    for (let x = 5; x <= 15; x++) expect(alphaAt(b, x, 10)).toBe(0)
    expect(alphaAt(b, 10, 0)).toBe(255)
  })
  it('pressure scales the dab', () => {
    const big = createBitmap(30, 30)
    new Stroke(big, opts({ size: 20 })).add(15, 15, 1)
    const small = createBitmap(30, 30)
    new Stroke(small, opts({ size: 20 })).add(15, 15, 0.25)
    expect(alphaAt(big, 15, 8)).toBe(255)
    expect(alphaAt(small, 15, 8)).toBe(0)
    expect(alphaAt(small, 15, 15)).toBe(255)
  })
  it('only touches the dab rect and clips to the bitmap', () => {
    const b = createBitmap(20, 20)
    const s = new Stroke(b, opts({ size: 6 }))
    expect(s.add(1, 1, null)).toEqual({ x: 0, y: 0, width: 4, height: 4 })
    expect(s.end()).toEqual({ x: 0, y: 0, width: 4, height: 4 })
    const off = new Stroke(b, opts({ size: 6 }))
    expect(off.add(-20, -20, null)).toBeNull()
    expect(off.end()).toBeNull()
  })
  it('a stroke is one history step and undo restores the exact bytes', () => {
    const doc = createDoc(80, 80, 'transparent')
    const layer = doc.layers[0]
    for (let i = 0; i < layer.pixels.data.length; i++) layer.pixels.data[i] = (i * 37) % 251
    const orig = layer.pixels.data.slice()
    const ed = new PhotoEditor(doc)
    const s = new Stroke(layer.pixels, opts({ size: 15, hardness: 0.3, opacity: 0.7, flow: 0.6, color: [10, 200, 30, 255] }))
    // A long multi-dab stroke across several 64 px tiles.
    for (let i = 0; i <= 20; i++) s.add(5 + i * 3.5, 10 + i * 3, null)
    expect(s.end()).not.toBeNull()
    expect(Buffer.compare(Buffer.from(layer.pixels.data), Buffer.from(orig))).not.toBe(0)
    ed.editPixelTiles('Brush', layer.id, s.savedTiles())
    expect(ed.history.steps.length).toBe(1)
    const painted = layer.pixels.data.slice()
    ed.history.undo()
    expect(Buffer.compare(Buffer.from(layer.pixels.data), Buffer.from(orig))).toBe(0)
    ed.history.redo()
    expect(Buffer.compare(Buffer.from(layer.pixels.data), Buffer.from(painted))).toBe(0)
  })
  it('keeps the dab cache bounded under a pressure sweep', () => {
    const b = createBitmap(600, 600)
    const s = new Stroke(b, opts({ size: 400, hardness: 0.5 }))
    for (let i = 0; i < 200; i++) s.add(100 + i * 2, 300, (i + 1) / 200)
    expect(s.cachedDabs).toBeLessThanOrEqual(DAB_CACHE)
    // And the set of dab shapes a 1..2000 px brush can ever need is bounded.
    const sizes = new Set<number>()
    for (let v = 1; v <= 2000; v += 0.25) sizes.add(quantizeSize(v))
    expect(sizes.size).toBeLessThan(250)
    expect(quantizeSize(2000)).toBeGreaterThan(1950)
    expect(quantizeSize(7.4)).toBe(7)
  })
  it('restore puts the original pixels back', () => {
    const b = createBitmap(100, 100, [1, 2, 3, 4])
    const orig = b.data.slice()
    const s = new Stroke(b, opts({ size: 30 }))
    s.add(10, 10, null)
    s.add(90, 90, null)
    expect(s.restore()).toEqual(s.end())
    expect(Buffer.compare(Buffer.from(b.data), Buffer.from(orig))).toBe(0)
  })
})
