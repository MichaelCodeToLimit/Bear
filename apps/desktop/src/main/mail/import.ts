import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { ImapFlow, ListResponse } from 'imapflow'
import type { ImportFolder, ImportJob, ImportOptions, MailResult } from '@bear/core'
import type { BearMail } from './bear-mail'
import { friendlyError, type MailService } from './service'
import { writeFileAtomic } from './atomic'

const BATCH = 20
const SYNC_EVERY = 5 * 60_000
const KEEP_FLAGS = new Set(['\\Seen', '\\Flagged', '\\Answered', '\\Draft'])

const SPECIAL: Record<string, string> = {
  '\\Inbox': 'INBOX', '\\Sent': 'Sent', '\\Drafts': 'Drafts', '\\Trash': 'Trash', '\\Junk': 'Junk', '\\Archive': 'Archive'
}
/** Views over mail that's already in other folders (Gmail's All Mail, Starred, Important): copying them would duplicate everything. */
const SKIP = new Set(['\\All', '\\Flagged', '\\Important'])

/** Where a source folder's mail goes in the Bear mailbox, or null to skip it. */
export function targetFolder(f: Pick<ListResponse, 'path' | 'delimiter' | 'specialUse' | 'flags'>): string | null {
  if (f.flags.has('\\Noselect') || f.flags.has('\\NonExistent')) return null
  if (f.specialUse && SKIP.has(f.specialUse)) return null
  if (f.path.toUpperCase() === 'INBOX') return 'INBOX'
  if (f.specialUse && SPECIAL[f.specialUse]) return SPECIAL[f.specialUse]
  const parts = (f.delimiter ? f.path.split(f.delimiter) : [f.path]).map((p) => p.replace(/\//g, '-').trim()).filter(Boolean)
  // Gmail keeps its system folders under "[Gmail]/"; Bear doesn't need that level.
  if (parts.length > 1 && /^\[(Gmail|Google Mail)\]$/i.test(parts[0])) parts.shift()
  return parts.join('/') || null
}

interface Progress extends ImportFolder {
  lastUid: number
  uidValidity: string | null
}

type StoredJob = ImportJob & { folders: Progress[] }

/**
 * Copies mail from an IMAP account into a Bear Mail address, folder by folder, oldest first.
 * Progress is saved after every few messages, so an interrupted import carries on where it stopped.
 */
export class MailImporter {
  private jobs: StoredJob[] | null = null
  private running = new Set<string>()
  private cancelled = new Set<string>()
  private timer: NodeJS.Timeout | null = null

  constructor(private mail: MailService, private bear: BearMail, private file: string) {}

  private async load(): Promise<StoredJob[]> {
    if (this.jobs) return this.jobs
    try {
      this.jobs = (JSON.parse(await fs.readFile(this.file, 'utf8')) as { jobs: StoredJob[] }).jobs ?? []
    } catch {
      this.jobs = []
    }
    // Bear was closed during these.
    for (const j of this.jobs) if (j.state === 'running') j.state = 'paused'
    return this.jobs
  }

  private async persist() {
    await writeFileAtomic(this.file, JSON.stringify({ jobs: this.jobs }))
  }

  /** Start checking in-sync imports for new mail every few minutes. */
  async startSyncing() {
    await this.load()
    this.timer ??= setInterval(() => void this.syncAll(), SYNC_EVERY)
    void this.syncAll()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const id of this.running) this.cancelled.add(id)
  }

  private async syncAll() {
    for (const j of await this.load()) if (j.state === 'syncing') void this.run(j)
  }

  async list(): Promise<ImportJob[]> {
    return (await this.load()).map(({ folders, ...j }) => ({ ...j, folders: folders.map(({ source, target, total, done }) => ({ source, target, total, done })) }))
  }

  async start(o: ImportOptions): Promise<MailResult<ImportJob>> {
    const jobs = await this.load()
    const source = await this.mail.account(o.sourceId)
    if (!source) return { ok: false, error: 'That account no longer exists.' }
    if (source.auth === 'bear') return { ok: false, error: 'That account is already a Bear Mail address.' }
    let address: string
    if ('create' in o.target) {
      const created = await this.mail.createBearAccount(o.target.create)
      if (!created.ok) return created
      address = created.value.email
    } else {
      address = o.target.address.toLowerCase()
      if (!(await this.bear.exists(address))) return { ok: false, error: `${address} isn't a Bear Mail address on this computer.` }
    }
    if (jobs.some((j) => j.sourceId === o.sourceId && j.targetAddress === address && (j.state === 'running' || j.state === 'syncing'))) {
      return { ok: false, error: `${source.email} is already being copied into ${address}.` }
    }
    const job: StoredJob = {
      id: randomUUID(), sourceId: o.sourceId, sourceEmail: source.email, targetAddress: address,
      since: o.since, keepSyncing: o.keepSyncing, state: 'running', folders: [], startedAt: Date.now()
    }
    jobs.unshift(job)
    await this.persist()
    void this.run(job)
    return { ok: true, value: (await this.list()).find((j) => j.id === job.id)! }
  }

  async cancel(id: string) {
    const job = (await this.load()).find((j) => j.id === id)
    if (!job) return
    this.cancelled.add(id)
    job.state = 'cancelled'
    job.finishedAt = Date.now()
    await this.persist()
  }

  async resume(id: string) {
    const job = (await this.load()).find((j) => j.id === id)
    if (!job || job.state === 'running' || job.state === 'syncing') return
    job.state = 'running'
    job.error = undefined
    await this.persist()
    void this.run(job)
  }

  /** Wait for a job to stop running (for tests). */
  async settle(id: string) {
    while (this.running.has(id)) await new Promise((r) => setTimeout(r, 25))
  }

  private async run(job: StoredJob) {
    if (this.running.has(job.id)) return
    this.running.add(job.id)
    this.cancelled.delete(job.id)
    let client: ImapFlow | null = null
    try {
      client = await this.mail.connect(job.sourceId)
      const box = await this.bear.mailbox(job.targetAddress)
      await this.plan(job, client)
      for (const f of job.folders) {
        if (this.cancelled.has(job.id)) return
        if (!box.hasFolder(f.target)) box.createFolder(f.target)
        const lock = await client.getMailboxLock(f.source, { readOnly: true })
        try {
          const validity = client.mailbox ? String(client.mailbox.uidValidity) : null
          if (f.uidValidity && validity && f.uidValidity !== validity) f.lastUid = 0 // the server renumbered this folder
          f.uidValidity = validity
          const uids = await this.pending(client, job, f.lastUid)
          f.total = f.done + uids.length
          for (let i = 0; i < uids.length; i += BATCH) {
            if (this.cancelled.has(job.id)) return
            for await (const m of client.fetch(uids.slice(i, i + BATCH).join(','), { uid: true, flags: true, internalDate: true, source: true }, { uid: true })) {
              if (!m.source) continue
              const flags = [...(m.flags ?? [])].filter((x) => KEEP_FLAGS.has(x))
              await box.append(f.target, m.source, flags, m.internalDate ? new Date(m.internalDate).getTime() : Date.now(), true)
              f.lastUid = Math.max(f.lastUid, m.uid)
              f.done++
            }
            await box.flush()
            await this.persist()
          }
        } finally {
          lock.release()
        }
      }
      if (this.cancelled.has(job.id)) return
      job.state = job.keepSyncing ? 'syncing' : 'done'
      job.finishedAt ??= Date.now()
      job.lastSync = Date.now()
    } catch (e) {
      if (!this.cancelled.has(job.id)) {
        job.state = 'failed'
        job.error = friendlyError(e)
      }
    } finally {
      this.running.delete(job.id)
      await client?.logout().catch(() => {})
      await this.persist().catch(() => {})
    }
  }

  /** Work out (or refresh) which folders to copy and where to. */
  private async plan(job: StoredJob, client: ImapFlow) {
    const list = await client.list()
    for (const f of list) {
      const target = targetFolder(f)
      if (target && !job.folders.some((x) => x.source === f.path)) {
        job.folders.push({ source: f.path, target, total: 0, done: 0, lastUid: 0, uidValidity: null })
      }
    }
    // Inbox first, then the rest in the server's order.
    job.folders.sort((a, b) => Number(b.target === 'INBOX') - Number(a.target === 'INBOX'))
    await this.persist()
  }

  /** UIDs not yet copied, oldest first. */
  private async pending(client: ImapFlow, job: StoredJob, after: number): Promise<number[]> {
    const query = job.since ? { since: new Date(job.since) } : { all: true }
    const found = (await client.search(query, { uid: true })) || []
    return found.filter((u) => u > after).sort((a, b) => a - b)
  }
}
