import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBitmap, type Bitmap } from '../model/bitmap'
import { createDoc, type Layer } from '../model/doc'
import { PhotoEditor } from '../model/editor'
import { rectMask } from '../model/mask'
import { applyFilter } from '../ops/filters'
import { FILTER_FAILED, FilterSession, Latest, type FilterRunner } from './filterSession'

interface Call {
  params: Record<string, number>
  input: Bitmap
  signal?: AbortSignal
  mask: unknown
  resolve: (b: Bitmap) => void
  reject: (e: Error) => void
}

/** A runner whose calls resolve or reject only when the test says so. */
function controlledRunner() {
  const calls: Call[] = []
  const run: FilterRunner = (_id, b, params, mask, _offset, signal) =>
    new Promise<Bitmap>((resolve, reject) => {
      calls.push({ params, input: b, signal, mask, resolve, reject })
    })
  /** Resolve call `i` with the real filter result, then let the promise callbacks run. */
  const finish = async (i: number) => {
    const c = calls[i]
    c.resolve(applyFilter('gaussian', c.input, c.params))
    await flush()
  }
  return { calls, run, finish }
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

function setup(run: FilterRunner, opts: { select?: boolean } = {}) {
  const doc = createDoc(8, 8, 'transparent')
  const layer: Layer = doc.layers[0]
  for (let i = 0; i < layer.pixels.data.length; i += 4) layer.pixels.data.set(i % 8 === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255], i)
  const ed = new PhotoEditor(doc)
  if (opts.select) ed.setSelection(rectMask(8, 8, { x: 0, y: 0, width: 4, height: 8 }))
  ed.history.steps = []
  ed.history.index = 0
  const original = layer.pixels
  const bytes = original.data.slice()
  const refresh = vi.fn()
  const onError = vi.fn()
  const session = new FilterSession({ editor: ed, layer, id: 'gaussian', title: 'Gaussian Blur', run, refresh, onError })
  return { doc, ed, layer, original, bytes, refresh, onError, session }
}

describe('Latest', () => {
  it('only the newest token is current', () => {
    const l = new Latest()
    const a = l.next()
    const b = l.next()
    expect(l.current(a)).toBe(false)
    expect(l.current(b)).toBe(true)
    l.invalidate()
    expect(l.current(b)).toBe(false)
  })
})

describe('FilterSession', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces previews by 150 ms', () => {
    const r = controlledRunner()
    const { session } = setup(r.run)
    session.update({ radius: 1 })
    vi.advanceTimersByTime(100)
    session.update({ radius: 2 })
    vi.advanceTimersByTime(149)
    expect(r.calls.length).toBe(0)
    vi.advanceTimersByTime(1)
    expect(r.calls.length).toBe(1)
    expect(r.calls[0].params).toEqual({ radius: 2 })
  })

  it('shows a preview by swapping the layer pixels, without a history step; the original bytes are untouched', async () => {
    const r = controlledRunner()
    const { session, layer, original, bytes, ed, refresh } = setup(r.run)
    session.update({ radius: 2 })
    vi.advanceTimersByTime(150)
    await r.finish(0)
    expect(layer.pixels).not.toBe(original)
    expect(original.data).toEqual(bytes)
    expect(refresh).toHaveBeenCalled()
    expect(ed.history.steps.length).toBe(0)
  })

  it('ignores a stale result that arrives after a newer one, and aborts the older run', async () => {
    const r = controlledRunner()
    const { session, layer } = setup(r.run)
    session.update({ radius: 1 })
    vi.advanceTimersByTime(150)
    session.update({ radius: 3 })
    vi.advanceTimersByTime(150)
    expect(r.calls[0].signal?.aborted).toBe(true)
    await r.finish(1)
    const newest = layer.pixels
    await r.finish(0)
    expect(layer.pixels).toBe(newest)
  })

  it('cancel restores the original pixels and drops a late result', async () => {
    const r = controlledRunner()
    const { session, layer, original, bytes } = setup(r.run)
    session.update({ radius: 2 })
    vi.advanceTimersByTime(150)
    await r.finish(0)
    session.update({ radius: 5 })
    vi.advanceTimersByTime(150)
    session.cancel()
    expect(layer.pixels).toBe(original)
    await r.finish(1)
    expect(layer.pixels).toBe(original)
    expect(original.data).toEqual(bytes)
    // Nothing runs after cancel.
    session.update({ radius: 9 })
    vi.advanceTimersByTime(500)
    expect(r.calls.length).toBe(2)
  })

  it('apply reuses the shown preview and records exactly one step; undo restores the bytes', async () => {
    const r = controlledRunner()
    const { session, layer, original, bytes, ed } = setup(r.run)
    session.update({ radius: 2 })
    vi.advanceTimersByTime(150)
    await r.finish(0)
    const shown = layer.pixels.data.slice()
    expect(await session.apply({ radius: 2 })).toBe(true)
    expect(r.calls.length).toBe(1)
    expect(layer.pixels).toBe(original) // the layer keeps its bitmap; the result is written into it
    expect(layer.pixels.data).toEqual(shown)
    expect(ed.history.steps.map((s) => s.label)).toEqual(['Gaussian Blur'])
    ed.history.undo()
    expect(layer.pixels.data).toEqual(bytes)
  })

  it('apply with settings not yet previewed runs the filter first', async () => {
    const r = controlledRunner()
    const { session, ed } = setup(r.run)
    session.update({ radius: 1 }) // debounce pending; apply supersedes it
    const done = session.apply({ radius: 4 })
    expect(r.calls.length).toBe(1)
    expect(r.calls[0].params).toEqual({ radius: 4 })
    await r.finish(0)
    expect(await done).toBe(true)
    vi.advanceTimersByTime(500)
    expect(r.calls.length).toBe(1)
    expect(ed.history.steps.length).toBe(1)
  })

  it('cancel while apply is running records nothing', async () => {
    const r = controlledRunner()
    const { session, ed, layer, original } = setup(r.run)
    const done = session.apply({ radius: 4 })
    session.cancel()
    await r.finish(0)
    expect(await done).toBe(false)
    expect(ed.history.steps.length).toBe(0)
    expect(layer.pixels).toBe(original)
  })

  it('a failed filter shows the message and restores the pixels', async () => {
    const r = controlledRunner()
    const { session, layer, original, onError } = setup(r.run)
    session.update({ radius: 2 })
    vi.advanceTimersByTime(150)
    await r.finish(0)
    session.update({ radius: 3 })
    vi.advanceTimersByTime(150)
    r.calls[1].reject(new Error('The filter stopped unexpectedly'))
    await flush()
    expect(onError).toHaveBeenCalledWith(FILTER_FAILED)
    expect(FILTER_FAILED).toBe("The filter stopped unexpectedly. Your image wasn't changed.")
    expect(layer.pixels).toBe(original)
  })

  it('a failed apply records nothing', async () => {
    const r = controlledRunner()
    const { session, ed, onError } = setup(r.run)
    const done = session.apply({ radius: 4 })
    r.calls[0].reject(new Error('The filter stopped unexpectedly'))
    expect(await done).toBe(false)
    expect(onError).toHaveBeenCalledWith(FILTER_FAILED)
    expect(ed.history.steps.length).toBe(0)
  })

  it('passes the selection and only writes inside its bounds on apply', async () => {
    const r = controlledRunner()
    const { session, layer, bytes, ed } = setup(r.run, { select: true })
    const done = session.apply({ radius: 4 })
    expect(r.calls[0].mask).toBe(ed.doc.selection)
    // A runner that ignores the mask changes everything; apply must still only write the selected half.
    r.calls[0].resolve(createBitmap(8, 8, [9, 9, 9, 9]))
    expect(await done).toBe(true)
    const rightHalf = (d: Uint8ClampedArray) => Array.from(d.subarray(4 * 4, 8 * 4))
    expect(rightHalf(layer.pixels.data)).toEqual(rightHalf(bytes))
    expect(Array.from(layer.pixels.data.subarray(0, 4))).toEqual([9, 9, 9, 9])
  })

  it('originalPixels gives the real pixels while a preview is shown', async () => {
    const r = controlledRunner()
    const { session, original, layer } = setup(r.run)
    session.update({ radius: 2 })
    vi.advanceTimersByTime(150)
    await r.finish(0)
    expect(layer.pixels).not.toBe(original)
    expect(session.originalPixels).toBe(original)
  })
})
