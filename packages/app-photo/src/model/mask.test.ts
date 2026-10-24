import { describe, expect, it } from 'vitest'
import { createBitmap } from './bitmap'
import {
  combineMask,
  ellipseMask,
  featherMask,
  invertMask,
  maskBounds,
  maskValueAt,
  polygonMask,
  rectMask,
  traceEdges,
  wandMask,
} from './mask'

const count = (m: { data: Uint8Array }, v = 255) => m.data.filter((x) => x === v).length
const selected = (m: { data: Uint8Array }) => m.data.filter((x) => x > 0).length

describe('rect/combine', () => {
  it('rectMask selects exactly the rect', () => {
    const m = rectMask(10, 10, { x: 2, y: 2, width: 3, height: 3 })
    expect(count(m)).toBe(9)
    expect(count(m, 0)).toBe(91)
  })
  it('rectMask clips to the document', () => {
    const m = rectMask(4, 4, { x: -2, y: 2, width: 4, height: 10 })
    expect(count(m)).toBe(2 * 2)
  })
  it('add, subtract, intersect', () => {
    const a = rectMask(10, 10, { x: 0, y: 0, width: 3, height: 3 })
    const b = rectMask(10, 10, { x: 5, y: 5, width: 3, height: 3 })
    expect(count(combineMask(a, b, 'add')!)).toBe(18)
    expect(combineMask(a, b, 'intersect')).toBeNull()
    const big = rectMask(10, 10, { x: 0, y: 0, width: 6, height: 6 })
    const inner = rectMask(10, 10, { x: 2, y: 2, width: 2, height: 2 })
    expect(count(combineMask(big, inner, 'subtract')!)).toBe(36 - 4)
    expect(combineMask(big, big, 'subtract')).toBeNull()
    expect(combineMask(a, b, 'replace')).toBe(b)
  })
  it('null current means no selection', () => {
    const b = rectMask(4, 4, { x: 0, y: 0, width: 2, height: 2 })
    expect(combineMask(null, b, 'add')).toBe(b)
    expect(combineMask(null, b, 'replace')).toBe(b)
    expect(combineMask(null, b, 'subtract')).toBeNull()
    expect(combineMask(null, b, 'intersect')).toBeNull()
  })
  it('replace with empty returns null', () => {
    expect(combineMask(null, rectMask(4, 4, { x: 0, y: 0, width: 0, height: 0 }), 'replace')).toBeNull()
  })
})

describe('ellipse/polygon', () => {
  it('circle is symmetric with partial values only on the edge', () => {
    const m = ellipseMask(10, 10, { x: 0, y: 0, width: 10, height: 10 })
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++) {
        const v = m.data[y * 10 + x]
        expect(m.data[y * 10 + (9 - x)]).toBe(v)
        expect(m.data[(9 - y) * 10 + x]).toBe(v)
        expect(m.data[x * 10 + y]).toBe(v)
      }
    expect(m.data[5 * 10 + 5]).toBe(255)
    expect(m.data[0]).toBe(0)
    const partial = m.data.filter((v) => v > 0 && v < 255).length
    expect(partial).toBeGreaterThan(0)
    expect(m.data[5 * 10 + 0]).toBeGreaterThan(0)
  })
  it('polygon fills a pixel-aligned square fully and anti-aliases half pixels', () => {
    const sq = polygonMask(8, 8, [[2, 2], [5, 2], [5, 5], [2, 5]])
    expect(count(sq)).toBe(9)
    expect(selected(sq)).toBe(9)
    const half = polygonMask(8, 8, [[2, 2], [4.5, 2], [4.5, 4], [2, 4]])
    expect(half.data[2 * 8 + 4]).toBeGreaterThan(100)
    expect(half.data[2 * 8 + 4]).toBeLessThan(155)
  })
  it('polygon is even-odd', () => {
    const outer = [[0, 0], [8, 0], [8, 8], [0, 8], [0, 0], [2, 2], [2, 6], [6, 6], [6, 2], [2, 2]] as [number, number][]
    const m = polygonMask(8, 8, outer)
    expect(m.data[3 * 8 + 3]).toBe(0)
    expect(m.data[0]).toBe(255)
  })
})

describe('wand', () => {
  it('tolerance selects by max channel difference', () => {
    const b = createBitmap(10, 4)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 10; x++) b.data.set(x < 5 ? [200, 0, 0, 255] : [210, 0, 0, 255], (y * 10 + x) * 4)
    expect(selected(wandMask(b, 0, 0, 5, true))).toBe(20)
    expect(selected(wandMask(b, 0, 0, 20, true))).toBe(40)
  })
  it('contiguous vs global', () => {
    const b = createBitmap(10, 4, [255, 255, 255, 255])
    for (const x0 of [1, 6])
      for (let y = 1; y < 3; y++) for (let x = x0; x < x0 + 2; x++) b.data.set([255, 0, 0, 255], (y * 10 + x) * 4)
    expect(selected(wandMask(b, 1, 1, 0, true))).toBe(4)
    expect(selected(wandMask(b, 1, 1, 0, false))).toBe(8)
  })
  it('alpha counts and layer offset / docSize are honoured', () => {
    const b = createBitmap(2, 2, [10, 10, 10, 255])
    b.data[3] = 0
    expect(selected(wandMask(b, 0, 0, 0, true))).toBe(1)
    const m = wandMask(b, 6, 5, 0, true, { x: 5, y: 5 }, { w: 10, h: 10 })
    expect(m.width).toBe(10)
    expect(m.data[5 * 10 + 6]).toBe(255)
    expect(selected(m)).toBe(3)
    expect(m.data[5 * 10 + 5]).toBe(0)
    expect(selected(wandMask(b, 0, 0, 0, true, { x: 5, y: 5 }, { w: 10, h: 10 }))).toBe(0)
  })
})

describe('feather/invert/bounds/value/trace', () => {
  it('feather softens edges and keeps the centre', () => {
    const m = rectMask(20, 20, { x: 5, y: 5, width: 10, height: 10 })
    const f = featherMask(m, 2)
    expect(f.width).toBe(20)
    expect(f.data[10 * 20 + 10]).toBe(255)
    const edge = f.data[10 * 20 + 5]
    expect(edge).toBeGreaterThan(0)
    expect(edge).toBeLessThan(255)
    expect(f.data[10 * 20 + 4]).toBeGreaterThan(0)
    expect(m.data[10 * 20 + 4]).toBe(0)
  })
  it('feather 0 is a copy; border-touching selection stays solid', () => {
    const m = rectMask(8, 8, { x: 0, y: 0, width: 8, height: 8 })
    expect(featherMask(m, 0).data).toEqual(m.data)
    expect(count(featherMask(m, 3))).toBe(64)
  })
  it('invert', () => {
    const m = rectMask(4, 4, { x: 0, y: 0, width: 1, height: 1 })
    const i = invertMask(m)
    expect(i.data[0]).toBe(0)
    expect(i.data[1]).toBe(255)
    expect(m.data[1]).toBe(0)
  })
  it('bounds', () => {
    expect(maskBounds(rectMask(10, 10, { x: 0, y: 0, width: 0, height: 0 }))).toBeNull()
    expect(maskBounds(rectMask(10, 10, { x: 2, y: 3, width: 4, height: 2 }))).toEqual({ x: 2, y: 3, width: 4, height: 2 })
  })
  it('maskValueAt', () => {
    const m = rectMask(4, 4, { x: 1, y: 1, width: 1, height: 1 })
    expect(maskValueAt(null, 99, 99)).toBe(255)
    expect(maskValueAt(m, 1, 1)).toBe(255)
    expect(maskValueAt(m, 0, 0)).toBe(0)
    expect(maskValueAt(m, -1, 0)).toBe(0)
    expect(maskValueAt(m, 4, 0)).toBe(0)
  })
  it('traceEdges of a rect is one closed loop around it', () => {
    const loops = traceEdges(rectMask(10, 10, { x: 2, y: 2, width: 3, height: 3 }))
    expect(loops).toHaveLength(1)
    expect(loops[0]).toHaveLength(4)
    const keys = loops[0].map((p) => p.join(',')).sort()
    expect(keys).toEqual(['2,2', '2,5', '5,2', '5,5'])
  })
  it('traceEdges gives outer and hole loops, and handles empty', () => {
    const ring = combineMask(
      rectMask(10, 10, { x: 0, y: 0, width: 6, height: 6 }),
      rectMask(10, 10, { x: 2, y: 2, width: 2, height: 2 }),
      'subtract',
    )!
    expect(traceEdges(ring)).toHaveLength(2)
    expect(traceEdges(rectMask(4, 4, { x: 0, y: 0, width: 0, height: 0 }))).toEqual([])
  })
  it('traceEdges separates diagonal-touching cells without crashing', () => {
    const m = rectMask(4, 4, { x: 0, y: 0, width: 1, height: 1 })
    m.data[1 * 4 + 1] = 255
    const loops = traceEdges(m)
    expect(loops.reduce((n, l) => n + l.length, 0)).toBeGreaterThanOrEqual(8)
  })
})
