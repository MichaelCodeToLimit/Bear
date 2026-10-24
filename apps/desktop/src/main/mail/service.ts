import { ImapFlow, type FetchMessageObject, type ListResponse, type MessageStructureObject } from 'imapflow'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser'
import { randomUUID } from 'node:crypto'
import {
  formatAddress, isLocalHost,
  type Address, type MailAccount, type MailAccountInput, type MailFolder, type MailMessage, type MailResult,
  type MessageHeader, type MessagePage, type OutgoingMessage, type ServerSettings, type SpecialUse
} from '@bear/core'
import type { AccountStore, Secret } from './accounts'
import type { BearMail } from './bear-mail'
import type { LocalMailbox } from './local-store'
import { ENDPOINTS, refreshTokens, type OAuthProvider, type Tokens } from './oauth'

const PAGE_SIZE = 50
const SEARCH_LIMIT = 200

type Auth = { user: string; pass: string } | { user: string; accessToken: string }

/** Turn library/network errors into something a person can act on. */
export function friendlyError(e: unknown, host?: string): string {
  const err = e as { code?: string; authenticationFailed?: boolean; responseText?: string; message?: string; response?: string }
  const msg = err?.message ?? String(e)
  if (err?.authenticationFailed || /auth|credentials|login|password/i.test(err?.responseText ?? '') || err?.code === 'EAUTH') {
    return 'The server rejected the sign-in. Check the user name and password (many providers need an app password).'
  }
  if (err?.code === 'ENOTFOUND' || err?.code === 'EDNS') return `Couldn't find the server${host ? ` ${host}` : ''}. Check the server name and your internet connection.`
  if (err?.code === 'ECONNREFUSED') return `The server${host ? ` ${host}` : ''} refused the connection. Check the port and security settings.`
  if (err?.code === 'ETIMEDOUT' || err?.code === 'ETIMEOUT' || /timed? ?out/i.test(msg)) return `The server${host ? ` ${host}` : ''} didn't respond in time.`
  if (/certificate|self.signed|CERT_/i.test(msg)) return `The server's security certificate isn't trusted${host ? ` (${host})` : ''}.`
  return err?.responseText || err?.response || msg
}

const ok = <T>(value: T): MailResult<T> => ({ ok: true, value })
const fail = (e: unknown, host?: string): MailResult<never> => ({ ok: false, error: friendlyError(e, host) })

function imapOptions(s: ServerSettings, auth: Auth) {
  return {
    host: s.host,
    port: s.port,
    secure: s.security === 'tls',
    doSTARTTLS: s.security === 'starttls' ? true : s.security === 'none' ? false : undefined,
    auth,
    logger: false as const,
    // Only local servers (test servers, Proton Mail Bridge) may use self-signed certificates.
    tls: { rejectUnauthorized: !isLocalHost(s.host) },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 5 * 60_000
  }
}

function smtpOptions(s: ServerSettings, auth: Auth) {
  return {
    host: s.host,
    port: s.port,
    secure: s.security === 'tls',
    requireTLS: s.security === 'starttls',
    ignoreTLS: s.security === 'none',
    auth: 'pass' in auth ? { user: auth.user, pass: auth.pass } : { type: 'OAuth2' as const, user: auth.user, accessToken: auth.accessToken },
    tls: { rejectUnauthorized: !isLocalHost(s.host) },
    connectionTimeout: 20_000
  }
}

const SPECIAL: Record<string, SpecialUse> = {
  '\\Inbox': 'inbox', '\\Sent': 'sent', '\\Drafts': 'drafts', '\\Trash': 'trash', '\\Junk': 'junk',
  '\\Archive': 'archive', '\\Flagged': 'flagged', '\\All': 'all'
}

/** Folders without a special-use flag but with a well-known name. */
function guessSpecial(f: ListResponse): SpecialUse {
  if (f.path.toUpperCase() === 'INBOX') return 'inbox'
  if (f.specialUse && SPECIAL[f.specialUse]) return SPECIAL[f.specialUse]
  const n = f.name.toLowerCase()
  if (/^(sent( items| mail| messages)?)$/.test(n)) return 'sent'
  if (/^drafts?$/.test(n)) return 'drafts'
  if (/^(trash|deleted( items| messages)?|bin)$/.test(n)) return 'trash'
  if (/^(junk( e-?mail)?|spam)$/.test(n)) return 'junk'
  if (/^archives?$/.test(n)) return 'archive'
  return null
}

const ORDER: SpecialUse[] = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash']

function addresses(a: { name?: string; address?: string }[] | undefined): Address[] {
  return (a ?? []).filter((x) => x.address).map((x) => ({ name: x.name ?? '', address: x.address! }))
}

function parsedAddresses(a: AddressObject | AddressObject[] | undefined): Address[] {
  const list = Array.isArray(a) ? a : a ? [a] : []
  return list.flatMap((o) => o.value).filter((v) => v.address).map((v) => ({ name: v.name ?? '', address: v.address! }))
}

function hasAttachment(s: MessageStructureObject | undefined): boolean {
  if (!s) return false
  if (s.disposition === 'attachment' || (s.dispositionParameters?.filename && s.disposition !== 'inline')) return true
  return (s.childNodes ?? []).some(hasAttachment)
}

function header(m: FetchMessageObject): MessageHeader {
  const flags = m.flags ?? new Set<string>()
  const when = m.envelope?.date ?? m.internalDate
  return {
    uid: m.uid,
    subject: m.envelope?.subject ?? '',
    from: addresses(m.envelope?.from),
    to: addresses(m.envelope?.to),
    date: when ? new Date(when).getTime() || Date.now() : Date.now(),
    seen: flags.has('\\Seen'),
    flagged: flags.has('\\Flagged'),
    answered: flags.has('\\Answered'),
    hasAttachments: hasAttachment(m.bodyStructure),
    size: m.size ?? 0
  }
}

/** Gmail and Microsoft keep a copy of sent mail themselves. */
const providerSavesSent = (a: Pick<MailAccount, 'imap'>) => /gmail\.com|office365\.com|outlook\.com/i.test(a.imap.host)

interface CachedAttachments {
  key: string
  items: { id: string; filename: string; content: Buffer }[]
}

export interface OAuthSession {
  provider: OAuthProvider
  tokens: Tokens
}

/** All mail operations, one IMAP connection per account (reused, reconnected on demand). */
export class MailService {
  private clients = new Map<string, Promise<ImapFlow>>()
  private attachmentCache: CachedAttachments[] = []
  /** Sign-ins completed in the setup dialog but not yet saved as an account. */
  readonly sessions = new Map<string, OAuthSession>()

  constructor(private store: AccountStore, private bear?: BearMail) {}

  /** A Bear Mail address's mailbox, or null for an IMAP account. */
  private async local(accountId: string): Promise<LocalMailbox | null> {
    const a = await this.store.get(accountId)
    if (a?.auth !== 'bear') return null
    if (!this.bear) throw new Error('Bear Mail is not available.')
    return this.bear.mailbox(a.email)
  }

  // ---------- Credentials ----------

  private async authFor(account: Pick<MailAccount, 'id' | 'auth' | 'username'>, secret?: Secret | null): Promise<Auth> {
    const s = secret ?? (await this.store.secret(account.id))
    if (!s) throw new Error("There's no saved password for this account that Bear can use. Edit the account and sign in again.")
    if (s.kind === 'password') return { user: account.username, pass: s.password }
    let tokens = s.tokens
    if (tokens.expiresAt - 60_000 < Date.now()) {
      const provider: OAuthProvider = account.auth === 'oauth-google' ? 'google' : 'microsoft'
      const clients = await this.store.oauthClients()
      const client = clients[provider]
      if (!client) throw new Error(`Sign-in with ${provider === 'google' ? 'Google' : 'Microsoft'} isn't set up in Mail settings.`)
      tokens = await refreshTokens(ENDPOINTS[provider], client, tokens.refreshToken)
      if (account.id) await this.store.setSecret(account.id, { kind: 'oauth', tokens })
    }
    return { user: account.username, accessToken: tokens.accessToken }
  }

  private secretFromInput(input: MailAccountInput): Secret | null {
    if (input.auth === 'password') return input.password ? { kind: 'password', password: input.password } : null
    const session = input.oauthSession ? this.sessions.get(input.oauthSession) : undefined
    return session ? { kind: 'oauth', tokens: session.tokens } : null
  }

  private client(accountId: string): Promise<ImapFlow> {
    const existing = this.clients.get(accountId)
    if (existing) return existing
    const p = (async () => {
      const account = await this.store.get(accountId)
      if (!account) throw new Error('This account no longer exists.')
      const c = new ImapFlow(imapOptions(account.imap, await this.authFor(account)))
      const drop = () => {
        if (this.clients.get(accountId) === p) this.clients.delete(accountId)
      }
      c.on('close', drop)
      c.on('error', drop)
      try {
        await c.connect()
      } catch (e) {
        drop()
        throw Object.assign(e as object, { host: account.imap.host })
      }
      return c
    })()
    this.clients.set(accountId, p)
    p.catch(() => this.clients.delete(accountId))
    return p
  }

  /** A separate connection (the caller logs it out), for long jobs like imports that shouldn't hold up reading mail. */
  async connect(accountId: string): Promise<ImapFlow> {
    const account = await this.store.get(accountId)
    if (!account) throw new Error('This account no longer exists.')
    if (account.auth === 'bear') throw new Error('This is already a Bear Mail address.')
    const c = new ImapFlow(imapOptions(account.imap, await this.authFor(account)))
    c.on('error', () => {})
    await c.connect()
    return c
  }

  account(accountId: string) {
    return this.store.get(accountId)
  }

  /** Run with a mailbox selected; retries once on a dropped connection. */
  private async withMailbox<T>(accountId: string, folder: string, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const c = await this.client(accountId)
      try {
        const lock = await c.getMailboxLock(folder)
        try {
          return await fn(c)
        } finally {
          lock.release()
        }
      } catch (e) {
        const dropped = !c.usable || /connection|closed|socket|EPIPE|ECONNRESET/i.test(String((e as Error).message))
        if (attempt === 0 && dropped) {
          this.clients.delete(accountId)
          continue
        }
        throw e
      }
    }
  }

  async closeAll() {
    const clients = [...this.clients.values()]
    this.clients.clear()
    // Bear Mail saves its mailboxes first thing, so it runs alongside the (possibly slow) remote logouts.
    await Promise.all([...clients.map((p) => p.then((c) => c.logout()).catch(() => {})), this.bear?.close()])
  }

  // ---------- Accounts ----------

  async test(input: MailAccountInput, existingId?: string): Promise<MailResult<null>> {
    if (input.auth === 'bear') return (await this.bear?.exists(input.email)) ? ok(null) : { ok: false, error: `${input.email} isn't a Bear Mail address on this computer.` }
    let auth: Auth
    try {
      const secret = this.secretFromInput(input) ?? (existingId ? await this.store.secret(existingId) : null)
      if (!secret) return { ok: false, error: input.auth === 'password' ? 'Enter your password.' : 'Sign in first.' }
      auth = await this.authFor({ id: existingId ?? '', auth: input.auth, username: input.username }, secret)
    } catch (e) {
      return fail(e)
    }
    const imap = new ImapFlow(imapOptions(input.imap, auth))
    try {
      await imap.connect()
      await imap.logout()
    } catch (e) {
      return { ok: false, error: `Incoming mail (IMAP): ${friendlyError(e, input.imap.host)}` }
    }
    try {
      await nodemailer.createTransport(smtpOptions(input.smtp, auth)).verify()
    } catch (e) {
      return { ok: false, error: `Outgoing mail (SMTP): ${friendlyError(e, input.smtp.host)}` }
    }
    return ok(null)
  }

  async save(input: MailAccountInput, id?: string): Promise<MailResult<MailAccount>> {
    const tested = await this.test(input, id)
    if (!tested.ok) return tested
    try {
      const account = await this.store.save(input, this.secretFromInput(input), id)
      if (input.oauthSession) this.sessions.delete(input.oauthSession)
      // Settings may have changed; reconnect next time.
      const old = this.clients.get(account.id)
      this.clients.delete(account.id)
      old?.then((c) => c.logout()).catch(() => {})
      return ok(account)
    } catch (e) {
      return fail(e)
    }
  }

  async removeAccount(id: string) {
    const account = await this.store.get(id)
    const c = this.clients.get(id)
    this.clients.delete(id)
    await c?.then((x) => x.logout()).catch(() => {})
    await this.store.remove(id)
    // A Bear Mail address only exists in Bear, so removing it deletes the address and its mail.
    if (account?.auth === 'bear') await this.bear?.remove(account.email)
  }

  async createBearAccount(input: { username: string; name: string }): Promise<MailResult<MailAccount>> {
    if (!this.bear) return { ok: false, error: 'Bear Mail is not available.' }
    let address: string
    try {
      address = await this.bear.create(input.username, input.name)
    } catch (e) {
      return fail(e)
    }
    // Bear Mail needs no servers or password: the mailbox is on this computer.
    const none: ServerSettings = { host: '127.0.0.1', port: 0, security: 'none' }
    const r = await this.save({ name: input.name.trim() || input.username.trim(), email: address, username: address, auth: 'bear', imap: none, smtp: none })
    if (!r.ok) await this.bear.remove(address).catch(() => {})
    return r
  }

  addSession(s: OAuthSession): string {
    const id = randomUUID()
    this.sessions.set(id, s)
    return id
  }

  // ---------- Folders & messages ----------

  async folders(accountId: string): Promise<MailResult<MailFolder[]>> {
    try {
      const box = await this.local(accountId)
      if (box) return ok(box.folders())
      const c = await this.client(accountId)
      const list = await c.list({ statusQuery: { messages: true, unseen: true } })
      const visible = list.filter((f) => !f.flags.has('\\Noselect') && !f.flags.has('\\NonExistent'))
      const paths = new Set(visible.map((f) => f.path))
      const folders: MailFolder[] = visible.map((f) => {
        const special = guessSpecial(f)
        const parent = f.parentPath && paths.has(f.parentPath) ? f.parentPath : null
        return {
          path: f.path,
          name: special === 'inbox' ? 'Inbox' : f.name,
          specialUse: special,
          unseen: f.status?.unseen ?? 0,
          total: f.status?.messages ?? 0,
          parent,
          depth: parent ? f.path.split(f.delimiter || '/').length - 1 : 0
        }
      })
      // Well-known folders first, in a familiar order; everything else alphabetically.
      const rank = (f: MailFolder) => (f.specialUse && ORDER.includes(f.specialUse) ? ORDER.indexOf(f.specialUse) : ORDER.length)
      folders.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))
      return ok(folders)
    } catch (e) {
      return fail(e, (e as { host?: string }).host)
    }
  }

  async messages(accountId: string, folder: string, before?: number | null): Promise<MailResult<MessagePage>> {
    try {
      const box = await this.local(accountId)
      if (box) return ok(box.page(folder, before))
      return ok(
        await this.withMailbox(accountId, folder, async (c) => {
          const all = ((await c.search({ all: true }, { uid: true })) || []).sort((a, b) => a - b)
          const older = before ? all.filter((u) => u < before) : all
          const page = older.slice(-PAGE_SIZE)
          const messages: MessageHeader[] = []
          if (page.length) {
            for await (const m of c.fetch(page.join(','), { uid: true, envelope: true, flags: true, bodyStructure: true, size: true, internalDate: true }, { uid: true })) {
              messages.push(header(m))
            }
          }
          messages.sort((a, b) => b.date - a.date || b.uid - a.uid)
          return { messages, total: all.length, nextBefore: older.length > page.length ? page[0] : null }
        })
      )
    } catch (e) {
      return fail(e)
    }
  }

  async message(accountId: string, folder: string, uid: number): Promise<MailResult<MailMessage>> {
    try {
      const box = await this.local(accountId)
      if (box) {
        const h = box.headerOf(folder, uid)
        if (!h) throw new Error('This message no longer exists.')
        const parsed = await simpleParser(await box.raw(folder, uid))
        if (!h.seen) box.setFlags(folder, [uid], { seen: true })
        return ok(this.toMessage(accountId, folder, { ...h, seen: true }, parsed))
      }
      return ok(
        await this.withMailbox(accountId, folder, async (c) => {
          const m = await c.fetchOne(String(uid), { uid: true, envelope: true, flags: true, bodyStructure: true, size: true, source: true }, { uid: true })
          if (!m || !m.source) throw new Error('This message no longer exists.')
          const parsed = await simpleParser(m.source)
          if (!m.flags?.has('\\Seen')) {
            await c.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
            m.flags?.add('\\Seen')
          }
          return this.toMessage(accountId, folder, header(m), parsed)
        })
      )
    } catch (e) {
      return fail(e)
    }
  }

  private toMessage(accountId: string, folder: string, h: MessageHeader, p: ParsedMail): MailMessage {
    const items = p.attachments.map((a, i) => ({ id: String(i), filename: a.filename || `attachment-${i + 1}`, content: a.content, cid: a.cid, contentType: a.contentType, related: a.related }))
    // Inline images referenced as cid: become data URLs, so the body shows them without any network access.
    let html = p.html || null
    const inlined = new Set<string>()
    if (html) {
      for (const a of items) {
        if (!a.cid || !a.contentType.startsWith('image/')) continue
        const ref = new RegExp(`cid:${a.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi')
        if (ref.test(html)) {
          html = html.replace(ref, `data:${a.contentType};base64,${a.content.toString('base64')}`)
          inlined.add(a.id)
        }
      }
    }
    const key = `${accountId}\u0000${folder}\u0000${h.uid}`
    this.attachmentCache = [{ key, items }, ...this.attachmentCache.filter((x) => x.key !== key)].slice(0, 10)
    const refs = p.references ? (Array.isArray(p.references) ? p.references : [p.references]) : []
    return {
      ...h,
      subject: p.subject ?? h.subject,
      from: parsedAddresses(p.from).length ? parsedAddresses(p.from) : h.from,
      to: parsedAddresses(p.to),
      cc: parsedAddresses(p.cc),
      replyTo: parsedAddresses(p.replyTo),
      date: p.date?.getTime() ?? h.date,
      messageId: p.messageId ?? null,
      references: refs,
      html,
      text: p.text ?? '',
      attachments: items.map((a) => ({ id: a.id, filename: a.filename, contentType: a.contentType, size: a.content.length, inline: inlined.has(a.id) }))
    }
  }

  async attachment(accountId: string, folder: string, uid: number, id: string): Promise<MailResult<{ filename: string; data: Uint8Array }>> {
    const key = `${accountId}\u0000${folder}\u0000${uid}`
    let cached = this.attachmentCache.find((x) => x.key === key)
    if (!cached) {
      const r = await this.message(accountId, folder, uid)
      if (!r.ok) return r
      cached = this.attachmentCache.find((x) => x.key === key)
    }
    const item = cached?.items.find((a) => a.id === id)
    return item ? ok({ filename: item.filename, data: new Uint8Array(item.content) }) : { ok: false, error: 'Attachment not found.' }
  }

  async setFlags(accountId: string, folder: string, uids: number[], flags: { seen?: boolean; flagged?: boolean }): Promise<MailResult<null>> {
    try {
      const box = await this.local(accountId)
      if (box) {
        box.setFlags(folder, uids, flags)
        return ok(null)
      }
      await this.withMailbox(accountId, folder, async (c) => {
        const set = uids.join(',')
        if (flags.seen !== undefined) await (flags.seen ? c.messageFlagsAdd(set, ['\\Seen'], { uid: true }) : c.messageFlagsRemove(set, ['\\Seen'], { uid: true }))
        if (flags.flagged !== undefined) await (flags.flagged ? c.messageFlagsAdd(set, ['\\Flagged'], { uid: true }) : c.messageFlagsRemove(set, ['\\Flagged'], { uid: true }))
      })
      return ok(null)
    } catch (e) {
      return fail(e)
    }
  }

  async move(accountId: string, folder: string, uids: number[], target: string): Promise<MailResult<null>> {
    try {
      const box = await this.local(accountId)
      if (box) {
        await box.move(folder, uids, target)
        return ok(null)
      }
      await this.withMailbox(accountId, folder, (c) => c.messageMove(uids.join(','), target, { uid: true }).then(() => undefined))
      return ok(null)
    } catch (e) {
      return fail(e)
    }
  }

  private async specialFolder(accountId: string, use: SpecialUse, createAs?: string): Promise<string | null> {
    const box = await this.local(accountId)
    if (box) return box.pathFor(use) ?? (createAs ? box.createFolder(createAs, use) : null)
    const r = await this.folders(accountId)
    if (!r.ok) throw new Error(r.error)
    const found = r.value.find((f) => f.specialUse === use)
    if (found) return found.path
    if (!createAs) return null
    const c = await this.client(accountId)
    await c.mailboxCreate(createAs)
    return createAs
  }

  async remove(accountId: string, folder: string, uids: number[]): Promise<MailResult<null>> {
    try {
      const trash = await this.specialFolder(accountId, 'trash', 'Trash')
      if (trash && trash !== folder) return this.move(accountId, folder, uids, trash)
      const box = await this.local(accountId)
      if (box) {
        await box.expunge(folder, uids)
        return ok(null)
      }
      await this.withMailbox(accountId, folder, (c) => c.messageDelete(uids.join(','), { uid: true }).then(() => undefined))
      return ok(null)
    } catch (e) {
      return fail(e)
    }
  }

  async archive(accountId: string, folder: string, uids: number[]): Promise<MailResult<null>> {
    try {
      const target = await this.specialFolder(accountId, 'archive', 'Archive')
      if (!target || target === folder) return ok(null)
      return this.move(accountId, folder, uids, target)
    } catch (e) {
      return fail(e)
    }
  }

  async search(accountId: string, folder: string, query: string): Promise<MailResult<MessageHeader[]>> {
    const q = query.trim()
    if (!q) return ok([])
    try {
      const box = await this.local(accountId)
      if (box) return ok(box.search(folder, q))
      return ok(
        await this.withMailbox(accountId, folder, async (c) => {
          const uids = ((await c.search({ or: [{ subject: q }, { from: q }, { to: q }, { body: q }] }, { uid: true })) || []).sort((a, b) => b - a).slice(0, SEARCH_LIMIT)
          const out: MessageHeader[] = []
          if (uids.length) for await (const m of c.fetch(uids.join(','), { uid: true, envelope: true, flags: true, bodyStructure: true, size: true }, { uid: true })) out.push(header(m))
          return out.sort((a, b) => b.date - a.date)
        })
      )
    } catch (e) {
      return fail(e)
    }
  }

  // ---------- Sending ----------

  async send(accountId: string, msg: OutgoingMessage): Promise<MailResult<null>> {
    const account = await this.store.get(accountId)
    if (!account) return { ok: false, error: 'This account no longer exists.' }
    if (!msg.to.length && !msg.cc.length && !msg.bcc.length) return { ok: false, error: 'Add at least one recipient.' }
    let raw: Buffer
    try {
      const composer = new MailComposer({
        from: formatAddress({ name: account.name, address: account.email }),
        to: msg.to.map(formatAddress),
        cc: msg.cc.map(formatAddress),
        bcc: msg.bcc.map(formatAddress),
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        inReplyTo: msg.inReplyTo ?? undefined,
        references: msg.references?.length ? msg.references : undefined,
        attachments: msg.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, 'base64'), contentType: a.contentType }))
      })
      const node = composer.compile()
      // Keep Bcc in the copy filed to Sent so the sender can see who was Bcc'd; stripBcc() removes it
      // from what's actually transmitted.
      ;(node as unknown as { keepBcc: boolean }).keepBcc = true
      raw = await node.build()
    } catch (e) {
      return fail(e)
    }
    const recipients = [...msg.to, ...msg.cc, ...msg.bcc].map((a) => a.address)
    try {
      // The Bcc header is stripped from what recipients receive.
      if (account.auth === 'bear') {
        if (!this.bear) throw new Error('Bear Mail is not available.')
        await this.bear.deliver(recipients, stripBcc(raw))
      } else {
        const transport = nodemailer.createTransport(smtpOptions(account.smtp, await this.authFor(account)))
        await transport.sendMail({ envelope: { from: account.email, to: recipients }, raw: stripBcc(raw) })
      }
    } catch (e) {
      return fail(e, account.smtp.host)
    }
    // Keep a copy in Sent, unless the provider already does.
    if (!providerSavesSent(account)) {
      try {
        const sent = await this.specialFolder(accountId, 'sent', 'Sent')
        const box = await this.local(accountId)
        if (sent && box) await box.append(sent, raw, ['\\Seen'])
        else if (sent) await (await this.client(accountId)).append(sent, raw, ['\\Seen'])
      } catch {
        /* the message was sent; failing to file a copy shouldn't report a send failure */
      }
    }
    return ok(null)
  }
}

/** Remove the Bcc header (and its folded continuation lines) from a raw message's header block. */
export function stripBcc(raw: Buffer): Buffer {
  const text = raw.toString('binary')
  const end = text.indexOf('\r\n\r\n')
  if (end < 0) return raw
  const headers = text.slice(0, end).replace(/^Bcc:.*(?:\r\n[ \t].*)*\r\n?/gim, '')
  return Buffer.from(headers + text.slice(end), 'binary')
}
