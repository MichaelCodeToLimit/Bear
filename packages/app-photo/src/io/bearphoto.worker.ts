import type { PhotoDoc } from '../model/doc'
import { writeBearPhoto } from './bearphoto'

export type BearPhotoResponse = { ok: true; bytes: Uint8Array } | { ok: false; error: string }

// The tsconfig has the DOM lib, not WebWorker, so type the worker global by hand.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PhotoDoc>) => void) | null
  postMessage(msg: BearPhotoResponse, transfer: Transferable[]): void
}

scope.onmessage = async (e) => {
  try {
    const bytes = await writeBearPhoto(e.data)
    scope.postMessage({ ok: true, bytes }, [bytes.buffer])
  } catch (err) {
    scope.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) }, [])
  }
}
