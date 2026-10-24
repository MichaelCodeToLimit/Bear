import { describe, expect, it } from 'vitest'
import { createBitmap } from './model/bitmap'
import { createDoc, createLayer, type PhotoDoc } from './model/doc'
import { decodePng } from './io/png'
import { compositeLayers } from './ops/composite'
import { SAVABLE, flattenWarning, loadPhotoFile, needsFlatten, scaleDoc, serializePhoto } from './file-io'

const BIG = 1 << 30

function twoLayerDoc(): PhotoDoc {
  const doc = createDoc(6, 4, [200, 10, 10, 255])
  const top = createLayer('Top', createBitmap(2, 2, [0, 0, 255, 255]), { x: 1, y: 1, opacity: 0.5 })
  doc.layers.push(top)
  doc.activeLayerId = top.id
  return doc
}

const opened = (path: string, data: Uint8Array) => ({ path, name: path.split('/').pop()!, data })

describe('file-io', () => {
  it('saves only bearphoto and psd in place', () => {
    expect([...SAVABLE].sort()).toEqual(['bearphoto', 'psd'])
  })

  it('round-trips .bearphoto', async () => {
    const doc = twoLayerDoc()
    const bytes = await serializePhoto(doc, 'C:/x/pic.bearphoto')
    const res = await loadPhotoFile(opened('C:/x/pic.bearphoto', bytes), BIG)
    if (!('doc' in res)) throw new Error('expected a doc')
    expect(res.doc).toEqual(doc)
    expect(res.warnings).toEqual([])
  })

  it('round-trips .psd layers', async () => {
    const doc = twoLayerDoc()
    const bytes = await serializePhoto(doc, '/x/pic.PSD')
    const res = await loadPhotoFile(opened('/x/pic.PSD', bytes), BIG)
    if (!('doc' in res)) throw new Error('expected a doc')
    expect(res.doc.layers.map((l) => l.name)).toEqual(['Background', 'Top'])
    expect(res.doc.layers[1].x).toBe(1)
  })

  it('writes .png as the flattened image and reads it back as one layer', async () => {
    const doc = twoLayerDoc()
    const bytes = await serializePhoto(doc, '/x/pic.png')
    expect(decodePng(bytes)).toEqual(compositeLayers(doc.layers, 6, 4))
    const res = await loadPhotoFile(opened('/x/pic.png', bytes), BIG)
    if (!('doc' in res)) throw new Error('expected a doc')
    expect(res.doc.layers).toHaveLength(1)
    expect(res.doc.width).toBe(6)
  })

  it('rejects extensions it cannot write', async () => {
    await expect(serializePhoto(twoLayerDoc(), '/x/pic.gif')).rejects.toThrow(/GIF/)
  })

  it('asks to scale when the image is over budget, and scales when told to', async () => {
    const doc = createDoc(100, 50, [1, 2, 3, 255])
    const bytes = await serializePhoto(doc, '/x/big.bearphoto')
    const res = await loadPhotoFile(opened('/x/big.bearphoto', bytes), 100 * 50 * 12 - 1)
    expect(res).toEqual({ needsScale: expect.any(Number), reason: 'memory' })
    const scaled = await loadPhotoFile(opened('/x/big.bearphoto', bytes), BIG, 0.5)
    if (!('doc' in scaled)) throw new Error('expected a doc')
    expect([scaled.doc.width, scaled.doc.height]).toEqual([50, 25])
    expect(scaled.doc.layers[0].pixels.width).toBe(50)
    expect(Array.from(scaled.doc.layers[0].pixels.data.slice(0, 4))).toEqual([1, 2, 3, 255])
  })

  it('scales layer offsets with the document', () => {
    const doc = twoLayerDoc()
    doc.layers[1].x = 4
    const out = scaleDoc(doc, 0.5)
    expect([out.width, out.height]).toEqual([3, 2])
    expect(out.layers[1].x).toBe(2)
    expect(out.layers[1].pixels.width).toBe(1)
  })

  it('warns before flattening layers into a flat format', () => {
    const doc = twoLayerDoc()
    expect(needsFlatten(doc, '/x/a.png')).toBe(true)
    expect(needsFlatten(doc, '/x/a.bearphoto')).toBe(false)
    expect(needsFlatten(doc, '/x/a.psd')).toBe(false)
    expect(needsFlatten(createDoc(2, 2, 'transparent'), '/x/a.jpg')).toBe(false)
    expect(flattenWarning('/x/a.jpg')).toBe('Saving as JPG flattens your layers into one. Keep a .bearphoto copy to edit layers later.')
  })
})
