import { formatAddress, parseAddresses, type Address, type MailMessage, type OutgoingAttachment } from '@bear/core'

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export interface Draft {
  id: string
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  html: string
  attachments: OutgoingAttachment[]
  inReplyTo: string | null
  references: string[]
  updated: number
}

let n = 0
export const draftId = () => `d${Date.now().toString(36)}${(n++).toString(36)}`

export function emptyDraft(accountId: string): Draft {
  return { id: draftId(), accountId, to: '', cc: '', bcc: '', subject: '', html: '', attachments: [], inReplyTo: null, references: [], updated: Date.now() }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "Re: Re: Fwd: x" -> "Re: x" style prefixes, without stacking. */
export function prefixedSubject(prefix: 'Re' | 'Fwd', subject: string): string {
  const bare = subject.replace(/^\s*((re|fw|fwd|aw|sv|wg)\s*(\[\d+\])?\s*:\s*)+/i, '').trim()
  return `${prefix}: ${bare}`
}

const sameAddress = (a: Address, b: string) => a.address.toLowerCase() === b.toLowerCase()

function uniq(list: Address[]): Address[] {
  const seen = new Set<string>()
  return list.filter((a) => {
    const k = a.address.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** The original message as quoted text, safe to put into the editor. */
function quote(msg: MailMessage, intro: string): string {
  const body = escapeHtml(msg.text || '').trim().split(/\r?\n/).map((l) => `${l}<br>`).join('')
  return `<p></p><p></p><p>${escapeHtml(intro)}</p><blockquote>${body || '<br>'}</blockquote>`
}

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Build a reply, reply-all or forward from a received message. `me` is the account's own address. */
export function draftFrom(mode: Exclude<ComposeMode, 'new'>, msg: MailMessage, accountId: string, me: string): Draft {
  const d = emptyDraft(accountId)
  const sender = msg.replyTo.length ? msg.replyTo : msg.from
  const fromText = msg.from.map(formatAddress).join(', ')
  if (mode === 'forward') {
    const header = [
      '---------- Forwarded message ----------',
      `From: ${fromText}`,
      `Date: ${when(msg.date)}`,
      `Subject: ${msg.subject}`,
      `To: ${msg.to.map(formatAddress).join(', ')}`
    ]
    return {
      ...d,
      subject: prefixedSubject('Fwd', msg.subject),
      html: `<p></p><p></p>${header.map((h) => `<p>${escapeHtml(h)}</p>`).join('')}<blockquote>${escapeHtml(msg.text || '').split(/\r?\n/).map((l) => `${l}<br>`).join('')}</blockquote>`
    }
  }
  let to = sender
  let cc: Address[] = []
  if (mode === 'replyAll') {
    // Everyone else on the thread, minus me and the person I'm replying to.
    to = uniq(sender)
    cc = uniq([...msg.to, ...msg.cc]).filter((a) => !sameAddress(a, me) && !to.some((t) => sameAddress(t, a.address)))
  }
  if (to.every((a) => sameAddress(a, me)) && msg.to.length) to = msg.to // replying to my own sent message
  return {
    ...d,
    to: to.map(formatAddress).join(', '),
    cc: cc.map(formatAddress).join(', '),
    subject: prefixedSubject('Re', msg.subject),
    html: quote(msg, `On ${when(msg.date)}, ${fromText} wrote:`),
    inReplyTo: msg.messageId,
    references: [...msg.references, ...(msg.messageId ? [msg.messageId] : [])].slice(-20)
  }
}

/** Validate a draft's address fields; returns parsed lists or the first problem. */
export function recipients(d: Draft): { ok: true; to: Address[]; cc: Address[]; bcc: Address[] } | { ok: false; error: string } {
  const fields = { to: parseAddresses(d.to), cc: parseAddresses(d.cc), bcc: parseAddresses(d.bcc) }
  for (const [name, r] of Object.entries(fields)) {
    if (r.invalid.length) return { ok: false, error: `"${r.invalid[0]}" in ${name === 'to' ? 'To' : name === 'cc' ? 'Cc' : 'Bcc'} isn't a valid email address.` }
  }
  if (!fields.to.addresses.length && !fields.cc.addresses.length && !fields.bcc.addresses.length) return { ok: false, error: 'Add at least one recipient.' }
  return { ok: true, to: fields.to.addresses, cc: fields.cc.addresses, bcc: fields.bcc.addresses }
}

/** Plain-text alternative for an HTML body (for clients that don't show HTML). */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Total attachment size limit most providers accept. */
export const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024
export const base64Size = (b64: string) => Math.floor((b64.length * 3) / 4)
