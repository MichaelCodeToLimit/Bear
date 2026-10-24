import { describe, expect, it } from 'vitest'
import { createBitmap } from '../model/bitmap'
import { createDoc, createLayer } from '../model/doc'
import { compositeSignature } from './signature'

describe('compositeSignature', () => {
  const doc = createDoc(10, 10, [255, 255, 255, 255])
  doc.layers.push(createLayer('Top', createBitmap(4, 4)))

  it('is stable for the same inputs', () => {
    expect(compositeSignature(doc, undefined, 0)).toBe(compositeSignature(doc, undefined, 0))
  })

  it('changes with layer properties, pixel identity, order and the version counter', () => {
    const base = compositeSignature(doc, undefined, 0)
    const top = doc.layers[1] as unknown as Record<string, unknown>
    const edits: [string, unknown][] = [
      ['opacity', 0.5],
      ['visible', false],
      ['blend', 'multiply'],
      ['x', 3],
      ['y', -2]
    ]
    for (const [k, val] of edits) {
      const old = top[k]
      top[k] = val
      expect(compositeSignature(doc, undefined, 0), k).not.toBe(base)
      top[k] = old
    }
    expect(compositeSignature(doc, undefined, 0)).toBe(base)
    const px = doc.layers[1].pixels
    doc.layers[1].pixels = createBitmap(4, 4)
    expect(compositeSignature(doc, undefined, 0)).not.toBe(base)
    doc.layers[1].pixels = px
    expect(compositeSignature(doc, undefined, 1)).not.toBe(base)
    expect(compositeSignature({ ...doc, layers: [...doc.layers].reverse() }, undefined, 0)).not.toBe(base)
    expect(compositeSignature({ ...doc, width: 11 }, undefined, 0)).not.toBe(base)
  })

  it('ignores selection, active layer and colours', () => {
    const base = compositeSignature(doc, undefined, 0)
    expect(compositeSignature({ ...doc, foreground: [1, 2, 3, 255], selection: null, activeLayerId: 'x' }, undefined, 0)).toBe(base)
  })

  it('changes with the preview kind, params, lut and mask identity', () => {
    const id = doc.layers[1].id
    const lut = new Uint8Array(256)
    const sigs = new Set([
      compositeSignature(doc, undefined, 0),
      compositeSignature(doc, { layerId: id, kind: 'invert' }, 0),
      compositeSignature(doc, { layerId: id, kind: 'bw' }, 0),
      compositeSignature(doc, { layerId: id, kind: 'bc', brightness: 10, contrast: 0 }, 0),
      compositeSignature(doc, { layerId: id, kind: 'bc', brightness: 11, contrast: 0 }, 0),
      compositeSignature(doc, { layerId: id, kind: 'hsl', hue: 1, saturation: 0, lightness: 0 }, 0),
      compositeSignature(doc, { layerId: id, kind: 'lut', lut }, 0),
      compositeSignature(doc, { layerId: id, kind: 'lut', lut: new Uint8Array(256) }, 0),
      compositeSignature(doc, { layerId: id, kind: 'invert', mask: { width: 10, height: 10, data: new Uint8Array(100) } }, 0)
    ])
    expect(sigs.size).toBe(9)
    expect(compositeSignature(doc, { layerId: id, kind: 'lut', lut }, 0)).toBe(compositeSignature(doc, { layerId: id, kind: 'lut', lut }, 0))
  })
})
