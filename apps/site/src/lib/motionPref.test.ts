import { describe, it, expect } from 'vitest'
import { resolveMotion, readSaved, saveMotion, MOTION_KEY } from './motionPref'

describe('resolveMotion', () => {
  it('honours a saved choice over the OS preference', () => {
    expect(resolveMotion('off', false)).toBe('off')
    expect(resolveMotion('on', true)).toBe('on')
  })
  it('falls back to the OS reduced-motion preference', () => {
    expect(resolveMotion(null, true)).toBe('off')
    expect(resolveMotion(null, false)).toBe('on')
  })
  it('ignores invalid saved values', () => {
    expect(resolveMotion('banana', true)).toBe('off')
    expect(resolveMotion('banana', false)).toBe('on')
  })
})

describe('storage helpers', () => {
  it('readSaved returns null when storage throws', () => {
    expect(
      readSaved({
        getItem: () => {
          throw new Error('blocked')
        }
      })
    ).toBeNull()
  })
  it('readSaved returns null with no storage', () => {
    expect(readSaved(undefined)).toBeNull()
  })
  it('readSaved reads the bear-motion key', () => {
    const seen: string[] = []
    const value = readSaved({
      getItem: (k) => {
        seen.push(k)
        return 'off'
      }
    })
    expect(value).toBe('off')
    expect(seen).toEqual([MOTION_KEY])
    expect(MOTION_KEY).toBe('bear-motion')
  })
  it('saveMotion swallows storage errors', () => {
    expect(() =>
      saveMotion(
        {
          setItem: () => {
            throw new Error()
          }
        },
        'off'
      )
    ).not.toThrow()
    expect(() => saveMotion(undefined, 'off')).not.toThrow()
  })
  it('saveMotion writes the value', () => {
    const calls: [string, string][] = []
    saveMotion(
      {
        setItem: (k, v) => {
          calls.push([k, v])
        }
      },
      'off'
    )
    expect(calls).toEqual([['bear-motion', 'off']])
  })
})
