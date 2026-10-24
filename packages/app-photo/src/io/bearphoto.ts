import JSZip from 'jszip'
import { createBitmap, type Bitmap, type RGBA } from '../model/bitmap'
import type { BlendMode, Layer, PhotoDoc, TextData } from '../model/doc'
import { compositeLayers } from '../ops/composite'
import { BLEND_MODES } from '../ops/blend'
import { decodePng, encodePng } from './png'

const NOT_BEAR = 'This is not a Bear Photo file'
const PREVIEW_SIDE = 512
// Fixed so the same document always produces the same bytes.
const ZIP_DATE = new Date(Date.UTC(2020, 0, 1))

interface LayerJson {
  id: string
  name: string
  kind: 'raster' | 'text'
  visible: boolean
  locked: boolean
  opacity: number
  blend: BlendMode
  x: number
  y: number
  width: number
  height: number
  text?: TextData
}

interface DocJson {
  format: 'bearphoto'
  version: number
  width: number
  height: number
  activeLayerId: string
  foreground: RGBA
  background: RGBA
  layers: LayerJson[]
}

/** Box-average resample to `w` × `h` (meant for shrinking; growing repeats pixels). Colour is alpha-weighted. */
function boxResize(src: Bitmap, w: number, h: number): Bitmap {
  const out = createBitmap(w, h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * src.height) / h)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.height) / h))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * src.width) / w)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.width) / w))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4
          const sa = src.data[i + 3]
          r += src.data[i] * sa
          g += src.data[i + 1] * sa
          b += src.data[i + 2] * sa
          a += sa
        }
      }
      const n = (y1 - y0) * (x1 - x0)
      const o = (y * w + x) * 4
      if (a > 0) {
        out.data[o] = r / a
        out.data[o + 1] = g / a
        out.data[o + 2] = b / a
      }
      out.data[o + 3] = a / n
    }
  }
  return out
}

/**
 * The flattened image at most PREVIEW_SIDE on its longest side. Each layer is shrunk to the preview's
 * scale first and the small layers are composited, so a 24 MP document never needs a full-size
 * composite just for its thumbnail. (Layer edges may land up to a preview pixel off: fine for a preview.)
 */
export function previewOf(doc: PhotoDoc): Bitmap {
  const longest = Math.max(doc.width, doc.height)
  if (longest <= PREVIEW_SIDE) return compositeLayers(doc.layers, doc.width, doc.height)
  const f = PREVIEW_SIDE / longest
  const pw = Math.max(1, Math.round(doc.width * f))
  const ph = Math.max(1, Math.round(doc.height * f))
  const layers: Layer[] = []
  for (const l of doc.layers) {
    const { width, height } = l.pixels
    if (!l.visible || l.opacity <= 0 || width === 0 || height === 0) continue
    const x0 = Math.floor(l.x * f)
    const y0 = Math.floor(l.y * f)
    const x1 = Math.max(x0 + 1, Math.round((l.x + width) * f))
    const y1 = Math.max(y0 + 1, Math.round((l.y + height) * f))
    // Entirely outside the preview: nothing to shrink.
    if (x1 <= 0 || y1 <= 0 || x0 >= pw || y0 >= ph) continue
    layers.push({ ...l, x: x0, y: y0, pixels: boxResize(l.pixels, x1 - x0, y1 - y0) })
  }
  return compositeLayers(layers, pw, ph)
}

export async function writeBearPhoto(doc: PhotoDoc): Promise<Uint8Array> {
  const json: DocJson = {
    format: 'bearphoto',
    version: 1,
    width: doc.width,
    height: doc.height,
    activeLayerId: doc.activeLayerId,
    foreground: doc.foreground,
    background: doc.background,
    layers: doc.layers.map((l) => {
      const entry: LayerJson = {
        id: l.id,
        name: l.name,
        kind: l.kind,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        blend: l.blend,
        x: l.x,
        y: l.y,
        width: l.pixels.width,
        height: l.pixels.height
      }
      if (l.text) entry.text = l.text
      return entry
    })
  }
  const zip = new JSZip()
  const opts = { date: ZIP_DATE, createFolders: false }
  // PNGs are compressed already: deflating them again costs seconds on a large image and saves next to
  // nothing, so they are stored as they are. document.json is deflated (the archive-wide default below).
  const stored = { ...opts, compression: 'STORE' as const }
  zip.file('document.json', JSON.stringify(json), opts)
  for (const l of doc.layers) {
    if (l.pixels.width > 0 && l.pixels.height > 0) zip.file(`layers/${l.id}.png`, encodePng(l.pixels), stored)
  }
  const preview = previewOf(doc)
  if (preview.width > 0 && preview.height > 0) zip.file('preview.png', encodePng(preview), stored)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

const DAMAGED = "The file is damaged and can't be opened"

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const isColor = (c: unknown): c is RGBA => Array.isArray(c) && c.length === 4 && c.every(isNum)

export async function readBearPhoto(bytes: Uint8Array): Promise<PhotoDoc> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    // A zip signature means this was a zip that is now broken (for example cut short).
    const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
    throw new Error(isZip ? DAMAGED : NOT_BEAR)
  }
  const docFile = zip.file('document.json')
  if (!docFile) throw new Error(NOT_BEAR)
  let json: DocJson
  try {
    json = JSON.parse(await docFile.async('string')) as DocJson
  } catch {
    throw new Error(NOT_BEAR)
  }
  if (!json || json.format !== 'bearphoto' || typeof json.version !== 'number' || !Array.isArray(json.layers)) throw new Error(NOT_BEAR)
  if (json.version > 1) throw new Error('This file was made by a newer version of Bear. Update Bear to open it.')
  if (!isInt(json.width) || !isInt(json.height) || json.width <= 0 || json.height <= 0) throw new Error(DAMAGED)
  if (!isColor(json.foreground) || !isColor(json.background)) throw new Error(DAMAGED)

  const layers: Layer[] = []
  for (const e of json.layers) {
    if (
      !e ||
      typeof e !== 'object' ||
      typeof e.id !== 'string' ||
      typeof e.name !== 'string' ||
      (e.kind !== 'raster' && e.kind !== 'text') ||
      !isInt(e.width) ||
      !isInt(e.height) ||
      e.width < 0 ||
      e.height < 0 ||
      !isInt(e.x) ||
      !isInt(e.y) ||
      !isNum(e.opacity)
    ) {
      throw new Error(DAMAGED)
    }
    let pixels: Bitmap
    if (e.width > 0 && e.height > 0) {
      const f = zip.file(`layers/${e.id}.png`)
      if (!f) throw new Error(`The file is damaged: layer "${e.name}" is missing`)
      try {
        pixels = decodePng(await f.async('uint8array'))
      } catch {
        throw new Error(DAMAGED)
      }
      if (pixels.width !== e.width || pixels.height !== e.height) throw new Error(DAMAGED)
    } else {
      pixels = createBitmap(0, 0)
    }
    const layer: Layer = {
      id: e.id,
      name: e.name,
      kind: e.kind,
      visible: !!e.visible,
      locked: !!e.locked,
      opacity: e.opacity,
      blend: BLEND_MODES.includes(e.blend) ? e.blend : 'normal',
      x: e.x,
      y: e.y,
      pixels
    }
    if (e.text) layer.text = e.text
    layers.push(layer)
  }
  if (!layers.some((l) => l.id === json.activeLayerId)) throw new Error(DAMAGED)
  return {
    width: json.width,
    height: json.height,
    layers,
    activeLayerId: json.activeLayerId,
    selection: null,
    foreground: json.foreground,
    background: json.background
  }
}
