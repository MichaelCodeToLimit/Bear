import { useCallback, useEffect, useRef, useState } from 'react'

const SAVE_DELAY = 400

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error'

/**
 * App data kept in Bear's data folder (notebooks, task lists, boards, sites). Loads once, then
 * every change is saved shortly afterwards; pending saves are flushed when the app closes or
 * the component unmounts, and window close waits for them.
 */
export function useStoredData<T>(name: string, initial: () => T, upgrade: (raw: unknown) => T | null = (r) => r as T) {
  const [data, setData] = useState<T | null>(null)
  const [status, setStatus] = useState<SaveStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<T | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<Promise<void>>(Promise.resolve())
  /** If loading failed, never write: that would replace the user's real data with an empty start. */
  const loadFailed = useRef(false)

  useEffect(() => {
    let alive = true
    window.bear
      .readData<unknown>(name)
      .then((raw) => {
        if (!alive) return
        setData((raw !== null && upgrade(raw)) || initial())
        setStatus('saved')
      })
      .catch((e) => {
        if (!alive) return
        // Don't overwrite data we couldn't read; start fresh in memory and say so.
        loadFailed.current = true
        setError(`Couldn't load your saved data (${(e as Error).message}). Changes won't be saved until this is fixed.`)
        setData(initial())
        setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [name]) // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const value = pending.current
    if (value === null) return inFlight.current
    pending.current = null
    setStatus('saving')
    inFlight.current = inFlight.current
      .then(() => window.bear.writeData(name, value))
      .then(() => setStatus(pending.current ? 'saving' : 'saved'))
      .catch((e) => {
        setStatus('error')
        setError(`Couldn't save: ${(e as Error).message}`)
      })
    return inFlight.current
  }, [name])

  const update = useCallback(
    (fn: (d: T) => T) => {
      setData((prev) => {
        if (prev === null) return prev
        const next = fn(prev)
        if (next === prev || loadFailed.current) return next
        pending.current = next
        setStatus('saving')
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void flush(), SAVE_DELAY)
        return next
      })
    },
    [flush]
  )

  // Save anything outstanding when leaving the app, and before the window closes.
  useEffect(() => () => void flush(), [flush])
  useEffect(
    () =>
      window.bear.onCloseRequest(() => {
        if (pending.current === null) return true
        void flush().then(() => window.bear.forceClose())
        return false
      }),
    [flush]
  )

  return { data, update, status, error, dismissError: () => setError(null) }
}

export function statusLabel(s: SaveStatus): string {
  return s === 'loading' ? 'Loading…' : s === 'saving' ? 'Saving…' : s === 'error' ? 'Not saved' : 'Saved'
}
