import type { PhotoDoc } from '../model/doc'
import { writeBearPhoto } from './bearphoto'
import type { BearPhotoResponse } from './bearphoto.worker'

/** The parts of a Worker used here (tests pass a fake one). */
export interface BearPhotoWorker {
  onmessage: ((e: MessageEvent<BearPhotoResponse>) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
  onmessageerror: ((e: MessageEvent) => void) | null
  postMessage(msg: PhotoDoc, transfer: Transferable[]): void
  terminate(): void
}

const startWorker = (): BearPhotoWorker | null =>
  typeof Worker === 'undefined' ? null : (new Worker(new URL('./bearphoto.worker.ts', import.meta.url), { type: 'module' }) as unknown as BearPhotoWorker)

/**
 * A copy of the document as it is now: layer pixels are copied (so later edits can't reach a save under
 * way) and the selection is left out (.bearphoto doesn't store it).
 */
export function snapshotForSave(doc: PhotoDoc): PhotoDoc {
  return {
    ...doc,
    selection: null,
    layers: doc.layers.map((l) => ({ ...l, text: l.text && { ...l.text, color: [...l.text.color] }, pixels: { width: l.pixels.width, height: l.pixels.height, data: l.pixels.data.slice() } }))
  }
}

/**
 * writeBearPhoto on a Web Worker, so encoding a large image doesn't freeze the window (AutoSave and the
 * crash-recovery copy run while the user works). The document is snapshotted synchronously, before this
 * returns, and the snapshot's pixels are transferred to the worker (one extra copy of the layers in memory). Without workers (Node tests), or if the worker fails, it is written on this thread instead.
 */
export function writeBearPhotoOffThread(doc: PhotoDoc, createWorker: () => BearPhotoWorker | null = startWorker): Promise<Uint8Array> {
  const snap = snapshotForSave(doc)
  let worker: BearPhotoWorker | null
  try {
    worker = createWorker()
  } catch (e) {
    console.warn('Photo: no save worker, saving on the main thread', e)
    worker = null
  }
  if (!worker) return writeBearPhoto(snap)
  const w = worker
  return new Promise<Uint8Array>((resolve) => {
    let done = false
    const finish = (bytes: Uint8Array | null, detail?: unknown) => {
      if (done) return
      done = true
      w.terminate()
      if (bytes) return resolve(bytes)
      // The snapshot went to the worker; write the document as it is now (any newer edit keeps it dirty).
      console.warn('Photo: the save worker failed, saving on the main thread', detail)
      resolve(writeBearPhoto(snapshotForSave(doc)))
    }
    w.onmessage = (e) => (e.data.ok ? finish(e.data.bytes) : finish(null, e.data.error))
    w.onerror = (e) => finish(null, e?.message ?? e)
    w.onmessageerror = () => finish(null, 'the reply could not be read')
    try {
      // The snapshot's pixel buffers move to the worker instead of being copied again.
      w.postMessage(snap, snap.layers.map((l) => l.pixels.data.buffer))
    } catch (e) {
      finish(null, e)
    }
  })
}
