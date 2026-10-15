export type Theme = 'dark' | 'light'

export const THEME_KEY = 'bear-theme'

/** Dark is the default for everyone; only a saved 'light' switches to daylight. */
export function resolveTheme(saved: string | null): Theme {
  return saved === 'light' ? 'light' : 'dark'
}

/** Persist the choice. Storage failures are ignored. */
export function saveTheme(storage: Pick<Storage, 'setItem'> | undefined, value: Theme): void {
  try {
    storage?.setItem(THEME_KEY, value)
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}
