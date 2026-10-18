import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createBitmap, type Bitmap } from '../model/bitmap'
import { createDoc, createLayer, type PhotoDoc } from '../model/doc'
import { writeBearPhoto, readBearPhoto } from './bearphoto'
import { readPsd, writePsd } from './psd'
import { encodePng, decodePng } from './png'
import { checkOpenSize, prepareIncomingImage, memoryBudget } from './limits'
import { makeMaskedLayerPsd } from './fixtures/makeFixturePsd'

function noisy(w: number, h: number, seed: number): Bitmap {
  const b = createBitmap(w, h)
  for (let i = 0; i < b.data.length; i++) b.data[i] = (i * 37 + seed * 11 + (i >> 3)) & 255
  return b
}

function threeLayerDoc(): PhotoDoc {
  const doc = createDoc(8, 6, [10, 20, 30, 255])
  const bg = doc.layers[0]
  const shifted = createLayer('Shifted', noisy(4, 3, 1), { x: -3, y: -2, opacity: 0.5, blend: 'screen' })
  const text = createLayer('Hello', noisy(5, 2, 2), {
    kind: 'text',
    locked: true,
    x: 1,
    y: 2,
    text: { text: 'Hello', font: 'Arial', size: 12, color: [1, 2, 3, 255], align: 'center' }
  })
  const hidden = createLayer('Hidden', noisy(8, 6, 3), { visible: false, opacity: 0.4, blend: 'multiply' })
  doc.layers = [bg, shifted, text, hidden]
  doc.activeLayerId = text.id
  doc.foreground = [255, 0, 0, 255]
  doc.background = [0, 255, 0, 128]
  return doc
}

describe('bearphoto', () => {
  it('round-trips a document', async () => {
    const doc = threeLayerDoc()
    const back = await readBearPhoto(await writeBearPhoto(doc))
    expect(back).toEqual(doc)
    expect(back.selection).toBeNull()
    expect(back.layers[1].x).toBe(-3)
    expect(back.layers[1].y).toBe(-2)
  })

  it('is deterministic', async () => {
    const doc = threeLayerDoc()
    expect(await writeBearPhoto(doc)).toEqual(await writeBearPhoto(doc))
  })

  it('writes a preview no larger than 512 on its longest side', async () => {
    const doc = createDoc(1024, 256, [5, 5, 5, 255])
    const zip = await JSZip.loadAsync(await writeBearPhoto(doc))
    const preview = decodePng(await zip.file('preview.png')!.async('uint8array'))
    expect(preview.width).toBe(512)
    expect(preview.height).toBe(128)
  })

  it('rejects a file that is not a zip', async () => {
    await expect(readBearPhoto(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow('This is not a Bear Photo file')
  })

  it('rejects a zip without document.json', async () => {
    const zip = new JSZip()
    zip.file('other.txt', 'x')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    await expect(readBearPhoto(bytes)).rejects.toThrow('This is not a Bear Photo file')
  })

  it('rejects a newer version', async () => {
    const zip = await JSZip.loadAsync(await writeBearPhoto(threeLayerDoc()))
    const json = JSON.parse(await zip.file('document.json')!.async('string'))
    json.version = 2
    zip.file('document.json', JSON.stringify(json))
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    await expect(readBearPhoto(bytes)).rejects.toThrow('This file was made by a newer version of Bear. Update Bear to open it.')
  })

  it('reports a missing layer image', async () => {
    const doc = threeLayerDoc()
    const zip = await JSZip.loadAsync(await writeBearPhoto(doc))
    zip.remove(`layers/${doc.layers[1].id}.png`)
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    await expect(readBearPhoto(bytes)).rejects.toThrow('The file is damaged: layer "Shifted" is missing')
  })

  it('reports a truncated file as damaged', async () => {
    const bytes = await writeBearPhoto(threeLayerDoc())
    await expect(readBearPhoto(bytes.slice(0, bytes.length / 2))).rejects.toThrow("The file is damaged and can't be opened")
  })

  it('reports bad layer entries as damaged', async () => {
    const zip = await JSZip.loadAsync(await writeBearPhoto(threeLayerDoc()))
    const json = JSON.parse(await zip.file('document.json')!.async('string'))
    json.layers[1].width = 'x'
    zip.file('document.json', JSON.stringify(json))
    await expect(readBearPhoto(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow("The file is damaged and can't be opened")
    json.layers[1] = null
    zip.file('document.json', JSON.stringify(json))
    await expect(readBearPhoto(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow("The file is damaged and can't be opened")
  })

  it('reports a bad document size as damaged', async () => {
    const zip = await JSZip.loadAsync(await writeBearPhoto(threeLayerDoc()))
    const json = JSON.parse(await zip.file('document.json')!.async('string'))
    delete json.width
    zip.file('document.json', JSON.stringify(json))
    await expect(readBearPhoto(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow("The file is damaged and can't be opened")
  })

  it('reports a layer image of the wrong size or that cannot be decoded as damaged', async () => {
    const doc = threeLayerDoc()
    const zip = await JSZip.loadAsync(await writeBearPhoto(doc))
    const path = `layers/${doc.layers[1].id}.png`
    zip.file(path, encodePng(noisy(2, 2, 9)))
    await expect(readBearPhoto(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow("The file is damaged and can't be opened")
    zip.file(path, new Uint8Array([1, 2, 3]))
    await expect(readBearPhoto(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow("The file is damaged and can't be opened")
  })
})

describe('png', () => {
  it('round-trips exactly', () => {
    const b = noisy(7, 5, 4)
    const back = decodePng(encodePng(b))
    expect(back.width).toBe(7)
    expect(back.height).toBe(5)
    expect(back.data).toEqual(b.data)
  })
})

describe('psd', () => {
  it('round-trips names, visibility, opacity, blend, offsets and pixels', () => {
    const doc = threeLayerDoc()
    // Fully opaque pixels avoid any premultiplication differences.
    for (const l of doc.layers) for (let i = 3; i < l.pixels.data.length; i += 4) l.pixels.data[i] = 255
    const { doc: back, warnings } = readPsd(writePsd(doc))
    expect(warnings).toEqual([])
    expect(back.width).toBe(doc.width)
    expect(back.height).toBe(doc.height)
    expect(back.layers).toHaveLength(doc.layers.length)
    doc.layers.forEach((l, i) => {
      const r = back.layers[i]
      expect(r.name).toBe(l.name)
      expect(r.visible).toBe(l.visible)
      expect(Math.abs(r.opacity - l.opacity)).toBeLessThanOrEqual(1 / 255)
      expect(r.blend).toBe(l.blend)
      expect(r.x).toBe(l.x)
      expect(r.y).toBe(l.y)
      expect(r.pixels.width).toBe(l.pixels.width)
      expect(r.pixels.height).toBe(l.pixels.height)
      expect(r.pixels.data).toEqual(l.pixels.data)
    })
  })

  it('maps color-dodge to ag-psd color dodge', () => {
    const doc = createDoc(2, 2, [9, 9, 9, 255])
    doc.layers.push(createLayer('D', createBitmap(2, 2, [200, 100, 50, 255]), { blend: 'color-dodge' }))
    expect(readPsd(writePsd(doc)).doc.layers[1].blend).toBe('color-dodge')
  })

  it('opens the fixture and warns about what it left out', () => {
    const { doc, warnings } = readPsd(makeMaskedLayerPsd())
    expect(warnings).toContain('Layer masks were left out')
    expect(warnings).toContain('Smart objects were opened as plain pixels')
    expect(warnings).toContain('Layer effects were left out')
    expect(warnings).toContain('Layer groups were ungrouped')
    expect(warnings).toContain('Adjustment layers were left out')
    expect(doc.layers.length).toBeGreaterThanOrEqual(4)
    expect(doc.layers.some((l) => l.name === 'Masked')).toBe(true)
  })
})

describe('size limits', () => {
  it('rejects oversized dimensions with a rounded-down scale', () => {
    expect(checkOpenSize(30001, 10, 1e12)).toEqual({ ok: false, reason: 'dimensions', scale: 0.999 })
  })
  it('rejects by memory', () => {
    const r = checkOpenSize(10000, 10000, 600e6)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('memory')
      expect((10000 * r.scale) ** 2 * 12).toBeLessThanOrEqual(600e6)
      expect((10000 * (r.scale + 0.001)) ** 2 * 12).toBeGreaterThan(600e6)
    }
  })
  it('accepts small images', () => {
    expect(checkOpenSize(100, 100, 1e9)).toEqual({ ok: true })
  })
  it('applies the same rules to incoming images', () => {
    expect(prepareIncomingImage(40000, 100, 1e12)).toEqual({ ok: false, reason: 'dimensions', scale: 0.75 })
  })
  it('has a sane memory budget', () => {
    expect(memoryBudget()).toBeGreaterThan(0)
  })
})
