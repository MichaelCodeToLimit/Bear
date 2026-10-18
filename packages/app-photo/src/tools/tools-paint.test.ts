import { describe, expect, it } from 'vitest'
import { createBitmap, type Bitmap, type RGBA } from '../model/bitmap'
import { activeLayer, createDoc, createLayer } from '../model/doc'
import { rectMask } from '../model/mask'
import { brush } from './brush'
import { eraser } from './eraser'
import { fill } from './fill'
import { gradient } from './gradient'
import { editableLayer } from './guard'
import { shape } from './shape'
import { nextBrushSize } from './strokeTool'
import { commitText, text, textInput } from './text'
import { at, drag, fakeContext, key } from './testing'
import type { Tool } from './types'

const px = (b: Bitmap, x: number, y: number) => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))
const RED: RGBA = [255, 0, 0, 255]
const WHITE: RGBA = [255, 255, 255, 255]
const BLACK: RGBA = [0, 0, 0, 255]
const same = (a: Bitmap, b: Uint8ClampedArray) => Buffer.compare(Buffer.from(a.data), Buffer.from(b)) === 0

describe('brush', () => {
  it('paints under the stroke as one history step, and undo restores it', () => {
    const ctx = fakeContext(createDoc(20, 20, WHITE), brush, { size: 4, hardness: 100 })
    const layer = activeLayer(ctx.editor.doc)
    const orig = layer.pixels.data.slice()
    drag(brush, ctx, [2, 10], [17, 10], {}, [[6, 10], [12, 10]])
    for (let x = 2; x <= 17; x++) expect(px(layer.pixels, x, 10)).toEqual(BLACK)
    expect(px(layer.pixels, 10, 2)).toEqual(WHITE)
    expect(ctx.editor.history.steps.map((s) => s.label)).toEqual(['Brush'])
    expect(ctx.refreshes).toBeGreaterThan(0)
    ctx.editor.history.undo()
    expect(same(layer.pixels, orig)).toBe(true)
  })
  it('Review focus 2: respects the selection with the layer offset', () => {
    const doc = createDoc(20, 20, 'transparent')
    const layer = createLayer('L', createBitmap(15, 20), { x: 5 })
    doc.layers = [layer]
    doc.activeLayerId = layer.id
    doc.selection = rectMask(20, 20, { x: 5, y: 0, width: 5, height: 20 })
    const ctx = fakeContext(doc, brush, { size: 6, hardness: 100 })
    drag(brush, ctx, [0, 10], [19, 10], {}, [[10, 10]])
    for (let x = 0; x < 15; x++) expect(px(layer.pixels, x, 10)[3]).toBe(x <= 4 ? 255 : 0)
  })
  it('refuses a text layer', () => {
    const ctx = fakeContext(undefined, brush)
    const layer = activeLayer(ctx.editor.doc)
    layer.kind = 'text'
    drag(brush, ctx, [2, 2], [10, 10])
    expect(layer.pixels.data.every((v) => v === 0)).toBe(true)
    expect(ctx.statuses).toEqual(["Text layers can't be painted. Flatten or merge the layer first."])
    expect(ctx.editor.history.steps.length).toBe(0)
  })
  it('[ and ] change the size in steps', () => {
    expect(nextBrushSize(5, 1)).toBe(6)
    expect(nextBrushSize(9, 1)).toBe(10)
    expect(nextBrushSize(10, 1)).toBe(15)
    expect(nextBrushSize(45, 1)).toBe(50)
    expect(nextBrushSize(50, 1)).toBe(60)
    expect(nextBrushSize(10, -1)).toBe(9)
    expect(nextBrushSize(50, -1)).toBe(45)
    expect(nextBrushSize(60, -1)).toBe(50)
    expect(nextBrushSize(1, -1)).toBe(1)
    expect(nextBrushSize(1995, 1)).toBe(2000)
    expect(nextBrushSize(2000, 1)).toBe(2000)
    const ctx = fakeContext(undefined, brush, { size: 9 })
    expect(brush.onKey!(ctx, key(']'))).toBe(true)
    expect(ctx.options.size).toBe(10)
    expect(brush.onKey!(ctx, key('['))).toBe(true)
    expect(ctx.options.size).toBe(9)
    const e = fakeContext(undefined, eraser, { size: 30 })
    eraser.onKey!(e, key(']'))
    expect(e.options.size).toBe(35)
  })
  it('shows the brush outline while hovering', () => {
    const ctx = fakeContext(undefined, brush, { size: 12 })
    brush.move(ctx, at(ctx, 4, 5))
    expect(ctx.overlay).toEqual({ kind: 'brush', x: 4, y: 5, size: 12 })
    expect(ctx.editor.history.steps.length).toBe(0)
  })
  it('cancel mid-stroke restores the pixels and records nothing', () => {
    const ctx = fakeContext(createDoc(20, 20, WHITE), brush, { size: 4 })
    const layer = activeLayer(ctx.editor.doc)
    const orig = layer.pixels.data.slice()
    brush.down(ctx, at(ctx, 2, 2))
    brush.move(ctx, at(ctx, 15, 15))
    expect(same(layer.pixels, orig)).toBe(false)
    brush.cancel!(ctx)
    brush.up(ctx, at(ctx, 15, 15))
    expect(same(layer.pixels, orig)).toBe(true)
    expect(ctx.editor.history.steps.length).toBe(0)
  })
})

describe('eraser', () => {
  it('erases to transparency', () => {
    const ctx = fakeContext(createDoc(20, 20, RED), eraser, { size: 4, hardness: 100 })
    const layer = activeLayer(ctx.editor.doc)
    drag(eraser, ctx, [3, 10], [16, 10])
    for (let x = 3; x <= 16; x++) expect(px(layer.pixels, x, 10)[3]).toBe(0)
    expect(px(layer.pixels, 10, 3)).toEqual(RED)
    expect(ctx.editor.history.steps.map((s) => s.label)).toEqual(['Eraser'])
  })
})

/** White 20×20 with a black vertical line at x = 10. */
function lined() {
  const doc = createDoc(20, 20, WHITE)
  const b = doc.layers[0].pixels
  for (let y = 0; y < 20; y++) b.data.set(BLACK, (y * 20 + 10) * 4)
  return doc
}

describe('fill', () => {
  it('contiguous fill stops at the line', () => {
    const ctx = fakeContext(lined(), fill)
    ctx.colors.fg = RED
    fill.down(ctx, at(ctx, 2, 2))
    fill.up(ctx, at(ctx, 2, 2))
    const b = activeLayer(ctx.editor.doc).pixels
    expect(px(b, 0, 0)).toEqual(RED)
    expect(px(b, 9, 19)).toEqual(RED)
    expect(px(b, 10, 5)).toEqual(BLACK)
    expect(px(b, 11, 5)).toEqual(WHITE)
    expect(px(b, 19, 19)).toEqual(WHITE)
    expect(ctx.editor.history.steps.map((s) => s.label)).toEqual(['Fill'])
  })
  it('stays inside the selection', () => {
    const doc = lined()
    doc.selection = rectMask(20, 20, { x: 0, y: 0, width: 5, height: 20 })
    const ctx = fakeContext(doc, fill)
    ctx.colors.fg = RED
    fill.down(ctx, at(ctx, 2, 2))
    const b = activeLayer(ctx.editor.doc).pixels
    expect(px(b, 4, 10)).toEqual(RED)
    expect(px(b, 5, 10)).toEqual(WHITE)
  })
  it('non-contiguous fill with a selection fills every matching selected pixel', () => {
    const doc = lined()
    doc.selection = rectMask(20, 20, { x: 8, y: 0, width: 5, height: 20 })
    const ctx = fakeContext(doc, fill, { contiguous: false })
    ctx.colors.fg = RED
    fill.down(ctx, at(ctx, 9, 2))
    const b = activeLayer(ctx.editor.doc).pixels
    expect(px(b, 8, 3)).toEqual(RED)
    expect(px(b, 12, 3)).toEqual(RED)
    expect(px(b, 10, 3)).toEqual(BLACK)
    expect(px(b, 13, 3)).toEqual(WHITE)
    expect(px(b, 7, 3)).toEqual(WHITE)
  })
})

describe('gradient', () => {
  it('linear foreground to background', () => {
    const ctx = fakeContext(undefined, gradient)
    drag(gradient, ctx, [0, 0], [19, 0], {}, [[8, 0]])
    const b = activeLayer(ctx.editor.doc).pixels
    expect(px(b, 0, 5)[0]).toBe(0)
    expect(px(b, 19, 5)[0]).toBe(255)
    expect(Math.abs(px(b, 10, 5)[0] - 134)).toBeLessThanOrEqual(3)
    expect(px(b, 10, 5)[3]).toBe(255)
    expect(ctx.overlay).toBeNull()
    expect(ctx.editor.history.steps.map((s) => s.label)).toEqual(['Gradient'])
  })
  it('shows a line while dragging', () => {
    const ctx = fakeContext(undefined, gradient)
    gradient.down(ctx, at(ctx, 1, 2))
    gradient.move(ctx, at(ctx, 8, 9))
    expect(ctx.overlay).toEqual({ kind: 'path', points: [[1, 2], [8, 9]] })
  })
  it('radial goes outward from the start', () => {
    const ctx = fakeContext(undefined, gradient, { type: 'Radial' })
    drag(gradient, ctx, [10, 10], [10, 0])
    const b = activeLayer(ctx.editor.doc).pixels
    expect(px(b, 10, 10)[0]).toBe(0)
    expect(px(b, 0, 10)[0]).toBe(255)
    expect(px(b, 15, 10)[0]).toBeGreaterThan(110)
    expect(px(b, 15, 10)[0]).toBeLessThan(145)
  })
})

describe('shape', () => {
  it('a 4×4 rectangle with fill and a 1 px stroke', () => {
    const ctx = fakeContext(undefined, shape, { shape: 'Rectangle', stroke: 1 })
    ctx.colors = { fg: RED, bg: WHITE }
    drag(shape, ctx, [2, 2], [6, 6])
    const b = activeLayer(ctx.editor.doc).pixels
    let red = 0
    let white = 0
    let other = 0
    for (let i = 0; i < b.data.length; i += 4) {
      const c = Array.from(b.data.subarray(i, i + 4)).join()
      if (c === RED.join()) red++
      else if (c === WHITE.join()) white++
      else if (c !== '0,0,0,0') other++
    }
    expect({ red, white, other }).toEqual({ red: 4, white: 12, other: 0 })
    expect(px(b, 3, 3)).toEqual(RED)
    expect(px(b, 2, 2)).toEqual(WHITE)
    expect(ctx.editor.history.steps.length).toBe(1)
  })
  it('Shift keeps an ellipse round', () => {
    const ctx = fakeContext(undefined, shape, { shape: 'Ellipse' })
    drag(shape, ctx, [2, 2], [12, 6], { shift: true })
    const b = activeLayer(ctx.editor.doc).pixels
    expect(px(b, 7, 11)[3]).toBeGreaterThan(200)
    expect(px(b, 7, 13)[3]).toBe(0)
  })
  it('a line snaps to 45° with Shift', () => {
    const ctx = fakeContext(undefined, shape, { shape: 'Line', stroke: 2 })
    drag(shape, ctx, [2, 2], [12, 11], { shift: true })
    const b = activeLayer(ctx.editor.doc).pixels
    expect(px(b, 7, 7)[3]).toBeGreaterThan(200)
    expect(px(b, 11, 11)[3]).toBeGreaterThan(200)
    expect(px(b, 12, 2)[3]).toBe(0)
  })
  it('respects the selection', () => {
    const doc = createDoc(20, 20, 'transparent')
    doc.selection = rectMask(20, 20, { x: 0, y: 0, width: 5, height: 20 })
    const ctx = fakeContext(doc, shape, { shape: 'Rectangle' })
    drag(shape, ctx, [2, 2], [10, 10])
    const b = activeLayer(ctx.editor.doc).pixels
    expect(px(b, 4, 5)[3]).toBe(255)
    expect(px(b, 5, 5)[3]).toBe(0)
  })
})

describe('Review focus 4: locked and hidden layers', () => {
  const tools: [Tool, Record<string, unknown>][] = [[brush, {}], [eraser, {}], [fill, {}], [gradient, {}], [shape, {}]]
  for (const [tool, options] of tools) {
    for (const prop of ['locked', 'hidden'] as const) {
      it(`${tool.id} on a ${prop} layer changes nothing`, () => {
        const ctx = fakeContext(createDoc(20, 20, RED), tool, options)
        const layer = activeLayer(ctx.editor.doc)
        if (prop === 'locked') layer.locked = true
        else layer.visible = false
        const orig = layer.pixels.data.slice()
        drag(tool, ctx, [2, 2], [12, 12], {}, [[6, 6]])
        expect(same(layer.pixels, orig)).toBe(true)
        expect(ctx.editor.history.steps.length).toBe(0)
        expect(ctx.statuses[0]).toBe(prop === 'locked' ? 'This layer is locked' : 'This layer is hidden')
      })
    }
  }
  it('editableLayer reports locked before hidden', () => {
    const ctx = fakeContext()
    const layer = activeLayer(ctx.editor.doc)
    expect(editableLayer(ctx)).toBe(layer)
    layer.locked = true
    layer.visible = false
    expect(editableLayer(ctx)).toBeNull()
    expect(ctx.statuses).toEqual(['This layer is locked'])
  })
})

describe('text', () => {
  it('a click opens a box; clicking elsewhere commits a new text layer', () => {
    const ctx = fakeContext(undefined, text, { font: 'Georgia', size: 30, align: 'Center' })
    ctx.colors.fg = RED
    text.down(ctx, at(ctx, 3.4, 4.6))
    text.up(ctx, at(ctx, 3.4, 4.6))
    expect(ctx.overlay).toMatchObject({ kind: 'text', x: 3, y: 5, text: '' })
    textInput(ctx, 'Hello there, this is a long line')
    text.down(ctx, at(ctx, 15, 15))
    text.up(ctx, at(ctx, 15, 15))
    const doc = ctx.editor.doc
    expect(doc.layers.length).toBe(2)
    const l = activeLayer(doc)
    expect(l.kind).toBe('text')
    expect(l.name).toBe('Hello there, this is')
    expect(l.text).toEqual({ text: 'Hello there, this is a long line', font: 'Georgia', size: 30, color: RED, align: 'center' })
    expect([l.x, l.y]).toEqual([3, 5])
    expect(l.pixels.width).toBeGreaterThan(1)
    expect(ctx.overlay).toBeNull()
    expect(ctx.editor.history.steps.length).toBe(1)
  })
  it('clicking elsewhere with an empty box moves it', () => {
    const ctx = fakeContext(undefined, text)
    text.down(ctx, at(ctx, 3, 3))
    text.down(ctx, at(ctx, 15, 12))
    expect(ctx.overlay).toMatchObject({ kind: 'text', x: 15, y: 12, text: '' })
    expect(ctx.editor.doc.layers.length).toBe(1)
  })
  it('Escape cancels without a layer', () => {
    const ctx = fakeContext(undefined, text)
    text.down(ctx, at(ctx, 3, 3))
    textInput(ctx, 'abc')
    text.cancel!(ctx)
    commitText(ctx)
    expect(ctx.editor.doc.layers.length).toBe(1)
    expect(ctx.overlay).toBeNull()
  })
  it('double-clicking a text layer reopens it and commits one update step', () => {
    const ctx = fakeContext(undefined, text)
    text.down(ctx, at(ctx, 3, 3))
    textInput(ctx, 'First')
    commitText(ctx)
    const l = activeLayer(ctx.editor.doc)
    const steps = ctx.editor.history.steps.length
    text.down(ctx, at(ctx, 4, 3))
    text.up(ctx, at(ctx, 4, 3))
    text.down(ctx, at(ctx, 4, 3))
    text.up(ctx, at(ctx, 4, 3))
    expect(ctx.overlay).toMatchObject({ kind: 'text', x: 3, y: 3, text: 'First' })
    textInput(ctx, 'Second')
    commitText(ctx)
    expect(ctx.editor.doc.layers.length).toBe(2)
    expect(l.text!.text).toBe('Second')
    expect(l.name).toBe('Second')
    expect(ctx.editor.history.steps.length).toBe(steps + 1)
    ctx.editor.history.undo()
    expect(l.text!.text).toBe('First')
  })
  it('refuses to reopen a locked text layer', () => {
    const ctx = fakeContext(undefined, text)
    text.down(ctx, at(ctx, 3, 3))
    textInput(ctx, 'First')
    commitText(ctx)
    activeLayer(ctx.editor.doc).locked = true
    for (let i = 0; i < 2; i++) {
      text.down(ctx, at(ctx, 4, 3))
      text.up(ctx, at(ctx, 4, 3))
    }
    expect(ctx.statuses).toContain('This layer is locked')
    expect(ctx.overlay?.kind === 'text' && ctx.overlay.text).toBe('')
  })
})
