import { describe, expect, it } from 'vitest'
import { createBitmap } from '../model/bitmap'
import { createLayer } from '../model/doc'
import { layerThumbnail } from './thumbnail'

const px = (b: { width: number; data: Uint8ClampedArray }, x: number, y: number) => Array.from(b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))

describe('layerThumbnail', () => {
  it('fits the document into the side, keeping its shape', () => {
    const l = createLayer('A', createBitmap(200, 100, [255, 0, 0, 255]))
    const t = layerThumbnail(l, 200, 100, 64)
    expect([t.width, t.height]).toEqual([64, 32])
    expect(px(t, 10, 10)).toEqual([255, 0, 0, 255])
  })

  it('shows the layer where it sits in the document, ignoring its opacity, blend and visibility', () => {
    const l = createLayer('B', createBitmap(50, 50, [0, 0, 255, 255]), { x: 50, y: 0, opacity: 0.2, blend: 'multiply', visible: false })
    const t = layerThumbnail(l, 100, 100, 10)
    expect(px(t, 2, 2)[3]).toBe(0)
    expect(px(t, 7, 2)).toEqual([0, 0, 255, 255])
  })

  it('handles empty layers', () => {
    const t = layerThumbnail(createLayer('C', createBitmap(0, 0)), 10, 10, 8)
    expect([t.width, t.height]).toEqual([8, 8])
  })
})
