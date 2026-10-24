import { describe, expect, it } from 'vitest'
import { createBitmap, type Bitmap, type RGBA } from './bitmap'
import { createDoc, getLayer, type Layer } from './doc'
import { PhotoEditor } from './editor'
import { rectMask } from './mask'

const RED: RGBA = [255, 0, 0, 255]
const px = (b: Bitmap, x: number, y: number): number[] => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))
const dot = (w: number, h: number, x: number, y: number, c: RGBA = RED): Bitmap => {
  const b = createBitmap(w, h)
  b.data.set(c, (y * w + x) * 4)
  return b
}
const geometry = (l: Layer) => ({ x: l.x, y: l.y, w: l.pixels.width, h: l.pixels.height })

/** A 4x2 white document with a 1x1 red layer in its top-right corner, and a selection. */
function setup() {
  const doc = createDoc(4, 2, [255, 255, 255, 255])
  doc.layers[0].pixels.data.set(RED, 0) // marks the background's top-left
  const ed = new PhotoEditor(doc)
  const dotLayer = ed.addLayer({ name: 'Dot', pixels: dot(1, 1, 0, 0), x: 3, y: 0 })
  ed.setSelection(rectMask(4, 2, { x: 0, y: 0, width: 2, height: 2 }))
  const steps = ed.history.steps.length
  const bg = doc.layers[0]
  const before = { size: [doc.width, doc.height], bg: geometry(bg), dot: geometry(dotLayer), bgPixels: bg.pixels, selection: doc.selection }
  /** Undo once and check everything is as it was. */
  const undoRestores = () => {
    expect(ed.history.steps.length).toBe(steps + 1)
    ed.history.undo()
    expect([doc.width, doc.height]).toEqual(before.size)
    expect(geometry(bg)).toEqual(before.bg)
    expect(geometry(dotLayer)).toEqual(before.dot)
    expect(bg.pixels).toBe(before.bgPixels)
    expect(doc.selection).toBe(before.selection)
  }
  return { doc, ed, bg, dotLayer, undoRestores }
}

describe('PhotoEditor image commands', () => {
  it('resizeImage scales every layer and its offset as one "Image Size" step', () => {
    const { doc, ed, bg, dotLayer, undoRestores } = setup()
    ed.resizeImage(8, 4)
    expect([doc.width, doc.height]).toEqual([8, 4])
    expect(geometry(bg)).toEqual({ x: 0, y: 0, w: 8, h: 4 })
    expect(geometry(dotLayer)).toEqual({ x: 6, y: 0, w: 2, h: 2 })
    expect(px(dotLayer.pixels, 1, 1)).toEqual(RED)
    expect(doc.selection).toBeNull()
    expect(ed.history.steps.at(-1)!.label).toBe('Image Size')
    undoRestores()
  })

  it('resizeImage never shrinks a layer below 1 px', () => {
    const { ed, dotLayer } = setup()
    ed.resizeImage(1, 1)
    expect(geometry(dotLayer)).toEqual({ x: 1, y: 0, w: 1, h: 1 })
  })

  it('rotateDoc(1) turns the document clockwise: canvas size swaps, offsets follow', () => {
    const { doc, ed, bg, dotLayer, undoRestores } = setup()
    ed.rotateDoc(1)
    expect([doc.width, doc.height]).toEqual([2, 4])
    // The top-right corner of a landscape image ends at the bottom-right.
    expect(geometry(dotLayer)).toEqual({ x: 1, y: 3, w: 1, h: 1 })
    // The background's red top-left pixel ends at the top-right.
    expect(geometry(bg)).toEqual({ x: 0, y: 0, w: 2, h: 4 })
    expect(px(bg.pixels, 1, 0)).toEqual(RED)
    expect(doc.selection).toBeNull()
    expect(ed.history.steps.at(-1)!.label).toBe('Rotate 90° Right')
    undoRestores()
  })

  it('rotateDoc(3) turns counter-clockwise and rotateDoc(2) half a turn', () => {
    const a = setup()
    a.ed.rotateDoc(3)
    expect([a.doc.width, a.doc.height]).toEqual([2, 4])
    expect(geometry(a.dotLayer)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(px(a.bg.pixels, 0, 3)).toEqual(RED)
    expect(a.ed.history.steps.at(-1)!.label).toBe('Rotate 90° Left')
    a.undoRestores()

    const b = setup()
    b.ed.rotateDoc(2)
    expect([b.doc.width, b.doc.height]).toEqual([4, 2])
    expect(geometry(b.dotLayer)).toEqual({ x: 0, y: 1, w: 1, h: 1 })
    expect(px(b.bg.pixels, 3, 1)).toEqual(RED)
    expect(b.ed.history.steps.at(-1)!.label).toBe('Rotate 180°')
    b.undoRestores()
  })

  it('a layer that sticks out of the canvas keeps its place relative to the canvas', () => {
    const doc = createDoc(4, 2, 'transparent')
    const ed = new PhotoEditor(doc)
    const l = ed.addLayer({ pixels: createBitmap(3, 1), x: -1, y: 1 })
    ed.rotateDoc(1)
    // Doc point (x, y) -> (H - y, x): the rect [-1,2]x[1,2] becomes [0,1]x[-1,2].
    expect(geometry(l)).toEqual({ x: 0, y: -1, w: 1, h: 3 })
  })

  it('flipDoc mirrors every layer and its offset', () => {
    const h = setup()
    h.ed.flipDoc('h')
    expect(geometry(h.dotLayer)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(px(h.bg.pixels, 3, 0)).toEqual(RED)
    expect(h.doc.selection).toBeNull()
    expect(h.ed.history.steps.at(-1)!.label).toBe('Flip Horizontal')
    h.undoRestores()

    const v = setup()
    v.ed.flipDoc('v')
    expect(geometry(v.dotLayer)).toEqual({ x: 3, y: 1, w: 1, h: 1 })
    expect(px(v.bg.pixels, 0, 1)).toEqual(RED)
    expect(v.ed.history.steps.at(-1)!.label).toBe('Flip Vertical')
    v.undoRestores()
  })

  it('rotating or flipping turns text layers into pixels', () => {
    const { ed } = setup()
    const t = ed.addLayer({ kind: 'text', text: { text: 'Hi', font: 'Arial', size: 12, color: [0, 0, 0, 255], align: 'left' } })
    ed.flipDoc('h')
    expect(t.kind).toBe('raster')
    expect(t.text).toBeUndefined()
    ed.history.undo()
    expect(t.kind).toBe('text')
    expect(t.text?.text).toBe('Hi')
  })

  it('trim crops the canvas to the visible non-transparent pixels as one "Trim" step', () => {
    const doc = createDoc(10, 10, 'transparent')
    const ed = new PhotoEditor(doc)
    const base = doc.layers[0]
    base.pixels.data.set(RED, (4 * 10 + 3) * 4) // (3, 4)
    const hidden = ed.addLayer({ pixels: dot(10, 10, 0, 0) })
    ed.setLayerProps(hidden.id, { visible: false })
    const moved = ed.addLayer({ pixels: dot(3, 3, 1, 1), x: 5, y: 5 }) // its pixel is at (6, 6)
    const offCanvas = ed.addLayer({ pixels: dot(2, 2, 0, 0), x: -2, y: 0 }) // only off-canvas pixels
    const steps = ed.history.steps.length
    expect(ed.trim()).toBe(true)
    expect([doc.width, doc.height]).toEqual([4, 3])
    expect([base.x, base.y]).toEqual([-3, -4])
    expect([moved.x, moved.y]).toEqual([2, 1])
    expect([offCanvas.x, offCanvas.y]).toEqual([-5, -4])
    expect(ed.history.steps.length).toBe(steps + 1)
    expect(ed.history.steps.at(-1)!.label).toBe('Trim')
    ed.history.undo()
    expect([doc.width, doc.height]).toEqual([10, 10])
    expect([moved.x, moved.y, base.x]).toEqual([5, 5, 0])
    expect(getLayer(doc, hidden.id)!.visible).toBe(false)
  })

  it('trim does nothing when there is nothing to trim', () => {
    const empty = new PhotoEditor(createDoc(5, 5, 'transparent'))
    expect(empty.trim()).toBe(false)
    expect(empty.history.steps.length).toBe(0)
    const full = new PhotoEditor(createDoc(5, 5, [1, 2, 3, 255]))
    expect(full.trim()).toBe(false)
    expect(full.history.steps.length).toBe(0)
  })
})
