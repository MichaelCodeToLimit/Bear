import { describe, expect, it } from 'vitest'
import { EditCounter, cleanAfterSave } from './saveState'

/** The order of events in useDocumentFile's writeTo, without React. */
async function save(edits: EditCounter, write: () => Promise<void>): Promise<boolean> {
  const start = edits.count
  await write()
  return cleanAfterSave(start, edits.count)
}

describe('cleanAfterSave', () => {
  it('is clean when nothing changed during the save', async () => {
    const edits = new EditCounter()
    edits.mark(true)
    expect(await save(edits, async () => {})).toBe(true)
  })

  it('stays dirty when an edit lands while a slow save is writing', async () => {
    const edits = new EditCounter()
    expect(await save(edits, async () => {
      await Promise.resolve()
      edits.mark(true) // the user keeps painting while 100 MB are written
    })).toBe(false)
  })

  it('does not count marking the document clean as an edit', () => {
    const edits = new EditCounter()
    edits.mark(false)
    expect(cleanAfterSave(0, edits.count)).toBe(true)
  })
})
