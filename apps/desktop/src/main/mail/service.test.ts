import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { MailAccountInput } from '@bear/core'
import { AccountStore } from './accounts'
import { MailService, friendlyError, stripBcc } from './service'
import { authorizeUrl, exchangeCode, idTokenClaims, pkcePair, refreshTokens } from './oauth'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { start } = require('../../../../../tools/mail-server.cjs')

// Any free ports, so overlapping test runs never collide.
let IMAP = 0
let SMTP = 0
let server: { imapPort: number; smtpPort: number; deliver: (raw: string, folder?: string) => void; close: () => Promise<void> }
let mail: MailService
let store: AccountStore
let accountId: string

/** Reversible stand-in for Electron's safeStorage. */
const box = {
  available: () => true,
  encrypt: (s: string) => 'enc:' + Buffer.from(s).toString('base64'),
  decrypt: (s: string) => Buffer.from(s.slice(4), 'base64').toString()
}

const input = (password: string): MailAccountInput => ({
  name: 'Bear Tester',
  email: 'bear@bear.local',
  username: 'bear@bear.local',
  auth: 'password',
  password,
  imap: { host: '127.0.0.1', port: IMAP, security: 'none' },
  smtp: { host: '127.0.0.1', port: SMTP, security: 'none' }
})

const raw = (subject: string, body = 'hello', date = new Date()) =>
  `From: "Sender" <sender@example.test>\r\nTo: bear@bear.local\r\nSubject: ${subject}\r\nDate: ${date.toUTCString()}\r\n\r\n${body}`

async function waitFor<T>(fn: () => Promise<T | undefined>, ms = 4000): Promise<T> {
  const until = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v !== undefined) return v
    if (Date.now() > until) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 100))
  }
}

beforeAll(async () => {
  server = await start({ imapPort: 0, smtpPort: 0, quiet: true })
  ;({ imapPort: IMAP, smtpPort: SMTP } = server)
  store = new AccountStore(mkdtempSync(join(tmpdir(), 'bear-mail-')), box)
  mail = new MailService(store)
})

afterAll(async () => {
  await mail.closeAll()
  await server.close()
})

describe('accounts', () => {
  it('rejects a wrong password with a helpful message', async () => {
    const r = await mail.test(input('nope'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/rejected the sign-in/)
  })

  it('tests, then saves an account with its password encrypted', async () => {
    const r = await mail.save(input('bear'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    accountId = r.value.id
    expect(await store.list()).toHaveLength(1)
    expect(await store.secret(accountId)).toEqual({ kind: 'password', password: 'bear' })
    expect(JSON.stringify(r.value)).not.toContain('"bear"') // no password in the account record
  })
})

describe('reading', () => {
  it('lists folders in a familiar order with unread counts', async () => {
    const r = await mail.folders(accountId)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.map((f) => f.specialUse)).toEqual(['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash'])
    expect(r.value[0]).toMatchObject({ name: 'Inbox', unseen: 1, total: 1 })
  })

  it('pages newest first', async () => {
    const base = Date.UTC(2026, 0, 1)
    for (let i = 1; i <= 60; i++) server.deliver(raw(`Bulk ${i}`, 'x', new Date(base + i * 60_000)))
    const first = await mail.messages(accountId, 'INBOX')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.total).toBe(61)
    expect(first.value.messages).toHaveLength(50)
    expect(first.value.messages[0].subject).toBe('Bulk 60')
    const second = await mail.messages(accountId, 'INBOX', first.value.nextBefore)
    expect(second.ok && second.value.messages).toHaveLength(11)
    expect(second.ok && second.value.nextBefore).toBeNull()
  })

  it('searches by subject and body', async () => {
    server.deliver(raw('Quarterly numbers', 'The pineapple budget is approved'))
    const bySubject = await mail.search(accountId, 'INBOX', 'quarterly')
    const byBody = await mail.search(accountId, 'INBOX', 'pineapple')
    expect(bySubject.ok && bySubject.value.map((m) => m.subject)).toEqual(['Quarterly numbers'])
    expect(byBody.ok && byBody.value).toHaveLength(1)
  })
})

describe('sending', () => {
  it('sends HTML with an attachment, hides Bcc from recipients, and files a copy in Sent', async () => {
    const r = await mail.send(accountId, {
      to: [{ name: 'Bear', address: 'bear@bear.local' }],
      cc: [],
      bcc: [{ name: '', address: 'secret@example.test' }],
      subject: 'Report attached',
      html: '<p>See the <b>report</b>.</p><img src="https://tracker.example/pixel.gif">',
      text: 'See the report.',
      attachments: [{ filename: 'report.txt', contentType: 'text/plain', content: Buffer.from('numbers: 1,2,3').toString('base64') }]
    })
    expect(r).toEqual({ ok: true, value: null })

    // Delivered to the inbox (the test server routes all mail there).
    const inbox = await waitFor(async () => {
      const s = await mail.search(accountId, 'INBOX', 'Report attached')
      return s.ok && s.value.length ? s.value : undefined
    })
    expect(inbox[0].hasAttachments).toBe(true)
    const msg = await mail.message(accountId, 'INBOX', inbox[0].uid)
    expect(msg.ok).toBe(true)
    if (!msg.ok) return
    expect(msg.value.from[0]).toEqual({ name: 'Bear Tester', address: 'bear@bear.local' })
    expect(msg.value.html).toContain('<b>report</b>')
    expect(msg.value.text).toContain('See the report.')
    expect(msg.value.attachments.map((a) => a.filename)).toEqual(['report.txt'])
    expect(msg.value.seen).toBe(true) // opening marks it read
    const att = await mail.attachment(accountId, 'INBOX', inbox[0].uid, msg.value.attachments[0].id)
    expect(att.ok && Buffer.from(att.value.data).toString()).toBe('numbers: 1,2,3')

    // The received copy has no Bcc header; the Sent copy keeps it for the sender.
    const { ImapFlow } = await import('imapflow')
    const direct = new ImapFlow({ host: '127.0.0.1', port: IMAP, secure: false, auth: { user: 'bear@bear.local', pass: 'bear' }, logger: false })
    await direct.connect()
    const lock = await direct.getMailboxLock('INBOX')
    const received = await direct.fetchOne(String(inbox[0].uid), { source: true }, { uid: true })
    lock.release()
    const sentLock = await direct.getMailboxLock('Sent')
    const filed = await direct.fetchOne('*', { source: true })
    sentLock.release()
    await direct.logout()
    expect(received && received.source!.toString()).not.toMatch(/^Bcc:/im)
    expect(filed && filed.source!.toString()).toMatch(/^Bcc: secret@example.test/im)

    const sent = await mail.messages(accountId, 'Sent')
    expect(sent.ok && sent.value.messages.map((m) => m.subject)).toContain('Report attached')
    const sentMsg = sent.ok ? await mail.message(accountId, 'Sent', sent.value.messages[0].uid) : null
    expect(sentMsg?.ok && sentMsg.value.subject).toBe('Report attached')
  })

  it('refuses to send without recipients', async () => {
    const r = await mail.send(accountId, { to: [], cc: [], bcc: [], subject: 'x', html: '', text: '', attachments: [] })
    expect(r.ok).toBe(false)
  })
})

describe('organising', () => {
  it('flags, archives, deletes to Trash, and deletes for good from Trash', async () => {
    server.deliver(raw('Keep me'))
    server.deliver(raw('Throw me away'))
    const find = async (folder: string, subject: string) => {
      const s = await mail.search(accountId, folder, subject)
      return s.ok ? s.value[0] : undefined
    }
    const keep = (await waitFor(() => find('INBOX', 'Keep me')))!
    expect((await mail.setFlags(accountId, 'INBOX', [keep.uid], { flagged: true, seen: true })).ok).toBe(true)
    expect((await find('INBOX', 'Keep me'))).toMatchObject({ flagged: true, seen: true })

    expect((await mail.archive(accountId, 'INBOX', [keep.uid])).ok).toBe(true)
    expect(await find('INBOX', 'Keep me')).toBeUndefined()
    expect(await find('Archive', 'Keep me')).toBeDefined()

    const junk = (await find('INBOX', 'Throw me away'))!
    await mail.remove(accountId, 'INBOX', [junk.uid])
    const inTrash = (await find('Trash', 'Throw me away'))!
    expect(inTrash).toBeDefined()
    await mail.remove(accountId, 'Trash', [inTrash.uid])
    expect(await find('Trash', 'Throw me away')).toBeUndefined()
  })
})

describe('helpers', () => {
  it('strips Bcc headers including folded lines', () => {
    const msg = Buffer.from('From: a@x\r\nBcc: b@x,\r\n c@x\r\nSubject: hi\r\n\r\nBcc: stays in body')
    expect(stripBcc(msg).toString()).toBe('From: a@x\r\nSubject: hi\r\n\r\nBcc: stays in body')
  })

  it('explains common connection errors', () => {
    expect(friendlyError({ code: 'ENOTFOUND' }, 'imap.nope.test')).toMatch(/Couldn't find the server imap.nope.test/)
    expect(friendlyError({ code: 'ECONNREFUSED' })).toMatch(/refused the connection/)
  })
})

describe('OAuth sign-in', () => {
  let tokenServer: Server
  let endpoint: string
  const seen: URLSearchParams[] = []

  beforeAll(async () => {
    const claims = Buffer.from(JSON.stringify({ email: 'me@outlook.test', name: 'Me' })).toString('base64url')
    tokenServer = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const p = new URLSearchParams(body)
        seen.push(p)
        res.setHeader('Content-Type', 'application/json')
        if (p.get('grant_type') === 'authorization_code' && p.get('code') === 'good') {
          res.end(JSON.stringify({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600, id_token: `h.${claims}.s` }))
        } else if (p.get('grant_type') === 'refresh_token') {
          res.end(JSON.stringify({ access_token: 'A2', expires_in: 3600 }))
        } else {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Code expired' }))
        }
      })
    })
    await new Promise<void>((r) => tokenServer.listen(0, '127.0.0.1', r))
    endpoint = `http://127.0.0.1:${(tokenServer.address() as AddressInfo).port}/token`
  })

  afterAll(() => tokenServer.close())

  it('completes the whole browser round trip through the loopback redirect (localhost and 127.0.0.1)', async () => {
    const { interactiveSignIn } = await import('./oauth')
    for (const redirectHost of ['localhost', '127.0.0.1'] as const) {
      const ep = { authorize: 'https://login.example/auth', token: endpoint, scope: 'mail', redirectHost }
      // Play the browser: the provider would redirect back to redirect_uri with a code and the same state.
      const browser = (url: string) => {
        const u = new URL(url)
        void fetch(`${u.searchParams.get('redirect_uri')}?code=good&state=${u.searchParams.get('state')}`)
      }
      const r = await interactiveSignIn(ep, { clientId: 'abc' }, browser, 5000)
      expect(r.email).toBe('me@outlook.test')
    }
    // A forged redirect with the wrong state is rejected.
    const ep = { authorize: 'https://login.example/auth', token: endpoint, scope: 'mail', redirectHost: '127.0.0.1' as const }
    const forged = (url: string) => void fetch(`${new URL(url).searchParams.get('redirect_uri')}?code=good&state=attacker`)
    await expect(interactiveSignIn(ep, { clientId: 'abc' }, forged, 5000)).rejects.toThrow()
  })

  it('builds a PKCE authorize URL', () => {
    const { challenge } = pkcePair()
    const u = new URL(authorizeUrl({ authorize: 'https://login.example/auth', token: endpoint, scope: 'mail', redirectHost: '127.0.0.1' as const }, { clientId: 'abc' }, 'http://127.0.0.1:5000/callback', challenge, 'st'))
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('code_challenge')).toBe(challenge)
    expect(u.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5000/callback')
  })

  it('exchanges a code, reads the address from the ID token, and refreshes keeping the refresh token', async () => {
    const ep = { authorize: 'https://login.example/auth', token: endpoint, scope: 'mail', redirectHost: '127.0.0.1' as const }
    const r = await exchangeCode(ep, { clientId: 'abc' }, 'good', 'verifier', 'http://127.0.0.1:1/callback')
    expect(r).toMatchObject({ email: 'me@outlook.test', name: 'Me', tokens: { accessToken: 'A1', refreshToken: 'R1' } })
    expect(seen[seen.length - 1].get('code_verifier')).toBe('verifier')
    const t = await refreshTokens(ep, { clientId: 'abc' }, 'R1')
    expect(t).toMatchObject({ accessToken: 'A2', refreshToken: 'R1' })
    await expect(exchangeCode(ep, { clientId: 'abc' }, 'bad', 'v', 'x')).rejects.toThrow('Code expired')
    expect(idTokenClaims('garbage')).toEqual({})
  })
})
