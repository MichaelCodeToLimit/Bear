import type { Bitmap } from '../model/bitmap'
import type { Mask } from '../model/mask'
import type { FilterId } from './filters'
import type { FilterRequest, FilterResponse } from './filters.worker'

/**
 * Runs `applyFilter` on a Web Worker so large images do not block the UI. The input bitmap is
 * copied first (its buffer is transferred to the worker, the caller's stays usable) and the
 * result buffer is transferred back. The worker is terminated afterwards. Aborting `signal`
 * terminates the worker at once and rejects with an AbortError. Not unit-tested in Node (no
 * Worker there); covered by the e2e suite.
 */
export function runFilter(
  id: FilterId,
  b: Bitmap,
  params: Record<string, number>,
  mask?: Mask | null,
  offset?: { x: number; y: number },
  signal?: AbortSignal,
): Promise<Bitmap> {
  return new Promise<Bitmap>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('The filter was cancelled', 'AbortError'))
    const worker = new Worker(new URL('./filters.worker.ts', import.meta.url), { type: 'module' })
    const onAbort = (): void => finish(() => reject(new DOMException('The filter was cancelled', 'AbortError')))
    const finish = (fn: () => void): void => {
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
      fn()
    }
    const fail = (): void => finish(() => reject(new Error('The filter stopped unexpectedly')))
    signal?.addEventListener('abort', onAbort)
    worker.onerror = fail
    worker.onmessageerror = fail
    worker.onmessage = (e: MessageEvent<FilterResponse>) => {
      const r = e.data
      if (r.ok) finish(() => resolve({ width: r.width, height: r.height, data: r.data }))
      else fail()
    }
    const data = b.data.slice()
    const req: FilterRequest = { id, width: b.width, height: b.height, data, params, mask, offset }
    worker.postMessage(req, [data.buffer])
  })
}
