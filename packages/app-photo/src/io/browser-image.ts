import type { Bitmap } from '../model/bitmap'

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  png: 'image/png'
}

/** Decode JPG/WebP/GIF/BMP/AVIF/PNG bytes with the browser's decoder. Browser only. */
export async function decodeImage(bytes: Uint8Array, ext: string): Promise<Bitmap> {
  const blob = new Blob([bytes as BlobPart], { type: MIME[ext.toLowerCase().replace('.', '')] ?? 'application/octet-stream' })
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not read this image')
    ctx.drawImage(bmp, 0, 0)
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height)
    return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
  } finally {
    bmp.close()
  }
}

/** Encode a bitmap as PNG/JPEG/WebP with the browser's encoder. `quality` is 0..1. Browser only. */
export async function encodeImage(b: Bitmap, type: 'png' | 'jpeg' | 'webp', quality: number): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(b.width, b.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not export this image')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.width, b.height), 0, 0)
  const blob = await canvas.convertToBlob({ type: `image/${type}`, quality })
  return new Uint8Array(await blob.arrayBuffer())
}
