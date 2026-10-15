import { test, expect, type Page } from '@playwright/test'

const READY = ['write', 'sheets', 'slides', 'notes', 'mail', 'sites', 'board', 'tasks']

function trackConsole(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

test('deep link opens a panel with the demo', async ({ page }) => {
  await page.goto('tour/#sheets')
  const panel = page.locator('[data-panel]')
  await expect(panel).toContainText('Sheets')
  await expect(panel.locator('[data-demo="sheets"]')).toBeVisible()
  await expect(page.locator('[data-tile="sheets"]')).toHaveAttribute('aria-expanded', 'true')
})

test('Escape closes the panel and focuses the tile', async ({ page }) => {
  await page.goto('tour/#sheets')
  await expect(page.locator('[data-panel]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-panel]')).toHaveCount(0)
  await expect(page.locator('[data-tile="sheets"]')).toBeFocused()
})

test('clicking a tile updates the hash', async ({ page }) => {
  await page.goto('tour/')
  await page.locator('[data-tile="write"]').click()
  await expect(page).toHaveURL(/tour\/#write$/)
  await expect(page.locator('[data-panel] [data-demo="write"]')).toBeVisible()
})

test('unknown hash is ignored', async ({ page }) => {
  const errors = trackConsole(page)
  await page.goto('tour/#nope')
  await expect(page.locator('[data-tile]')).toHaveCount(12)
  await expect(page.locator('[data-panel]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('coming-soon app shows the sleeping bear and no guide link', async ({ page }) => {
  await page.goto('tour/#chat')
  const panel = page.locator('[data-panel]')
  await expect(panel).toContainText('Coming soon')
  await expect(panel.locator('[data-demo="sleeping"]')).toBeVisible()
  await expect(panel.getByRole('link', { name: /Read the guide/ })).toHaveCount(0)
})

test('ready app links to its guide', async ({ page }) => {
  await page.goto('tour/#mail')
  await expect(page.getByRole('link', { name: /Read the guide/ })).toHaveAttribute('href', '/Bear/docs/apps/mail/')
})

test('arrow keys move focus across the grid', async ({ page }) => {
  await page.goto('tour/')
  await page.locator('[data-tile="write"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-tile="sheets"]')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-tile="write"]')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-panel]')).toBeVisible()
})

test('with JavaScript off the static list shows all 12 apps', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('tour/')
  const items = page.locator('[data-tour-static] > li')
  await expect(items).toHaveCount(12)
  await expect(items.first()).toBeVisible()
  await context.close()
})

test('static list is hidden once JavaScript runs', async ({ page }) => {
  await page.goto('tour/')
  await expect(page.locator('[data-tour-static]')).toBeHidden()
})

test('open bottom sheet stays above the footer and starfield', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await page.goto('tour/#write')
  const panel = page.locator('[data-panel]')
  await expect(panel).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const hit = await page.evaluate(() => {
    const p = document.querySelector('.picker__panel')!.getBoundingClientRect()
    const el = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2)
    return !!el?.closest('.picker__panel')
  })
  expect(hit).toBe(true)
  const pe = await page.locator('canvas.starfield').evaluate((el) => getComputedStyle(el).pointerEvents)
  expect(pe).toBe('none')
})

test('no horizontal scroll at phone width, and panel is a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('tour/#write')
  const panel = page.locator('[data-panel]')
  await expect(panel).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
})

for (const id of READY) {
  test(`${id} opens without console errors`, async ({ page }) => {
    const errors = trackConsole(page)
    await page.goto('tour/')
    await page.locator(`[data-tile="${id}"]`).click()
    await expect(page.locator(`[data-panel] [data-demo="${id}"]`)).toBeVisible()
    await page.waitForTimeout(300)
    expect(errors).toEqual([])
  })
}

test('motion off renders demos without error', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = trackConsole(page)
  await page.goto('tour/#board')
  await expect(page.locator('[data-demo="board"]')).toBeVisible()
  expect(errors).toEqual([])
  await context.close()
})
