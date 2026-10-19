import { describe, expect, it } from 'vitest'
import { SaveQueue } from './saveQueue'
import { EditCounter, cleanAfterSave } from './saveState'

/** A deferred promise the test resolves by hand, to finish writes in any order. */
function deferred() {
  let resolve!: () => void
  let reject!: (e: Error) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * useDocumentFile's writeTo without React: snapshot the document when the save starts, wait for the
 * (slow) write, then mark clean only if no edit landed meanwhile. Each write waits on a gate the test opens.
 */
function harness() {
  const edits = new EditCounter()
  const state = { content: 'v0', file: '', dirty: false, error: null as string | null, busy: [] as boolean[], started: [] as string[] }
  const gates: ReturnType<typeof deferred>[] = []
  const queue = new SaveQueue((b) => state.busy.push(b))
  const edit = (content: string) => { state.content = content; edits.mark(true); state.dirty = true }
  const run = (label: string, fail = false) => async () => {
    const snapshot = state.content
    const at = edits.count
    state.started.push(label)
    const gate = deferred()
    gates.push(gate)
    try {
      await gate.promise
      if (fail) throw new Error('disk full')
      state.file = snapshot
      if (cleanAfterSave(at, edits.count)) state.dirty = false
      return true
    } catch (e) {
      state.error = (e as Error).message
      return false
    }
  }
  return { state, gates, queue, edit, run }
}

describe('SaveQueue', () => {
  it('AutoSave then an explicit save: the newer content lands last and the document ends clean', async () => {
    const h = harness()
    h.edit('v1')
    const auto = h.queue.request(true, h.run('auto'))
    await tick()
    h.edit('v2') // the user keeps painting during the ~8 s AutoSave
    const explicit = h.queue.request(false, h.run('ctrl+s'))
    await tick()
    // The explicit save waits behind the AutoSave instead of racing it.
    expect(h.state.started).toEqual(['auto'])
    expect(h.queue.busy).toBe(true)
    // Even if the user's save would have finished first, nothing can overwrite it with older content.
    h.gates[0].resolve()
    expect(await auto).toBe(true)
    expect(h.state.file).toBe('v1')
    expect(h.state.dirty).toBe(true) // v2 isn't in the file yet
    expect(h.queue.busy).toBe(true) // still saving: AutoSave can't start a third
    await tick()
    expect(h.state.started).toEqual(['auto', 'ctrl+s'])
    h.gates[1].resolve()
    expect(await explicit).toBe(true)
    expect(h.state.file).toBe('v2')
    expect(h.state.dirty).toBe(false)
    expect(h.queue.busy).toBe(false)
    expect(h.state.busy).toEqual([true, false])
  })

  it('two explicit saves run one after the other; a third request coalesces into the pending one', async () => {
    const h = harness()
    h.edit('v1')
    const first = h.queue.request(false, h.run('s1'))
    await tick()
    h.edit('v2')
    const second = h.queue.request(false, h.run('s2'))
    h.edit('v3')
    const third = h.queue.request(false, h.run('s3'))
    await tick()
    expect(h.state.started).toEqual(['s1'])
    h.gates[0].resolve()
    expect(await first).toBe(true)
    await tick()
    // One pending save, taking its snapshot when it starts: it carries v3.
    expect(h.state.started).toEqual(['s1', 's3'])
    h.gates[1].resolve()
    expect(await second).toBe(true)
    expect(await third).toBe(true)
    expect(h.state.file).toBe('v3')
    expect(h.state.dirty).toBe(false)
    expect(h.state.busy).toEqual([true, false])
  })

  it('a pending AutoSave is dropped when an explicit save is queued, and never replaces one', async () => {
    const h = harness()
    h.edit('v1')
    const first = h.queue.request(false, h.run('s1'))
    await tick()
    const auto = h.queue.request(true, h.run('auto'))
    const explicit = h.queue.request(false, h.run('s2'))
    const autoAgain = h.queue.request(true, h.run('auto2'))
    h.gates[0].resolve()
    await first
    await tick()
    expect(h.state.started).toEqual(['s1', 's2'])
    h.gates[1].resolve()
    expect(await explicit).toBe(true)
    expect(await auto).toBe(true)
    expect(await autoAgain).toBe(true)
    expect(h.state.started).toEqual(['s1', 's2'])
  })

  it('a save failing mid-queue reports the error, leaves the document dirty, and the next save still runs', async () => {
    const h = harness()
    h.edit('v1')
    const failing = h.queue.request(true, h.run('auto', true))
    await tick()
    h.edit('v2')
    const next = h.queue.request(false, h.run('ctrl+s'))
    await tick()
    expect(h.state.started).toEqual(['auto'])
    h.gates[0].resolve()
    expect(await failing).toBe(false)
    expect(h.state.error).toBe('disk full')
    expect(h.state.dirty).toBe(true)
    expect(h.state.file).toBe('')
    await tick()
    h.gates[1].resolve()
    expect(await next).toBe(true)
    expect(h.state.file).toBe('v2')
    expect(h.state.dirty).toBe(false)
    expect(h.queue.busy).toBe(false)
  })

  it('a run that throws rejects its callers and the queue keeps going', async () => {
    const queue = new SaveQueue()
    const order: string[] = []
    const gate = deferred()
    const bad = queue.request(false, async () => { order.push('bad'); await gate.promise; throw new Error('boom') })
    const good = queue.request(false, async () => { order.push('good'); return true })
    gate.resolve()
    await expect(bad).rejects.toThrow('boom')
    expect(await good).toBe(true)
    expect(order).toEqual(['bad', 'good'])
    expect(queue.busy).toBe(false)
  })
})
