import { cloneBitmap, createBitmap, intersectRect, readRect, unionRect, writeRect, type Bitmap, type Rect } from './bitmap'
import { createLayer, getLayer, layerBounds, type Layer, type PhotoDoc, type TextData } from './doc'
import { compositeLayers } from '../ops/composite'
import { History, type Step } from './history'
import type { Mask } from './mask'

interface LayerState {
  /** The live object that stays in doc.layers across undo/redo. */
  live: Layer
  /** Immutable copy of its props at snapshot time. */
  props: Layer
}

interface Snapshot {
  width: number
  height: number
  layers: LayerState[]
  activeLayerId: string
  selection: Mask | null
}

/** Fixed overhead of a structure step (layer records); bitmap memory is added on top. */
const STRUCTURE_BYTES = 1024

function copyLayer(l: Layer): Layer {
  return { ...l, text: l.text ? { ...l.text, color: [...l.text.color] } : undefined }
}

function snapshot(doc: PhotoDoc): Snapshot {
  return {
    width: doc.width,
    height: doc.height,
    layers: doc.layers.map((l) => ({ live: l, props: copyLayer(l) })),
    activeLayerId: doc.activeLayerId,
    selection: doc.selection
  }
}

function restore(doc: PhotoDoc, s: Snapshot): void {
  doc.width = s.width
  doc.height = s.height
  // Reuse the live Layer objects so references held by callers stay valid after undo/redo.
  doc.layers = s.layers.map(({ live, props }) => Object.assign(live, copyLayer(props)))
  doc.activeLayerId = s.activeLayerId
  doc.selection = s.selection
}

/** Bytes of bitmaps referenced by only one of the two snapshots; those are what the step keeps alive. */
function structureBytes(before: Snapshot, after: Snapshot): number {
  const a = new Set(before.layers.map((l) => l.props.pixels))
  const b = new Set(after.layers.map((l) => l.props.pixels))
  let n = STRUCTURE_BYTES
  for (const p of a) if (!b.has(p)) n += p.data.byteLength
  for (const p of b) if (!a.has(p)) n += p.data.byteLength
  if (before.selection !== after.selection) n += maskBytes(before.selection) + maskBytes(after.selection)
  return n
}

const maskBytes = (m: Mask | null): number => (m ? m.data.byteLength : 0)

export class PhotoEditor {
  history = new History()
  version = 0
  onChange?: (dirty: Rect | null) => void

  constructor(public doc: PhotoDoc) {}

  private changed(dirty: Rect | null): void {
    this.version++
    this.onChange?.(dirty)
  }

  private record(label: string, bytes: number, apply: (undo: boolean) => void, dirty: () => Rect | null): void {
    const step: Step = {
      label,
      bytes,
      undo: () => {
        apply(true)
        this.changed(dirty())
      },
      redo: () => {
        apply(false)
        this.changed(dirty())
      }
    }
    this.history.push(step)
    this.changed(dirty())
  }

  /** Run a structural change (layers, props, size, selection) as one undoable step. */
  editStructure(label: string, fn: (doc: PhotoDoc) => void): void {
    const before = snapshot(this.doc)
    fn(this.doc)
    const after = snapshot(this.doc)
    this.record(
      label,
      structureBytes(before, after),
      (undo) => restore(this.doc, undo ? before : after),
      () => null
    )
  }

  /**
   * Run a pixel change limited to `rect` (layer-local coordinates) as one undoable step.
   * `fn` must only write inside `rect`; anything outside is not captured by undo.
   * If `rect` misses the layer entirely, `fn` is not called and no step is recorded.
   */
  editPixels(label: string, layerId: string, rect: Rect, fn: (pixels: Bitmap) => void): void {
    const layer = getLayer(this.doc, layerId)
    if (!layer) throw new Error('Layer not found')
    const r = intersectRect(rect, { x: 0, y: 0, width: layer.pixels.width, height: layer.pixels.height })
    if (!r) return // nothing in range: fn is not called, so nothing can be written un-undoably
    const before = readRect(layer.pixels, r)
    fn(layer.pixels)
    const after = readRect(layer.pixels, r)
    const dirty = (): Rect => {
      const l = getLayer(this.doc, layerId)
      return { x: (l?.x ?? 0) + r.x, y: (l?.y ?? 0) + r.y, width: r.width, height: r.height }
    }
    this.record(
      label,
      before.data.length + after.data.length,
      (undo) => {
        // Look the layer up by id so this still works if structure steps replaced the record.
        const target = getLayer(this.doc, layerId)
        if (target) writeRect(target.pixels, r, undo ? before : after)
      },
      dirty
    )
  }

  /**
   * Record an edit already made to the layer as one undoable step, tile by tile: each entry is a
   * rect (layer-local) with its pixels from before the edit; the "after" pixels are read from the
   * layer now. Only the tiles are stored, so a long diagonal stroke costs its touched tiles, not
   * its bounding box. Rects must lie inside the layer and not overlap. No step for an empty list.
   */
  editPixelTiles(label: string, layerId: string, tiles: { rect: Rect; before: Bitmap }[]): void {
    const layer = getLayer(this.doc, layerId)
    if (!layer) throw new Error('Layer not found')
    if (!tiles.length) return
    const bounds = { x: 0, y: 0, width: layer.pixels.width, height: layer.pixels.height }
    const saved = tiles.map(({ rect, before }) => {
      const r = intersectRect(rect, bounds)
      if (!r || r.x !== rect.x || r.y !== rect.y || r.width !== rect.width || r.height !== rect.height) throw new Error('editPixelTiles: tile outside the layer')
      if (before.width !== rect.width || before.height !== rect.height) throw new Error('editPixelTiles: `before` does not match its rect')
      return { rect, before, after: readRect(layer.pixels, rect) }
    })
    const union = saved.reduce((u, t) => unionRect(u, t.rect), saved[0].rect)
    const dirty = (): Rect => {
      const l = getLayer(this.doc, layerId)
      return { ...union, x: (l?.x ?? 0) + union.x, y: (l?.y ?? 0) + union.y }
    }
    this.record(
      label,
      saved.reduce((n, t) => n + t.before.data.length + t.after.data.length, 0),
      (undo) => {
        const target = getLayer(this.doc, layerId)
        if (target) for (const t of saved) writeRect(target.pixels, t.rect, undo ? t.before : t.after)
      },
      dirty
    )
  }

  /**
   * Like `editPixels`, but the same step also replaces the selection with `selection`
   * (used by the Move tool, which moves selected pixels and the outline together).
   * The step stores the rect's pixels before and after, plus the old and new masks.
   */
  editPixelsAndSelection(label: string, layerId: string, rect: Rect, fn: (pixels: Bitmap) => void, selection: Mask | null): void {
    const layer = getLayer(this.doc, layerId)
    if (!layer) throw new Error('Layer not found')
    const r = intersectRect(rect, { x: 0, y: 0, width: layer.pixels.width, height: layer.pixels.height })
    const oldSel = this.doc.selection
    const before = r && readRect(layer.pixels, r)
    if (r) fn(layer.pixels)
    const after = r && readRect(layer.pixels, r)
    this.doc.selection = selection
    const dirty = (): Rect | null => {
      const l = getLayer(this.doc, layerId)
      return r ? { x: (l?.x ?? 0) + r.x, y: (l?.y ?? 0) + r.y, width: r.width, height: r.height } : null
    }
    this.record(
      label,
      (before?.data.length ?? 0) + (after?.data.length ?? 0) + maskBytes(oldSel) + maskBytes(selection),
      (undo) => {
        const target = getLayer(this.doc, layerId)
        if (target && r) writeRect(target.pixels, r, undo ? before! : after!)
        this.doc.selection = undo ? oldSel : selection
      },
      dirty
    )
  }

  addLayer(opts: { name?: string; above?: string; pixels?: Bitmap; x?: number; y?: number; kind?: 'raster' | 'text'; text?: TextData; label?: string } = {}): Layer {
    const layer = createLayer(opts.name ?? `Layer ${this.doc.layers.length + 1}`, opts.pixels ?? createBitmap(this.doc.width, this.doc.height), {
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      kind: opts.kind ?? 'raster',
      text: opts.text
    })
    this.editStructure(opts.label ?? 'New Layer', (doc) => {
      const at = doc.layers.findIndex((l) => l.id === (opts.above ?? doc.activeLayerId))
      doc.layers.splice(at < 0 ? doc.layers.length : at + 1, 0, layer)
      doc.activeLayerId = layer.id
    })
    return layer
  }

  duplicateLayer(id: string): Layer {
    const src = getLayer(this.doc, id)
    if (!src) throw new Error('Layer not found')
    const copy = createLayer(`${src.name} copy`, cloneBitmap(src.pixels), {
      kind: src.kind,
      visible: src.visible,
      locked: src.locked,
      opacity: src.opacity,
      blend: src.blend,
      x: src.x,
      y: src.y,
      text: src.text ? { ...src.text, color: [...src.text.color] } : undefined
    })
    this.editStructure('Duplicate Layer', (doc) => {
      const at = doc.layers.findIndex((l) => l.id === id)
      doc.layers.splice(at + 1, 0, copy)
      doc.activeLayerId = copy.id
    })
    return copy
  }

  deleteLayer(id: string): void {
    if (this.doc.layers.length <= 1) throw new Error('A document needs at least one layer')
    if (!getLayer(this.doc, id)) throw new Error('Layer not found')
    this.editStructure('Delete Layer', (doc) => {
      const at = doc.layers.findIndex((l) => l.id === id)
      doc.layers.splice(at, 1)
      if (doc.activeLayerId === id) doc.activeLayerId = doc.layers[Math.max(0, at - 1)].id
    })
  }

  moveLayer(id: string, toIndex: number): void {
    if (!getLayer(this.doc, id)) throw new Error('Layer not found')
    this.editStructure('Move Layer', (doc) => {
      const at = doc.layers.findIndex((l) => l.id === id)
      const [l] = doc.layers.splice(at, 1)
      doc.layers.splice(Math.max(0, Math.min(doc.layers.length, toIndex)), 0, l)
    })
  }

  setLayerProps(id: string, patch: Partial<Omit<Layer, 'id'>>): void {
    if (!getLayer(this.doc, id)) throw new Error('Layer not found')
    this.editStructure('Layer Properties', (doc) => {
      Object.assign(getLayer(doc, id)!, patch)
    })
  }

  /** Change the canvas size without resampling; layers shift so the anchor stays put. */
  resizeCanvas(w: number, h: number, anchor: 'tl' | 'c'): void {
    this.editStructure('Canvas Size', (doc) => {
      const dx = anchor === 'c' ? Math.floor((w - doc.width) / 2) : 0
      const dy = anchor === 'c' ? Math.floor((h - doc.height) / 2) : 0
      for (const l of doc.layers) {
        l.x += dx
        l.y += dy
      }
      doc.width = w
      doc.height = h
      doc.selection = null // a selection is document-sized, so it no longer fits
    })
  }

  /**
   * Merge layer `id` into the layer directly below it, as one undoable step. The result keeps the
   * lower layer's id, name, opacity and blend; its pixels are the upper layer composited onto the
   * lower one with the upper layer's own blend and opacity. Bounds are the lower layer's bounds
   * united with the on-canvas part of the upper layer (off-canvas pixels are never visible).
   */
  mergeDown(id: string): void {
    const at = this.doc.layers.findIndex((l) => l.id === id)
    if (at < 0) throw new Error('Layer not found')
    if (at === 0) throw new Error('There is no layer below to merge into')
    const upper = this.doc.layers[at]
    const lower = this.doc.layers[at - 1]
    const visibleUpper = intersectRect(layerBounds(upper), { x: 0, y: 0, width: this.doc.width, height: this.doc.height })
    const rect = visibleUpper ? unionRect(layerBounds(lower), visibleUpper) : layerBounds(lower)
    // The lower layer is the raw backdrop (its own opacity/blend stay on the result); the upper keeps its own.
    const shift = (l: Layer, extra: Partial<Layer>): Layer => ({ ...l, x: l.x - rect.x, y: l.y - rect.y, ...extra })
    const merged = compositeLayers([shift(lower, { visible: true, opacity: 1, blend: 'normal' }), shift(upper, {})], rect.width, rect.height)
    this.editStructure('Merge Down', (doc) => {
      lower.pixels = merged
      lower.x = rect.x
      lower.y = rect.y
      lower.kind = 'raster'
      lower.text = undefined
      doc.layers.splice(at, 1)
      doc.activeLayerId = lower.id
    })
  }

  /** Composite all visible layers into one "Background" layer covering the document; hidden layers are dropped. */
  flatten(): void {
    const pixels = compositeLayers(this.doc.layers, this.doc.width, this.doc.height)
    const flat = createLayer('Background', pixels)
    this.editStructure('Flatten Image', (doc) => {
      doc.layers = [flat]
      doc.activeLayerId = flat.id
    })
  }

  setSelection(m: Mask | null): void {
    this.editStructure(m ? 'Select' : 'Deselect', (doc) => {
      doc.selection = m
    })
  }
}
