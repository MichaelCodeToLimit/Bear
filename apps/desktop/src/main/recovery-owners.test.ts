import { describe, expect, it } from 'vitest'
import { START_TOLERANCE_MS, copyOwnership, ownerFolderName, parseOwnerFolder, type ProcessId } from './recovery-owners'

const self: ProcessId = { pid: 4242, startedAt: 1_792_000_000_000 }
const other: ProcessId = { pid: 9001, startedAt: 1_792_000_500_000 }
const folder = ownerFolderName(other)

describe('ownerFolderName / parseOwnerFolder', () => {
  it('round-trips a pid and start time', () => {
    expect(folder).toBe('9001-1792000500000')
    expect(parseOwnerFolder(folder)).toEqual(other)
  })

  it('rejects anything else', () => {
    for (const bad of ['', 'photo-1.bearphoto', '12', '-5-100', '12-abc', '0-100', '12-100-3', '../12-100'])
      expect(parseOwnerFolder(bad)).toBeNull()
  })
})

describe('copyOwnership', () => {
  it("hides a copy whose owner is alive (another edition's open document)", () => {
    expect(copyOwnership(folder, self, { alive: true, startedAt: other.startedAt + 300 })).toBe('live')
  })

  it('offers a copy whose owner has died', () => {
    expect(copyOwnership(folder, self, { alive: false })).toBe('orphan')
  })

  it('offers a copy when the pid was reused by a process that started at another time', () => {
    expect(copyOwnership(folder, self, { alive: true, startedAt: other.startedAt + START_TOLERANCE_MS + 1 })).toBe('orphan')
    expect(copyOwnership(folder, self, { alive: true, startedAt: other.startedAt - 3_600_000 })).toBe('orphan')
  })

  it("hides the copy when the owner is alive but its start time can't be read (never touch a maybe-live copy)", () => {
    expect(copyOwnership(folder, self, { alive: true, startedAt: null })).toBe('live')
  })

  it('offers a flat copy left directly in recovery/ by an earlier build', () => {
    expect(copyOwnership(null, self, undefined)).toBe('orphan')
  })

  it("recognises this process's own folder, and an earlier process that had the same pid", () => {
    expect(copyOwnership(ownerFolderName(self), self, undefined)).toBe('self')
    expect(copyOwnership(ownerFolderName({ pid: self.pid, startedAt: self.startedAt - 86_400_000 }), self, undefined)).toBe('orphan')
  })

  it('leaves folders it does not recognise alone', () => {
    expect(copyOwnership('somebody-elses', self, { alive: false })).toBe('live')
  })

  it('treats a missing probe for another process as alive', () => {
    expect(copyOwnership(folder, self, undefined)).toBe('live')
  })
})
