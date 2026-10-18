import type { Bitmap } from '../model/bitmap'
import type { Mask } from '../model/mask'
import type { FilterId } from './filters'
import type { FilterRequest, FilterResponse } from './filters.worker'

/**
 * Runs `applyFilter` on a Web Worker so large images do not block the UI. The input bitmap is
 * copied first (its buffer is transferred to the worker, the caller's stays usable) and the
 * result buffer is transferred back. The worker is terminated afterwards. Not unit-tested in
 * Node (no Worker there); covered by the e2e suite.
 */
export function runFilter(
  id: FilterId,
  b: Bitmap,
  params: Record<string, number>,
  mask?: Mask | null,
  offset?: { x: number; y: number },
): Promise<Bitmap> {
  return new Promise<Bitmap>((resolve, reject) => {
    const worker = new Worker(new URL('./filters.worker.ts', import.meta.url), { type: 'module' })
    const finish = (fn: () => void): void => {
      worker.terminate()
      fn()
    }
    const fail = (): void => finish(() => reject(new Error('The filter stopped unexpectedly')))
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
