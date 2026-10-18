import { describe, expect, it } from 'vitest'
import { createBitmap, readRect, unionRect, intersectRect, type Rect, type RGBA } from './bitmap'
import { createDoc, getLayer, activeLayer } from './doc'
import { History, type Step } from './history'
import { PhotoEditor } from './editor'

const WHITE: RGBA = [255, 255, 255, 255]
const RED: RGBA = [255, 0, 0, 255]

function fillRect(p: ReturnType<typeof createBitmap>, r: Rect, color: RGBA) {
  for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) p.data.set(color, (y * p.width + x) * 4)
}
const step = (label: string, bytes = 1, log: string[] = []): Step => ({
  label,
  bytes,
  undo: () => void log.push('u' + label),
  redo: () => void log.push('r' + label)
})

describe('bitmap helpers', () => {
  it('unions and intersects rects', () => {
    expect(unionRect({ x: 0, y: 0, width: 2, height: 2 }, { x: 3, y: 3, width: 2, height: 2 })).toEqual({ x: 0, y: 0, width: 5, height: 5 })
    expect(intersectRect({ x: 0, y: 0, width: 2, height: 2 }, { x: 2, y: 2, width: 2, height: 2 })).toBeNull()
    expect(intersectRect({ x: 0, y: 0, width: 3, height: 3 }, { x: 2, y: 2, width: 3, height: 3 })).toEqual({ x: 2, y: 2, width: 1, height: 1 })
  })
})

describe('createDoc', () => {
  it('has one white Background layer', () => {
    const doc = createDoc(4, 3, WHITE)
    expect(doc.layers).toHaveLength(1)
    const l = doc.layers[0]
    expect(l.name).toBe('Background')
    expect(l.pixels.width).toBe(4)
    expect(l.pixels.height).toBe(3)
    for (let i = 0; i < l.pixels.data.length; i++) expect(l.pixels.data[i]).toBe(255)
    expect(activeLayer(doc)).toBe(l)
    expect(getLayer(doc, l.id)).toBe(l)
  })
  it('transparent background is all zero', () => {
    const doc = createDoc(2, 2, 'transparent')
    expect(doc.layers[0].pixels.data.every((v) => v === 0)).toBe(true)
  })
})

describe('editPixels', () => {
  it('undo restores exact bytes and redo reapplies', () => {
    const ed = new PhotoEditor(createDoc(4, 3, WHITE))
    const id = ed.doc.layers[0].id
    const before = ed.doc.layers[0].pixels.data.slice()
    const r = { x: 1, y: 1, width: 2, height: 1 }
    ed.editPixels('Paint', id, r, (p) => fillRect(p, r, RED))
    const after = ed.doc.layers[0].pixels.data.slice()
    expect(after).not.toEqual(before)
    expect(Array.from(readRect(ed.doc.layers[0].pixels, { x: 1, y: 1, width: 1, height: 1 }).data)).toEqual(RED)
    ed.history.undo()
    expect(ed.doc.layers[0].pixels.data).toEqual(before)
    ed.history.redo()
    expect(ed.doc.layers[0].pixels.data).toEqual(after)
  })

  it('bumps version and calls onChange', () => {
    const ed = new PhotoEditor(createDoc(4, 3, WHITE))
    const seen: unknown[] = []
    ed.onChange = (r) => seen.push(r)
    const v = ed.version
    ed.editPixels('Paint', ed.doc.layers[0].id, { x: 0, y: 0, width: 1, height: 1 }, () => {})
    expect(ed.version).toBeGreaterThan(v)
    expect(seen).toHaveLength(1)
  })

  it('deleting a painted layer and undoing brings the pixels back; undoing again removes them', () => {
    const ed = new PhotoEditor(createDoc(4, 3, WHITE))
    const a = ed.addLayer({ name: 'A' })
    const r = { x: 0, y: 0, width: 2, height: 2 }
    ed.editPixels('Paint', a.id, r, (p) => fillRect(p, r, RED))
    ed.deleteLayer(a.id)
    expect(ed.doc.layers.find((l) => l.id === a.id)).toBeUndefined()
    ed.history.undo()
    const back = getLayer(ed.doc, a.id)!
    expect(Array.from(readRect(back.pixels, { x: 0, y: 0, width: 1, height: 1 }).data)).toEqual(RED)
    ed.history.undo()
    expect(Array.from(getLayer(ed.doc, a.id)!.pixels.data.slice(0, 4))).toEqual([0, 0, 0, 0])
  })
})

describe('History', () => {
  it('caps at 50 steps dropping the oldest', () => {
    const h = new History()
    for (let i = 0; i < 51; i++) h.push(step('s' + i))
    expect(h.steps).toHaveLength(50)
    expect(h.steps[0].label).toBe('s1')
    expect(h.index).toBe(50)
  })
  it('caps by bytes, keeping the newest', () => {
    const h = new History(50, 100)
    h.push(step('a', 60))
    h.push(step('b', 60))
    expect(h.steps.map((s) => s.label)).toEqual(['b'])
  })
  it('goTo(0) undoes all and a new push drops the redo branch', () => {
    const log: string[] = []
    const h = new History()
    h.push(step('1', 1, log))
    h.push(step('2', 1, log))
    h.push(step('3', 1, log))
    h.goTo(0)
    expect(log).toEqual(['u3', 'u2', 'u1'])
    expect(h.index).toBe(0)
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(true)
    h.goTo(2)
    expect(log.slice(3)).toEqual(['r1', 'r2'])
    h.undo()
    h.push(step('4'))
    expect(h.steps.map((s) => s.label)).toEqual(['1', '4'])
    expect(h.canRedo).toBe(false)
  })
})

describe('structure edits', () => {
  it('deleteLayer on the only layer throws', () => {
    const ed = new PhotoEditor(createDoc(2, 2, WHITE))
    expect(() => ed.deleteLayer(ed.doc.layers[0].id)).toThrow('A document needs at least one layer')
  })

  it('moveLayer is one undoable step', () => {
    const ed = new PhotoEditor(createDoc(2, 2, WHITE))
    const a = ed.addLayer({ name: 'A' })
    const b = ed.addLayer({ name: 'B' })
    const n = ed.history.steps.length
    ed.moveLayer(b.id, 0)
    expect(ed.history.steps.length).toBe(n + 1)
    expect(ed.doc.layers[0].id).toBe(b.id)
    ed.history.undo()
    expect(ed.doc.layers[2].id).toBe(b.id)
    expect(ed.doc.layers[1].id).toBe(a.id)
  })

  it('setLayerProps is one undoable step', () => {
    const ed = new PhotoEditor(createDoc(2, 2, WHITE))
    const id = ed.doc.layers[0].id
    const n = ed.history.steps.length
    ed.setLayerProps(id, { opacity: 0.5, blend: 'multiply', name: 'X' })
    expect(ed.history.steps.length).toBe(n + 1)
    expect(getLayer(ed.doc, id)).toMatchObject({ opacity: 0.5, blend: 'multiply', name: 'X' })
    ed.history.undo()
    expect(getLayer(ed.doc, id)).toMatchObject({ opacity: 1, blend: 'normal', name: 'Background' })
    ed.history.redo()
    expect(getLayer(ed.doc, id)!.opacity).toBe(0.5)
  })

  it('resizeCanvas is one undoable step and anchors', () => {
    const ed = new PhotoEditor(createDoc(4, 4, WHITE))
    const n = ed.history.steps.length
    ed.resizeCanvas(8, 6, 'c')
    expect(ed.history.steps.length).toBe(n + 1)
    expect([ed.doc.width, ed.doc.height]).toEqual([8, 6])
    expect(ed.doc.layers[0].x).toBe(2)
    expect(ed.doc.layers[0].y).toBe(1)
    ed.history.undo()
    expect([ed.doc.width, ed.doc.height]).toEqual([4, 4])
    expect(ed.doc.layers[0].x).toBe(0)
  })

  it('addLayer inserts above the active layer and is undoable; duplicate copies pixels', () => {
    const ed = new PhotoEditor(createDoc(2, 2, WHITE))
    const bg = ed.doc.layers[0]
    const l = ed.addLayer()
    expect(ed.doc.layers[1].id).toBe(l.id)
    expect(ed.doc.activeLayerId).toBe(l.id)
    const d = ed.duplicateLayer(bg.id)
    expect(d.pixels).not.toBe(bg.pixels)
    expect(d.pixels.data).toEqual(bg.pixels.data)
    expect(ed.doc.layers[1].id).toBe(d.id)
    ed.history.undo()
    expect(getLayer(ed.doc, d.id)).toBeUndefined()
    ed.history.undo()
    expect(ed.doc.layers).toHaveLength(1)
    expect(ed.doc.activeLayerId).toBe(bg.id)
  })

  it('setSelection is undoable with Select/Deselect labels', () => {
    const ed = new PhotoEditor(createDoc(2, 2, WHITE))
    const m = { width: 2, height: 2, data: new Uint8Array(4).fill(255) }
    ed.setSelection(m)
    expect(ed.doc.selection).toBe(m)
    expect(ed.history.steps.at(-1)!.label).toBe('Select')
    ed.setSelection(null)
    expect(ed.history.steps.at(-1)!.label).toBe('Deselect')
    ed.history.undo()
    expect(ed.doc.selection).toBe(m)
    ed.history.undo()
    expect(ed.doc.selection).toBeNull()
  })
})
