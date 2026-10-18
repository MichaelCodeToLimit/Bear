import { describe, expect, it } from 'vitest'
import { RECOVERY_NAME } from '@bear/core'
import { recoveryName, shouldWriteRecovery } from './recovery'

describe('recovery', () => {
  it('writes only while dirty, at most every 60 s', () => {
    expect(shouldWriteRecovery(false, 0, 1e9)).toBe(false)
    expect(shouldWriteRecovery(true, 0, 59_999)).toBe(false)
    expect(shouldWriteRecovery(true, 0, 60_000)).toBe(true)
  })

  it('takes a shorter interval when given one', () => {
    expect(shouldWriteRecovery(true, 0, 999, 1000)).toBe(false)
    expect(shouldWriteRecovery(true, 0, 1000, 1000)).toBe(true)
  })

  it('names the file after the session', () => {
    expect(recoveryName('ab12')).toBe('photo-ab12.bearphoto')
  })

  it('makes names the main process accepts', () => {
    expect(RECOVERY_NAME.test(recoveryName('0f3c9a1e'))).toBe(true)
    expect(RECOVERY_NAME.test('../evil.bearphoto')).toBe(false)
    expect(RECOVERY_NAME.test('photo-AB.bearphoto')).toBe(false)
    expect(RECOVERY_NAME.test('photo-ab.png')).toBe(false)
  })
})
