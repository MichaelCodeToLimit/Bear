/**
 * Width and height read from an image file's header, without decoding its pixels, so an image that is
 * too large can be refused (or opened scaled down) before anything big is allocated. Null when the
 * header isn't recognised; callers then decode first and check afterwards.
 */
export interface ImageSize {
  width: number
  height: number
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
const i32le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)
const ascii = (b: Uint8Array, i: number, s: string) => b.length >= i + s.length && [...s].every((c, k) => b[i + k] === c.charCodeAt(0))

const valid = (width: number, height: number): ImageSize | null => (width > 0 && height > 0 ? { width, height } : null)

/** PNG: the IHDR chunk always comes first, right after the 8-byte signature. */
export function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || b[0] !== 0x89 || !ascii(b, 1, 'PNG') || !ascii(b, 12, 'IHDR')) return null
  return valid(u32be(b, 16), u32be(b, 20))
}

/** PSD/PSB: "8BPS", version, 6 reserved bytes, channels, then height and width. */
export function psdSize(b: Uint8Array): ImageSize | null {
  if (b.length < 26 || !ascii(b, 0, '8BPS')) return null
  return valid(u32be(b, 18), u32be(b, 14))
}

/** GIF: the logical screen size. */
export function gifSize(b: Uint8Array): ImageSize | null {
  if (b.length < 10 || !ascii(b, 0, 'GIF8')) return null
  return valid(u16le(b, 6), u16le(b, 8))
}

/** BMP: BITMAPINFOHEADER (or later) width and height; a negative height means top-down rows. */
export function bmpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 26 || !ascii(b, 0, 'BM')) return null
  if (u32be(b, 14) === 0x0c000000) return valid(u16le(b, 18), u16le(b, 20)) // the old 12-byte BITMAPCOREHEADER
  return valid(Math.abs(i32le(b, 18)), Math.abs(i32le(b, 22)))
}

/** JPEG: the first start-of-frame marker (SOF0..SOF15, but not DHT, JPG or DAC). */
export function jpegSize(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    if (marker === 0xff) {
      i++ // fill byte
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2 // markers without a length
      continue
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return valid(u16be(b, i + 7), u16be(b, i + 5))
    }
    if (marker === 0xda || marker === 0xd9) return null // image data before any frame header
    i += 2 + u16be(b, i + 2)
  }
  return null
}

/** WebP: lossy (VP8), lossless (VP8L) or extended (VP8X) header. */
export function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30 || !ascii(b, 0, 'RIFF') || !ascii(b, 8, 'WEBP')) return null
  if (ascii(b, 12, 'VP8X')) return valid(u24le(b, 24) + 1, u24le(b, 27) + 1)
  if (ascii(b, 12, 'VP8L')) {
    if (b[20] !== 0x2f) return null
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return valid((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
  }
  if (ascii(b, 12, 'VP8 ')) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return valid(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff)
  }
  return null
}

/** AVIF (HEIF): the first "ispe" (image spatial extents) property, within the first 64 KB. */
export function avifSize(b: Uint8Array): ImageSize | null {
  if (b.length < 16 || !ascii(b, 4, 'ftyp')) return null
  const end = Math.min(b.length - 15, 1 << 16)
  for (let i = 8; i < end; i++) {
    // box: size(4) "ispe" version+flags(4) width(4) height(4)
    if (b[i] === 0x69 && ascii(b, i, 'ispe')) return valid(u32be(b, i + 8), u32be(b, i + 12))
  }
  return null
}

/** The size of an image in any format Photo opens except .bearphoto, by its contents (the extension only breaks ties). */
export function imageSize(b: Uint8Array, ext = ''): ImageSize | null {
  const readers = [pngSize, psdSize, jpegSize, gifSize, bmpSize, webpSize]
  for (const read of readers) {
    const s = read(b)
    if (s) return s
  }
  return ext === 'avif' || ascii(b, 4, 'ftyp') ? avifSize(b) : null
}
