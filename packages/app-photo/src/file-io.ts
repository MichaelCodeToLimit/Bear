import { extensionOf, type FileFilter, type OpenedFile } from '@bear/core'
import type { Bitmap } from './model/bitmap'
import { createLayer, type PhotoDoc } from './model/doc'
import { compositeLayers } from './ops/composite'
import { readBearPhoto } from './io/bearphoto'
import { writeBearPhotoOffThread } from './io/writeOffThread'
import { readPsd, writePsd } from './io/psd'
import { decodePng, encodePng } from './io/png'
import { decodeImage, encodeImage } from './io/browser-image'
import { DAMAGED_SIZE, checkImageSize, flatDecodePath, planOpen } from './io/openPlan'
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
 * Decode a flat image at `scale` (1 = full size), by the path flatDecodePath picks: at full size PNG goes
 * through fast-png (exact bytes) and the rest through the browser's decoder; scaled down, the browser's
 * decoder scales as it decodes (PNG included), so the full-size pixels are never made. Only an image whose
 * header gives no size is decoded in full and then scaled.
 */
export async function decodeFlatImageAt(data: Uint8Array, ext: string, scale = 1): Promise<Bitmap> {
  const size = scale < 1 ? imageSize(data, ext) : null
  switch (flatDecodePath(ext, scale, !!size)) {
    case 'fast-png':
      return decodePng(data)
    case 'browser':
      return decodeImage(data, ext)
    case 'browser-scaled':
      return decodeImage(data, ext, { width: scaledSide(size!.width, scale), height: scaledSide(size!.height, scale) })
    case 'browser-then-scale': {
      const full = await decodeImage(data, ext)
      return scaleBitmap(full, scaledSide(full.width, scale), scaledSide(full.height, scale))
    }
  }
}

/** Extension for a file or clipboard item: from its name, else from a MIME type like "image/png". */
export function imageExtension(name: string, mime = ''): string {
  const ext = extensionOf(name)
  if (ext) return ext
  const sub = mime.startsWith('image/') ? mime.slice(6).toLowerCase() : ''
  return sub === 'jpeg' ? 'jpg' : sub
}

/**
 * Read a file into a document. When it is too large for `budget` bytes (see checkOpenSize), returns the
 * largest scale that fits instead; call again with that `scale` to open it scaled down. Throws, with a
 * message for the user, for a .psd too large to read at all and for a size that can only be damage.
 */
export async function loadPhotoFile(file: OpenedFile, budget: number, scale?: number): Promise<LoadResult> {
  const ext = extensionOf(file.path || file.name)
  // The size from the header, before a huge PSD or picture is decoded at full size.
  const header = ext === 'bearphoto' ? null : imageSize(file.data, ext)
  const plan = planOpen(ext, header, budget, scale)
  if (plan.kind === 'refuse') throw new Error(plan.message)
  if (plan.kind === 'ask') return { needsScale: plan.scale, reason: plan.reason }
  let doc: PhotoDoc
  let warnings: string[] = []
  if (plan.path === 'bearphoto' || plan.path === 'psd') {
    // Neither can be decoded scaled: read in full (the plan only allows a .psd that fits), then scale.
    const read = plan.path === 'psd' ? await readPsd(file.data) : { doc: await readBearPhoto(file.data), warnings: [] }
    doc = plan.scale < 1 ? scaleDoc(read.doc, plan.scale) : read.doc
    warnings = read.warnings
  } else {
    doc = docFromBitmap(await decodeFlatImageAt(file.data, ext, plan.scale))
  }
  // Check what was actually read: a header can understate the size, and .bearphoto has none.
  const check = checkImageSize(doc.width, doc.height, budget)
  if (!check.ok) {
    if (check.reason === 'damaged' || plan.scale < 1) throw new Error(DAMAGED_SIZE)
    return { needsScale: check.scale, reason: check.reason }
  }
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
