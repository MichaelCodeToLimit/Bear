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
  await page.getByRole('button', { name: /reset/i }).click()
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

test('playground has no horizontal scroll at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('playground/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})
