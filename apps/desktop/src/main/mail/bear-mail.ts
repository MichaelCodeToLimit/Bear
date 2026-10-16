import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { BEAR_DOMAIN, bearUsernameProblem } from '@bear/core'
import { LocalMailbox } from './local-store'
import { writeFileAtomic } from './atomic'

interface Registered {
  address: string
  name: string
}

const welcome = (address: string, name: string) => Buffer.from([
  `From: "Bear Mail" <team@${BEAR_DOMAIN}>`,
  `To: ${name ? `"${name.replace(/"/g, '')}" ` : ''}<${address}>`,
  'Subject: Welcome to Bear Mail',
  `Date: ${new Date().toUTCString()}`,
  `Message-ID: <${randomBytes(12).toString('hex')}@${BEAR_DOMAIN}>`,
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8',
  '',
  `<h2>Welcome to Bear Mail</h2><p>Your new address is <b>${address}</b>.</p>` +
    `<p>Bear Mail addresses live on this computer for now: you can send mail between any Bear Mail addresses created here, ` +
    `and bring in your mail from Gmail, Outlook or any other account with <b>Import into Bear Mail</b>. ` +
    `Sending to other email services needs a Bear Mail server on the internet, which is coming later.</p>`
].join('\r\n'))

/** The error people see when mail can't be delivered, worded for each reason. */
export function undeliverable(address: string): string {
  return address.toLowerCase().endsWith(`@${BEAR_DOMAIN}`)
    ? `There's no Bear Mail address ${address} on this computer.`
    : `Bear Mail can't send to other email services yet, so ${address} can't be reached. You can send to any @${BEAR_DOMAIN} address created on this computer.`
}

/**
 * Bear's own mail for name@bear.com addresses. Each address is a LocalMailbox in
 * <dir>/<address>/; "sending" between them is a direct delivery into the recipient's Inbox.
 */
export class BearMail {
  private registry: Registered[] | null = null
  private open = new Map<string, Promise<LocalMailbox>>()
  private file: string

  constructor(private dir: string) {
    this.file = join(dir, 'addresses.json')
  }

  private async load(): Promise<Registered[]> {
    if (this.registry) return this.registry
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as { addresses: Registered[] }
      this.registry = (raw.addresses ?? []).map(({ address, name }) => ({ address, name }))
    } catch {
      this.registry = []
    }
    return this.registry
  }

  private async persist() {
    await writeFileAtomic(this.file, JSON.stringify({ addresses: this.registry }, null, 2))
  }

  async list(): Promise<Registered[]> {
    return [...(await this.load())]
  }

  async exists(address: string) {
    return (await this.load()).some((r) => r.address === address.toLowerCase())
  }

  /** The mailbox for an address (opened once, then shared). */
  mailbox(address: string): Promise<LocalMailbox> {
    address = address.toLowerCase()
    let p = this.open.get(address)
    if (!p) {
      p = (async () => {
        if (!(await this.exists(address))) throw new Error(`${address} isn't a Bear Mail address on this computer.`)
        const box = await LocalMailbox.open(join(this.dir, address))
        await this.migrateOld(address, box)
        return box
      })()
      this.open.set(address, p)
      p.catch(() => this.open.delete(address))
    }
    return p
  }

  /** Create name@bear.com, with a welcome message waiting in the Inbox. */
  async create(username: string, name: string): Promise<string> {
    const problem = bearUsernameProblem(username)
    if (problem) throw new Error(problem)
    const address = `${username.trim().toLowerCase()}@${BEAR_DOMAIN}`
    if (await this.exists(address)) throw new Error(`${address} is already taken on this computer.`)
    this.registry!.push({ address, name: name.trim() })
    await this.persist()
    const box = await this.mailbox(address)
    await box.append('INBOX', welcome(address, name.trim()))
    await box.flush()
    return address
  }

  /** Delete an address and all of its mail. */
  async remove(address: string) {
    address = address.toLowerCase()
    await this.load()
    const p = this.open.get(address)
    this.open.delete(address)
    await p?.then((b) => b.flush()).catch(() => {})
    this.registry = this.registry!.filter((r) => r.address !== address)
    await this.persist()
    await fs.rm(join(this.dir, address), { recursive: true, force: true })
  }

  /** Check every recipient first, then deliver to each Inbox. Throws if any can't be reached, and then nothing is delivered. */
  async deliver(recipients: string[], raw: Buffer) {
    const unique = [...new Set(recipients.map((r) => r.toLowerCase()))]
    for (const r of unique) if (!(await this.exists(r))) throw new Error(undeliverable(r))
    for (const r of unique) await (await this.mailbox(r)).append('INBOX', raw)
  }

  async close() {
    const boxes = [...this.open.values()]
    this.open.clear()
    await Promise.all(boxes.map((p) => p.then((b) => b.flush()).catch(() => {})))
  }

  /**
   * Addresses made by the first version of Bear Mail were kept in one <address>.json file (the
   * storage of a small IMAP server). Move their mail into the new mailbox, keeping folders and flags.
   */
  private async migrateOld(address: string, box: LocalMailbox) {
    const old = join(this.dir, `${address}.json`)
    let storage: { INBOX?: OldBox; ''?: { folders?: Record<string, OldBox> } }
    try {
      storage = JSON.parse(await fs.readFile(old, 'utf8'))
    } catch {
      return
    }
    const SPECIAL: Record<string, 'drafts' | 'sent' | 'archive' | 'junk' | 'trash'> = {
      '\\Drafts': 'drafts', '\\Sent': 'sent', '\\Archive': 'archive', '\\Junk': 'junk', '\\Trash': 'trash'
    }
    const copy = async (path: string, b: OldBox) => {
      const use = [].concat((b['special-use'] ?? []) as never).map((s: string) => SPECIAL[s]).find(Boolean)
      const target = path === 'INBOX' ? 'INBOX' : (use && box.pathFor(use)) || box.createFolder(path)
      for (const m of b.messages ?? []) await box.append(target, Buffer.from(m.raw, 'binary'), m.flags, Date.parse(m.internaldate) || Date.now(), true)
      for (const [name, child] of Object.entries(b.folders ?? {})) await copy(path === 'INBOX' ? `INBOX/${name}` : `${path}/${name}`, child)
    }
    if (storage.INBOX) await copy('INBOX', storage.INBOX)
    for (const [name, b] of Object.entries(storage['']?.folders ?? {})) await copy(name, b)
    await box.flush()
    await fs.rm(old, { force: true })
  }
}

interface OldBox {
  messages?: { raw: string; flags: string[]; internaldate: string }[]
  folders?: Record<string, OldBox>
  'special-use'?: string | string[]
}
