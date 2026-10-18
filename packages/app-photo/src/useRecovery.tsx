import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@bear/ui'
import type { PhotoDoc } from './model/doc'
import { readBearPhoto, writeBearPhoto } from './io/bearphoto'
import { RecoveryWriter, SESSION_ID, recoveryInterval, recoveryName } from './recovery'

interface RecoveryOptions {
  accent: string
  /** The document to back up (read when a copy is written). */
  getDoc: () => PhotoDoc | null
  /** Unsaved changes, from useDocumentFile. */
  dirty: boolean
  /** Changes on every edit, so an unchanged document isn't written twice. */
  version: number
  onRestore: (doc: PhotoDoc) => void
  onError: (message: string) => void
}

const NAME = recoveryName(SESSION_ID)

/**
 * Crash recovery: every 60 s while there are unsaved changes, a .bearphoto copy goes to userData/recovery.
 * It is removed once the document is clean again (saved, or changes discarded), when Photo closes, and when
 * the window closes normally (main process). On start, copies left by a crash are offered back.
 */
export function useRecovery({ accent, getDoc, dirty, version, onRestore, onError }: RecoveryOptions) {
  const [offers, setOffers] = useState<{ name: string; savedAt: number }[]>([])
  const live = useRef({ dirty, version, getDoc, onError })
  live.current = { dirty, version, getDoc, onError }
  const [writer] = useState(
    () => new RecoveryWriter<PhotoDoc>(window.bear.recovery, NAME, writeBearPhoto, recoveryInterval(), Date.now())
  )

  useEffect(() => {
    void window.bear.recovery.list().then(setOffers, () => setOffers([]))
  }, [])

  // Write on a timer; a short tick keeps the shortened e2e interval accurate.
  useEffect(() => {
    const interval = recoveryInterval()
    const timer = setInterval(() => {
      const { dirty: d, version: v, getDoc: get } = live.current
      const doc = get()
      if (!doc) return
      writer.maybeWrite(doc, d, v, Date.now()).catch((e) => console.warn('Photo: could not write a recovery copy', e))
    }, Math.min(5000, Math.max(100, interval / 4)))
    return () => clearInterval(timer)
  }, [writer])

  // Clean again (saved, changes discarded, another file opened): drop the copy, even one mid-write.
  useEffect(() => {
    if (dirty) return
    writer.lastWrite = Date.now()
    void writer.remove().catch(() => {})
  }, [dirty, writer])

  useEffect(() => () => void writer.remove().catch(() => {}), [writer])

  const offer = offers[0]
  const next = () => setOffers((list) => list.slice(1))

  const restore = async () => {
    if (!offer) return
    let doc: PhotoDoc
    try {
      doc = await readBearPhoto(await window.bear.recovery.read(offer.name))
    } catch (e) {
      live.current.onError(`Could not restore: ${(e as Error).message}`)
      next()
      return
    }
    onRestore(doc)
    setOffers([])
    // The old copy goes only once this session's own copy exists, so a second crash can't lose the work.
    try {
      await writer.writeNow(doc, -1)
      writer.lastWrite = Date.now()
    } catch (e) {
      console.warn('Photo: could not write a recovery copy; keeping the old one', e)
      return
    }
    // The restore itself worked; failing to tidy up the old copy is not worth reporting.
    await window.bear.recovery.remove(offer.name).catch((e) => console.warn('Photo: could not remove the old recovery copy', e))
  }

  const discard = () => {
    if (!offer) return
    void window.bear.recovery.remove(offer.name).catch(() => {})
    next()
  }

  const prompt = offer && (
    // Closing the prompt (Escape) keeps the copy for next time; only Discard deletes it.
    <Modal
      title="Restore your work?"
      onClose={() => setOffers([])}
      footer={
        <>
          <Button primary accent={accent} onClick={() => void restore()}>Restore</Button>
          <Button onClick={discard}>Discard</Button>
        </>
      }
    >
      <span data-testid="photo-recovery">Photo closed unexpectedly. Restore {new Date(offer.savedAt).toLocaleString()}?</span>
    </Modal>
  )

  return { prompt }
}
