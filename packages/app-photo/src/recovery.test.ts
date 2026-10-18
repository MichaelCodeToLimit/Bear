import { describe, expect, it } from 'vitest'
import { RECOVERY_NAME } from '@bear/core'
import { RecoveryWriter, recoveryName, shouldWriteRecovery } from './recovery'

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

describe('RecoveryWriter', () => {
  function fakeIO() {
    const files = new Map<string, Uint8Array>()
    const gates: (() => void)[] = []
    let hold = false
    return {
      files,
      hold(v: boolean) { hold = v },
      release() { gates.splice(0).forEach((g) => g()) },
      io: {
        write: async (name: string, data: Uint8Array) => {
          if (hold) await new Promise<void>((r) => gates.push(r))
          files.set(name, data)
        },
        remove: async (name: string) => void files.delete(name)
      }
    }
  }
  const serialize = async () => new Uint8Array([1])
  const tick = () => new Promise((r) => setTimeout(r, 0))

  it('writes when due and not again for an unchanged version', async () => {
    const f = fakeIO()
    const w = new RecoveryWriter(f.io, 'photo-a.bearphoto', serialize, 1000, 0)
    expect(await w.maybeWrite({}, true, 1, 999)).toBe(false)
    expect(await w.maybeWrite({}, true, 1, 1000)).toBe(true)
    expect(f.files.has('photo-a.bearphoto')).toBe(true)
    expect(await w.maybeWrite({}, true, 1, 5000)).toBe(false)
    expect(await w.maybeWrite({}, true, 2, 5000)).toBe(true)
  })

  it('a write still in flight when the document is saved leaves no copy', async () => {
    const f = fakeIO()
    const w = new RecoveryWriter(f.io, 'n.bearphoto', serialize, 1000, 0)
    f.hold(true)
    const writing = w.maybeWrite({}, true, 1, 2000)
    await tick()
    const removing = w.remove()
    f.release()
    await Promise.all([writing, removing])
    expect(f.files.size).toBe(0)
    expect(w.written).toBe(false)
  })

  it('a removal queued after a finished write deletes the copy', async () => {
    const f = fakeIO()
    const w = new RecoveryWriter(f.io, 'n.bearphoto', serialize, 1000, 0)
    await w.writeNow({}, 1)
    await w.remove()
    expect(f.files.size).toBe(0)
  })

  it('writes again after a removal', async () => {
    const f = fakeIO()
    const w = new RecoveryWriter(f.io, 'n.bearphoto', serialize, 1000, 0)
    await w.remove()
    await w.writeNow({}, 3)
    expect(f.files.size).toBe(1)
  })

  it('writeNow reports failures', async () => {
    const w = new RecoveryWriter({ write: async () => { throw new Error('disk full') }, remove: async () => {} }, 'n.bearphoto', serialize, 1000, 0)
    await expect(w.writeNow({}, 1)).rejects.toThrow('disk full')
    expect(w.written).toBe(false)
  })
})
