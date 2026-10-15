import { describe, it, expect } from 'vitest'
import { THEME_KEY, resolveTheme, saveTheme } from './themePref'

describe('resolveTheme', () => {
  it('defaults to dark', () => expect(resolveTheme(null)).toBe('dark'))
  it('keeps a saved light', () => expect(resolveTheme('light')).toBe('light'))
  it('keeps a saved dark', () => expect(resolveTheme('dark')).toBe('dark'))
  it('treats anything else as dark', () => expect(resolveTheme('banana')).toBe('dark'))
})

describe('saveTheme', () => {
  it('writes under bear-theme', () => {
    const calls: [string, string][] = []
    saveTheme({ setItem: (k, v) => void calls.push([k, v]) }, 'light')
    expect(THEME_KEY).toBe('bear-theme')
    expect(calls).toEqual([['bear-theme', 'light']])
  })
  it('swallows storage errors', () => {
    expect(() =>
      saveTheme(
        {
          setItem: () => {
            throw new Error('full')
          }
        },
        'dark'
      )
    ).not.toThrow()
  })
})
