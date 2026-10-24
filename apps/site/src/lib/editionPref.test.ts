import { describe, it, expect } from 'vitest'
import { EDITION_KEY, readEdition, saveEdition } from './editionPref'

describe('readEdition', () => {
  it('defaults to everything', () => {
    expect(readEdition({ getItem: () => null })).toBe('all')
    expect(readEdition(undefined)).toBe('all')
  })
  it('keeps a saved edition', () => {
    expect(readEdition({ getItem: () => 'office' })).toBe('office')
    expect(readEdition({ getItem: () => 'studio' })).toBe('studio')
  })
  it('treats anything else as everything', () => expect(readEdition({ getItem: () => 'banana' })).toBe('all'))
  it('swallows storage errors', () => {
    expect(
      readEdition({
        getItem: () => {
          throw new Error('blocked')
        }
      })
    ).toBe('all')
  })
})

describe('saveEdition', () => {
  it('writes under bear-edition', () => {
    const calls: [string, string][] = []
    saveEdition({ setItem: (k, v) => void calls.push([k, v]) }, 'studio')
    expect(EDITION_KEY).toBe('bear-edition')
    expect(calls).toEqual([['bear-edition', 'studio']])
  })
  it('swallows storage errors', () => {
    expect(() =>
      saveEdition(
        {
          setItem: () => {
            throw new Error('full')
          }
        },
        'office'
      )
    ).not.toThrow()
  })
})
