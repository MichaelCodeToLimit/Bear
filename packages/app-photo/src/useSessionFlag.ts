import { useCallback, useState } from 'react'

/** A boolean remembered for this window's session (sessionStorage); false when storage is unavailable. */
export function useSessionFlag(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return sessionStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const set = useCallback(
    (v: boolean) => {
      setOn(v)
      try {
        sessionStorage.setItem(key, v ? '1' : '0')
      } catch {
        /* not remembered */
      }
    },
    [key]
  )
  return [on, set]
}
