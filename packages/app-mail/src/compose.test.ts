import { describe, expect, it } from 'vitest'
import { formatAddress, guessProvider, parseAddresses, type MailMessage } from '@bear/core'
import { draftFrom, emptyDraft, htmlToText, prefixedSubject, recipients } from './compose'

const msg: MailMessage = {
  uid: 7, subject: 'Re: Budget <Q3>', date: Date.UTC(2026, 9, 1, 9, 30),
  from: [{ name: 'Ann Lee', address: 'ann@example.com' }],
  to: [{ name: 'Me', address: 'me@bear.test' }, { name: 'Bob', address: 'bob@example.com' }],
  cc: [{ name: '', address: 'cy@example.com' }, { name: 'Me again', address: 'ME@bear.test' }],
  replyTo: [], seen: true, flagged: false, answered: false, hasAttachments: false, size: 1,
  messageId: '<m2@example.com>', references: ['<m1@example.com>'],
  html: '<p>x</p>', text: 'Numbers <attached>\nThanks', attachments: []
}

describe('addresses', () => {
  it('parses lists with names, quotes and separators', () => {
    const r = parseAddresses('Ann <ann@x.com>, bob@y.org; "Lee, Sam" <sam@z.io>, nope')
    expect(r.addresses).toEqual([
      { name: 'Ann', address: 'ann@x.com' },
      { name: '', address: 'bob@y.org' },
      { name: 'Lee, Sam', address: 'sam@z.io' }
    ])
    expect(r.invalid).toEqual(['nope'])
    expect(formatAddress({ name: 'Lee, Sam', address: 'sam@z.io' })).toBe('"Lee, Sam" <sam@z.io>')
  })

  it('knows common providers and guesses the rest', () => {
    expect(guessProvider('x@gmail.com').preset.imap.host).toBe('imap.gmail.com')
    expect(guessProvider('x@hotmail.com').preset.oauthOnly).toBe('microsoft')
    expect(guessProvider('x@mycompany.org').preset.imap.host).toBe('imap.mycompany.org')
  })
})

describe('replies and forwards', () => {
  it('does not stack Re:/Fwd: prefixes', () => {
    expect(prefixedSubject('Re', 'RE: Fwd: re: Hello')).toBe('Re: Hello')
    expect(prefixedSubject('Fwd', 'Hello')).toBe('Fwd: Hello')
  })

  it('replies to the sender, quoting the original safely, and threads correctly', () => {
    const d = draftFrom('reply', msg, 'acct', 'me@bear.test')
    expect(d.to).toBe('Ann Lee <ann@example.com>')
    expect(d.cc).toBe('')
    expect(d.subject).toBe('Re: Budget <Q3>')
    expect(d.html).toContain('Numbers &lt;attached&gt;') // escaped, not live HTML
    expect(d.inReplyTo).toBe('<m2@example.com>')
    expect(d.references).toEqual(['<m1@example.com>', '<m2@example.com>'])
  })

  it('reply-all includes everyone except me', () => {
    const d = draftFrom('replyAll', msg, 'acct', 'me@bear.test')
    expect(d.to).toBe('Ann Lee <ann@example.com>')
    expect(d.cc).toBe('Bob <bob@example.com>, cy@example.com')
  })

  it('forwards with a header block and no recipients', () => {
    const d = draftFrom('forward', msg, 'acct', 'me@bear.test')
    expect(d.to).toBe('')
    expect(d.subject).toBe('Fwd: Budget <Q3>')
    expect(d.html).toContain('Forwarded message')
  })

  it('validates recipients before sending', () => {
    expect(recipients(emptyDraft('a'))).toEqual({ ok: false, error: 'Add at least one recipient.' })
    expect(recipients({ ...emptyDraft('a'), to: 'ann@x.com, oops' })).toMatchObject({ ok: false, error: expect.stringContaining('"oops"') })
    expect(recipients({ ...emptyDraft('a'), bcc: 'hidden@x.com' })).toMatchObject({ ok: true })
  })

  it('makes a plain-text version of HTML', () => {
    expect(htmlToText('<p>Hi &amp; bye</p><ul><li>one</li></ul><p>a<br>b</p>')).toBe('Hi & bye\n• one\na\nb')
  })
})
