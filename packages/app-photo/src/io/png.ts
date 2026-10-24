import { decode, encode } from 'fast-png'
import type { Bitmap } from '../model/bitmap'

export function encodePng(b: Bitmap): Uint8Array {
  return encode({ width: b.width, height: b.height, data: b.data, depth: 8, channels: 4 })
}

/** Decodes any PNG to 8-bit RGBA (expands gray, RGB, palette and 16-bit). */
export function decodePng(bytes: Uint8Array): Bitmap {
  const png = decode(bytes)
  const { width, height, channels, depth } = png
  const n = width * height
  const out = new Uint8ClampedArray(n * 4)
  const src = png.data
  const shift = depth === 16 ? 8 : 0
  const px = (i: number): number => (shift ? (src[i] as number) >> shift : (src[i] as number))
  if (png.palette) {
    const pal = png.palette as number[][]
    for (let i = 0; i < n; i++) {
      const c = pal[src[i]] ?? [0, 0, 0]
      out[i * 4] = c[0]
      out[i * 4 + 1] = c[1]
      out[i * 4 + 2] = c[2]
      out[i * 4 + 3] = c[3] ?? png.transparency?.[src[i]] ?? 255
    }
    return { width, height, data: out }
  }
  // Gray bit depths below 8 are unpacked by the decoder to 0..2^depth-1 values.
  const maxv = depth < 8 ? (1 << depth) - 1 : 255
  const scale = depth < 8 ? 255 / maxv : 1
  for (let i = 0; i < n; i++) {
    if (channels === 4) {
      out[i * 4] = px(i * 4)
      out[i * 4 + 1] = px(i * 4 + 1)
      out[i * 4 + 2] = px(i * 4 + 2)
      out[i * 4 + 3] = px(i * 4 + 3)
    } else if (channels === 3) {
      out[i * 4] = px(i * 3)
      out[i * 4 + 1] = px(i * 3 + 1)
      out[i * 4 + 2] = px(i * 3 + 2)
      out[i * 4 + 3] = 255
    } else {
      const g = Math.round(px(i * channels) * scale)
      out[i * 4] = g
      out[i * 4 + 1] = g
      out[i * 4 + 2] = g
      out[i * 4 + 3] = channels === 2 ? px(i * 2 + 1) : 255
    }
  }
  return { width, height, data: out }
}
