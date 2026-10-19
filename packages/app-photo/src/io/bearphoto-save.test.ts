import { describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { createBitmap, type Bitmap } from '../model/bitmap'
import { createDoc, createLayer, type PhotoDoc } from '../model/doc'
import { compositeLayers } from '../ops/composite'
import { previewOf, readBearPhoto, writeBearPhoto } from './bearphoto'
import { decodePng } from './png'
import { writeBearPhotoOffThread, type BearPhotoWorker } from './writeOffThread'

const solid = (w: number, h: number, c: [number, number, number, number]): Bitmap => {
  const b = createBitmap(w, h)
  for (let i = 0; i < b.data.length; i += 4) b.data.set(c, i)
  return b
}

function bigDoc(): PhotoDoc {
  const doc = createDoc(1200, 600, [255, 255, 255, 255])
  // A red square on the right half, partly off the canvas, and a hidden layer that must not show.
  doc.layers.push(createLayer('Red', solid(720, 360, [255, 0, 0, 255]), { x: 840, y: 120 }))
  doc.layers.push(createLayer('Hidden', solid(1200, 600, [0, 0, 255, 255]), { visible: false }))
  return doc
}

describe('.bearphoto writer', () => {
  it('stores layer PNGs uncompressed and deflates document.json', async () => {
    const zip = await JSZip.loadAsync(await writeBearPhoto(bigDoc()))
    const method = (name: string) => (zip.file(name) as unknown as { _data: { compression: { magic: string } } })._data.compression.magic
    // JSZip's compression "magic": \x00\x00 is STORE, \x08\x00 is DEFLATE.
    for (const name of Object.keys(zip.files).filter((n) => n.endsWith('.png'))) expect(method(name)).toBe('\x00\x00')
    expect(method('document.json')).toBe('\x08\x00')
  })

  it('still reads files written the old way (everything deflated)', async () => {
    const doc = bigDoc()
    const zip = await JSZip.loadAsync(await writeBearPhoto(doc))
    const old = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const back = await readBearPhoto(old)
    expect(back.layers.map((l) => l.name)).toEqual(['Background', 'Red', 'Hidden'])
    expect(back.layers[1].pixels.data).toEqual(doc.layers[1].pixels.data)
  })

  it('builds the preview from shrunk layers, matching a full composite', async () => {
    const doc = bigDoc()
    const preview = previewOf(doc)
    expect([preview.width, preview.height]).toEqual([512, 256])
    const px = (b: Bitmap, x: number, y: number) => Array.from(b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))
    expect(px(preview, 450, 100)).toEqual([255, 0, 0, 255]) // inside the red layer
    expect(px(preview, 100, 100)).toEqual([255, 255, 255, 255]) // white, the hidden blue layer left out
    expect(px(preview, 450, 20)).toEqual([255, 255, 255, 255])
    // The stored preview is that image.
    const zip = await JSZip.loadAsync(await writeBearPhoto(doc))
    const stored = decodePng(await zip.file('preview.png')!.async('uint8array'))
    expect(stored.data).toEqual(preview.data)
    // Small documents are composited at full size, as before.
    const small = createDoc(40, 20, [1, 2, 3, 255])
    expect(previewOf(small).data).toEqual(compositeLayers(small.layers, 40, 20).data)
  })
})

describe('writeBearPhotoOffThread', () => {
  const fakeWorker = (reply: (doc: PhotoDoc, w: BearPhotoWorker) => void) => {
    const w: BearPhotoWorker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: (doc) => setTimeout(() => reply(doc, w)),
      terminate: vi.fn()
    }
    return w
  }

  it('writes on the worker from a snapshot taken at the call', async () => {
    const doc = bigDoc()
    let seen: PhotoDoc | null = null
    const w = fakeWorker(async (snap, self) => {
      seen = snap
      self.onmessage!({ data: { ok: true, bytes: await writeBearPhoto(snap) } } as MessageEvent)
    })
    const pending = writeBearPhotoOffThread(doc, () => w)
    doc.layers[1].pixels.data[0] = 7 // an edit after the save started
    const back = await readBearPhoto(await pending)
    expect(back.layers[1].pixels.data[0]).toBe(255)
    expect(seen!.layers[1].pixels.data).not.toBe(doc.layers[1].pixels.data)
    expect(w.terminate).toHaveBeenCalled()
  })

  it('falls back to this thread when the worker fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const doc = bigDoc()
    const w = fakeWorker((_snap, self) => self.onerror!({ message: 'boom' } as ErrorEvent))
    const back = await readBearPhoto(await writeBearPhotoOffThread(doc, () => w))
    expect(back.layers).toHaveLength(3)
    expect(w.terminate).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('writes directly where there are no workers', async () => {
    const back = await readBearPhoto(await writeBearPhotoOffThread(bigDoc(), () => null))
    expect(back.width).toBe(1200)
  })
})
