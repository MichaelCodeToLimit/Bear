import { describe, expect, it } from 'vitest'
import { createBitmap } from './bitmap'
import { activeLayer, createDoc, createLayer } from './doc'
import { PhotoEditor } from './editor'
import { maskBounds, rectMask } from './mask'
import { clearSelected, copyActiveLayer, invertSelection, selectAll } from './clipboardOps'

const px = (ed: PhotoEditor, x: number, y: number) => {
  const l = activeLayer(ed.doc)
  const i = ((y - l.y) * l.pixels.width + (x - l.x)) * 4
  return Array.from(l.pixels.data.slice(i, i + 4))
}
const make = () => new PhotoEditor(createDoc(6, 6, [255, 0, 0, 255]))
const count = (ed: PhotoEditor) => ed.history.steps.length

describe('selectAll / invertSelection', () => {
  it('Select All is one step covering the document', () => {
    const ed = make()
    selectAll(ed)
    expect(count(ed)).toBe(1)
    expect(ed.history.steps[0].label).toBe('Select All')
    expect(ed.doc.selection!.data.every((v) => v === 255)).toBe(true)
    expect(maskBounds(ed.doc.selection!)).toEqual({ x: 0, y: 0, width: 6, height: 6 })
    ed.history.undo()
    expect(ed.doc.selection).toBeNull()
  })
  it('invert does nothing without a selection', () => {
    const ed = make()
    expect(invertSelection(ed)).toBe('none')
    expect(count(ed)).toBe(0)
  })
  it('invert flips the mask in one step', () => {
    const ed = make()
    ed.setSelection(rectMask(6, 6, { x: 0, y: 0, width: 3, height: 6 }))
    expect(invertSelection(ed)).toBe('ok')
    expect(count(ed)).toBe(2)
    expect(ed.history.steps[1].label).toBe('Invert Selection')
    expect(maskBounds(ed.doc.selection!)).toEqual({ x: 3, y: 0, width: 3, height: 6 })
    ed.history.undo()
    expect(maskBounds(ed.doc.selection!)).toEqual({ x: 0, y: 0, width: 3, height: 6 })
  })
  it('inverting a full selection leaves nothing selected', () => {
    const ed = make()
    selectAll(ed)
    expect(invertSelection(ed)).toBe('empty')
    expect(ed.doc.selection).toBeNull()
  })
})

describe('clearSelected', () => {
  it('clears exactly the selected pixels as one labelled step and undoes', () => {
    const ed = make()
    ed.setSelection(rectMask(6, 6, { x: 1, y: 1, width: 2, height: 2 }))
    const n = count(ed)
    expect(clearSelected(ed, activeLayer(ed.doc), 'Clear')).toBe(true)
    expect(px(ed, 1, 1)).toEqual([0, 0, 0, 0])
    expect(px(ed, 2, 2)).toEqual([0, 0, 0, 0])
    expect(px(ed, 3, 3)).toEqual([255, 0, 0, 255])
    expect(px(ed, 0, 1)).toEqual([255, 0, 0, 255])
    expect(count(ed)).toBe(n + 1)
    expect(ed.history.steps.at(-1)!.label).toBe('Clear')
    ed.history.undo()
    expect(px(ed, 1, 1)).toEqual([255, 0, 0, 255])
  })
  it('scales alpha by soft mask values', () => {
    const ed = make()
    const m = rectMask(6, 6, { x: 0, y: 0, width: 1, height: 1 })
    m.data[0] = 128
    ed.setSelection(m)
    clearSelected(ed, activeLayer(ed.doc), 'Clear')
    expect(px(ed, 0, 0)[3]).toBe(127)
  })
  it('respects the layer offset and clips to the layer', () => {
    const ed = make()
    const l = createLayer('Offset', createBitmap(3, 3, [0, 255, 0, 255]), { x: 3, y: 3 })
    ed.doc.layers.push(l)
    ed.doc.activeLayerId = l.id
    ed.setSelection(rectMask(6, 6, { x: 0, y: 0, width: 6, height: 6 }))
    expect(clearSelected(ed, l, 'Cut')).toBe(true)
    expect(l.pixels.data.every((v) => v === 0)).toBe(true)
  })
  it('records nothing when there is nothing to clear', () => {
    const ed = new PhotoEditor(createDoc(4, 4, 'transparent'))
    ed.setSelection(rectMask(4, 4, { x: 0, y: 0, width: 2, height: 2 }))
    const n = count(ed)
    expect(clearSelected(ed, activeLayer(ed.doc), 'Clear')).toBe(false)
    expect(count(ed)).toBe(n)
  })
  it('without a selection clears the whole layer', () => {
    const ed = make()
    expect(clearSelected(ed, activeLayer(ed.doc), 'Cut')).toBe(true)
    expect(activeLayer(ed.doc).pixels.data.every((v) => v === 0)).toBe(true)
  })
})

describe('copyActiveLayer', () => {
  it('copies selection and layer overlap with mask values as alpha', () => {
    const ed = make()
    const m = rectMask(6, 6, { x: 1, y: 2, width: 3, height: 2 })
    m.data[2 * 6 + 1] = 128
    ed.setSelection(m)
    const out = copyActiveLayer(ed.doc)!
    expect(out.width).toBe(3)
    expect(out.height).toBe(2)
    expect(Array.from(out.data.slice(0, 4))).toEqual([255, 0, 0, 128])
    expect(Array.from(out.data.slice(4, 8))).toEqual([255, 0, 0, 255])
  })
  it('copies the whole layer without a selection', () => {
    const out = copyActiveLayer(make().doc)!
    expect([out.width, out.height]).toEqual([6, 6])
  })
  it('returns null for a hidden layer or an empty layer', () => {
    const ed = make()
    activeLayer(ed.doc).visible = false
    expect(copyActiveLayer(ed.doc)).toBeNull()
    expect(copyActiveLayer(new PhotoEditor(createDoc(4, 4, 'transparent')).doc)).toBeNull()
  })
  it('crops to the layer when the layer is smaller than the selection', () => {
    const ed = make()
    const l = createLayer('Small', createBitmap(2, 2, [0, 0, 255, 255]), { x: 1, y: 1 })
    ed.doc.layers.push(l)
    ed.doc.activeLayerId = l.id
    ed.setSelection(rectMask(6, 6, { x: 0, y: 0, width: 6, height: 6 }))
    const out = copyActiveLayer(ed.doc)!
    expect([out.width, out.height]).toEqual([2, 2])
  })
})
