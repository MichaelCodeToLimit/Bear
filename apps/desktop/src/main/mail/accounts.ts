import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ACCOUNT_COLORS, type MailAccount, type MailAccountInput, type OAuthClients } from '@bear/core'
import type { Tokens } from './oauth'
import { writeFileAtomic } from './atomic'

export type Secret = { kind: 'password'; password: string } | { kind: 'oauth'; tokens: Tokens }

/** Encrypts secrets before they touch the disk (Electron safeStorage in the app; a stub in tests). */
export interface SecretBox {
  available(): boolean
  encrypt(plain: string): string
  decrypt(cipher: string): string
}

interface FileShape {
  accounts: MailAccount[]
  /** Encrypted JSON of each account's Secret, by account id. */
  secrets: Record<string, string>
  oauthClients: OAuthClients
}

/** Mail accounts and their encrypted credentials, in <userData>/mail/accounts.json. */
export class AccountStore {
  private data: FileShape | null = null
  private file: string

  constructor(private dir: string, private box: SecretBox) {
    this.file = join(dir, 'accounts.json')
  }

  private async load(): Promise<FileShape> {
    if (this.data) return this.data
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<FileShape>
      this.data = { accounts: raw.accounts ?? [], secrets: raw.secrets ?? {}, oauthClients: raw.oauthClients ?? {} }
    } catch {
      this.data = { accounts: [], secrets: {}, oauthClients: {} }
    }
    return this.data
  }

  private async persist() {
    await writeFileAtomic(this.file, JSON.stringify(this.data, null, 2))
  }

  async list(): Promise<MailAccount[]> {
    return (await this.load()).accounts
  }

  async get(id: string): Promise<MailAccount | undefined> {
    return (await this.load()).accounts.find((a) => a.id === id)
  }

  /**
   * The account's saved password or tokens, or null when there are none or they can't be read here.
   * Another Bear edition may have encrypted them under a different keychain entry (macOS, Linux), so a
   * decrypt failure counts as "no saved password" and the user is asked to sign in again.
   */
  async secret(id: string): Promise<Secret | null> {
    const enc = (await this.load()).secrets[id]
    if (!enc) return null
    try {
      return JSON.parse(this.box.decrypt(enc)) as Secret
    } catch (e) {
      console.warn('Mail: could not read the saved credentials of an account; asking to sign in again', e)
      return null
    }
  }

  async setSecret(id: string, secret: Secret) {
    if (!this.box.available()) throw new Error("This computer can't encrypt saved passwords, so Bear won't store them.")
    const d = await this.load()
    d.secrets[id] = this.box.encrypt(JSON.stringify(secret))
    await this.persist()
  }

  /** Create or update an account. A blank password on update keeps the existing one. */
  async save(input: MailAccountInput, secret: Secret | null, id?: string): Promise<MailAccount> {
    const d = await this.load()
    const { password: _p, oauthSession: _o, ...fields } = input
    const existing = id ? d.accounts.find((a) => a.id === id) : undefined
    const account: MailAccount = existing
      ? { ...existing, ...fields }
      : { ...fields, id: randomUUID(), color: ACCOUNT_COLORS[d.accounts.length % ACCOUNT_COLORS.length] }
    d.accounts = existing ? d.accounts.map((a) => (a.id === account.id ? account : a)) : [...d.accounts, account]
    if (secret) {
      if (!this.box.available()) throw new Error("This computer can't encrypt saved passwords, so Bear won't store them.")
      d.secrets[account.id] = this.box.encrypt(JSON.stringify(secret))
    }
    await this.persist()
    return account
  }

  async remove(id: string) {
    const d = await this.load()
    d.accounts = d.accounts.filter((a) => a.id !== id)
    delete d.secrets[id]
    await this.persist()
  }

  async oauthClients(): Promise<OAuthClients> {
    return (await this.load()).oauthClients
  }

  async setOAuthClients(c: OAuthClients) {
    const d = await this.load()
    d.oauthClients = c
    await this.persist()
  }
}
