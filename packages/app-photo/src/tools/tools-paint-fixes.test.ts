import { describe, expect, it } from 'vitest'
import type { Bitmap, RGBA } from '../model/bitmap'
import { activeLayer, createDoc } from '../model/doc'
import { combineMask, rectMask } from '../model/mask'
import { brush } from './brush'
import { ToolDispatcher } from './dispatch'
import { fill } from './fill'
import { defaultOptions, toolById } from './index'
import { at, drag, fakeContext, type FakeContext } from './testing'
import { text, textInput } from './text'
import type { ToolContext, ToolId } from './types'

const px = (b: Bitmap, x: number, y: number) => Array.from(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4))
const RED: RGBA = [255, 0, 0, 255]
const WHITE: RGBA = [255, 255, 255, 255]
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0

/** A dispatcher whose contexts carry each tool's own options, as useTools builds them. */
function setup(start: ToolId, overrides: Partial<Record<ToolId, Record<string, unknown>>> = {}) {
  const base = fakeContext()
  const s = { tool: start }
  const options = {} as Record<ToolId, Record<string, unknown>>
  const ctxFor = (tool?: ToolId): ToolContext => {
    const id = tool ?? s.tool
    options[id] ??= { ...defaultOptions(toolById(id)), ...overrides[id] }
    return { ...base, options: options[id], setOption: (k, v) => (options[id] = { ...options[id], [k]: v }) }
  }
  const d = new ToolDispatcher(ctxFor, () => s.tool, (t) => (s.tool = t))
  d.attach(base.editor)
  /** A real switch, the way useTools reports it. */
  const switchTo = (t: ToolId) => {
    const prev = s.tool
    s.tool = t
    d.toolChanged(prev)
  }
  return { base, d, s, ctxFor, switchTo }
}

function typeInBox(env: ReturnType<typeof setup>, x: number, y: number, s: string) {
  env.d.pointer('down', at(env.base, x, y))
  env.d.pointer('up', at(env.base, x, y))
  textInput(env.ctxFor(), s)
}

describe('an open text box is kept', () => {
  it('a tool switch commits it with the Text tool’s own font and size', () => {
    const env = setup('text', { text: { font: 'Georgia', size: 30 }, brush: { size: 7 } })
    typeInBox(env, 3, 3, 'Hello')
    env.switchTo('brush')
    const l = activeLayer(env.base.editor.doc)
    expect(l.kind).toBe('text')
    expect(l.text).toMatchObject({ text: 'Hello', font: 'Georgia', size: 30 })
    expect(env.base.overlay).toBeNull()
  })
  it('undo commits it first, then removes it; redo brings it back', () => {
    const env = setup('text')
    typeInBox(env, 3, 3, 'Undo me')
    const h = env.base.editor.history
    h.undo()
    expect(h.steps.map((s) => s.label)).toEqual(['Text'])
    expect(h.index).toBe(0)
    expect(env.base.editor.doc.layers.length).toBe(1)
    h.redo()
    expect(activeLayer(env.base.editor.doc).text?.text).toBe('Undo me')
  })
  it('commitPending (before saving) commits it', () => {
    const env = setup('text')
    typeInBox(env, 3, 3, 'Saved')
    env.d.commitPending()
    expect(activeLayer(env.base.editor.doc).text?.text).toBe('Saved')
    expect(env.base.editor.history.steps.length).toBe(1)
  })
  it('a new document discards it', () => {
    const env = setup('text')
    typeInBox(env, 3, 3, 'Gone')
    env.d.reset()
    env.d.commitPending()
    expect(env.base.editor.doc.layers.length).toBe(1)
    expect(env.base.editor.history.steps.length).toBe(0)
  })
  it('other tools are still cancelled on a switch', () => {
    const env = setup('brush')
    env.d.pointer('down', at(env.base, 2, 2))
    env.d.pointer('move', at(env.base, 9, 9))
    env.switchTo('move')
    expect(env.base.editor.history.steps.length).toBe(0)
  })
})

describe('fill with a selection', () => {
  it('contiguous fill does not leak through unselected pixels', () => {
    const doc = createDoc(20, 20, WHITE)
    doc.selection = combineMask(rectMask(20, 20, { x: 0, y: 0, width: 5, height: 5 }), rectMask(20, 20, { x: 10, y: 0, width: 5, height: 5 }), 'add')
    const ctx = fakeContext(doc, fill)
    ctx.colors.fg = RED
    fill.down(ctx, at(ctx, 2, 2))
    const b = activeLayer(doc).pixels
    expect(px(b, 2, 2)).toEqual(RED)
    expect(px(b, 4, 4)).toEqual(RED)
    expect(px(b, 12, 2)).toEqual(WHITE)
    expect(px(b, 7, 2)).toEqual(WHITE)
  })
})

describe('brush strokes', () => {
  it('pen lift-off (pressure 0) does not stamp', () => {
    const ctx = fakeContext(undefined, brush, { size: 6 })
    brush.down(ctx, at(ctx, 5, 5, { pressure: 1 }))
    brush.move(ctx, at(ctx, 5, 5, { pressure: 1 }))
    brush.up(ctx, at(ctx, 15, 15, { pressure: 0 }))
    const b = activeLayer(ctx.editor.doc).pixels
    expect(px(b, 5, 5)[3]).toBe(255)
    // Nothing along the way to the lift-off point, more than the brush radius from the press.
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (Math.hypot(x + 0.5 - 5, y + 0.5 - 5) > 4.5) expect(px(b, x, y)[3]).toBe(0)
    expect(ctx.editor.history.steps.length).toBe(1)
  })
  it('a diagonal stroke records only the touched tiles, and undo/redo are exact', () => {
    const doc = createDoc(2000, 2000, 'transparent')
    const layer = doc.layers[0]
    for (let i = 0; i < layer.pixels.data.length; i += 997) layer.pixels.data[i] = i % 256
    const orig = layer.pixels.data.slice()
    const ctx: FakeContext = fakeContext(doc, brush, { size: 20, hardness: 50 })
    drag(brush, ctx, [5, 5], [1995, 1995], {}, [[700, 700], [1300, 1300]])
    const painted = layer.pixels.data.slice()
    const step = ctx.editor.history.steps[0]
    const unionBytes = 2000 * 2000 * 4 * 2
    expect(ctx.editor.history.steps.length).toBe(1)
    expect(step.bytes).toBeLessThan(unionBytes * 0.15)
    ctx.editor.history.undo()
    expect(same(layer.pixels.data, orig)).toBe(true)
    ctx.editor.history.redo()
    expect(same(layer.pixels.data, painted)).toBe(true)
  })
})
