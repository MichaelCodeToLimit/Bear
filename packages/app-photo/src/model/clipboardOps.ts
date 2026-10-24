import { createBitmap, intersectRect, type Bitmap, type Rect } from './bitmap'
import { activeLayer, type Layer, type PhotoDoc } from './doc'
import type { PhotoEditor } from './editor'
import { invertMask, maskBounds, maskValueAt, rectMask } from './mask'

const layerRect = (l: Layer): Rect => ({ x: l.x, y: l.y, width: l.pixels.width, height: l.pixels.height })

/** The part of `layer` the selection covers, in document coordinates (the whole layer with no selection). */
function affected(doc: PhotoDoc, layer: Layer): Rect | null {
  if (!doc.selection) return layerRect(layer)
  const b = maskBounds(doc.selection)
  return b && intersectRect(b, layerRect(layer))
}

/**
 * The selected area of the active layer as a bitmap (selection ∩ layer, soft mask values becoming
 * alpha), or the whole layer with no selection. Null when the layer is hidden or nothing visible results.
 */
export function copyActiveLayer(doc: PhotoDoc): Bitmap | null {
  const layer = activeLayer(doc)
  if (!layer.visible) return null
  const r = affected(doc, layer)
  if (!r) return null
  const out = createBitmap(r.width, r.height)
  let any = false
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const s = ((r.y + y - layer.y) * layer.pixels.width + (r.x + x - layer.x)) * 4
      const a = Math.round((layer.pixels.data[s + 3] * maskValueAt(doc.selection, r.x + x, r.y + y)) / 255)
      if (!a) continue
      const d = (y * r.width + x) * 4
      out.data[d] = layer.pixels.data[s]
      out.data[d + 1] = layer.pixels.data[s + 1]
      out.data[d + 2] = layer.pixels.data[s + 2]
      out.data[d + 3] = a
      any = true
    }
  }
  return any ? out : null
}

/**
 * Clear the selected pixels of `layer` to transparent as one history step (soft mask values clear
 * partially); the whole layer with no selection. False, with no step, when nothing would change.
 */
export function clearSelected(editor: PhotoEditor, layer: Layer, label: string): boolean {
  const doc = editor.doc
  const r = affected(doc, layer)
  if (!r) return false
  const sel = doc.selection
  const at = (x: number, y: number) => ((y - layer.y) * layer.pixels.width + (x - layer.x)) * 4
  let any = false
  for (let y = r.y; y < r.y + r.height && !any; y++) {
    for (let x = r.x; x < r.x + r.width; x++) {
      if (layer.pixels.data[at(x, y) + 3] && maskValueAt(sel, x, y)) {
        any = true
        break
      }
    }
  }
  if (!any) return false
  editor.editPixels(label, layer.id, { x: r.x - layer.x, y: r.y - layer.y, width: r.width, height: r.height }, (p) => {
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) {
        const m = maskValueAt(sel, x, y)
        if (!m) continue
        const i = at(x, y)
        const a = Math.round((p.data[i + 3] * (255 - m)) / 255)
        if (a) p.data[i + 3] = a
        else p.data.fill(0, i, i + 4)
      }
    }
  })
  return true
}

export function selectAll(editor: PhotoEditor): void {
  const { width, height } = editor.doc
  editor.editStructure('Select All', (d) => {
    d.selection = rectMask(width, height, { x: 0, y: 0, width, height })
  })
}

/** Invert the selection. 'none' when there is no selection (nothing happens); 'empty' when nothing is left. */
export function invertSelection(editor: PhotoEditor): 'ok' | 'none' | 'empty' {
  const sel = editor.doc.selection
  if (!sel) return 'none'
  const inv = invertMask(sel)
  const empty = !maskBounds(inv)
  editor.editStructure('Invert Selection', (d) => {
    d.selection = empty ? null : inv
  })
  return empty ? 'empty' : 'ok'
}
