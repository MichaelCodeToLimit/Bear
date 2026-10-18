import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBitmap } from '../model/bitmap'
import { FILTER_STOPPED, runFilter, type FilterWorker } from './runFilter'

class FakeWorker implements FilterWorker {
  onmessage: FilterWorker['onmessage'] = null
  onerror: FilterWorker['onerror'] = null
  onmessageerror: FilterWorker['onmessageerror'] = null
  posted: unknown[] = []
  terminated = 0
  constructor(private readonly postThrows?: Error) {}
  postMessage(msg: unknown): void {
    if (this.postThrows) throw this.postThrows
    this.posted.push(msg)
  }
  terminate(): void {
    this.terminated++
  }
  reply(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent)
  }
}

const bmp = () => createBitmap(2, 2, [10, 20, 30, 255])

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as { __bearPhotoBreakFilter?: unknown }).__bearPhotoBreakFilter
})

describe('runFilter', () => {
  it('resolves with the reply and terminates the worker', async () => {
    const w = new FakeWorker()
    const p = runFilter('gaussian', bmp(), { radius: 1 }, null, undefined, undefined, () => w)
    const out = new Uint8ClampedArray(16).fill(7)
    w.reply({ ok: true, width: 2, height: 2, data: out })
    await expect(p).resolves.toEqual({ width: 2, height: 2, data: out })
    expect(w.terminated).toBe(1)
  })

  it('a postMessage that throws (DataCloneError) rejects and terminates the worker', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = new FakeWorker(new DOMException('could not be cloned', 'DataCloneError'))
    await expect(runFilter('gaussian', bmp(), { radius: 1 }, null, undefined, undefined, () => w)).rejects.toThrow(FILTER_STOPPED)
    expect(w.terminated).toBe(1)
    expect(err).toHaveBeenCalled()
  })

  it('an ok:false reply keeps the user message and logs the worker error text', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = new FakeWorker()
    const p = runFilter('gaussian', bmp(), { radius: 1 }, null, undefined, undefined, () => w)
    w.reply({ ok: false, error: 'Unknown filter: zap' })
    await expect(p).rejects.toThrow(new Error(FILTER_STOPPED))
    expect(FILTER_STOPPED).toBe('The filter stopped unexpectedly')
    expect(err.mock.calls.flat()).toContain('Unknown filter: zap')
    expect(w.terminated).toBe(1)
  })

  it('a crash rejects once, terminates once and ignores later events', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const w = new FakeWorker()
    const p = runFilter('gaussian', bmp(), { radius: 1 }, null, undefined, undefined, () => w)
    w.onerror?.({ message: 'boom' } as ErrorEvent)
    w.reply({ ok: true, width: 2, height: 2, data: new Uint8ClampedArray(16) })
    await expect(p).rejects.toThrow(FILTER_STOPPED)
    expect(w.terminated).toBe(1)
  })

  it('aborting terminates the worker and rejects with an AbortError', async () => {
    const w = new FakeWorker()
    const ac = new AbortController()
    const p = runFilter('gaussian', bmp(), { radius: 1 }, null, undefined, ac.signal, () => w)
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(w.terminated).toBe(1)
  })

  it('the e2e break hook sends the worker a request it cannot read', async () => {
    ;(globalThis as { __bearPhotoBreakFilter?: unknown }).__bearPhotoBreakFilter = true
    const w = new FakeWorker()
    void runFilter('gaussian', bmp(), { radius: 1 }, null, undefined, undefined, () => w).catch(() => {})
    expect(w.posted).toEqual([null])
  })

  it('without the hook it sends a copy of the pixels', () => {
    const w = new FakeWorker()
    const b = bmp()
    void runFilter('gaussian', b, { radius: 1 }, null, undefined, undefined, () => w).catch(() => {})
    const req = w.posted[0] as { id: string; data: Uint8ClampedArray }
    expect(req.id).toBe('gaussian')
    expect(req.data).not.toBe(b.data)
    expect(Array.from(req.data)).toEqual(Array.from(b.data))
  })
})
