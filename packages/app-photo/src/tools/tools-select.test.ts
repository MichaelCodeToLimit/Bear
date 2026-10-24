import { describe, expect, it } from 'vitest'
import { createBitmap, type Bitmap, type RGBA } from '../model/bitmap'
import { activeLayer, createDoc } from '../model/doc'
import { rectMask } from '../model/mask'
import { ZOOM_STEPS } from '../zoom'
import { holdSpace, toolForKey, TOOLS } from './index'
import { crop } from './crop'
import { eyedropper } from './eyedropper'
import { hand } from './hand'
import { lasso } from './lasso'
import { marquee } from './marquee'
import { move } from './move'
import { wand } from './wand'
import { zoom } from './zoom'
import { at, drag, fakeContext, key } from './testing'

const selected = (m: { data: Uint8Array } | null) => (m ? m.data.filter((v) => v > 0).length : 0)
const px = (b: Bitmap, x: number, y: number) => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))
function paint(b: Bitmap, x0: number, y0: number, w: number, h: number, c: RGBA) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) b.data.set(c, (y * b.width + x) * 4)
}
const RED: RGBA = [255, 0, 0, 255]

describe('marquee', () => {
  it('replaces, adds with Shift and subtracts with Alt', () => {
    const ctx = fakeContext(undefined, marquee)
    drag(marquee, ctx, [2, 2], [6, 6])
    expect(selected(ctx.editor.doc.selection)).toBe(16)
    drag(marquee, ctx, [10, 10], [12, 12], { shift: true })
    expect(selected(ctx.editor.doc.selection)).toBe(20)
    drag(marquee, ctx, [2, 2], [6, 6], { alt: true })
    expect(selected(ctx.editor.doc.selection)).toBe(4)
    expect(ctx.overlay).toBeNull()
  })
  it('shows the rectangle while dragging', () => {
    const ctx = fakeContext(undefined, marquee)
    marquee.down(ctx, at(ctx, 1, 1))
    marquee.move(ctx, at(ctx, 4, 3))
    expect(ctx.overlay).toEqual({ kind: 'marquee', rect: { x: 1, y: 1, width: 3, height: 2 }, ellipse: false })
  })
  it('subtracting everything deselects and says so', () => {
    const ctx = fakeContext(undefined, marquee)
    drag(marquee, ctx, [2, 2], [6, 6])
    drag(marquee, ctx, [0, 0], [10, 10], { alt: true })
    expect(ctx.editor.doc.selection).toBeNull()
    expect(ctx.statuses).toContain('Nothing selected')
  })
  it('an empty intersection deselects and says so', () => {
    const ctx = fakeContext(undefined, marquee)
    drag(marquee, ctx, [2, 2], [6, 6])
    drag(marquee, ctx, [10, 10], [12, 12], { shift: true, alt: true })
    expect(ctx.editor.doc.selection).toBeNull()
    expect(ctx.statuses).toContain('Nothing selected')
  })
  it('a click without dragging deselects', () => {
    const ctx = fakeContext(undefined, marquee)
    drag(marquee, ctx, [2, 2], [6, 6])
    drag(marquee, ctx, [8, 8], [8, 8])
    expect(ctx.editor.doc.selection).toBeNull()
    expect(ctx.editor.history.steps.map((s) => s.label)).toEqual(['Select', 'Deselect'])
  })
  it('ellipse shape', () => {
    const ctx = fakeContext(undefined, marquee, { shape: 'Ellipse' })
    drag(marquee, ctx, [0, 0], [10, 10])
    const n = selected(ctx.editor.doc.selection)
    expect(n).toBeGreaterThan(70)
    expect(n).toBeLessThan(100)
  })
})

describe('lasso', () => {
  it('freehand polygon selects about 100 cells', () => {
    const ctx = fakeContext(undefined, lasso)
    drag(lasso, ctx, [0, 0], [0, 10], {}, [[10, 0], [10, 10]])
    const n = selected(ctx.editor.doc.selection)
    expect(n).toBeGreaterThanOrEqual(90)
    expect(n).toBeLessThanOrEqual(110)
  })
  it('polygonal: clicks add points, Enter closes', () => {
    const ctx = fakeContext(undefined, lasso, { mode: 'Polygonal' })
    for (const [x, y] of [[0, 0], [10, 0], [10, 10], [0, 10]]) {
      lasso.down(ctx, at(ctx, x, y))
      lasso.up(ctx, at(ctx, x, y))
    }
    expect(ctx.overlay?.kind).toBe('path')
    expect(lasso.onKey!(ctx, key('Enter'))).toBe(true)
    expect(Math.abs(selected(ctx.editor.doc.selection) - 100)).toBeLessThanOrEqual(10)
    expect(ctx.overlay).toBeNull()
  })
  it('lasso subtract of everything deselects and says so', () => {
    const ctx = fakeContext(undefined, lasso)
    ctx.editor.setSelection(rectMask(20, 20, { x: 2, y: 2, width: 3, height: 3 }))
    drag(lasso, ctx, [0, 0], [0, 10], { alt: true }, [[10, 0], [10, 10]])
    expect(ctx.editor.doc.selection).toBeNull()
    expect(ctx.statuses).toContain('Nothing selected')
  })
})

describe('wand', () => {
  it('selects the clicked colour region only', () => {
    const doc = createDoc(20, 20, [255, 255, 255, 255])
    paint(activeLayer(doc).pixels, 0, 0, 5, 5, [250, 10, 10, 255])
    paint(activeLayer(doc).pixels, 1, 1, 2, 2, [230, 30, 30, 255]) // within tolerance 32
    paint(activeLayer(doc).pixels, 15, 15, 5, 5, [250, 10, 10, 255]) // same colour, not touching
    const ctx = fakeContext(doc, wand, { tolerance: 32 })
    drag(wand, ctx, [2, 2], [2, 2])
    expect(selected(ctx.editor.doc.selection)).toBe(25)
    ctx.options = { ...ctx.options, contiguous: false }
    drag(wand, ctx, [2, 2], [2, 2])
    expect(selected(ctx.editor.doc.selection)).toBe(50)
  })
  it('subtracting the whole selection deselects and says so', () => {
    const ctx = fakeContext(createDoc(20, 20, [255, 255, 255, 255]), wand)
    ctx.editor.setSelection(rectMask(20, 20, { x: 2, y: 2, width: 3, height: 3 }))
    drag(wand, ctx, [5, 5], [5, 5], { alt: true })
    expect(ctx.editor.doc.selection).toBeNull()
    expect(ctx.statuses).toContain('Nothing selected')
  })
})

describe('move', () => {
  it('moves the selected pixels and the selection as one step', () => {
    const ctx = fakeContext(undefined, move)
    const layer = activeLayer(ctx.editor.doc)
    paint(layer.pixels, 2, 2, 2, 2, RED)
    ctx.editor.setSelection(rectMask(20, 20, { x: 2, y: 2, width: 2, height: 2 }))
    const steps = ctx.editor.history.steps.length
    drag(move, ctx, [2, 2], [5, 2], {}, [[3, 2], [4, 2]])
    const l = activeLayer(ctx.editor.doc)
    expect(px(l.pixels, 5, 2)).toEqual(RED)
    expect(px(l.pixels, 6, 3)).toEqual(RED)
    expect(px(l.pixels, 2, 2)).toEqual([0, 0, 0, 0])
    expect(px(l.pixels, 3, 3)).toEqual([0, 0, 0, 0])
    expect(ctx.editor.history.steps.length).toBe(steps + 1)
    expect(ctx.editor.history.steps.at(-1)!.label).toBe('Move')
    const sel = ctx.editor.doc.selection!
    expect(sel.data[2 * 20 + 5]).toBe(255)
    expect(sel.data[2 * 20 + 2]).toBe(0)
    ctx.editor.history.undo()
    expect(px(activeLayer(ctx.editor.doc).pixels, 2, 2)).toEqual(RED)
    expect(px(activeLayer(ctx.editor.doc).pixels, 5, 2)).toEqual([0, 0, 0, 0])
    expect(ctx.editor.doc.selection!.data[2 * 20 + 2]).toBe(255)
  })
  it('without a selection moves the layer and touches no pixels', () => {
    const ctx = fakeContext(undefined, move)
    const layer = activeLayer(ctx.editor.doc)
    const pixels = layer.pixels
    const bytes = pixels.data.slice()
    drag(move, ctx, [4, 4], [7, 4])
    expect(layer.x).toBe(3)
    expect(layer.y).toBe(0)
    expect(layer.pixels).toBe(pixels)
    expect(layer.pixels.data).toEqual(bytes)
    expect(ctx.editor.history.steps.map((s) => s.label)).toEqual(['Move'])
  })
  it('keeps layer offsets whole after a fractional drag', () => {
    const ctx = fakeContext(undefined, move)
    drag(move, ctx, [1.2, 1.7], [4.6, 3.1], {}, [[2.3, 2.9]])
    const l = activeLayer(ctx.editor.doc)
    expect(Number.isInteger(l.x) && Number.isInteger(l.y)).toBe(true)
    expect([l.x, l.y]).toEqual([3, 1])
  })
  it('selection moves land on whole pixels too', () => {
    const ctx = fakeContext(undefined, move)
    paint(activeLayer(ctx.editor.doc).pixels, 2, 2, 2, 2, RED)
    ctx.editor.setSelection(rectMask(20, 20, { x: 2, y: 2, width: 2, height: 2 }))
    drag(move, ctx, [2, 2], [4.4, 3.6])
    const l = activeLayer(ctx.editor.doc)
    expect(Number.isInteger(l.x) && Number.isInteger(l.y)).toBe(true)
    expect(px(l.pixels, 4 - l.x, 4 - l.y)).toEqual(RED)
  })
  it('arrow keys nudge 1 px, Shift+arrow 10 px', () => {
    const ctx = fakeContext(undefined, move)
    const layer = activeLayer(ctx.editor.doc)
    expect(move.onKey!(ctx, key('ArrowRight'))).toBe(true)
    expect(layer.x).toBe(1)
    move.onKey!(ctx, key('ArrowDown', { shiftKey: true }))
    expect(layer.y).toBe(10)
    move.onKey!(ctx, key('ArrowLeft', { shiftKey: true }))
    expect(layer.x).toBe(-9)
    expect(move.onKey!(ctx, key('a'))).toBe(false)
  })
  it('refuses a locked layer', () => {
    const ctx = fakeContext(undefined, move)
    activeLayer(ctx.editor.doc).locked = true
    drag(move, ctx, [4, 4], [7, 4])
    move.onKey!(ctx, key('ArrowRight'))
    expect(activeLayer(ctx.editor.doc).x).toBe(0)
    expect(ctx.statuses).toContain('This layer is locked')
    expect(ctx.editor.history.steps.length).toBe(0)
  })
  it('previews without history and cancel restores', () => {
    const ctx = fakeContext(undefined, move)
    const layer = activeLayer(ctx.editor.doc)
    move.down(ctx, at(ctx, 1, 1))
    move.move(ctx, at(ctx, 5, 1))
    expect(layer.x).toBe(4)
    expect(ctx.editor.history.steps.length).toBe(0)
    expect(ctx.refreshes).toBeGreaterThan(0)
    move.cancel!(ctx)
    expect(layer.x).toBe(0)
  })
})

describe('crop', () => {
  function cropDoc() {
    const doc = createDoc(20, 20, [255, 255, 255, 255])
    const top = createBitmap(20, 20, RED)
    doc.layers.push({ ...activeLayer(doc), id: 'top', name: 'Top', pixels: top })
    return doc
  }
  it('Enter crops the canvas and shifts layers; undo restores', () => {
    const ctx = fakeContext(cropDoc(), crop, { deleteCropped: false })
    drag(crop, ctx, [5, 5], [15, 15])
    expect(ctx.overlay).toEqual({ kind: 'crop', rect: { x: 5, y: 5, width: 10, height: 10 } })
    expect(crop.onKey!(ctx, key('Enter'))).toBe(true)
    const doc = ctx.editor.doc
    expect([doc.width, doc.height]).toEqual([10, 10])
    for (const l of doc.layers) {
      expect([l.x, l.y]).toEqual([-5, -5])
      expect([l.pixels.width, l.pixels.height]).toEqual([20, 20])
    }
    expect(ctx.overlay).toBeNull()
    ctx.editor.history.undo()
    expect([doc.width, doc.height]).toEqual([20, 20])
    expect(doc.layers.map((l) => [l.x, l.y])).toEqual([[0, 0], [0, 0]])
  })
  it('with "delete cropped" the bitmaps are trimmed too', () => {
    const ctx = fakeContext(cropDoc(), crop)
    expect(ctx.options.deleteCropped).toBe(true)
    drag(crop, ctx, [5, 5], [15, 15])
    crop.onKey!(ctx, key('Enter'))
    const doc = ctx.editor.doc
    expect([doc.width, doc.height]).toEqual([10, 10])
    for (const l of doc.layers) {
      expect([l.x, l.y]).toEqual([0, 0])
      expect([l.pixels.width, l.pixels.height]).toEqual([10, 10])
    }
    expect(ctx.editor.history.steps.at(-1)!.label).toBe('Crop')
    ctx.editor.history.undo()
    expect([doc.width, doc.height]).toEqual([20, 20])
    expect(doc.layers.every((l) => l.pixels.width === 20 && l.x === 0)).toBe(true)
  })
  it('Escape cancels', () => {
    const ctx = fakeContext(cropDoc(), crop)
    drag(crop, ctx, [5, 5], [15, 15])
    expect(crop.onKey!(ctx, key('Escape'))).toBe(true)
    expect(ctx.overlay).toBeNull()
    expect(crop.onKey!(ctx, key('Enter'))).toBe(false)
    expect(ctx.editor.doc.width).toBe(20)
  })
  it('1:1 ratio keeps the box square', () => {
    const ctx = fakeContext(cropDoc(), crop, { ratio: '1:1' })
    drag(crop, ctx, [2, 2], [12, 7])
    expect(ctx.overlay).toEqual({ kind: 'crop', rect: { x: 2, y: 2, width: 5, height: 5 } })
  })
  it('dragging inside the box moves it', () => {
    const ctx = fakeContext(cropDoc(), crop)
    drag(crop, ctx, [2, 2], [8, 8])
    drag(crop, ctx, [5, 5], [7, 6])
    expect(ctx.overlay).toEqual({ kind: 'crop', rect: { x: 4, y: 3, width: 6, height: 6 } })
  })
})

describe('eyedropper', () => {
  it('samples one pixel or averages a 3×3 box', () => {
    const doc = createDoc(20, 20, [0, 0, 0, 255])
    const b = activeLayer(doc).pixels
    paint(b, 5, 5, 1, 1, [10, 20, 30, 255])
    const ctx = fakeContext(doc, eyedropper)
    drag(eyedropper, ctx, [5.5, 5.5], [5.5, 5.5])
    expect(ctx.colors.fg).toEqual([10, 20, 30, 255])
    paint(b, 4, 4, 3, 3, [90, 0, 0, 255])
    paint(b, 5, 5, 1, 1, [0, 90, 0, 255])
    ctx.options = { ...ctx.options, sample: '3×3' }
    drag(eyedropper, ctx, [5.5, 5.5], [5.5, 5.5])
    expect(ctx.colors.fg).toEqual([80, 10, 0, 255])
  })
})

describe('hand and zoom', () => {
  it('hand drags pan the view', () => {
    const ctx = fakeContext(undefined, hand)
    hand.down(ctx, { ...at(ctx, 0, 0), sx: 10, sy: 10 })
    hand.move(ctx, { ...at(ctx, 0, 0), sx: 30, sy: 5 })
    expect([ctx.view.panX, ctx.view.panY]).toEqual([20, -5])
  })
  it('zoom click steps in at the point; Alt steps out', () => {
    const ctx = fakeContext(undefined, zoom)
    drag(zoom, ctx, [10, 10], [10, 10])
    expect(ctx.view.zoom).toBe(ZOOM_STEPS[ZOOM_STEPS.indexOf(1) + 1])
    expect(ctx.view.panX).toBeCloseTo(10 - 10 * ctx.view.zoom)
    drag(zoom, ctx, [10, 10], [10, 10], { alt: true })
    drag(zoom, ctx, [10, 10], [10, 10], { alt: true })
    expect(ctx.view.zoom).toBe(ZOOM_STEPS[ZOOM_STEPS.indexOf(1) - 1])
  })
})

describe('registry and keys', () => {
  it('maps shortcut letters', () => {
    expect(toolForKey('b')).toBe('brush')
    expect(toolForKey('Z')).toBe('zoom')
    expect(toolForKey('v')).toBe('move')
    expect(toolForKey('q')).toBeNull()
    expect(toolForKey('g')).toBe('fill')
    expect(toolForKey('G', { shift: true, current: 'fill' })).toBe('gradient')
    expect(toolForKey('G', { shift: true, current: 'gradient' })).toBe('fill')
    expect(toolForKey('g', { current: 'gradient' })).toBe('gradient')
  })
  it('has all 14 tools with unique ids', () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(14)
  })
  it('holding Space selects Hand and releasing restores the tool', () => {
    let s = holdSpace({ tool: 'marquee', held: null }, 'down')
    expect(s).toEqual({ tool: 'hand', held: 'marquee' })
    s = holdSpace(s, 'down') // key repeat
    expect(s).toEqual({ tool: 'hand', held: 'marquee' })
    s = holdSpace(s, 'up')
    expect(s).toEqual({ tool: 'marquee', held: null })
    expect(holdSpace({ tool: 'crop', held: null }, 'up')).toEqual({ tool: 'crop', held: null })
  })
})
