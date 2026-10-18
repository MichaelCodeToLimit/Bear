import { describe, expect, it, vi } from 'vitest'
import { runImageChange } from './imageChange'

describe('runImageChange', () => {
  it('reports an out-of-memory failure in plain words', () => {
    const notify = vi.fn()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    runImageChange('rotate', () => {
      throw new RangeError('Array buffer allocation failed')
    }, notify)
    expect(notify).toHaveBeenCalledWith('Not enough memory to rotate this image.')
    runImageChange('resize', () => {
      throw new Error('boom')
    }, notify)
    expect(notify).toHaveBeenLastCalledWith("Photo couldn't resize this image. It wasn't changed.")
  })

  it('says nothing when the change works', () => {
    const notify = vi.fn()
    let ran = false
    runImageChange('flip', () => (ran = true), notify)
    expect(ran).toBe(true)
    expect(notify).not.toHaveBeenCalled()
  })
})
