export type Motion = 'on' | 'off'

export const MOTION_KEY = 'bear-motion'

/** A saved 'on'/'off' wins; anything else falls back to the OS reduced-motion preference. */
export function resolveMotion(saved: string | null, prefersReduced: boolean): Motion {
  if (saved === 'on' || saved === 'off') return saved
  return prefersReduced ? 'off' : 'on'
}

/** Read the saved preference. Returns null when storage is missing or throws. */
export function readSaved(storage?: Pick<Storage, 'getItem'>): string | null {
  try {
    return storage ? storage.getItem(MOTION_KEY) : null
  } catch {
    return null
  }
}

/** Persist the preference. Storage failures are ignored. */
export function saveMotion(storage: Pick<Storage, 'setItem'> | undefined, value: Motion): void {
  try {
    storage?.setItem(MOTION_KEY, value)
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}
