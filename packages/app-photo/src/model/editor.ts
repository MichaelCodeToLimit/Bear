import { cloneBitmap, createBitmap, intersectRect, readRect, writeRect, type Bitmap, type Rect } from './bitmap'
import { createLayer, getLayer, type Layer, type PhotoDoc, type TextData } from './doc'
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
  return n
}

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

  addLayer(opts: { name?: string; above?: string; pixels?: Bitmap; x?: number; y?: number; kind?: 'raster' | 'text'; text?: TextData } = {}): Layer {
    const layer = createLayer(opts.name ?? `Layer ${this.doc.layers.length + 1}`, opts.pixels ?? createBitmap(this.doc.width, this.doc.height), {
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      kind: opts.kind ?? 'raster',
      text: opts.text
    })
    this.editStructure('New Layer', (doc) => {
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

  setSelection(m: Mask | null): void {
    this.editStructure(m ? 'Select' : 'Deselect', (doc) => {
      doc.selection = m
    })
  }
}
