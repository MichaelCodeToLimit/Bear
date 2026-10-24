import type { RGBA } from '../model/bitmap'
import { activeLayer, type PhotoDoc } from '../model/doc'
import { compositeLayers } from '../ops/composite'
import type { Tool, ToolContext, ToolPointer } from './types'

/**
 * The average colour of the `size`×`size` box centred on document pixel (x, y), from the active
 * layer or the composite. Colour is weighted by alpha so transparent pixels don't darken it. Pixels
 * outside the source are skipped; returns null when nothing in the box can be sampled.
 */
export function sampleColor(doc: PhotoDoc, x: number, y: number, size: number, allLayers: boolean): RGBA | null {
  const half = (size - 1) >> 1
  const box = { x: Math.floor(x) - half, y: Math.floor(y) - half, width: size, height: size }
  let src = activeLayer(doc).pixels
  let ox = activeLayer(doc).x
  let oy = activeLayer(doc).y
  if (allLayers) {
    // Composite just the box, not the whole image.
    src = compositeLayers(doc.layers, doc.width, doc.height, box)
    ox = Math.max(0, box.x)
    oy = Math.max(0, box.y)
  }
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  let n = 0
  for (let py = box.y; py < box.y + size; py++) {
    for (let px = box.x; px < box.x + size; px++) {
      const lx = px - ox
      const ly = py - oy
      if (lx < 0 || ly < 0 || lx >= src.width || ly >= src.height) continue
      const i = (ly * src.width + lx) * 4
      const w = src.data[i + 3]
      r += src.data[i] * w
      g += src.data[i + 1] * w
      b += src.data[i + 2] * w
      a += w
      n++
    }
  }
  if (!n || !a) return null
  return [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / n)]
}

const SIZES: Record<string, number> = { '1×1': 1, '3×3': 3, '5×5': 5 }

let pressed = false

/** Set the foreground colour (background with Alt) from under the pointer. */
function pick(ctx: ToolContext, p: ToolPointer): void {
  const c = sampleColor(ctx.editor.doc, p.x, p.y, SIZES[String(ctx.options.sample)] ?? 1, ctx.options.source === 'All layers')
  if (!c) return
  ctx.setColors(p.alt ? { ...ctx.colors, bg: c } : { ...ctx.colors, fg: c })
}

export const eyedropper: Tool = {
  id: 'eyedropper',
  label: 'Eyedropper',
  key: 'I',
  cursor: 'crosshair',
  options: [
    { id: 'sample', label: 'Sample', type: 'select', choices: ['1×1', '3×3', '5×5'], default: '1×1' },
    { id: 'source', label: 'From', type: 'select', choices: ['This layer', 'All layers'], default: 'This layer' }
  ],
  down(ctx, p) {
    pressed = true
    pick(ctx, p)
  },
  move(ctx, p) {
    if (pressed) pick(ctx, p)
  },
  up() {
    pressed = false
  },
  cancel() {
    pressed = false
  }
}
