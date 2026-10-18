import { extensionOf, type FileFilter, type OpenedFile } from '@bear/core'
import { createBitmap, type Bitmap } from './model/bitmap'
import { createLayer, type PhotoDoc } from './model/doc'
import { compositeLayers } from './ops/composite'
import { readBearPhoto, writeBearPhoto } from './io/bearphoto'
import { readPsd, writePsd } from './io/psd'
import { decodePng, encodePng } from './io/png'
import { decodeImage, encodeImage } from './io/browser-image'
import { checkOpenSize } from './io/limits'

export const OPEN_EXTENSIONS = ['bearphoto', 'psd', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']

export const OPEN_FILTERS: FileFilter[] = [
  { name: 'Images', extensions: OPEN_EXTENSIONS },
  { name: 'All files', extensions: ['*'] }
]

export const SAVE_FILTERS: FileFilter[] = [
  { name: 'Bear Photo', extensions: ['bearphoto'] },
  { name: 'Layered image (.psd)', extensions: ['psd'] },
  { name: 'PNG image', extensions: ['png'] },
  { name: 'JPEG image', extensions: ['jpg', 'jpeg'] },
  { name: 'WebP image', extensions: ['webp'] }
]

/** Formats that keep layers, so Save (and AutoSave) can write back to them. */
export const SAVABLE = new Set(['bearphoto', 'psd'])

export type LoadResult = { doc: PhotoDoc; warnings: string[] } | { needsScale: number; reason: 'dimensions' | 'memory' }

/** A whole image as a one-layer document. */
export function docFromBitmap(pixels: Bitmap): PhotoDoc {
  const layer = createLayer('Background', pixels)
  return {
    width: pixels.width,
    height: pixels.height,
    layers: [layer],
    activeLayerId: layer.id,
    selection: null,
    foreground: [0, 0, 0, 255],
    background: [255, 255, 255, 255]
  }
}

/** Bilinear resample (straight alpha, weighted by alpha so transparent edges don't darken). */
export function scaleBitmap(src: Bitmap, w: number, h: number): Bitmap {
  const out = createBitmap(w, h)
  if (src.width === 0 || src.height === 0) return out
  const sx = src.width / w
  const sy = src.height / h
  const d = src.data
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(src.height - 1, (y + 0.5) * sy - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(src.height - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, Math.min(src.width - 1, (x + 0.5) * sx - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(src.width - 1, x0 + 1)
      const tx = fx - x0
      const taps: [number, number][] = [
        [(y0 * src.width + x0) * 4, (1 - tx) * (1 - ty)],
        [(y0 * src.width + x1) * 4, tx * (1 - ty)],
        [(y1 * src.width + x0) * 4, (1 - tx) * ty],
        [(y1 * src.width + x1) * 4, tx * ty]
      ]
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (const [i, wgt] of taps) {
        const wa = wgt * d[i + 3]
        r += d[i] * wa
        g += d[i + 1] * wa
        b += d[i + 2] * wa
        a += wa
      }
      const o = (y * w + x) * 4
      if (a > 0) {
        out.data[o] = r / a
        out.data[o + 1] = g / a
        out.data[o + 2] = b / a
      }
      out.data[o + 3] = a
    }
  }
  return out
}

/** Scale every layer (pixels and offsets) and the canvas by `scale`. */
export function scaleDoc(doc: PhotoDoc, scale: number): PhotoDoc {
  const size = (n: number) => Math.max(1, Math.round(n * scale))
  return {
    ...doc,
    width: size(doc.width),
    height: size(doc.height),
    selection: null,
    layers: doc.layers.map((l) => ({
      ...l,
      x: Math.round(l.x * scale),
      y: Math.round(l.y * scale),
      pixels: l.pixels.width && l.pixels.height ? scaleBitmap(l.pixels, size(l.pixels.width), size(l.pixels.height)) : l.pixels
    }))
  }
}

/** Decode a flat image (PNG in plain JS, everything else with the browser's decoder). */
export async function decodeFlatImage(data: Uint8Array, ext: string): Promise<Bitmap> {
  return ext === 'png' ? decodePng(data) : decodeImage(data, ext)
}

/** Extension for a file or clipboard item: from its name, else from a MIME type like "image/png". */
export function imageExtension(name: string, mime = ''): string {
  const ext = extensionOf(name)
  if (ext) return ext
  const sub = mime.startsWith('image/') ? mime.slice(6).toLowerCase() : ''
  return sub === 'jpeg' ? 'jpg' : sub
}

async function readAny(file: OpenedFile): Promise<{ doc: PhotoDoc; warnings: string[] }> {
  const ext = extensionOf(file.path || file.name)
  if (ext === 'bearphoto') return { doc: await readBearPhoto(file.data), warnings: [] }
  if (ext === 'psd') return readPsd(file.data)
  return { doc: docFromBitmap(await decodeFlatImage(file.data, ext)), warnings: [] }
}

/**
 * Read a file into a document. When it is too large for `budget` bytes (see checkOpenSize), returns the
 * largest scale that fits instead; call again with that `scale` to open it scaled down.
 */
export async function loadPhotoFile(file: OpenedFile, budget: number, scale?: number): Promise<LoadResult> {
  const { doc, warnings } = await readAny(file)
  if (scale !== undefined && scale < 1) return { doc: scaleDoc(doc, scale), warnings }
  const check = checkOpenSize(doc.width, doc.height, budget)
  if (!check.ok) return { needsScale: check.scale, reason: check.reason }
  return { doc, warnings }
}

const flatten = (doc: PhotoDoc, background?: [number, number, number, number]) =>
  compositeLayers(doc.layers, doc.width, doc.height, undefined, { background })

/** Encode the document for `path`, by extension. Flat formats get the flattened image. */
export async function serializePhoto(doc: PhotoDoc, path: string): Promise<Uint8Array> {
  const ext = extensionOf(path)
  switch (ext) {
    case 'bearphoto':
      return writeBearPhoto(doc)
    case 'psd':
      return writePsd(doc)
    case 'png':
      return encodePng(flatten(doc))
    case 'jpg':
    case 'jpeg':
      // JPEG has no transparency: put the image on white.
      return encodeImage(flatten(doc, [255, 255, 255, 255]), 'jpeg', 0.92)
    case 'webp':
      return encodeImage(flatten(doc), 'webp', 0.92)
    default:
      throw new Error(`Photo can't save ${ext ? ext.toUpperCase() : 'this'} files. Choose Bear Photo, PSD, PNG, JPG or WebP.`)
  }
}

/** True when saving to `path` would merge several layers into one. */
export function needsFlatten(doc: PhotoDoc, path: string): boolean {
  return doc.layers.length > 1 && !SAVABLE.has(extensionOf(path))
}

export function flattenWarning(path: string): string {
  return `Saving as ${extensionOf(path).toUpperCase()} flattens your layers into one. Keep a .bearphoto copy to edit layers later.`
}
