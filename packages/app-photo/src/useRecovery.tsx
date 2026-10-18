import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@bear/ui'
import type { PhotoDoc } from './model/doc'
import { readBearPhoto, writeBearPhoto } from './io/bearphoto'
import { SESSION_ID, recoveryInterval, recoveryName, shouldWriteRecovery } from './recovery'

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
  const written = useRef(false)
  const lastWrite = useRef(Date.now())
  const writtenVersion = useRef(-1)

  useEffect(() => {
    void window.bear.recovery.list().then(setOffers, () => setOffers([]))
  }, [])

  // Write on a timer; a short tick keeps the shortened e2e interval accurate.
  useEffect(() => {
    let busy = false
    const interval = recoveryInterval()
    const timer = setInterval(async () => {
      const { dirty: d, version: v, getDoc: get } = live.current
      const doc = get()
      if (busy || !doc || !shouldWriteRecovery(d && v !== writtenVersion.current, lastWrite.current, Date.now(), interval)) return
      busy = true
      try {
        await window.bear.recovery.write(NAME, await writeBearPhoto(doc))
        written.current = true
        writtenVersion.current = v
        lastWrite.current = Date.now()
      } catch (e) {
        console.warn('Photo: could not write a recovery copy', e)
      } finally {
        busy = false
      }
    }, Math.min(5000, Math.max(100, interval / 4)))
    return () => clearInterval(timer)
  }, [])

  const remove = () => {
    if (!written.current) return
    written.current = false
    writtenVersion.current = -1
    void window.bear.recovery.remove(NAME).catch(() => {})
  }

  useEffect(() => {
    if (dirty) return
    lastWrite.current = Date.now()
    remove()
  }, [dirty])

  useEffect(() => remove, [])

  const offer = offers[0]
  const next = () => setOffers((list) => list.slice(1))

  const restore = async () => {
    if (!offer) return
    try {
      const doc = await readBearPhoto(await window.bear.recovery.read(offer.name))
      onRestore(doc)
      await window.bear.recovery.remove(offer.name)
      setOffers([])
    } catch (e) {
      live.current.onError(`Could not restore: ${(e as Error).message}`)
      next()
    }
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
