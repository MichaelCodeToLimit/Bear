import { createBitmap, intersectRect, type Bitmap, type Rect, type RGBA } from '../model/bitmap'
import type { Layer } from '../model/doc'
import { blendPixel, type Vec3 } from './blend'

/**
 * CPU reference compositor (W3C Compositing and Blending Level 1, straight alpha).
 * Bottom-to-top; per layer, with as = layerAlpha * opacity and (ab, Cb) the accumulated backdrop:
 *   Cs' = (1 - ab)·Cs + ab·B(Cb, Cs)
 *   ao  = as + ab·(1 - as)
 *   Co  = (as·Cs' + ab·Cb·(1 - as)) / ao
 * Accumulation is in floats across layers; only the final result is rounded to 8 bits.
 *
 * `region` (document coordinates, clamped to the canvas) selects the part to render; the result
 * has the region's size. Without it the whole canvas is rendered.
 */
export function compositeLayers(layers: Layer[], width: number, height: number, region?: Rect, opts: { background?: RGBA } = {}): Bitmap {
  const canvas: Rect = { x: 0, y: 0, width, height }
  const r = region ? intersectRect(region, canvas) : canvas
  if (!r) return createBitmap(0, 0)
  const n = r.width * r.height
  // Accumulated straight-alpha color (0..1) and alpha, one Float32 quad per pixel.
  const acc = new Float32Array(n * 4)
  if (opts.background && opts.background[3] > 0) {
    const [br, bg, bb, ba] = opts.background
    for (let i = 0; i < n; i++) {
      acc[i * 4] = br / 255
      acc[i * 4 + 1] = bg / 255
      acc[i * 4 + 2] = bb / 255
      acc[i * 4 + 3] = ba / 255
    }
  }

  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) continue
    const lp = layer.pixels
    const area = intersectRect(r, { x: layer.x, y: layer.y, width: lp.width, height: lp.height })
    if (!area) continue
    const mode = layer.blend
    for (let y = area.y; y < area.y + area.height; y++) {
      let si = ((y - layer.y) * lp.width + (area.x - layer.x)) * 4
      let di = ((y - r.y) * r.width + (area.x - r.x)) * 4
      for (let x = 0; x < area.width; x++, si += 4, di += 4) {
        const as = (lp.data[si + 3] / 255) * layer.opacity
        if (as <= 0) continue
        const ab = acc[di + 3]
        const cs: Vec3 = [lp.data[si] / 255, lp.data[si + 1] / 255, lp.data[si + 2] / 255]
        let cr = cs[0]
        let cg = cs[1]
        let cbl = cs[2]
        if (ab > 0 && mode !== 'normal') {
          const b = blendPixel(mode, [acc[di], acc[di + 1], acc[di + 2]], cs)
          cr = (1 - ab) * cs[0] + ab * b[0]
          cg = (1 - ab) * cs[1] + ab * b[1]
          cbl = (1 - ab) * cs[2] + ab * b[2]
        }
        const ao = as + ab * (1 - as)
        const k = ab * (1 - as)
        acc[di] = (as * cr + k * acc[di]) / ao
        acc[di + 1] = (as * cg + k * acc[di + 1]) / ao
        acc[di + 2] = (as * cbl + k * acc[di + 2]) / ao
        acc[di + 3] = ao
      }
    }
  }

  const out = createBitmap(r.width, r.height)
  for (let i = 0; i < n * 4; i++) out.data[i] = Math.round(acc[i] * 255) // Uint8ClampedArray also clamps
  return out
}
