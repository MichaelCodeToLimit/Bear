import { describe, it, expect } from 'vitest'
import { numberWord } from './numberWord'
import { SITE_APPS } from './officeApps'

describe('numberWord', () => {
  it('spells small counts with a capital', () => {
    expect(numberWord(1)).toBe('One')
    expect(numberWord(12)).toBe('Twelve')
    expect(numberWord(13)).toBe('Thirteen')
    expect(numberWord(20)).toBe('Twenty')
  })
  it('falls back to digits beyond twenty', () => expect(numberWord(21)).toBe('21'))
  it('spells the current site app count', () => expect(numberWord(SITE_APPS.length)).toBe('Thirteen'))
})
