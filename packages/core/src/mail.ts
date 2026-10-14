/** Mail types shared by the main process (IMAP/SMTP) and the Mail app. */

export type Security = 'tls' | 'starttls' | 'none'
export type AuthMethod = 'password' | 'oauth-microsoft' | 'oauth-google'

export interface ServerSettings {
  host: string
  port: number
  security: Security
}

export interface MailAccount {
  id: string
  /** Name shown to recipients. */
  name: string
  email: string
  username: string
  auth: AuthMethod
  imap: ServerSettings
  smtp: ServerSettings
  color: string
}

/** What the setup form sends; the secret never comes back out. */
export interface MailAccountInput extends Omit<MailAccount, 'id' | 'color'> {
  password?: string
  /** Set after a successful OAuth sign-in (held by the main process, referenced by id). */
  oauthSession?: string
}

export interface Address {
  name: string
  address: string
}

export type SpecialUse = 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | 'flagged' | 'all' | null

export interface MailFolder {
  path: string
  name: string
  specialUse: SpecialUse
  unseen: number
  total: number
  /** Folders are shown as a tree using these. */
  parent: string | null
  depth: number
}

export interface MessageHeader {
  uid: number
  subject: string
  from: Address[]
  to: Address[]
  date: number
  seen: boolean
  flagged: boolean
  answered: boolean
  hasAttachments: boolean
  size: number
}

export interface AttachmentInfo {
  id: string
  filename: string
  contentType: string
  size: number
  inline: boolean
}

export interface MailMessage extends MessageHeader {
  cc: Address[]
  replyTo: Address[]
  messageId: string | null
  references: string[]
  /** Raw (unsanitised) HTML body, with inline cid: images replaced by data URLs. Sanitise before showing. */
  html: string | null
  text: string
  attachments: AttachmentInfo[]
}

export interface MessagePage {
  messages: MessageHeader[]
  total: number
  /** Pass back as `before` to load the next (older) page. */
  nextBefore: number | null
}

export interface OutgoingAttachment {
  filename: string
  contentType?: string
  /** Base64 content. */
  content: string
}

export interface OutgoingMessage {
  to: Address[]
  cc: Address[]
  bcc: Address[]
  subject: string
  html: string
  text: string
  attachments: OutgoingAttachment[]
  inReplyTo?: string | null
  references?: string[]
}

export interface OAuthClients {
  microsoft?: { clientId: string }
  google?: { clientId: string; clientSecret: string }
}

export type MailResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** The Mail part of the preload bridge (`window.bear.mail`). */
export interface MailBridge {
  listAccounts(): Promise<MailAccount[]>
  /** Connect to IMAP and SMTP with these settings without saving anything. */
  testAccount(input: MailAccountInput): Promise<MailResult<null>>
  saveAccount(input: MailAccountInput, id?: string): Promise<MailResult<MailAccount>>
  removeAccount(id: string): Promise<void>
  getOAuthClients(): Promise<OAuthClients>
  setOAuthClients(c: OAuthClients): Promise<void>
  /** Opens the provider's sign-in page in the browser; resolves when the user comes back. */
  signIn(provider: 'microsoft' | 'google'): Promise<MailResult<{ session: string; email: string; name: string }>>
  listFolders(accountId: string): Promise<MailResult<MailFolder[]>>
  listMessages(accountId: string, folder: string, before?: number | null): Promise<MailResult<MessagePage>>
  getMessage(accountId: string, folder: string, uid: number): Promise<MailResult<MailMessage>>
  getAttachment(accountId: string, folder: string, uid: number, attachmentId: string): Promise<MailResult<{ filename: string; data: Uint8Array }>>
  setFlags(accountId: string, folder: string, uids: number[], flags: { seen?: boolean; flagged?: boolean }): Promise<MailResult<null>>
  move(accountId: string, folder: string, uids: number[], target: string): Promise<MailResult<null>>
  /** Moves to Trash, or deletes for good when already in Trash. */
  remove(accountId: string, folder: string, uids: number[]): Promise<MailResult<null>>
  archive(accountId: string, folder: string, uids: number[]): Promise<MailResult<null>>
  search(accountId: string, folder: string, query: string): Promise<MailResult<MessageHeader[]>>
  send(accountId: string, message: OutgoingMessage): Promise<MailResult<null>>
}

/** Every MailBridge method; the preload exposes exactly these and the main process handles each. */
export const MAIL_METHODS = [
  'listAccounts', 'testAccount', 'saveAccount', 'removeAccount', 'getOAuthClients', 'setOAuthClients', 'signIn',
  'listFolders', 'listMessages', 'getMessage', 'getAttachment', 'setFlags', 'move', 'remove', 'archive', 'search', 'send'
] as const satisfies readonly (keyof MailBridge)[]

// ---------- Address helpers ----------

export function formatAddress(a: Address): string {
  if (!a.name || a.name === a.address) return a.address
  return /[",<>@]/.test(a.name) ? `"${a.name.replace(/"/g, '\\"')}" <${a.address}>` : `${a.name} <${a.address}>`
}

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/

export const isEmail = (s: string) => EMAIL.test(s.trim())

/** Parse "Ann <ann@x.com>, bob@y.com; \"Lee, Sam\" <sam@z.com>" into addresses. Invalid parts are returned separately. */
export function parseAddresses(input: string): { addresses: Address[]; invalid: string[] } {
  const parts: string[] = []
  let cur = ''
  let quoted = false
  let angle = false
  for (const ch of input) {
    if (ch === '"') quoted = !quoted
    if (ch === '<' && !quoted) angle = true
    if (ch === '>' && !quoted) angle = false
    if ((ch === ',' || ch === ';') && !quoted && !angle) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  const addresses: Address[] = []
  const invalid: string[] = []
  for (const raw of parts.map((p) => p.trim()).filter(Boolean)) {
    const m = /^(.*)<([^>]+)>$/.exec(raw)
    const address = (m ? m[2] : raw).trim()
    const name = m ? m[1].trim().replace(/^"|"$/g, '').replace(/\\"/g, '"') : ''
    if (isEmail(address)) addresses.push({ name, address })
    else invalid.push(raw)
  }
  return { addresses, invalid }
}

export function displayName(a: Address | undefined): string {
  if (!a) return '(no sender)'
  return a.name || a.address
}

// ---------- Provider presets ----------

export interface ProviderPreset {
  name: string
  imap: ServerSettings
  smtp: ServerSettings
  /** Password sign-in no longer works; OAuth only. */
  oauthOnly?: 'microsoft'
  oauth?: 'microsoft' | 'google'
  /** Where to create an app password, if the provider uses them. */
  appPasswordUrl?: string
  /** The provider saves sent mail itself, so don't append a copy to Sent. */
  savesSent?: boolean
}

const tls = (host: string, port = 993): ServerSettings => ({ host, port, security: 'tls' })

export const PROVIDERS: Record<string, ProviderPreset> = {
  gmail: { name: 'Gmail', imap: tls('imap.gmail.com'), smtp: tls('smtp.gmail.com', 465), oauth: 'google', appPasswordUrl: 'https://myaccount.google.com/apppasswords', savesSent: true },
  microsoft: { name: 'Outlook.com', imap: tls('outlook.office365.com'), smtp: { host: 'smtp-mail.outlook.com', port: 587, security: 'starttls' }, oauthOnly: 'microsoft', oauth: 'microsoft', savesSent: true },
  icloud: { name: 'iCloud Mail', imap: tls('imap.mail.me.com'), smtp: { host: 'smtp.mail.me.com', port: 587, security: 'starttls' }, appPasswordUrl: 'https://account.apple.com/account/manage' },
  yahoo: { name: 'Yahoo Mail', imap: tls('imap.mail.yahoo.com'), smtp: tls('smtp.mail.yahoo.com', 465), appPasswordUrl: 'https://login.yahoo.com/myaccount/security/' },
  aol: { name: 'AOL Mail', imap: tls('imap.aol.com'), smtp: tls('smtp.aol.com', 465), appPasswordUrl: 'https://login.aol.com/myaccount/security/' },
  fastmail: { name: 'Fastmail', imap: tls('imap.fastmail.com'), smtp: tls('smtp.fastmail.com', 465), appPasswordUrl: 'https://app.fastmail.com/settings/security/apps' },
  zoho: { name: 'Zoho Mail', imap: tls('imap.zoho.com'), smtp: tls('smtp.zoho.com', 465) },
  gmx: { name: 'GMX', imap: tls('imap.gmx.com'), smtp: { host: 'mail.gmx.com', port: 587, security: 'starttls' } },
  proton: { name: 'Proton Mail (via Proton Mail Bridge)', imap: { host: '127.0.0.1', port: 1143, security: 'starttls' }, smtp: { host: '127.0.0.1', port: 1025, security: 'starttls' } }
}

const DOMAINS: Record<string, keyof typeof PROVIDERS> = {
  'gmail.com': 'gmail', 'googlemail.com': 'gmail',
  'outlook.com': 'microsoft', 'hotmail.com': 'microsoft', 'live.com': 'microsoft', 'msn.com': 'microsoft',
  'hotmail.co.uk': 'microsoft', 'outlook.co.uk': 'microsoft', 'live.co.uk': 'microsoft',
  'icloud.com': 'icloud', 'me.com': 'icloud', 'mac.com': 'icloud',
  'yahoo.com': 'yahoo', 'yahoo.co.uk': 'yahoo', 'ymail.com': 'yahoo', 'rocketmail.com': 'yahoo',
  'aol.com': 'aol', 'fastmail.com': 'fastmail', 'fastmail.fm': 'fastmail',
  'zoho.com': 'zoho', 'zohomail.com': 'zoho', 'gmx.com': 'gmx', 'gmx.net': 'gmx',
  'proton.me': 'proton', 'protonmail.com': 'proton', 'pm.me': 'proton'
}

/** Settings for an email address: a known provider, or a best guess (imap./smtp. on the domain). */
export function guessProvider(email: string): { key: string | null; preset: ProviderPreset } {
  const domain = email.split('@')[1]?.trim().toLowerCase() ?? ''
  const key = DOMAINS[domain]
  if (key) return { key, preset: PROVIDERS[key] }
  return {
    key: null,
    preset: { name: domain || 'Other', imap: tls(`imap.${domain || 'example.com'}`), smtp: { host: `smtp.${domain || 'example.com'}`, port: 587, security: 'starttls' } }
  }
}

export const ACCOUNT_COLORS = ['#0369a1', '#0f766e', '#be123c', '#7c3aed', '#b45309', '#15803d']

/** Hosts where self-signed certificates and unencrypted connections are acceptable (local test servers, bridges). */
export const isLocalHost = (host: string) => /^(localhost|127\.0\.0\.1|::1|\[::1\])$/i.test(host.trim())
