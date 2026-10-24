import { describe, expect, it } from 'vitest'
import type { Bitmap, RGBA } from '../model/bitmap'
import { activeLayer, createDoc } from '../model/doc'
import { rectMask } from '../model/mask'
import { ToolDispatcher } from './dispatch'
import { lasso } from './lasso'
import { move } from './move'
import { at, fakeContext, key, type FakeContext } from './testing'
import type { ToolId } from './types'

const RED: RGBA = [255, 0, 0, 255]
const px = (b: Bitmap, x: number, y: number) => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))
function paint(b: Bitmap, x0: number, y0: number, w: number, h: number, c: RGBA) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) b.data.set(c, (y * b.width + x) * 4)
}
/** Byte equality without building a diff (these buffers are 16 MB). */
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0
const countRed = (b: Bitmap) => {
  let n = 0
  for (let i = 0; i < b.data.length; i += 4) if (b.data[i] === 255 && b.data[i + 3] === 255) n++
  return n
}

function dispatcher(ctx: FakeContext, start: ToolId) {
  const s = { tool: start }
  const d = new ToolDispatcher(() => ctx, () => s.tool, (t) => (s.tool = t))
  d.attach(ctx.editor)
  return { d, s }
}

describe('undo during a drag', () => {
  it('cancels the move preview first, so history stays consistent', () => {
    const ctx = fakeContext()
    const { d } = dispatcher(ctx, 'move')
    const layer = activeLayer(ctx.editor.doc)
    ctx.editor.editPixels('Paint', layer.id, { x: 0, y: 0, width: 2, height: 2 }, (b) => paint(b, 0, 0, 2, 2, RED))
    ctx.editor.setSelection(rectMask(20, 20, { x: 0, y: 0, width: 2, height: 2 }))
    d.pointer('down', at(ctx, 0, 0))
    d.pointer('move', at(ctx, 5, 0))
    expect(px(layer.pixels, 5, 0)).toEqual(RED) // live preview
    expect(d.busy).toBe(true)

    ctx.editor.history.undo() // undoes "Select"
    expect(d.busy).toBe(false)
    d.pointer('move', at(ctx, 6, 0))
    d.pointer('up', at(ctx, 6, 0)) // the stray release finishes nothing
    const h = ctx.editor.history
    expect(h.steps.map((s) => s.label)).toEqual(['Paint', 'Select'])
    expect(h.index).toBe(1)
    expect(h.canRedo).toBe(true)
    expect(px(layer.pixels, 0, 0)).toEqual(RED)
    expect(px(layer.pixels, 5, 0)).toEqual([0, 0, 0, 0])
    expect(ctx.editor.doc.selection).toBeNull()

    h.redo()
    expect(ctx.editor.doc.selection!.data[0]).toBe(255)
    h.goTo(0)
    expect(px(layer.pixels, 0, 0)).toEqual([0, 0, 0, 0]) // the paint step is still undoable
  })
})

describe('selection move history', () => {
  it('a nudge stores only the touched area plus the two masks, and undo/redo are exact', () => {
    const doc = createDoc(2000, 2000, 'transparent')
    const layer = activeLayer(doc)
    for (let y = 100; y < 300; y++) for (let x = 100; x < 300; x++) layer.pixels.data.set([x & 255, y & 255, (x + y) & 255, 255], (y * 2000 + x) * 4)
    const ctx = fakeContext(doc)
    const sel = rectMask(2000, 2000, { x: 100, y: 100, width: 200, height: 200 })
    ctx.editor.setSelection(sel)
    const before = layer.pixels.data.slice()
    move.onKey!(ctx, key('ArrowRight'))
    const step = ctx.editor.history.steps.at(-1)!
    expect(step.label).toBe('Move')
    const masks = 2 * 2000 * 2000
    expect(step.bytes - masks).toBeLessThan(400_000)
    expect(step.bytes - masks).toBeGreaterThan(0)
    expect(px(layer.pixels, 101, 150)).toEqual([100, 150, 250, 255])
    expect(px(layer.pixels, 100, 150)).toEqual([0, 0, 0, 0])
    const after = layer.pixels.data.slice()
    const moved = ctx.editor.doc.selection!
    expect(moved.data[100 * 2000 + 300]).toBe(255)
    expect(moved.data[100 * 2000 + 100]).toBe(0)

    ctx.editor.history.undo()
    expect(same(layer.pixels.data, before)).toBe(true)
    expect(ctx.editor.doc.selection).toBe(sel)
    ctx.editor.history.redo()
    expect(same(layer.pixels.data, after)).toBe(true)
    expect(ctx.editor.doc.selection).toBe(moved)
  })
  it('structure steps count a selection mask held by only one side', () => {
    const ctx = fakeContext()
    ctx.editor.setSelection(rectMask(20, 20, { x: 0, y: 0, width: 4, height: 4 }))
    expect(ctx.editor.history.steps[0].bytes).toBeGreaterThanOrEqual(400)
  })
})

describe('moving selected pixels off the canvas', () => {
  it('keeps them in the layer, so they can come back', () => {
    const ctx = fakeContext()
    paint(activeLayer(ctx.editor.doc).pixels, 2, 2, 4, 4, RED)
    ctx.editor.setSelection(rectMask(20, 20, { x: 2, y: 2, width: 4, height: 4 }))
    const { d } = dispatcher(ctx, 'move')
    const drag = (x0: number, x1: number) => {
      d.pointer('down', at(ctx, x0, 3))
      d.pointer('move', at(ctx, x1, 3))
      d.pointer('up', at(ctx, x1, 3))
    }
    drag(5, 0) // 5 px left: three columns land off the canvas
    let l = activeLayer(ctx.editor.doc)
    expect(l.x).toBe(-3)
    expect(countRed(l.pixels)).toBe(16)
    drag(0, 5) // the part still selected (one column) goes back
    l = activeLayer(ctx.editor.doc)
    expect(countRed(l.pixels)).toBe(16)
    expect(px(l.pixels, 5 - l.x, 3 - l.y)).toEqual(RED)
    expect(px(l.pixels, -3 - l.x, 3 - l.y)).toEqual(RED) // still there, off the canvas
  })
  it('a selection moved entirely off the canvas becomes "nothing selected"', () => {
    const ctx = fakeContext()
    ctx.editor.setSelection(rectMask(20, 20, { x: 0, y: 0, width: 2, height: 2 }))
    move.onKey!(ctx, key('ArrowLeft', { shiftKey: true }))
    expect(ctx.editor.doc.selection).toBeNull()
    expect(ctx.statuses).toContain('Nothing selected')
  })
})

describe('Space hold keeps pending work', () => {
  it('a crop box survives panning with Space, a real switch drops it', async () => {
    const { crop } = await import('./crop')
    const ctx = fakeContext(createDoc(20, 20, [255, 255, 255, 255]), crop)
    const { d, s } = dispatcher(ctx, 'crop')
    d.pointer('down', at(ctx, 5, 5))
    d.pointer('move', at(ctx, 15, 15))
    d.pointer('up', at(ctx, 15, 15))
    d.space('down')
    expect(s.tool).toBe('hand')
    expect(d.toolChanged('crop')).toBe(false)
    expect(ctx.overlay?.kind).toBe('crop')
    d.space('up')
    expect(s.tool).toBe('crop')
    expect(d.toolChanged('hand')).toBe(false)
    expect(d.onKey(key('Enter'))).toBe(true)
    expect(ctx.editor.doc.width).toBe(10)

    d.pointer('down', at(ctx, 1, 1))
    d.pointer('move', at(ctx, 5, 5))
    d.pointer('up', at(ctx, 5, 5))
    s.tool = 'marquee' // e.g. a Toolbox click
    expect(d.toolChanged('crop')).toBe(true)
    expect(ctx.overlay).toBeNull()
    s.tool = 'crop'
    d.toolChanged('marquee')
    expect(d.onKey(key('Enter'))).toBe(false)
  })
  it('Space is ignored during a drag', () => {
    const ctx = fakeContext()
    const { d, s } = dispatcher(ctx, 'move')
    d.pointer('down', at(ctx, 1, 1))
    d.space('down')
    expect(s.tool).toBe('move')
  })
})

describe('hit zones follow the device pixel ratio', () => {
  it('closing a polygon on its first point measures CSS pixels', () => {
    for (const [dpr, closes] of [[2, true], [1, false]] as const) {
      const ctx = fakeContext(undefined, lasso, { mode: 'Polygonal' })
      ctx.dpr = dpr
      ctx.view = { ...ctx.view, zoom: 2 } // 6 doc px = 12 device px = 6 CSS px at DPR 2
      for (const [x, y] of [[0, 0], [10, 0], [10, 10], [0, 6]]) {
        lasso.down(ctx, at(ctx, x, y))
        lasso.up(ctx, at(ctx, x, y))
      }
      expect(ctx.editor.doc.selection !== null).toBe(closes)
      lasso.cancel!(ctx)
    }
  })
})
