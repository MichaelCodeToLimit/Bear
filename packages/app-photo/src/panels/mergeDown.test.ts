import { describe, expect, it } from 'vitest'
import { createBitmap } from '../model/bitmap'
import { createLayer } from '../model/doc'
import { HIDDEN } from '../tools/guard'
import { BELOW_LOCKED, mergeDownBlocked } from './mergeDown'

const layer = (opts: { visible?: boolean; locked?: boolean } = {}) => createLayer('L', createBitmap(2, 2), opts)

describe('mergeDownBlocked', () => {
  it('allows two ordinary layers', () => {
    expect(mergeDownBlocked(layer(), layer())).toBeNull()
  })
  it('refuses a hidden upper layer', () => {
    expect(mergeDownBlocked(layer({ visible: false }), layer())).toBe(HIDDEN)
  })
  it('refuses a locked lower layer', () => {
    expect(mergeDownBlocked(layer(), layer({ locked: true }))).toBe(BELOW_LOCKED)
  })
})
