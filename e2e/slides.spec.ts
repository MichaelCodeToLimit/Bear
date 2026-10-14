import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { close, launch, stubOpenDialog, stubSaveDialog } from './helpers'

test.describe.configure({ mode: 'serial' })

let app: ElectronApplication
let page: Page
let dir: string

test.beforeAll(async () => {
  ;({ app, page, dir } = await launch())
})

test.afterAll(() => close(app))

const stage = () => page.locator('[data-stage]')
const thumbs = () => page.getByRole('listbox', { name: 'Slides' }).getByRole('option')

async function elementBox(text: string) {
  return (await stage().locator('[data-el]', { hasText: text }).first().boundingBox())!
}

test('opens Slides with a title slide and edits text in place', async () => {
  await page.getByRole('button', { name: /Slides Presentations/ }).click()
  await expect(stage()).toBeVisible()
  await expect(stage()).toContainText('Click to add title')
  await stage().getByText('Click to add title').dblclick()
  await page.keyboard.type('Quarterly review')
  await page.keyboard.press('Escape')
  await stage().getByText('Click to add subtitle').dblclick()
  await page.keyboard.type('October 2026')
  await page.keyboard.press('Escape')
  await expect(stage()).toContainText('Quarterly review')
  await expect(thumbs().first()).toContainText('Quarterly review')
})

test('adds a slide from a layout and types bullets', async () => {
  await page.getByTitle('New slide').first().click()
  await page.getByRole('button', { name: 'Title and content layout' }).click()
  await expect(thumbs()).toHaveCount(2)
  await expect(page.getByText('Slide 2 of 2')).toBeVisible()
  await stage().getByText('Click to add title').dblclick()
  await page.keyboard.type('Highlights')
  await page.keyboard.press('Escape')
  await stage().getByText('Click to add text').dblclick()
  await page.keyboard.type('Revenue up 12%')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Two new markets')
  await page.keyboard.press('Escape')
  await expect(stage().locator('li')).toHaveCount(2)
})

test('inserts, moves and resizes a shape with text', async () => {
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByTitle('Oval').click()
  await expect(stage().locator('[data-selected]')).toHaveCount(1)
  await page.keyboard.type('Go!')
  await page.keyboard.press('Escape')
  const before = await elementBox('Go!')

  // Drag the shape 100px right.
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 100, before.y + before.height / 2, { steps: 5 })
  await page.mouse.up()
  const moved = await elementBox('Go!')
  expect(moved.x).toBeGreaterThan(before.x + 80)

  // Resize from the bottom-right handle.
  const handle = (await stage().locator('[data-handle="se"]').boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + 60, handle.y + 40, { steps: 5 })
  await page.mouse.up()
  const resized = await elementBox('Go!')
  expect(resized.width).toBeGreaterThan(moved.width + 30)

  // Undo the resize, then redo it.
  await stage().press('Control+z')
  expect((await elementBox('Go!')).width).toBeCloseTo(moved.width, 0)
  await stage().press('Control+y')
  await page.screenshot({ path: join(__dirname, 'shots/12-slides-editor.png') })
})

test('applies a theme and writes speaker notes', async () => {
  await page.getByRole('button', { name: 'Design', exact: true }).click()
  await page.getByRole('button', { name: 'Ocean theme' }).click()
  await expect(stage().locator('div[style*="linear-gradient"]').first()).toBeVisible()
  await page.getByLabel('Speaker notes').fill('Mention the two markets')
  await expect(thumbs().nth(1).locator('span[title="Has speaker notes"]')).toBeVisible()
})

test('presents full screen and navigates with the keyboard', async () => {
  await stage().click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('F5')
  const show = page.getByRole('dialog', { name: 'Slide show' })
  await expect(show).toBeVisible()
  await expect(show).toContainText('1 / 2')
  await expect(show).toContainText('Quarterly review')
  await page.keyboard.press('ArrowRight')
  await expect(show).toContainText('2 / 2')
  await page.screenshot({ path: join(__dirname, 'shots/13-slides-present.png') })
  await page.keyboard.press('ArrowRight')
  await expect(show).toContainText('End of slide show')
  await page.keyboard.press('Escape')
  await expect(show).toBeHidden()
})

test('saves a .pptx that PowerPoint can read and reopens it', async () => {
  const out = join(dir, 'review.pptx')
  await stubSaveDialog(app, out)
  await page.keyboard.press('Control+s')
  await expect(page.getByText('· Saved')).toBeVisible()

  const zip = await JSZip.loadAsync(readFileSync(out))
  const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string')
  const slide2 = await zip.file('ppt/slides/slide2.xml')!.async('string')
  expect(slide1).toContain('Quarterly review')
  expect(slide2).toContain('Two new markets')
  expect(slide2).toContain('Go!')

  await page.getByTitle('Home').click()
  await stubOpenDialog(app, out)
  await page.keyboard.press('Control+o')
  await expect(thumbs()).toHaveCount(2)
  await thumbs().nth(1).click()
  await expect(stage()).toContainText('Two new markets')
  await expect(page.getByLabel('Speaker notes')).toHaveValue('Mention the two markets')
})

test('exports a PDF with one page per slide', async () => {
  const pdf = join(dir, 'review.pdf')
  await stubSaveDialog(app, pdf)
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: 'Export to PDF' }).click()
  await expect.poll(() => existsSync(pdf), { timeout: 10_000 }).toBe(true)
  const text = readFileSync(pdf).toString('latin1')
  expect(text.startsWith('%PDF-')).toBe(true)
  expect(text.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(2)
})

test('slide sorter, duplicate and delete', async () => {
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByTitle('Slide sorter').click()
  const sorter = page.getByRole('listbox', { name: 'Slide sorter' })
  await expect(sorter.getByRole('option')).toHaveCount(2)
  await sorter.getByRole('option').first().dblclick()
  await expect(stage()).toBeVisible()
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await page.getByTitle('Duplicate', { exact: true }).click()
  await expect(thumbs()).toHaveCount(3)
  await page.getByTitle('Delete slide').click()
  await expect(thumbs()).toHaveCount(2)
})
