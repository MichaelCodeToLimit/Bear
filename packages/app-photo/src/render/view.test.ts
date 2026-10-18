import { describe, expect, it } from 'vitest'
import { docToScreen, fitView, screenToDoc, visibleDocRect, zoomAt, type ViewState } from './view'

const v: ViewState = { zoom: 1.5, panX: 37, panY: -12, viewW: 800, viewH: 600 }

describe('view', () => {
  it('screenToDoc inverts docToScreen', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 123.25, y: -40 }, { x: 4000, y: 3000 }]) {
      const q = screenToDoc(v, docToScreen(v, p))
      expect(q.x).toBeCloseTo(p.x, 9)
      expect(q.y).toBeCloseTo(p.y, 9)
    }
  })

  it('docToScreen applies zoom then pan', () => {
    expect(docToScreen(v, { x: 10, y: 20 })).toEqual({ x: 52, y: 18 })
  })

  it('zoomAt keeps the doc point under the cursor fixed', () => {
    const before = screenToDoc(v, { x: 200, y: 150 })
    const z = zoomAt(v, 2, 200, 150)
    expect(z.zoom).toBe(3)
    const after = screenToDoc(z, { x: 200, y: 150 })
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
    expect(z.viewW).toBe(800)
    expect(z.viewH).toBe(600)
  })

  it('zoomAt clamps to 32 and 0.01, still keeping the point fixed', () => {
    const hi = zoomAt(v, 1000, 200, 150)
    expect(hi.zoom).toBe(32)
    const p = screenToDoc(hi, { x: 200, y: 150 })
    const want = screenToDoc(v, { x: 200, y: 150 })
    expect(p.x).toBeCloseTo(want.x, 9)
    expect(p.y).toBeCloseTo(want.y, 9)
    expect(zoomAt(v, 1e-6, 200, 150).zoom).toBe(0.01)
  })

  it('fitView of 4000x2000 into 800x600 gives zoom 0.2, centred', () => {
    const f = fitView(4000, 2000, 800, 600)
    expect(f.zoom).toBeCloseTo(0.2, 12)
    expect(f.panX).toBe(0)
    expect(f.panY).toBe(100)
    expect(f.viewW).toBe(800)
    expect(f.viewH).toBe(600)
  })

  it('visibleDocRect is the on-screen part of the doc in whole pixels', () => {
    const view: ViewState = { zoom: 2, panX: -10, panY: -11, viewW: 100, viewH: 100 }
    expect(visibleDocRect(1000, 1000, view)).toEqual({ x: 5, y: 5, width: 50, height: 51 })
    expect(visibleDocRect(20, 20, view)).toEqual({ x: 5, y: 5, width: 15, height: 15 })
    expect(visibleDocRect(4, 4, view)).toBeNull()
    expect(visibleDocRect(10, 10, { zoom: 1, panX: 50, panY: 50, viewW: 100, viewH: 100 })).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('fitView rounds the pan to whole pixels', () => {
    const f = fitView(101, 100, 200, 100)
    expect(Number.isInteger(f.panX)).toBe(true)
    expect(Number.isInteger(f.panY)).toBe(true)
  })
})
