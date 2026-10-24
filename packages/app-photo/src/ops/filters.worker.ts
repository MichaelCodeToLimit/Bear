import { applyFilter, type FilterId } from './filters'
import type { Mask } from '../model/mask'

/** Request posted by runFilter. `data` is a private copy whose buffer is transferred in. */
export interface FilterRequest {
  id: FilterId
  width: number
  height: number
  data: Uint8ClampedArray
  params: Record<string, number>
  mask?: Mask | null
  offset?: { x: number; y: number }
}

export type FilterResponse =
  | { ok: true; width: number; height: number; data: Uint8ClampedArray }
  | { ok: false; error: string }

// The tsconfig has the DOM lib, not WebWorker, so type the worker global by hand.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<FilterRequest>) => void) | null
  postMessage(msg: FilterResponse, transfer: Transferable[]): void
}

scope.onmessage = (e) => {
  const { id, width, height, data, params, mask, offset } = e.data
  try {
    const out = applyFilter(id, { width, height, data }, params, mask, offset)
    scope.postMessage({ ok: true, width: out.width, height: out.height, data: out.data }, [out.data.buffer])
  } catch (err) {
    scope.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) }, [])
  }
}
