import { test, expect, type Page } from '@playwright/test'

function trackConsole(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

test('playground has one h1 and four headed cards, no console errors', async ({ page }) => {
  const errors = trackConsole(page)
  await page.goto('playground/')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('[data-playground-card]')).toHaveCount(4)
  await expect(page.locator('[data-playground-card] h2')).toHaveCount(4)
  await page.locator('[data-tile-physics]').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-bodies="12"]')).toBeVisible({ timeout: 5000 })
  expect(errors).toEqual([])
})

test('bear buddy mood button cycles data-mood', async ({ page }) => {
  await page.goto('playground/')
  const buddy = page.locator('[data-bear-buddy]')
  await expect(buddy).toBeVisible()
  const before = await buddy.getAttribute('data-mood')
  await page.getByRole('button', { name: /mood/i }).click()
  await expect(buddy).not.toHaveAttribute('data-mood', before ?? '')
  const second = await buddy.getAttribute('data-mood')
  await page.getByRole('button', { name: /mood/i }).click()
  await expect(buddy).not.toHaveAttribute('data-mood', second ?? '')
})

test('bear buddy pupils follow the pointer when motion is on', async ({ page }) => {
  await page.goto('playground/')
  const pupil = page.locator('[data-pupil]').first()
  await expect(pupil).toBeVisible()
  const before = await pupil.getAttribute('transform')
  const box = await page.locator('[data-bear-buddy]').boundingBox()
  await page.mouse.move(box!.x + box!.width / 2 + 200, box!.y + box!.height / 2 + 100)
  await expect.poll(() => pupil.getAttribute('transform')).not.toBe(before)
})

test('with motion off the pupils stay still', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('bear-motion', 'off'))
  const page = await context.newPage()
  await page.goto('playground/')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
  const pupil = page.locator('[data-pupil]').first()
  await expect(pupil).toBeVisible()
  const before = await pupil.getAttribute('transform')
  const box = await page.locator('[data-bear-buddy]').boundingBox()
  await page.mouse.move(box!.x + 10, box!.y + 10)
  await page.mouse.move(box!.x + box!.width + 100, box!.y + box!.height + 100)
  await page.waitForTimeout(200)
  expect(await pupil.getAttribute('transform')).toBe(before)
  await context.close()
})

test('tile physics makes 12 bodies and Reset keeps them', async ({ page }) => {
  await page.goto('playground/')
  await page.locator('[data-tile-physics]').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-bodies="12"]')).toBeVisible({ timeout: 5000 })
  await page.getByRole('button', { name: /reset/i }).first().click()
  await expect(page.locator('[data-bodies="12"]')).toBeVisible()
})

test('wheel over the tile canvas is not default-prevented', async ({ page }) => {
  await page.goto('playground/')
  await page.locator('[data-tile-physics]').scrollIntoViewIfNeeded()
  await expect(page.locator('[data-bodies="12"]')).toBeVisible({ timeout: 5000 })
  const prevented = await page.locator('canvas.tp__canvas').evaluate((el) => {
    const ev = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
    el.dispatchEvent(ev)
    return ev.defaultPrevented
  })
  expect(prevented).toBe(false)
})

test('failed matter-js load shows the fallback message', async ({ page }) => {
  await page.route(/matter/i, (route) => route.abort())
  await page.goto('playground/')
  await page.locator('[data-playground-card]').nth(1).scrollIntoViewIfNeeded()
  await expect(page.locator('[data-island-failed="tile-physics"]')).toContainText("This one didn't load")
})

test('mini sheet evaluates a formula and surfaces errors', async ({ page }) => {
  const errors = trackConsole(page)
  await page.goto('playground/')
  await page.locator('[data-mini-demos]').scrollIntoViewIfNeeded()
  await expect(page.getByRole('tab', { name: 'Mini sheet' })).toHaveAttribute('aria-selected', 'true')
  await page.getByLabel('A1', { exact: true }).fill('2')
  await page.getByLabel('B1', { exact: true }).fill('3')
  await page.getByLabel('C1', { exact: true }).fill('=A1*B1')
  await expect(page.locator('[data-cell-result="C1"]')).toHaveText('6')
  await page.getByLabel('A2', { exact: true }).fill('=A2')
  await expect(page.locator('[data-cell-result="A2"]')).toHaveText('#CYCLE!')
  expect(errors).toEqual([])
})

test('tabs switch panels and the doodle canvas draws and clears', async ({ page }) => {
  await page.goto('playground/')
  await page.locator('[data-mini-demos]').scrollIntoViewIfNeeded()
  await page.getByRole('tab', { name: 'Doodle' }).click()
  await expect(page.getByRole('tab', { name: 'Doodle' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Mini sheet' })).toHaveAttribute('aria-selected', 'false')
  await expect(page.locator('canvas.doodle__canvas')).toBeVisible()
  await expect(page.locator('.doodle__swatch')).toHaveCount(12)
  const box = await page.locator('canvas.doodle__canvas').boundingBox()
  await page.mouse.move(box!.x + 20, box!.y + 20)
  await page.mouse.down()
  await page.mouse.move(box!.x + 80, box!.y + 60)
  await page.mouse.up()
  await expect(page.locator('[data-doodle-strokes="1"]')).toBeVisible()
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.locator('[data-doodle-strokes="0"]')).toBeVisible()
})

test('checking all four tasks celebrates with bounded confetti', async ({ page }) => {
  await page.goto('playground/')
  await page.locator('[data-mini-demos]').scrollIntoViewIfNeeded()
  await page.getByRole('tab', { name: 'Tasks' }).click()
  const boxes = page.getByRole('checkbox')
  await expect(boxes).toHaveCount(4)
  for (let i = 0; i < 4; i++) await boxes.nth(i).check()
  await expect(page.locator('[data-confetti]')).toBeVisible()
  expect(await page.locator('[data-confetti] span').count()).toBeLessThanOrEqual(40)
  await expect(page.locator('[data-confetti]')).toHaveCount(0, { timeout: 4000 })
})

test('with motion off, finishing the tasks shows static text', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('bear-motion', 'off'))
  const page = await context.newPage()
  await page.goto('playground/')
  await page.locator('[data-mini-demos]').scrollIntoViewIfNeeded()
  await page.getByRole('tab', { name: 'Tasks' }).click()
  const boxes = page.getByRole('checkbox')
  for (let i = 0; i < 4; i++) await boxes.nth(i).check()
  await expect(page.getByText(/All done!/)).toBeVisible()
  await expect(page.locator('[data-confetti]')).toHaveCount(0)
  await context.close()
})

test('failed miniSheet import shows the fallback message', async ({ page }) => {
  await page.route(/miniSheet/i, (route) => route.abort())
  await page.goto('playground/')
  await page.locator('[data-playground-card]').nth(2).scrollIntoViewIfNeeded()
  await expect(page.locator('[data-island-failed="mini-sheet"]')).toContainText("This one didn't load")
})

test('playground has no horizontal scroll at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('playground/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

const setSpeed = (page: Page, value: string) =>
  page.getByLabel('Animation speed').evaluate((el, v) => {
    const input = el as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)

const htmlSpeed = (page: Page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue('--motion-speed'))

test('theme mixer speed slider sets --motion-speed, survives reload, and Reset restores 1', async ({ page }) => {
  await page.goto('playground/')
  await page.getByLabel('Animation speed').scrollIntoViewIfNeeded()
  await expect(page.getByLabel('Animation speed')).toBeEnabled()
  await setSpeed(page, '1.5')
  await expect.poll(() => htmlSpeed(page)).toBe('1.5')
  await page.reload()
  // applied by the head script before any island hydrates
  expect(await htmlSpeed(page)).toBe('1.5')
  await page.getByRole('button', { name: 'Reset mix' }).click()
  await expect.poll(() => htmlSpeed(page)).toBe('1')
  await page.reload()
  // nothing saved any more, so the stylesheet default applies
  expect(await htmlSpeed(page)).toBe('')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-speed').trim())).toBe('1')
})

test('a garbage saved mix is ignored without console errors', async ({ page }) => {
  const errors = trackConsole(page)
  await page.addInitScript(() => localStorage.setItem('bear-mix', 'garbage'))
  await page.goto('playground/')
  await page.getByLabel('Animation speed').scrollIntoViewIfNeeded()
  await expect(page.getByLabel('Animation speed')).toHaveValue('1')
  expect(await htmlSpeed(page)).toBe('')
  expect(errors).toEqual([])
})

test('Surprise me persists a readable mix', async ({ page }) => {
  await page.goto('playground/')
  await page.getByRole('button', { name: 'Surprise me' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Surprise me' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bear-mix'))).not.toBeNull()
})
