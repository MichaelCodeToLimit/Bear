import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { close, launch, stubOpenDialog, stubSaveDialog } from './helpers'

test.describe.configure({ mode: 'serial' })

let app: ElectronApplication
let page: Page
let dir: string

test.beforeAll(async () => {
  ;({ app, page, dir } = await launch())
})

test.afterAll(() => close(app))

const grid = () => page.locator('[data-grid]')
const formulaBar = () => page.getByLabel('Formula bar')
const nameBox = () => page.getByLabel('Name box')
/** Displayed values come from the (hidden) print table, since cells are drawn on a canvas. */
const printed = () => page.locator('.sheet-print')

async function goTo(ref: string) {
  await nameBox().fill(ref)
  await nameBox().press('Enter')
}

test('opens Sheets and computes formulas as you type', async () => {
  await page.getByRole('button', { name: /Sheets Spreadsheets/ }).click()
  await expect(grid()).toBeVisible()
  await expect(nameBox()).toHaveValue('A1')

  await grid().click({ position: { x: 100, y: 40 } }) // A1
  await page.keyboard.type('Item')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Cost')
  await page.keyboard.press('Enter')
  await goTo('A2')
  for (const [item, cost] of [['Rent', '1200'], ['Food', '350.5'], ['Fun', '15%']]) {
    await page.keyboard.type(item)
    await page.keyboard.press('Tab')
    await page.keyboard.type(cost)
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowLeft')
  }
  await goTo('B5')
  await page.keyboard.type('=SUM(B2:B3')  // missing ")" is closed automatically
  await page.keyboard.press('Enter')

  await goTo('B5')
  await expect(formulaBar()).toHaveValue('=SUM(B2:B3)')
  await expect(printed()).toContainText('1550.5')
  await expect(printed()).toContainText('15%') // auto-detected percent format
  await expect(page.getByText('· Edited')).toBeVisible()
})

test('formats cells and shows selection stats', async () => {
  await goTo('B2:B3')
  await expect(page.getByText('Sum: 1550.5')).toBeVisible()
  await expect(page.getByText('Count: 2')).toBeVisible()
  await page.getByTitle('Currency').click()
  await expect(printed()).toContainText('$1,200.00')

  await goTo('A1:B1')
  await grid().press('Control+b')
  await page.screenshot({ path: join(__dirname, 'shots/05-sheets.png') })
})

test('fill handle extends a series', async () => {
  await goTo('D1')
  await page.keyboard.type('1')
  await page.keyboard.press('Enter')
  await page.keyboard.type('2')
  await page.keyboard.press('Enter')
  await goTo('D1:D2')
  // Ctrl+D fills down from the top row of a selection; use it on a taller range for the series check.
  await goTo('D1:D2')
  const handle = await page.evaluate(() => {
    const c = document.querySelector('[data-grid] canvas') as HTMLCanvasElement
    const r = c.getBoundingClientRect()
    return { x: r.left, y: r.top }
  })
  // D2's bottom-right corner: header 46 + 3 cols * 88, header 24 + 2 rows * 24.
  const hx = handle.x + 46 + 4 * 88 - 1
  const hy = handle.y + 24 + 2 * 24 - 1
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  await page.mouse.move(hx, hy + 24 * 3, { steps: 4 })
  await page.mouse.up()
  await goTo('D5')
  await expect(formulaBar()).toHaveValue('5')
})

test('Max with no nearby numbers lets you drag a range into the formula', async () => {
  await goTo('G6')
  await page.getByRole('button', { name: 'Formulas', exact: true }).click()
  await page.getByTitle('Max', { exact: true }).click()
  const cellEditor = page.getByLabel('Cell editor')
  await expect(cellEditor).toHaveValue('=MAX(')
  // Drag from B2 to B3 on the canvas while the formula is open.
  const box = (await grid().locator('canvas').boundingBox())!
  const cellCenter = (col: number, row: number) => ({ x: box.x + 46 + col * 88 + 44, y: box.y + 24 + row * 24 + 12 })
  const from = cellCenter(1, 1)
  const to = cellCenter(1, 2)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 3 })
  await page.mouse.up()
  await expect(cellEditor).toHaveValue('=MAX(B2:B3')
  await page.keyboard.press('Enter')
  await goTo('G6')
  await expect(formulaBar()).toHaveValue('=MAX(B2:B3)')
  await expect(printed()).toContainText('1200')
})

test('inserts a chart from the selection', async () => {
  await goTo('A1:B3')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByTitle('Column', { exact: true }).click()
  await expect(page.locator('[data-chart]')).toHaveCount(1)
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Chart' })).toBeVisible()
  await page.getByLabel('Chart title').fill('Costs')
  await page.screenshot({ path: join(__dirname, 'shots/06-sheets-chart.png') })
  await grid().click({ position: { x: 100, y: 300 } })
})

test('adds, renames and undoes sheets', async () => {
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet2' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Sheet2' }).dblclick()
  await page.getByLabel('Sheet name').fill('Notes')
  await page.getByLabel('Sheet name').press('Enter')
  await expect(page.getByRole('tab', { name: 'Notes' })).toBeVisible()
  await grid().press('Control+z')
  await expect(page.getByRole('tab', { name: 'Sheet2' })).toBeVisible()
  await grid().press('Control+z')
  await expect(page.getByRole('tab')).toHaveCount(1)
})

test('saves .xlsx that other spreadsheet apps can read, and reopens it', async () => {
  const out = join(dir, 'budget.xlsx')
  await stubSaveDialog(app, out)
  await grid().press('Control+s')
  await expect(page.getByText('· Saved')).toBeVisible()

  const xl = new ExcelJS.Workbook()
  await xl.xlsx.load(readFileSync(out).buffer as ArrayBuffer)
  const ws = xl.worksheets[0]
  expect(ws.getCell('B5').value).toEqual({ formula: 'SUM(B2:B3)', result: 1550.5 })
  expect(ws.getCell('B2').numFmt).toBe('$#,##0.00')
  expect(ws.getCell('A1').font.bold).toBe(true)
  expect(ws.getCell('D5').value).toBe(5)

  // Reopen through the File view.
  await stubOpenDialog(app, out)
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: 'Browse…' }).click()
  await expect(page.locator('[data-chart]')).toHaveCount(1)
  await goTo('B5')
  await expect(formulaBar()).toHaveValue('=SUM(B2:B3)')
})

test('opens a template and a CSV from home', async () => {
  await page.getByTitle('Home').click()
  await expect(page.getByText('New spreadsheet')).toBeVisible()
  await page.getByRole('button', { name: 'Monthly budget template' }).click()
  await expect(printed()).toContainText('$2,720.00')
  await expect(page.locator('[data-chart]')).toHaveCount(1)

  const csv = join(dir, 'people.csv')
  writeFileSync(csv, 'name,age\r\n"Smith, Jo",41\r\nAl,7\r\n')
  await stubOpenDialog(app, csv)
  await grid().press('Control+o')
  await expect(printed()).toContainText('Smith, Jo')
  await goTo('B2')
  await expect(formulaBar()).toHaveValue('41')
  await page.screenshot({ path: join(__dirname, 'shots/07-sheets-csv.png') })
})
