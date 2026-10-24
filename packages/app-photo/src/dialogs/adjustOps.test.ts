import { describe, expect, it } from 'vitest'
import { createBitmap } from '../model/bitmap'
import { createDoc } from '../model/doc'
import { PhotoEditor } from '../model/editor'
import { rectMask } from '../model/mask'
import { adjustDefaults, adjustPreview, commitAdjust, editArea } from './adjustOps'

describe('adjustment dialogs: helpers', () => {
  it('previews are fresh objects with fresh lookup tables (the compositor compares by identity)', () => {
    const a = adjustPreview('levels', adjustDefaults('levels'), 'L', null)
    const b = adjustPreview('levels', adjustDefaults('levels'), 'L', null)
    expect(a).not.toBe(b)
    expect(a.kind === 'lut' && b.kind === 'lut' && a.lut !== b.lut).toBe(true)
    expect(adjustPreview('hsl', { hue: 30, saturation: 0, lightness: 0 }, 'L', null)).toMatchObject({ kind: 'hsl', hue: 30, layerId: 'L' })
  })

  it('editArea is the selection bounds in layer coordinates, clipped to the layer, or the whole layer', () => {
    const doc = createDoc(10, 10, 'transparent')
    const ed = new PhotoEditor(doc)
    const l = ed.addLayer({ pixels: createBitmap(4, 4), x: 5, y: 5 })
    expect(editArea(doc, l)).toEqual({ x: 0, y: 0, width: 4, height: 4 })
    ed.setSelection(rectMask(10, 10, { x: 3, y: 6, width: 4, height: 2 }))
    expect(editArea(doc, l)).toEqual({ x: 0, y: 1, width: 2, height: 2 })
    ed.setSelection(rectMask(10, 10, { x: 0, y: 0, width: 2, height: 2 }))
    expect(editArea(doc, l)).toBeNull()
  })

  it('commitAdjust records one step named after the dialog and changes only the selection', () => {
    const doc = createDoc(4, 1, [10, 10, 10, 255])
    const ed = new PhotoEditor(doc)
    ed.setSelection(rectMask(4, 1, { x: 0, y: 0, width: 2, height: 1 }))
    const n = ed.history.steps.length
    expect(commitAdjust(ed, doc.layers[0], 'invert', null)).toBe(true)
    expect(ed.history.steps.length).toBe(n + 1)
    expect(ed.history.steps.at(-1)!.label).toBe('Invert')
    expect(Array.from(doc.layers[0].pixels.data)).toEqual([245, 245, 245, 255, 245, 245, 245, 255, 10, 10, 10, 255, 10, 10, 10, 255])
    commitAdjust(ed, doc.layers[0], 'hsl', { hue: 0, saturation: 0, lightness: 100 })
    expect(ed.history.steps.at(-1)!.label).toBe('Hue/Saturation')
    expect(doc.layers[0].pixels.data[0]).toBe(255)
    ed.history.undo()
    ed.history.undo()
    expect(Array.from(doc.layers[0].pixels.data.subarray(0, 4))).toEqual([10, 10, 10, 255])
  })
})
