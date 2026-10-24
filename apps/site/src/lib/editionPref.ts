import { parseEdition, type Edition } from '@bear/core'

/** The Download page's edition switcher remembers the choice under this key. */
export const EDITION_KEY = 'bear-edition'

/** The saved edition, or 'all' (Everything) when nothing valid is saved or storage is unavailable. */
export function readEdition(storage: Pick<Storage, 'getItem'> | undefined): Edition {
  try {
    return parseEdition(storage?.getItem(EDITION_KEY) ?? undefined)
  } catch {
    return 'all'
  }
}

/** Persist the choice. Storage failures are ignored. */
export function saveEdition(storage: Pick<Storage, 'setItem'> | undefined, value: Edition): void {
  try {
    storage?.setItem(EDITION_KEY, value)
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}
