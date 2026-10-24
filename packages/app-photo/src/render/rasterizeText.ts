import { createBitmap, type Bitmap } from '../model/bitmap'
import type { TextData } from '../model/doc'

/** Line height as a multiple of the font size; the app's text box uses the same. */
export const LINE_HEIGHT = 1.2

/** CSS font shorthand for a text layer, with a generic fallback. */
export const cssFont = (t: Pick<TextData, 'font' | 'size'>) => `${t.size}px "${t.font}", sans-serif`

/**
 * Draw a text layer's text into a bitmap just big enough for it (OffscreenCanvas `fillText`).
 * Each line is `size × LINE_HEIGHT` tall; lines are aligned within the widest one. Pixels are
 * straight alpha, as `getImageData` returns them. Empty text gives a 1×1 transparent bitmap.
 */
export function rasterizeText(t: TextData): Bitmap {
  const lines = t.text.split('\n')
  const probe = new OffscreenCanvas(1, 1).getContext('2d')!
  probe.font = cssFont(t)
  const widths = lines.map((l) => probe.measureText(l).width)
  // A little room on the right for italic overhangs and anti-aliasing.
  const pad = Math.ceil(t.size * 0.1)
  const w = Math.ceil(Math.max(0, ...widths)) + pad
  const lh = t.size * LINE_HEIGHT
  const h = Math.ceil(lines.length * lh)
  if (!t.text || w <= pad || h <= 0) return createBitmap(1, 1)
  const canvas = new OffscreenCanvas(w, h)
  const g = canvas.getContext('2d')!
  g.font = cssFont(t)
  g.textBaseline = 'middle'
  g.textAlign = t.align
  const [r, gr, b, a] = t.color
  g.fillStyle = `rgba(${r}, ${gr}, ${b}, ${a / 255})`
  const x = t.align === 'center' ? (w - pad) / 2 : t.align === 'right' ? w - pad : 0
  lines.forEach((line, i) => g.fillText(line, x, i * lh + lh / 2))
  const img = g.getImageData(0, 0, w, h)
  return { width: w, height: h, data: img.data }
}
