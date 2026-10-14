import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { close, launch, stubOpenDialog as stubOpen, stubSaveDialog as stubSave } from './helpers'

test.describe.configure({ mode: 'serial' })

let app: ElectronApplication
let page: Page
let dir: string

const stubSaveDialog = (path: string) => stubSave(app, path)
const stubOpenDialog = (path: string) => stubOpen(app, path)

test.beforeAll(async () => {
  ;({ app, page, dir } = await launch())
})

test.afterAll(() => close(app))

test('launcher shows app tiles and opens Write', async () => {
  await page.screenshot({ path: join(__dirname, 'shots/01-launcher.png') })
  await expect(page.getByRole('button', { name: /Write Documents/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Sheets Spreadsheets/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Slides Presentations/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Notes Notebooks/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Mail Email/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Chat Coming soon/ })).toBeDisabled()
  await page.getByRole('button', { name: /Write Documents/ }).click()
  await expect(page.locator('.write-doc')).toBeVisible()
})

test('formats text, inserts a table, and saves a .docx that reopens', async () => {
  const editor = page.locator('.write-doc')
  await editor.click()
  await page.keyboard.type('Project Plan')
  await page.getByTitle('Style').selectOption('h1')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('This is ')
  await page.keyboard.press('Control+b')
  await page.keyboard.type('bold')
  await page.keyboard.press('Control+b')
  await page.keyboard.type(' and plain text.')
  await expect(editor.locator('h1')).toHaveText('Project Plan')
  await expect(editor.locator('strong')).toHaveText('bold')

  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByTitle('Table', { exact: true }).click()
  await page.getByRole('button', { name: '3 by 3 table' }).click()
  await expect(editor.locator('table tr')).toHaveCount(3)
  await page.keyboard.type('Owner')
  await expect(editor.locator('table')).toContainText('Owner')
  // The contextual Table tab appears while the cursor is in a table.
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Table' })).toBeVisible()

  await expect(page.getByText('· Edited')).toBeVisible()
  await page.screenshot({ path: join(__dirname, 'shots/02-editing.png') })

  const out = join(dir, 'plan.docx')
  await stubSaveDialog(out)
  await page.keyboard.press('Control+s')
  await expect(page.getByText('· Saved')).toBeVisible()
  expect(existsSync(out)).toBe(true)
  expect(readFileSync(out).subarray(0, 2).toString()).toBe('PK')

  // Re-open the saved file through the File > Open > Browse flow.
  await stubOpenDialog(out)
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByText('plan.docx').first()).toBeVisible() // listed in recent
  await page.getByRole('button', { name: 'Browse…' }).click()
  await expect(editor.locator('h1')).toHaveText('Project Plan')
  await expect(editor.locator('strong')).toHaveText('bold')
  await expect(editor.locator('table')).toContainText('Owner')
})

test('find and replace', async () => {
  const editor = page.locator('.write-doc')
  await editor.click()
  await page.keyboard.press('Control+h')
  await page.getByPlaceholder('Find in document').fill('plain')
  await expect(page.getByText('1 of 1')).toBeVisible()
  await page.getByPlaceholder('Replace with').fill('simple')
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(editor).toContainText('and simple text.')
  await page.keyboard.press('Escape')
  await expect(page.getByPlaceholder('Find in document')).toBeHidden()
})

test('colour dropdown opens fully in a narrow window', async () => {
  // Same size as a user-reported window where the ribbon clipped the swatches.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(952, 1000))
  const editor = page.locator('.write-doc')
  await editor.locator('p').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await page.getByTitle('Font color options').click()
  const panel = page.getByRole('dialog', { name: 'Font color colors' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: 'No color' })).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: join(__dirname, 'shots/08-color-dropdown.png') })
  await panel.getByTitle('#b91c1c').click()
  await expect(panel).toBeHidden()
  await expect(editor.locator('span[style*="color"]').first()).toHaveCSS('color', 'rgb(185, 28, 28)')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1344, 841))
})

test('inserts pictures of any common format, converting what .docx cannot hold', async () => {
  const editor = page.locator('.write-doc')
  // Make a 3000x1500 WebP "photo" in the browser and save it to disk.
  const webp = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 3000
    c.height = 1500
    const g = c.getContext('2d')!
    g.fillStyle = '#0f766e'
    g.fillRect(0, 0, 3000, 1500)
    return c.toDataURL('image/webp').split(',')[1]
  })
  const webpPath = join(dir, 'photo.webp')
  writeFileSync(webpPath, Buffer.from(webp, 'base64'))
  const badPath = join(dir, 'broken.jpg')
  writeFileSync(badPath, 'not really an image')

  const pick = async (path: string) => {
    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByTitle('Picture', { exact: true }).click()
    await (await chooser).setFiles(path)
  }

  await editor.locator('p').last().click()
  await page.keyboard.press('End')
  await pick(join(__dirname, '../apps/desktop/build/icon-128.png'))
  await expect(editor.locator('img')).toHaveCount(1)
  await expect(editor.locator('img').first()).toHaveAttribute('src', /^data:image\/png/)

  await pick(webpPath)
  await expect(editor.locator('img')).toHaveCount(2)
  const big = editor.locator('img').nth(1)
  await expect(big).toHaveAttribute('src', /^data:image\/png/) // WebP converted
  // Stored at most 2000px wide, displayed no wider than the text area.
  const natural = await big.evaluate((el: HTMLImageElement) => el.naturalWidth)
  expect(natural).toBe(2000)
  expect(Number(await big.getAttribute('width'))).toBeLessThanOrEqual(624)

  await pick(badPath)
  await expect(page.getByText(/Couldn't add broken\.jpg/)).toBeVisible()
  await expect(editor.locator('img')).toHaveCount(2)
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await page.screenshot({ path: join(__dirname, 'shots/09-pictures.png') })
})

test('clicking text after selecting a picture does not overwrite the picture', async () => {
  const editor = page.locator('.write-doc')
  const before = await editor.locator('img').count()
  await editor.locator('img').first().click() // select the picture
  await page.locator('footer').click() // focus leaves the editor
  await editor.locator('h1').click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await expect(editor.locator('h1')).toHaveText('Project Plan!')
  await expect(editor.locator('img')).toHaveCount(before)
  await page.keyboard.press('Backspace')
})

test('table picker, insert dialog and table tools', async () => {
  const editor = page.locator('.write-doc')
  await editor.locator('h1').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')

  // Hover grid shows the size and inserts exactly that table.
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByTitle('Table', { exact: true }).click()
  await page.getByRole('button', { name: '5 by 2 table' }).hover()
  await expect(page.getByText('5 × 2 table')).toBeVisible()
  await page.screenshot({ path: join(__dirname, 'shots/10-table-picker.png') })
  await page.getByRole('button', { name: '5 by 2 table' }).click()
  const picked = editor.locator('table').first()
  await expect(picked.locator('tr')).toHaveCount(2)
  await expect(picked.locator('tr').first().locator('td')).toHaveCount(5) // plain table, like Word
  await expect(picked.locator('th')).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(editor.locator('table')).toHaveCount(1) // only the earlier 3×3 table remains

  // A user picked 5 × 5 and read the shaded header row as "not a row"; tables now insert plain.
  await page.getByTitle('Table', { exact: true }).click()
  await page.getByRole('button', { name: '5 by 5 table' }).click()
  const five = editor.locator('table').first()
  await expect(five.locator('tr')).toHaveCount(5)
  await expect(five.locator('td')).toHaveCount(25)
  await page.keyboard.press('Control+z')
  await expect(editor.locator('table')).toHaveCount(1)

  // Bigger tables through the dialog, with a style.
  await page.getByTitle('Table', { exact: true }).click()
  await page.getByRole('button', { name: 'Insert table…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Insert table' })
  await dialog.getByLabel('Columns', { exact: true }).fill('6')
  await dialog.getByLabel('Rows', { exact: true }).fill('12')
  await dialog.getByLabel('Header row').check()
  await dialog.getByRole('button', { name: 'Banded rows style' }).click()
  await dialog.getByRole('button', { name: 'Insert', exact: true }).click()
  const big = editor.locator('table.tbl-banded')
  await expect(big.locator('tr')).toHaveCount(12)
  await expect(big.locator('tr').first().locator('th')).toHaveCount(6)

  // Table tab tools.
  await page.keyboard.type('Name')
  await page.getByRole('navigation').getByRole('button', { name: 'Table' }).click()
  await page.getByTitle('Styles').click()
  await page.getByRole('button', { name: 'Accent header style' }).click()
  await expect(editor.locator('table.tbl-accent')).toHaveCount(1)
  await page.getByTitle('Header column', { exact: true }).click()
  await expect(editor.locator('table.tbl-accent tr').nth(3).locator('th')).toHaveCount(1)

  await editor.locator('table.tbl-accent tr').nth(2).locator('td').nth(1).click()
  await page.getByTitle('Shading options').click()
  await page.getByRole('dialog', { name: 'Shading colors' }).getByTitle('#fef08a').click()
  await page.getByTitle('Align middle').click()
  const shaded = editor.locator('td[data-bg="#fef08a"]')
  await expect(shaded).toHaveCount(1)
  await expect(shaded).toHaveAttribute('data-valign', 'middle')
  await page.getByTitle('Distribute columns').click()
  await page.screenshot({ path: join(__dirname, 'shots/11-table-tools.png') })
})

test('autosave writes edits to disk', async () => {
  const editor = page.locator('.write-doc')
  await editor.locator('p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Autosaved!')
  await expect(page.getByText('· Saved')).toBeVisible({ timeout: 10_000 })
  const { importDocx } = await import('../packages/app-write/src/docx-import')
  const { html } = await importDocx(new Uint8Array(readFileSync(join(dir, 'plan.docx'))))
  expect(html).toContain('Autosaved!')
})

test('exports a PDF', async () => {
  const pdf = join(dir, 'plan.pdf')
  await stubSaveDialog(pdf)
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: 'Export to PDF' }).click()
  await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true)
  expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-')
})

test('unsaved changes prompt before going home', async () => {
  await page.getByRole('button', { name: 'Layout', exact: true }).click()
  await page.getByTitle('Landscape').click()
  await page.getByTitle('Home').click()
  await expect(page.getByRole('dialog', { name: 'Save changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.write-doc')).toBeVisible()

  await page.getByTitle('Home').click()
  await page.getByRole('button', { name: "Don't save" }).click()
  await expect(page.getByText('Apps')).toBeVisible()
  await expect(page.getByText('plan.docx').first()).toBeVisible()
  await page.screenshot({ path: join(__dirname, 'shots/03-home-recent.png') })
})

test('opens a template and plain text files', async () => {
  await page.getByRole('button', { name: /^Resume/ }).click()
  await expect(page.locator('.write-doc h1')).toHaveText('Your Name')
  await page.screenshot({ path: join(__dirname, 'shots/04-resume.png') })

  const txt = join(dir, 'notes.txt')
  writeFileSync(txt, 'line one\n\nline <two>')
  await stubOpenDialog(txt)
  await page.keyboard.press('Control+o')
  await expect(page.locator('.write-doc p')).toHaveCount(2)
  await expect(page.locator('.write-doc')).toContainText('line <two>')
})
