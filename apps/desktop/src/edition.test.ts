import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildEdition } from './edition'

afterEach(() => vi.unstubAllGlobals())

describe('buildEdition', () => {
  it('falls back to all when the build constant is missing', () => {
    expect(buildEdition()).toBe('all')
  })
  it('reads the build constant', () => {
    vi.stubGlobal('__BEAR_EDITION__', 'studio')
    expect(buildEdition()).toBe('studio')
  })
  it('falls back to all for an unknown value', () => {
    vi.stubGlobal('__BEAR_EDITION__', 'bogus')
    expect(buildEdition()).toBe('all')
  })
})
