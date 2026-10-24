import type { Bitmap } from '../model/bitmap'
import type { Mask } from '../model/mask'
import type { FilterId } from './filters'
import type { FilterRequest, FilterResponse } from './filters.worker'

/** The parts of a Worker that runFilter uses (so tests can pass a fake one). */
export interface FilterWorker {
  onmessage: ((e: MessageEvent<FilterResponse>) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
  onmessageerror: ((e: MessageEvent) => void) | null
  postMessage(msg: FilterRequest | null, transfer: Transferable[]): void
  terminate(): void
}

export const FILTER_STOPPED = 'The filter stopped unexpectedly'

const startWorker = (): FilterWorker =>
  new Worker(new URL('./filters.worker.ts', import.meta.url), { type: 'module' }) as unknown as FilterWorker

/**
 * End-to-end tests set `window.__bearPhotoBreakFilter = true` to make the worker crash: it is sent
 * a request it can't read, so it throws outside its own error handling.
 */
const breakRequested = (): boolean => (globalThis as { __bearPhotoBreakFilter?: unknown }).__bearPhotoBreakFilter === true

/**
 * Runs `applyFilter` on a Web Worker so large images do not block the UI. The input bitmap is
 * copied first (its buffer is transferred to the worker, the caller's stays usable) and the
 * result buffer is transferred back. The worker is terminated afterwards, whatever happens.
 * Aborting `signal` terminates the worker at once and rejects with an AbortError. Any failure
 * (a crash, an unreadable reply, an error reply, a request that can't be posted) rejects with
 * FILTER_STOPPED; the underlying detail goes to the console.
 */
export function runFilter(
  id: FilterId,
  b: Bitmap,
  params: Record<string, number>,
  mask?: Mask | null,
  offset?: { x: number; y: number },
  signal?: AbortSignal,
  createWorker: () => FilterWorker = startWorker,
): Promise<Bitmap> {
  return new Promise<Bitmap>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('The filter was cancelled', 'AbortError'))
    const worker = createWorker()
    let done = false
    const finish = (fn: () => void): void => {
      if (done) return
      done = true
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
      fn()
    }
    const onAbort = (): void => finish(() => reject(new DOMException('The filter was cancelled', 'AbortError')))
    const fail = (detail?: unknown): void => {
      if (detail !== undefined) console.error('Photo: filter worker failed:', detail)
      finish(() => reject(new Error(FILTER_STOPPED)))
    }
    signal?.addEventListener('abort', onAbort)
    worker.onerror = (e) => fail(e?.message ?? e)
    worker.onmessageerror = () => fail('the reply could not be read')
    worker.onmessage = (e) => {
      const r = e.data
      if (r.ok) finish(() => resolve({ width: r.width, height: r.height, data: r.data }))
      else fail(r.error)
    }
    const data = b.data.slice()
    const req: FilterRequest = { id, width: b.width, height: b.height, data, params, mask, offset }
    try {
      worker.postMessage(breakRequested() ? null : req, [data.buffer])
    } catch (e) {
      // e.g. a DataCloneError: no reply will ever come, so don't leave the worker running.
      fail(e)
    }
  })
}
