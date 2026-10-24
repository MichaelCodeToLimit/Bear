import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AccountStore } from './accounts'
import { MailService } from './service'

const input = {
  name: 'Bear Tester',
  email: 'bear@example.test',
  username: 'bear@example.test',
  auth: 'password' as const,
  imap: { host: '127.0.0.1', port: 1, security: 'none' as const },
  smtp: { host: '127.0.0.1', port: 1, security: 'none' as const }
}

describe('AccountStore secrets', () => {
  it('treats credentials it cannot decrypt (saved by another edition) as missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bear-accounts-'))
    const writer = new AccountStore(dir, { available: () => true, encrypt: (s) => 'enc:' + s, decrypt: (s) => s.slice(4) })
    const account = await writer.save(input, { kind: 'password', password: 'pw' })

    // Another edition: safeStorage can't decrypt what the first one wrote.
    const reader = new AccountStore(dir, {
      available: () => true,
      encrypt: (s) => s,
      decrypt: () => {
        throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.')
      }
    })
    expect(await reader.list()).toHaveLength(1)
    expect(await reader.secret(account.id)).toBeNull()

    // Reading mail asks to sign in again instead of failing with the decrypt error.
    const r = await new MailService(reader).folders(account.id)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/sign in again/)
  })
})
