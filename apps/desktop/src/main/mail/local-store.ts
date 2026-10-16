import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { simpleParser, type AddressObject } from 'mailparser'
import type { Address, MailFolder, MessageHeader, MessagePage, SpecialUse } from '@bear/core'
import { writeFileAtomic } from './atomic'

const PAGE_SIZE = 50
const SEARCH_LIMIT = 200
const SNIPPET = 1000
const SAVE_DELAY = 300

export type Flag = '\\Seen' | '\\Flagged' | '\\Answered' | '\\Draft'
const KNOWN_FLAGS = new Set<string>(['\\Seen', '\\Flagged', '\\Answered', '\\Draft'])

interface StoredMessage {
  uid: number
  /** SHA-256 of the raw message; the file is msgs/<file>.eml (shared when the same message is in several folders). */
  file: string
  flags: string[]
  internalDate: number
  date: number
  subject: string
  from: Address[]
  to: Address[]
  size: number
  hasAttachments: boolean
  /** Start of the text, for searching without opening every file. */
  snippet: string
}

interface StoredFolder {
  specialUse: SpecialUse
  uidnext: number
  messages: StoredMessage[]
}

interface Index {
  version: 1
  folders: Record<string, StoredFolder>
}

export const DEFAULT_FOLDERS: [string, SpecialUse][] = [
  ['INBOX', 'inbox'], ['Drafts', 'drafts'], ['Sent', 'sent'], ['Archive', 'archive'], ['Junk', 'junk'], ['Trash', 'trash']
]
const ORDER: SpecialUse[] = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash']

function addresses(a: AddressObject | AddressObject[] | undefined): Address[] {
  const list = Array.isArray(a) ? a : a ? [a] : []
  return list.flatMap((o) => o.value).filter((v) => v.address).map((v) => ({ name: v.name ?? '', address: v.address! }))
}

/**
 * One Bear Mail mailbox on disk: every message is its own .eml file (msgs/), and index.json holds
 * folders, flags and the headers the message list needs. Nothing but the index is kept in memory,
 * so mailboxes can hold years of imported mail.
 */
export class LocalMailbox {
  private timer: NodeJS.Timeout | null = null
  private saving: Promise<void> = Promise.resolve()

  private constructor(private dir: string, private index: Index) {}

  static async open(dir: string): Promise<LocalMailbox> {
    let index: Index
    try {
      index = JSON.parse(await fs.readFile(join(dir, 'index.json'), 'utf8')) as Index
    } catch {
      index = { version: 1, folders: Object.fromEntries(DEFAULT_FOLDERS.map(([p, s]) => [p, { specialUse: s, uidnext: 1, messages: [] }])) }
      await fs.mkdir(join(dir, 'msgs'), { recursive: true })
    }
    const box = new LocalMailbox(dir, index)
    await box.flush()
    return box
  }

  // ---------- Reading ----------

  private folder(path: string): StoredFolder {
    const f = this.index.folders[path]
    if (!f) throw new Error(`The folder "${path}" doesn't exist.`)
    return f
  }

  folders(): MailFolder[] {
    const paths = Object.keys(this.index.folders)
    const out = paths.map((path): MailFolder => {
      const f = this.index.folders[path]
      const parts = path.split('/')
      const parentPath = parts.slice(0, -1).join('/')
      const parent = parentPath && paths.includes(parentPath) ? parentPath : null
      return {
        path,
        name: f.specialUse === 'inbox' ? 'Inbox' : parts[parts.length - 1],
        specialUse: f.specialUse,
        unseen: f.messages.filter((m) => !m.flags.includes('\\Seen')).length,
        total: f.messages.length,
        parent,
        depth: parent ? parts.length - 1 : 0
      }
    })
    const rank = (f: MailFolder) => (f.specialUse && ORDER.includes(f.specialUse) ? ORDER.indexOf(f.specialUse) : ORDER.length)
    return out.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))
  }

  pathFor(use: SpecialUse): string | null {
    return Object.keys(this.index.folders).find((p) => this.index.folders[p].specialUse === use) ?? null
  }

  private header(m: StoredMessage): MessageHeader {
    return {
      uid: m.uid, subject: m.subject, from: m.from, to: m.to, date: m.date, size: m.size, hasAttachments: m.hasAttachments,
      seen: m.flags.includes('\\Seen'), flagged: m.flags.includes('\\Flagged'), answered: m.flags.includes('\\Answered')
    }
  }

  /** Same paging as the IMAP accounts: 50 at a time, newest first; pass nextBefore to get older ones. */
  page(path: string, before?: number | null): MessagePage {
    const all = this.folder(path).messages // kept in uid order
    const older = before ? all.filter((m) => m.uid < before) : all
    const page = older.slice(-PAGE_SIZE)
    const messages = page.map((m) => this.header(m)).sort((a, b) => b.date - a.date || b.uid - a.uid)
    return { messages, total: all.length, nextBefore: older.length > page.length ? page[0].uid : null }
  }

  headerOf(path: string, uid: number): MessageHeader | null {
    const m = this.folder(path).messages.find((x) => x.uid === uid)
    return m ? this.header(m) : null
  }

  async raw(path: string, uid: number): Promise<Buffer> {
    const m = this.folder(path).messages.find((x) => x.uid === uid)
    if (!m) throw new Error('This message no longer exists.')
    return fs.readFile(this.file(m.file))
  }

  search(path: string, query: string): MessageHeader[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hit = (m: StoredMessage) =>
      m.subject.toLowerCase().includes(q) || m.snippet.toLowerCase().includes(q) ||
      [...m.from, ...m.to].some((a) => a.name.toLowerCase().includes(q) || a.address.toLowerCase().includes(q))
    return this.folder(path).messages.filter(hit).map((m) => this.header(m)).sort((a, b) => b.date - a.date).slice(0, SEARCH_LIMIT)
  }

  // ---------- Writing ----------

  private file = (hash: string) => join(this.dir, 'msgs', `${hash}.eml`)

  /**
   * Store a message in a folder; returns its uid there. It's on disk when this returns, unless
   * `later` is set (bulk imports, which save once per batch).
   */
  async append(path: string, raw: Buffer, flags: string[] = [], internalDate = Date.now(), later = false): Promise<number> {
    const folder = this.folder(path)
    const hash = createHash('sha256').update(raw).digest('hex')
    const file = this.file(hash)
    // Content-addressed: the same message in several folders (e.g. Gmail labels) is stored once.
    try {
      await fs.access(file)
    } catch {
      await writeFileAtomic(file, raw)
    }
    const p = await simpleParser(raw, { skipImageLinks: true })
    const uid = folder.uidnext++
    folder.messages.push({
      uid,
      file: hash,
      flags: [...new Set(flags.filter((f) => KNOWN_FLAGS.has(f)))],
      internalDate,
      date: p.date?.getTime() || internalDate,
      subject: p.subject ?? '',
      from: addresses(p.from),
      to: addresses(p.to),
      size: raw.length,
      hasAttachments: p.attachments.some((a) => a.contentDisposition !== 'inline' || !a.cid),
      snippet: (p.text ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET)
    })
    if (later) this.scheduleSave()
    else await this.flush()
    return uid
  }

  setFlags(path: string, uids: number[], change: Partial<Record<'seen' | 'flagged' | 'answered', boolean>>) {
    const names = { seen: '\\Seen', flagged: '\\Flagged', answered: '\\Answered' } as const
    for (const m of this.folder(path).messages) {
      if (!uids.includes(m.uid)) continue
      for (const [k, on] of Object.entries(change) as [keyof typeof names, boolean | undefined][]) {
        if (on === undefined) continue
        m.flags = on ? [...new Set([...m.flags, names[k]])] : m.flags.filter((f) => f !== names[k])
      }
    }
    this.scheduleSave()
  }

  async move(path: string, uids: number[], target: string) {
    if (path === target) return
    const from = this.folder(path)
    const to = this.folder(target)
    const moving = from.messages.filter((m) => uids.includes(m.uid))
    from.messages = from.messages.filter((m) => !uids.includes(m.uid))
    for (const m of moving) to.messages.push({ ...m, uid: to.uidnext++ })
    await this.flush()
  }

  async expunge(path: string, uids: number[]) {
    const f = this.folder(path)
    const gone = f.messages.filter((m) => uids.includes(m.uid))
    f.messages = f.messages.filter((m) => !uids.includes(m.uid))
    await this.flush()
    // Delete the files no folder refers to any more.
    const used = new Set(Object.values(this.index.folders).flatMap((x) => x.messages.map((m) => m.file)))
    for (const m of gone) if (!used.has(m.file)) await fs.rm(this.file(m.file), { force: true })
  }

  /** Create a folder (and its parents). Returns the path. */
  createFolder(path: string, specialUse: SpecialUse = null): string {
    const parts = path.split('/').filter(Boolean)
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/')
      this.index.folders[p] ??= { specialUse: i === parts.length ? specialUse : null, uidnext: 1, messages: [] }
    }
    this.scheduleSave()
    return parts.join('/')
  }

  hasFolder(path: string) {
    return path in this.index.folders
  }

  // ---------- Saving ----------

  private scheduleSave() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY)
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const write = () => writeFileAtomic(join(this.dir, 'index.json'), JSON.stringify(this.index))
    this.saving = this.saving.then(write, write)
    // A failed timed save must not go unnoticed; the next change (or closing Bear) tries again.
    this.saving.catch((e) => console.error('Bear Mail: could not save the mailbox index', e))
    return this.saving
  }
}
