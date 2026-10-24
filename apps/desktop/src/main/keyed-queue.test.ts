import { describe, expect, it } from 'vitest'
import { KeyedQueue } from './keyed-queue'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('KeyedQueue', () => {
  it('runs jobs for one key one after another, in order', async () => {
    const q = new KeyedQueue()
    const log: string[] = []
    let release!: () => void
    const slow = q.run('a', async () => {
      log.push('write start')
      await new Promise<void>((r) => (release = r))
      log.push('write end')
    })
    const rm = q.run('a', async () => void log.push('remove'))
    await tick()
    expect(log).toEqual(['write start'])
    release()
    await Promise.all([slow, rm])
    expect(log).toEqual(['write start', 'write end', 'remove'])
  })

  it('does not hold up other keys', async () => {
    const q = new KeyedQueue()
    const log: string[] = []
    void q.run('a', () => new Promise<void>(() => {}))
    await q.run('b', async () => void log.push('b'))
    expect(log).toEqual(['b'])
  })

  it('keeps going after a failed job and passes results and errors through', async () => {
    const q = new KeyedQueue()
    await expect(q.run('a', async () => { throw new Error('disk full') })).rejects.toThrow('disk full')
    await expect(q.run('a', async () => 7)).resolves.toBe(7)
    expect(q.size).toBe(0)
  })
})
