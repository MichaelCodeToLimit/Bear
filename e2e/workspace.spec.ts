import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { close, launch } from './helpers'

// Notes, Tasks, Board and Sites keep their data in Bear's data folder (saved automatically).
test.describe.configure({ mode: 'serial' })

let app: ElectronApplication
let page: Page
let dir: string

test.beforeAll(async () => {
  ;({ app, page, dir } = await launch())
})

test.afterAll(() => close(app))

const home = async () => {
  await page.getByTitle('Home').click()
  await expect(page.getByText('Apps', { exact: true })).toBeVisible()
}

const saved = () => expect(page.locator('header').getByText('· Saved')).toBeVisible({ timeout: 5000 })

test('Tasks: lists, details, importance, completion and the board', async () => {
  await page.getByRole('button', { name: /Tasks To-dos/ }).click()
  await page.getByLabel('Add a task').fill('Call the plumber')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('row', { name: /Call the plumber/ })).toContainText('My Day')

  // A new list with a task.
  await page.getByRole('button', { name: 'New list' }).click()
  await page.getByLabel('List name').fill('Launch')
  await page.keyboard.press('Enter')
  await page.getByLabel('Add a task').fill('Write the press release')
  await page.keyboard.press('Enter')
  await page.getByLabel('Add a task').fill('Book the venue')
  await page.keyboard.press('Enter')

  // Details: a step, a due date, a note, importance.
  await page.getByRole('row', { name: /Write the press release/ }).click()
  const details = page.getByRole('complementary', { name: 'Task details' })
  await details.getByLabel('Add step').fill('Draft')
  await details.getByLabel('Add step').press('Enter')
  await details.getByLabel('Due date').fill('2030-01-15')
  await details.getByLabel('Notes').fill('Ask Sam for quotes')
  await details.getByRole('button', { name: 'Mark as important' }).click()
  await expect(page.getByRole('row', { name: /Write the press release/ })).toContainText('0 of 1')

  await page.getByRole('button', { name: /^Important/ }).click()
  await expect(page.getByRole('row', { name: /Write the press release/ })).toBeVisible()

  // Board: drag a card to In progress; completing moves it to Done.
  await page.getByRole('button', { name: /^Launch/ }).click()
  await page.getByRole('button', { name: 'Board' }).click()
  const card = page.getByRole('article', { name: 'Book the venue' })
  await card.dragTo(page.getByRole('region', { name: 'Column In progress' }))
  await expect(page.getByRole('region', { name: 'Column In progress' }).getByRole('article')).toHaveCount(1)
  await page.getByRole('region', { name: 'Column In progress' }).getByRole('checkbox').click()
  await expect(page.getByRole('region', { name: 'Column Done' }).getByRole('article', { name: 'Book the venue' })).toBeVisible()
  await page.screenshot({ path: join(__dirname, 'shots/14-tasks-board.png') })

  // Delete with undo.
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.getByRole('row', { name: /Write the press release/ }).click()
  await page.getByRole('button', { name: 'Delete task' }).click()
  await expect(page.getByRole('row', { name: /Write the press release/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('row', { name: /Write the press release/ })).toBeVisible()
  await saved()
  await home()
})

test('Notes: pages, sections and search', async () => {
  await page.getByRole('button', { name: /Notes Notebooks/ }).click()
  await expect(page.getByLabel('Page title')).toHaveValue('Welcome to Notes')
  await page.getByRole('button', { name: 'Add page' }).click()
  await page.getByLabel('Page title').fill('Trip ideas')
  await page.locator('.page-doc').click()
  await page.keyboard.type('Take the night train to Edinburgh')
  await page.getByRole('button', { name: 'To-do list' }).click()
  await page.keyboard.type('Book tickets')
  await expect(page.locator('.page-doc ul[data-type="taskList"]')).toHaveCount(1)

  await page.getByRole('button', { name: 'Add section' }).click()
  await page.getByLabel('Section name').fill('Work')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('navigation', { name: 'Sections' })).toContainText('Work')

  await page.getByLabel('Search notes').fill('edinburgh')
  const results = page.getByLabel('Search results')
  await expect(results).toContainText('Trip ideas')
  await results.getByRole('button').first().click()
  await expect(page.getByLabel('Page title')).toHaveValue('Trip ideas')
  await page.screenshot({ path: join(__dirname, 'shots/15-notes.png') })
  await saved()
  await home()
})

test('Board: draw on a whiteboard and see it in the gallery', async () => {
  await page.getByRole('button', { name: /Board Whiteboard/ }).click()
  await page.getByRole('button', { name: 'New board' }).click()
  await page.getByLabel('Board name').fill('Brainstorm')
  await page.getByLabel('Board name').press('Enter')
  const canvas = page.locator('[data-board] canvas.interactive')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  // Pick the Rectangle tool from Excalidraw's toolbar, then drag on the canvas.
  await page.locator('[data-board]').getByTitle(/Rectangle/).click()
  // Draw in open canvas, clear of the style panel that opens on the left.
  await page.mouse.move(box.x + 520, box.y + 250)
  await page.mouse.down()
  await page.mouse.move(box.x + 760, box.y + 400, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: join(__dirname, 'shots/16-board.png') })

  // The drawing is saved to the board's own data file.
  const dataDir = join(dir, 'userdata', 'data')
  await expect
    .poll(() => {
      const f = readdirSync(dataDir).find((n) => n.startsWith('board-'))
      return f ? readFileSync(join(dataDir, f), 'utf8') : ''
    }, { timeout: 8000 })
    .toContain('"type":"rectangle"')

  await page.getByRole('button', { name: 'All boards' }).click()
  await expect(page.getByRole('button', { name: 'Open Brainstorm' })).toBeVisible()
  // The thumbnail is rendered shortly after drawing stops.
  await expect(page.getByRole('button', { name: 'Open Brainstorm' }).locator('img')).toBeVisible({ timeout: 8000 })
  await home()
})

test('Sites: create a team site with news, links, documents and tasks', async () => {
  // A document library folder with a Word file and something Bear doesn't open.
  const library = join(dir, 'TeamDocs')
  mkdirSync(join(library, 'Contracts'), { recursive: true })
  writeFileSync(join(library, 'notes.txt'), 'Team notes file')
  writeFileSync(join(library, 'readme.dat'), 'not a format Bear opens')

  await page.getByRole('button', { name: /Sites Team sites/ }).click()
  await page.getByRole('button', { name: 'Create site' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create a site' })
  await dialog.getByLabel('Site name').fill('Marketing')
  await dialog.getByLabel('Description').fill('Campaigns and launches')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { name: 'Marketing', exact: true })).toBeVisible()

  // Quick link.
  await page.getByLabel('Link title').fill('Brand guide')
  await page.getByLabel('Link address').fill('example.com/brand')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Brand guide', exact: true })).toBeVisible()

  // News post.
  await page.getByRole('button', { name: '+ Add news' }).click()
  await page.getByLabel('Page title').fill('Spring launch is live')
  await page.locator('.page-doc').click()
  await page.keyboard.type('Thanks everyone for the hard work.')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('navigation', { name: 'Site navigation' }).getByRole('button', { name: 'Home' }).click()
  await expect(page.getByText('Spring launch is live')).toBeVisible()

  // Link the Tasks list made earlier.
  await page.getByRole('navigation', { name: 'Site navigation' }).getByRole('button', { name: 'Site settings' }).click()
  await page.getByLabel('Task list').selectOption({ label: 'Launch' })

  // Connect the document library and open a file from it in Bear.
  await app.evaluate(({ dialog: d }, p) => {
    d.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof d.showOpenDialog
  }, library)
  await page.getByRole('navigation', { name: 'Site navigation' }).getByRole('button', { name: 'Documents' }).click()
  await page.getByRole('button', { name: 'Choose folder…' }).click()
  const files = page.getByRole('list', { name: 'Files' })
  await expect(files).toContainText('Contracts')
  await expect(files).toContainText('notes.txt')

  await page.getByRole('navigation', { name: 'Site navigation' }).getByRole('button', { name: 'Home' }).click()
  await expect(page.getByText('Tasks · Launch')).toBeVisible()
  await expect(page.getByText('Write the press release')).toBeVisible()
  await page.screenshot({ path: join(__dirname, 'shots/17-sites.png') })

  await page.getByRole('navigation', { name: 'Site navigation' }).getByRole('button', { name: 'Documents' }).click()
  await files.getByRole('button', { name: /notes\.txt/ }).click()
  await expect(page.locator('.write-doc')).toContainText('Team notes file') // opened in Write
  await home()
})

test('everything is still there after restarting Bear', async () => {
  await close(app)
  ;({ app, page } = await launch(dir))

  await page.getByRole('button', { name: /Tasks To-dos/ }).click()
  await page.getByRole('button', { name: /^Launch/ }).click()
  await expect(page.getByRole('row', { name: /Write the press release/ })).toBeVisible()
  await home()

  await page.getByRole('button', { name: /Notes Notebooks/ }).click()
  await expect(page.getByLabel('Page title')).toHaveValue('Trip ideas') // reopens where you left off
  await expect(page.locator('.page-doc')).toContainText('Edinburgh')
  await home()

  await page.getByRole('button', { name: /Board Whiteboard/ }).click()
  await expect(page.getByRole('button', { name: 'Open Brainstorm' })).toBeVisible()
  await home()

  await page.getByRole('button', { name: /Sites Team sites/ }).click()
  await page.getByRole('button', { name: 'Open site Marketing' }).click()
  await expect(page.getByText('Spring launch is live')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Brand guide', exact: true })).toBeVisible()
})
