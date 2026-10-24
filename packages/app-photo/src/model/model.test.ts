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

describe('fix round 1', () => {
  it('structure step bytes count bitmaps kept alive, so a big delete evicts older steps', () => {
    const ed = new PhotoEditor(createDoc(2, 2, WHITE))
    ed.history = new History(50, 5000)
    ed.setLayerProps(ed.doc.layers[0].id, { opacity: 0.9 })
    ed.setLayerProps(ed.doc.layers[0].id, { opacity: 0.8 })
    expect(ed.history.steps).toHaveLength(2)
    const big = ed.addLayer({ pixels: createBitmap(100, 100) }) // 40000 bytes
    expect(ed.history.steps).toHaveLength(1) // step alone exceeds cap, older evicted
    expect(ed.history.steps[0].bytes).toBeGreaterThanOrEqual(40000)
    ed.deleteLayer(big.id)
    expect(ed.history.steps.at(-1)!.bytes).toBeGreaterThanOrEqual(40000)
    expect(ed.history.steps).toHaveLength(1)
  })

  it('editPixels with a rect missing the layer does not call fn or record a step', () => {
    const ed = new PhotoEditor(createDoc(2, 2, WHITE))
    let called = false
    const v = ed.version
    ed.editPixels('Paint', ed.doc.layers[0].id, { x: 10, y: 10, width: 2, height: 2 }, () => {
      called = true
    })
    expect(called).toBe(false)
    expect(ed.history.steps).toHaveLength(0)
    expect(ed.version).toBe(v)
  })

  it('layer object identity is stable across undo/redo', () => {
    const ed = new PhotoEditor(createDoc(2, 2, WHITE))
    const l = ed.addLayer()
    ed.setLayerProps(l.id, { opacity: 0.5 })
    ed.history.undo()
    expect(ed.doc.layers).toContain(l)
    expect(l.opacity).toBe(1)
    ed.history.redo()
    expect(l.opacity).toBe(0.5)
    ed.deleteLayer(l.id)
    ed.history.undo()
    expect(ed.doc.layers).toContain(l)
    // in-place prop changes must not corrupt older snapshots
    ed.setLayerProps(l.id, { opacity: 0.1 })
    ed.history.undo()
    expect(l.opacity).toBe(0.5)
  })
})

function near4(got: number[], want: number[]) {
  got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(1))
}

describe('mergeDown and flatten', () => {
  it('merges a 50% normal layer onto the one below as a single step', () => {
    const ed = new PhotoEditor(createDoc(1, 1, [0, 0, 255, 255]))
    const bg = ed.doc.layers[0]
    const top = ed.addLayer({ pixels: createBitmap(1, 1, [128, 0, 0, 255]) })
    ed.setLayerProps(top.id, { opacity: 0.5 })
    ed.mergeDown(top.id)
    expect(ed.doc.layers).toEqual([bg])
    near4(Array.from(bg.pixels.data), [64, 0, 128, 255])
    expect(ed.doc.activeLayerId).toBe(bg.id)
    ed.history.undo()
    expect(ed.doc.layers).toHaveLength(2)
    expect(ed.doc.layers[1]).toBe(top)
    expect(Array.from(bg.pixels.data)).toEqual([0, 0, 255, 255])
    ed.history.redo()
    expect(ed.doc.layers).toHaveLength(1)
  })
  it('throws for the bottom layer', () => {
    const ed = new PhotoEditor(createDoc(2, 2, WHITE))
    expect(() => ed.mergeDown(ed.doc.layers[0].id)).toThrow('There is no layer below to merge into')
  })
  it('keeps only on-canvas pixels of an overhanging layer, at the right place', () => {
    const ed = new PhotoEditor(createDoc(4, 3, [0, 0, 255, 255]))
    const bg = ed.doc.layers[0]
    const src = createBitmap(4, 2)
    for (let x = 0; x < 4; x++) for (let y = 0; y < 2; y++) src.data.set([x * 50 + 10, 0, 0, 255], (y * 4 + x) * 4)
    const top = ed.addLayer({ pixels: src, x: -2, y: -1 })
    ed.mergeDown(top.id)
    expect(bg.x).toBe(0)
    expect(bg.y).toBe(0)
    expect(bg.pixels.width).toBe(4)
    expect(bg.pixels.height).toBe(3)
    const at = (x: number, y: number) => Array.from(bg.pixels.data.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4))
    // doc (0,0) comes from layer (2,1): column 2 => 110
    expect(at(0, 0)).toEqual([110, 0, 0, 255])
    expect(at(1, 0)).toEqual([160, 0, 0, 255])
    expect(at(2, 0)).toEqual([0, 0, 255, 255])
    expect(at(0, 1)).toEqual([0, 0, 255, 255])
  })
  it('grows to the union of both bounds when merging onto a smaller offset layer', () => {
    const ed = new PhotoEditor(createDoc(10, 10, 'transparent'))
    const low = ed.addLayer({ pixels: createBitmap(2, 2, [255, 0, 0, 255]), x: 5, y: 5 })
    const top = ed.addLayer({ pixels: createBitmap(3, 3, [0, 255, 0, 255]), x: 1, y: 2 })
    ed.mergeDown(top.id)
    expect(low.x).toBe(1)
    expect(low.y).toBe(2)
    expect(low.pixels.width).toBe(6)
    expect(low.pixels.height).toBe(5)
    const at = (x: number, y: number) => Array.from(low.pixels.data.subarray((y * 6 + x) * 4, (y * 6 + x) * 4 + 4))
    expect(at(0, 0)).toEqual([0, 255, 0, 255])
    expect(at(4, 3)).toEqual([255, 0, 0, 255])
    expect(at(5, 4)).toEqual([255, 0, 0, 255])
    expect(at(5, 0)).toEqual([0, 0, 0, 0])
    ed.history.undo()
    expect(low.x).toBe(5)
    expect(low.pixels.width).toBe(2)
  })
  it('flatten makes one Background layer and undo restores every layer', () => {
    const ed = new PhotoEditor(createDoc(2, 1, WHITE))
    const bg = ed.doc.layers[0]
    const a = ed.addLayer({ pixels: createBitmap(2, 1, [255, 0, 0, 255]) })
    ed.setLayerProps(a.id, { opacity: 0.5 })
    const hidden = ed.addLayer({ pixels: createBitmap(2, 1, [0, 0, 0, 255]) })
    ed.setLayerProps(hidden.id, { visible: false })
    ed.flatten()
    expect(ed.doc.layers).toHaveLength(1)
    const f = ed.doc.layers[0]
    expect(f.name).toBe('Background')
    expect(f.blend).toBe('normal')
    expect(f.opacity).toBe(1)
    expect(f.pixels.width).toBe(2)
    near4(Array.from(f.pixels.data.subarray(0, 4)), [255, 128, 128, 255])
    ed.history.undo()
    expect(ed.doc.layers).toEqual([bg, a, hidden])
    expect(ed.doc.layers[0]).toBe(bg)
    expect(Array.from(bg.pixels.data)).toEqual([255, 255, 255, 255, 255, 255, 255, 255])
    expect(hidden.visible).toBe(false)
    ed.history.redo()
    expect(ed.doc.layers).toHaveLength(1)
  })
})
