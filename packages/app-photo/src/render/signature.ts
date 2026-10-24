import type { PhotoDoc } from '../model/doc'
import type { Preview } from './compositor'

const ids = new WeakMap<object, number>()
let nextId = 1

/** A small number that stays the same for the same object (identity, not contents). */
function objId(o: object | null | undefined): number {
  if (!o) return 0
  let n = ids.get(o)
  if (n === undefined) {
    n = nextId++
    ids.set(o, n)
  }
  return n
}

/**
 * A string that changes whenever the composite could change: document size, layer order and
 * properties, the identity of each layer's pixel bitmap, the preview, and `version` (bumped by the
 * compositor on every syncLayer/dropLayer, which is how in-place pixel edits are noticed).
 * Selection, colours and the active layer do not affect the composite and are ignored.
 */
export function compositeSignature(doc: PhotoDoc, preview: Preview | undefined, version: number): string {
  const parts: (string | number)[] = [version, doc.width, doc.height]
  for (const l of doc.layers) {
    parts.push(l.id, l.visible ? 1 : 0, l.opacity, l.blend, l.x, l.y, l.pixels.width, l.pixels.height, objId(l.pixels))
  }
  if (preview) {
    parts.push('p', preview.layerId, preview.kind, objId(preview.mask))
    if (preview.kind === 'lut') parts.push(objId(preview.lut))
    else if (preview.kind === 'bc') parts.push(preview.brightness, preview.contrast)
    else if (preview.kind === 'hsl') parts.push(preview.hue, preview.saturation, preview.lightness)
  }
  return parts.join('|')
}
