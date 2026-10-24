import { createBitmap, type Bitmap } from '../model/bitmap'
import type { Layer } from '../model/doc'
import { compositeLayers } from '../ops/composite'

/**
 * A `side`-pixel preview of one layer as it sits in the document: the CPU composite of that layer alone
 * (shown, full opacity, normal blend). The layer is sampled down first, so this stays cheap for big images.
 */
export function layerThumbnail(layer: Layer, docW: number, docH: number, side: number): Bitmap {
  const s = side / Math.max(1, docW, docH)
  const tw = Math.max(1, Math.round(docW * s))
  const th = Math.max(1, Math.round(docH * s))
  const src = layer.pixels
  if (src.width === 0 || src.height === 0) return createBitmap(tw, th)
  // Nearest-neighbour sample of the layer onto the thumbnail grid (pixel centres).
  const x0 = Math.floor(layer.x * s)
  const y0 = Math.floor(layer.y * s)
  const w = Math.max(1, Math.ceil((layer.x + src.width) * s) - x0)
  const h = Math.max(1, Math.ceil((layer.y + src.height) * s) - y0)
  const small = createBitmap(w, h)
  for (let y = 0; y < h; y++) {
    const sy = Math.floor((y0 + y + 0.5) / s) - layer.y
    if (sy < 0 || sy >= src.height) continue
    for (let x = 0; x < w; x++) {
      const sx = Math.floor((x0 + x + 0.5) / s) - layer.x
      if (sx < 0 || sx >= src.width) continue
      const i = (sy * src.width + sx) * 4
      small.data.set(src.data.subarray(i, i + 4), (y * w + x) * 4)
    }
  }
  return compositeLayers([{ ...layer, pixels: small, x: x0, y: y0, visible: true, opacity: 1, blend: 'normal' }], tw, th)
}
