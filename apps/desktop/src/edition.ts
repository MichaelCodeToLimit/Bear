import { parseEdition, type Edition } from '@bear/core'

/**
 * The edition this build was made for. `__BEAR_EDITION__` is replaced at build time; if that ever
 * fails to happen, fall back to the full suite instead of crashing at startup.
 */
export function buildEdition(): Edition {
  return parseEdition(typeof __BEAR_EDITION__ === 'string' ? __BEAR_EDITION__ : undefined)
}
