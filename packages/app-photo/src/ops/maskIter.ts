import type { Mask } from '../model/mask'

export type Offset = { x: number; y: number }
const ZERO: Offset = { x: 0, y: 0 }

/**
 * Visits every layer pixel the mask lets through (mask value > 0), calling `fn(i, m)` with the
 * RGBA byte index of the pixel and its mask weight (1..255). Without a mask every pixel is
 * visited with weight 255. `offset` is the layer's position in document space: layer pixel
 * (lx, ly) is document pixel (lx + offset.x, ly + offset.y), where the document-sized mask is
 * sampled. Pixels outside the mask are skipped. No per-pixel allocations.
 */
export function forEachMasked(
  width: number,
  height: number,
  mask: Mask | null | undefined,
  offset: Offset | undefined,
  fn: (i: number, m: number) => void,
): void {
  if (!mask) {
    for (let i = 0, n = width * height * 4; i < n; i += 4) fn(i, 255)
    return
  }
  const { x: ox, y: oy } = offset ?? ZERO
  // Layer columns whose document x falls inside the mask.
  const lx0 = Math.max(0, -ox)
  const lx1 = Math.min(width, mask.width - ox)
  const md = mask.data
  for (let y = 0; y < height; y++) {
    const dy = y + oy
    if (dy < 0 || dy >= mask.height) continue
    const mrow = dy * mask.width + ox // mask index of layer column 0
    let i = (y * width + lx0) * 4
    for (let x = lx0; x < lx1; x++, i += 4) {
      const m = md[mrow + x]
      if (m !== 0) fn(i, m)
    }
  }
}
