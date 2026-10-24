import { describe, expect, it } from 'vitest'
import { formatZoom, zoomCommand } from './zoom'

const view = { zoom: 1, panX: 0, panY: 0, viewW: 800, viewH: 600 }

describe('zoom commands', () => {
  it('steps through the zoom levels around the centre', () => {
    const v = zoomCommand(view, 'in', 100, 100)
    expect(v.zoom).toBe(1.5)
    // The doc point under the centre (400, 300) stays put.
    expect((400 - v.panX) / v.zoom).toBeCloseTo(400)
    expect(zoomCommand(view, 'out', 100, 100).zoom).toBeCloseTo(0.6667)
    expect(zoomCommand({ ...view, zoom: 32 }, 'in', 100, 100).zoom).toBe(32)
    expect(zoomCommand({ ...view, zoom: 0.7 }, 'out', 100, 100).zoom).toBeCloseTo(0.6667)
  })

  it('fits and returns to 100%', () => {
    expect(zoomCommand(view, 'fit', 1600, 600).zoom).toBe(0.5)
    expect(zoomCommand({ ...view, zoom: 3 }, 'actual', 100, 100).zoom).toBe(1)
  })

  it('formats percentages', () => {
    expect(formatZoom(1)).toBe('100%')
    expect(formatZoom(0.6667)).toBe('67%')
    expect(formatZoom(0.005)).toBe('0.5%')
  })
})
