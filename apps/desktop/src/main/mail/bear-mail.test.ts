import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ImapFlow } from 'imapflow'
import { bearUsernameProblem, type MailAccount, type OutgoingMessage } from '@bear/core'
import { AccountStore } from './accounts'
import { BearMail } from './bear-mail'
import { MailImporter, targetFolder } from './import'
import { MailService } from './service'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { start } = require('../../../../../tools/mail-server.cjs')

const secrets = {
  available: () => true,
  encrypt: (s: string) => 'enc:' + Buffer.from(s).toString('base64'),
  decrypt: (s: string) => Buffer.from(s.slice(4), 'base64').toString()
}

let root: string
let mail: MailService
let bear: BearMail
let alice: MailAccount
let bob: MailAccount

const boot = () => {
  bear = new BearMail(join(root, 'bear'))
  mail = new MailService(new AccountStore(root, secrets), bear)
}

const message = (to: string, subject: string): OutgoingMessage => ({
  to: [{ name: '', address: to }], cc: [], bcc: [], subject, html: `<p>${subject} body text</p>`, text: `${subject} body text`, attachments: []
})

const subjects = async (a: MailAccount, folder = 'INBOX') => {
  const r = await mail.messages(a.id, folder)
  if (!r.ok) throw new Error(r.error)
  return r.value.messages.map((m) => m.subject).sort()
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bear-own-mail-'))
  boot()
})

afterAll(async () => {
  await mail.closeAll()
})

describe('Bear Mail addresses', () => {
  it('validates user names', () => {
    expect(bearUsernameProblem('sam.smith')).toBeNull()
    expect(bearUsernameProblem('Sam_99')).toBeNull()
    expect(bearUsernameProblem('')).toMatch(/Choose/)
    expect(bearUsernameProblem('.sam')).toMatch(/starting and ending/)
    expect(bearUsernameProblem('sa..m')).toMatch(/next to each other/)
    expect(bearUsernameProblem('a b')).toMatch(/letters, numbers/)
    expect(bearUsernameProblem('postmaster')).toMatch(/reserved/)
    expect(bearUsernameProblem('x'.repeat(33))).toMatch(/32/)
  })

  it('creates addresses with a welcome message and the usual folders', async () => {
    const a = await mail.createBearAccount({ username: 'Alice', name: 'Alice Adams' })
    const b = await mail.createBearAccount({ username: 'bob', name: 'Bob' })
    if (!a.ok || !b.ok) throw new Error('create failed')
    ;({ value: alice } = a)
    ;({ value: bob } = b)
    expect(alice.email).toBe('alice@bear.com')
    expect(await subjects(alice)).toEqual(['Welcome to Bear Mail'])
    const folders = await mail.folders(alice.id)
    expect(folders.ok && folders.value.map((f) => [f.name, f.unseen])).toEqual([['Inbox', 1], ['Drafts', 0], ['Sent', 0], ['Archive', 0], ['Junk', 0], ['Trash', 0]])
  })

  it('refuses a taken address', async () => {
    const r = await mail.createBearAccount({ username: 'ALICE', name: '' })
    expect(!r.ok && r.error).toMatch(/already taken/)
  })

  it('delivers between Bear Mail addresses and files a copy in Sent', async () => {
    expect(await mail.send(alice.id, message('bob@bear.com', 'Hello Bob'))).toEqual({ ok: true, value: null })
    expect(await subjects(bob)).toEqual(['Hello Bob', 'Welcome to Bear Mail'])
    expect(await subjects(alice, 'Sent')).toEqual(['Hello Bob'])
    const page = await mail.messages(bob.id, 'INBOX')
    const hello = page.ok && page.value.messages.find((m) => m.subject === 'Hello Bob')!
    const full = await mail.message(bob.id, 'INBOX', (hello as { uid: number }).uid)
    expect(full.ok && full.value.from[0]).toEqual({ name: 'Alice Adams', address: 'alice@bear.com' })
    expect(full.ok && full.value.seen).toBe(true)
  })

  it("explains that other email services can't be reached yet, and delivers nothing then", async () => {
    const r = await mail.send(alice.id, { ...message('bob@bear.com', 'Mixed'), cc: [{ name: '', address: 'someone@gmail.com' }] })
    expect(!r.ok && r.error).toMatch(/can't send to other email services yet/)
    expect(await subjects(bob)).not.toContain('Mixed')
    const r2 = await mail.send(alice.id, message('nobody@bear.com', 'Hi'))
    expect(!r2.ok && r2.error).toMatch(/no Bear Mail address nobody@bear.com/)
  })

  it('searches subjects, people and text', async () => {
    const hit = async (q: string) => { const r = await mail.search(bob.id, 'INBOX', q); return r.ok ? r.value.map((m) => m.subject) : [] }
    expect(await hit('hello')).toEqual(['Hello Bob'])
    expect(await hit('alice@bear')).toEqual(['Hello Bob'])
    expect(await hit('body text')).toEqual(['Hello Bob'])
    expect(await hit('nothing like this')).toEqual([])
  })

  it('keeps mail, flags and folders across a restart', async () => {
    const page = await mail.messages(bob.id, 'INBOX')
    const [hello, welcome] = ['Hello Bob', 'Welcome to Bear Mail'].map((s) => page.ok && page.value.messages.find((m) => m.subject === s)!) as { uid: number }[]
    await mail.setFlags(bob.id, 'INBOX', [hello.uid], { flagged: true })
    await mail.archive(bob.id, 'INBOX', [welcome.uid])
    await mail.closeAll()

    boot()
    const after = await mail.messages(bob.id, 'INBOX')
    expect(after.ok && after.value.messages.map((m) => [m.subject, m.uid, m.flagged, m.seen])).toEqual([['Hello Bob', hello.uid, true, true]])
    expect(await subjects(bob, 'Archive')).toEqual(['Welcome to Bear Mail'])
  })

  it('stores a message once even when it is in two folders, and deletes the file with the last copy', async () => {
    const files = () => readdirSync(join(root, 'bear', 'bob@bear.com', 'msgs')).length
    const before = files()
    await mail.send(alice.id, message('bob@bear.com', 'Twice'))
    const box = await bear.mailbox('bob@bear.com')
    const uid = box.page('INBOX').messages.find((m) => m.subject === 'Twice')!.uid
    await box.append('Archive', await box.raw('INBOX', uid))
    expect(files()).toBe(before + 1)
    await mail.remove(bob.id, 'INBOX', [uid]) // to Trash
    const inTrash = box.page('Trash').messages.find((m) => m.subject === 'Twice')!.uid
    await mail.remove(bob.id, 'Trash', [inTrash]) // gone from Trash, still in Archive
    expect(files()).toBe(before + 1)
    const inArchive = box.page('Archive').messages.find((m) => m.subject === 'Twice')!.uid
    await box.expunge('Archive', [inArchive])
    expect(files()).toBe(before)
  })

  it('brings over addresses saved by the first version of Bear Mail', async () => {
    const dir = join(root, 'old')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'addresses.json'), JSON.stringify({ addresses: [{ address: 'old@bear.com', name: 'Old', secret: 'x' }] }))
    const raw = (s: string) => `From: a@bear.com\r\nTo: old@bear.com\r\nSubject: ${s}\r\n\r\nhi`
    writeFileSync(join(dir, 'old@bear.com.json'), JSON.stringify({
      INBOX: { messages: [{ raw: raw('Kept'), flags: ['\\Seen'], uid: 1, internaldate: '14-Oct-2026 10:00:00 +0000' }] },
      '': { separator: '/', folders: { Sent: { 'special-use': '\\Sent', messages: [{ raw: raw('Was sent'), flags: [], uid: 1, internaldate: '' }] }, Projects: { messages: [], folders: { Bear: { messages: [{ raw: raw('Nested'), flags: ['\\Flagged'], uid: 3, internaldate: '' }] } } } } }
    }))
    const m = await new BearMail(dir).mailbox('old@bear.com')
    expect(m.page('INBOX').messages.map((x) => [x.subject, x.seen])).toEqual([['Kept', true]])
    expect(m.page('Sent').messages.map((x) => x.subject)).toEqual(['Was sent'])
    expect(m.page('Projects/Bear').messages.map((x) => [x.subject, x.flagged])).toEqual([['Nested', true]])
    expect(existsSync(join(dir, 'old@bear.com.json'))).toBe(false)
  })

  it('deletes the address and its mail when the account is removed', async () => {
    await mail.removeAccount(bob.id)
    expect(existsSync(join(root, 'bear', 'bob@bear.com'))).toBe(false)
    expect(await bear.exists('bob@bear.com')).toBe(false)
    expect((await mail.send(alice.id, message('bob@bear.com', 'Gone?'))).ok).toBe(false)
    expect((await mail.createBearAccount({ username: 'bob', name: 'Bob 2' })).ok).toBe(true)
  })
})

describe('folder mapping for imports', () => {
  const f = (path: string, specialUse = '', flags: string[] = [], delimiter = '/') => targetFolder({ path, delimiter, specialUse, flags: new Set(flags) })
  it('maps well-known folders, flattens Gmail’s system folder, and skips views', () => {
    expect(f('INBOX')).toBe('INBOX')
    expect(f('[Gmail]/Sent Mail', '\\Sent')).toBe('Sent')
    expect(f('Deleted Items', '\\Trash')).toBe('Trash')
    expect(f('[Gmail]/All Mail', '\\All')).toBeNull()
    expect(f('[Gmail]/Starred', '\\Flagged')).toBeNull()
    expect(f('[Gmail]/Important', '\\Important')).toBeNull()
    expect(f('[Gmail]', '', ['\\Noselect'])).toBeNull()
    expect(f('Work.Clients', '', [], '.')).toBe('Work/Clients')
    expect(f('[Gmail]/Receipts')).toBe('Receipts')
    expect(f('a/b', '', [], '.')).toBe('a-b')
  })
})

describe('importing an account into Bear Mail', () => {
  let server: { imapPort: number; smtpPort: number; deliver: (raw: string, folder?: string) => void; close: () => Promise<void> }
  let gmail: MailAccount
  let importer: MailImporter
  const file = () => join(root, 'imports.json')
  const raw = (subject: string, date = new Date()) => `From: "Friend" <friend@example.test>\r\nTo: bear@bear.com\r\nSubject: ${subject}\r\nDate: ${date.toUTCString()}\r\n\r\nhello`

  beforeAll(async () => {
    server = await start({ imapPort: 0, smtpPort: 0, quiet: true, seed: false })
    const r = await mail.save({
      name: 'Me', email: 'bear@bear.com', username: 'bear@bear.com', auth: 'password', password: 'bear',
      imap: { host: '127.0.0.1', port: server.imapPort, security: 'none' }, smtp: { host: '127.0.0.1', port: server.smtpPort, security: 'none' }
    })
    if (!r.ok) throw new Error(r.error)
    gmail = r.value
    // A mailbox with history: old and recent mail, a sent message, a nested folder, flags.
    const c = new ImapFlow({ host: '127.0.0.1', port: server.imapPort, secure: false, auth: { user: 'bear@bear.com', pass: 'bear' }, logger: false })
    await c.connect()
    await c.mailboxCreate('Projects')
    await c.mailboxCreate('Projects/Bear')
    await c.append('INBOX', raw('Ancient', new Date('2019-01-01')), [], new Date('2019-01-01'))
    await c.append('INBOX', raw('Recent and read'), ['\\Seen', '\\Flagged'])
    await c.append('Sent', raw('I sent this'), ['\\Seen'])
    await c.append('Projects/Bear', raw('Plans'), [])
    await c.logout()
    importer = new MailImporter(mail, bear, file())
  })

  afterAll(async () => {
    importer.stop()
    await server.close()
  })

  it('copies every folder, with flags, into a new address', async () => {
    const r = await importer.start({ sourceId: gmail.id, target: { create: { username: 'moved', name: 'Moved Me' } }, since: null, keepSyncing: true })
    if (!r.ok) throw new Error(r.error)
    await importer.settle(r.value.id)
    const job = (await importer.list())[0]
    expect(job.error).toBeUndefined()
    expect(job.state).toBe('syncing')
    expect(job.folders.map((f) => [f.target, f.done, f.total])).toEqual(expect.arrayContaining([['INBOX', 2, 2], ['Sent', 1, 1], ['Projects/Bear', 1, 1]]))

    const box = await bear.mailbox('moved@bear.com')
    expect(box.page('INBOX').messages.map((m) => [m.subject, m.seen, m.flagged]).sort()).toEqual([['Ancient', false, false], ['Recent and read', true, true], ['Welcome to Bear Mail', false, false]])
    expect(box.page('Sent').messages.map((m) => m.subject)).toEqual(['I sent this'])
    expect(box.page('Projects/Bear').messages.map((m) => m.subject)).toEqual(['Plans'])
    const accounts = await new AccountStore(root, secrets).list()
    expect(accounts.some((a) => a.email === 'moved@bear.com')).toBe(true)
  })

  it('keeps bringing in new mail, without copying anything twice', async () => {
    server.deliver(raw('Arrived later'))
    await importer.startSyncing()
    const id = (await importer.list())[0].id
    await new Promise((r) => setTimeout(r, 50))
    await importer.settle(id)
    const box = await bear.mailbox('moved@bear.com')
    expect(box.page('INBOX').messages.map((m) => m.subject).sort()).toEqual(['Ancient', 'Arrived later', 'Recent and read', 'Welcome to Bear Mail'])
    await importer.cancel(id)
    expect((await importer.list())[0].state).toBe('cancelled')
  })

  it('copies only recent mail when asked, into an existing address', async () => {
    const r = await importer.start({ sourceId: gmail.id, target: { address: 'alice@bear.com' }, since: Date.now() - 30 * 86400_000, keepSyncing: false })
    if (!r.ok) throw new Error(r.error)
    await importer.settle(r.value.id)
    expect((await importer.list()).find((j) => j.id === r.value.id)!.state).toBe('done')
    const inbox = (await bear.mailbox('alice@bear.com')).page('INBOX').messages.map((m) => m.subject)
    expect(inbox).toContain('Recent and read')
    expect(inbox).not.toContain('Ancient')
  })

  it('carries on after Bear was closed mid-import', async () => {
    const r = await importer.start({ sourceId: gmail.id, target: { create: { username: 'resumed', name: '' } }, since: null, keepSyncing: false })
    if (!r.ok) throw new Error(r.error)
    importer.stop() // as if Bear quit straight away
    await importer.settle(r.value.id)

    const reopened = new MailImporter(mail, bear, file())
    const job = (await reopened.list()).find((j) => j.id === r.value.id)!
    expect(job.state).toBe('paused')
    await reopened.resume(job.id)
    await reopened.settle(job.id)
    expect((await reopened.list()).find((j) => j.id === job.id)!.state).toBe('done')
    const box = await bear.mailbox('resumed@bear.com')
    expect(box.page('INBOX').messages.map((m) => m.subject).sort()).toEqual(['Ancient', 'Arrived later', 'Recent and read', 'Welcome to Bear Mail'])
    reopened.stop()
  })

  it("won't import a Bear Mail address into itself", async () => {
    const r = await importer.start({ sourceId: alice.id, target: { address: 'alice@bear.com' }, since: null, keepSyncing: false })
    expect(!r.ok && r.error).toMatch(/already a Bear Mail address/)
  })
})
