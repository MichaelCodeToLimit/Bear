import { extensionOf, type FileFilter, type OpenedFile } from '@bear/core'
import type { Bitmap } from './model/bitmap'
import { createLayer, type PhotoDoc } from './model/doc'
import { compositeLayers } from './ops/composite'
import { readBearPhoto } from './io/bearphoto'
import { writeBearPhotoOffThread } from './io/writeOffThread'
import { readPsd, writePsd } from './io/psd'
import { decodePng, encodePng } from './io/png'
import { decodeImage, encodeImage } from './io/browser-image'
import { checkOpenSize, type SizeCheck } from './io/limits'
import { imageSize } from './io/imageSize'
import { resample } from './ops/resample'

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

/** Bilinear resample (see ops/resample.ts), kept under this name for the open and paste paths. */
export function scaleBitmap(src: Bitmap, w: number, h: number): Bitmap {
  return resample(src, w, h, 'bilinear')
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

/** A side scaled by `scale`, the same rounding everywhere (open, paste, drop). */
export const scaledSide = (n: number, scale: number) => Math.max(1, Math.round(n * scale))

/**
 * Decode a flat image at `scale` (1 = full size). The browser's formats are scaled by the decoder itself;
 * PNG is decoded and then scaled (only reached once the size check allowed the full-size decode's memory).
 */
export async function decodeFlatImageAt(data: Uint8Array, ext: string, scale = 1): Promise<Bitmap> {
  if (scale >= 1) return decodeFlatImage(data, ext)
  if (ext === 'png') {
    const full = decodePng(data)
    return scaleBitmap(full, scaledSide(full.width, scale), scaledSide(full.height, scale))
  }
  const size = imageSize(data, ext)
  if (!size) {
    const full = await decodeImage(data, ext)
    return scaleBitmap(full, scaledSide(full.width, scale), scaledSide(full.height, scale))
  }
  return decodeImage(data, ext, { width: scaledSide(size.width, scale), height: scaledSide(size.height, scale) })
}

/**
 * The size check for an image's bytes, from its header alone (no pixels decoded). Null when the header
 * isn't recognised: decode it, then check the decoded size.
 */
export function checkHeaderSize(data: Uint8Array, ext: string, budget: number): SizeCheck | null {
  const size = imageSize(data, ext)
  return size ? checkOpenSize(size.width, size.height, budget) : null
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
  const ext = extensionOf(file.path || file.name)
  if (scale === undefined && ext !== 'bearphoto') {
    // Refuse from the header, before a huge PSD or picture is decoded at full size.
    const check = checkHeaderSize(file.data, ext, budget)
    if (check && !check.ok) return { needsScale: check.scale, reason: check.reason }
  }
  if (scale !== undefined && scale < 1 && ext !== 'bearphoto' && ext !== 'psd') {
    return { doc: docFromBitmap(await decodeFlatImageAt(file.data, ext, scale)), warnings: [] }
  }
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
      // Off the main thread: a large image takes seconds to encode, and AutoSave runs while the user works.
      return writeBearPhotoOffThread(doc)
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
