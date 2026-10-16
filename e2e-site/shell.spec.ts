import { test, expect } from '@playwright/test'

test('motion toggle sets data-motion, persists and updates aria-pressed', async ({ page }) => {
  await page.goto('./')
  const toggle = page.locator('[data-motion-toggle]').first()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
  const again = page.locator('[data-motion-toggle]').first()
  await expect(again).toHaveAttribute('aria-pressed', 'false')
  await expect(again.getByText('Motion off')).toBeVisible()
  await expect(again.getByText('Motion on')).toBeHidden()
})

test('saved-off shows the right label before scripts run', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => localStorage.setItem('bear-motion', 'off'))
  const page = await context.newPage()
  // Strip the bundled module scripts so only the inline head script has run.
  await page.route('**/Bear/', async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/<script type="module">[\s\S]*?<\/script>/g, '')
    await route.fulfill({ response, body })
  })
  await page.goto('./')
  const toggle = page.locator('[data-motion-toggle]').first()
  await expect(toggle.getByText('Motion off')).toBeVisible()
  await expect(toggle.getByText('Motion on')).toBeHidden()
  await context.close()
})

test('reduced motion starts with data-motion off', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('./')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
  await context.close()
})

test('no horizontal scroll at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  for (const path of ['./', 'tour/']) {
    await page.goto(path)
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(375)
  }
})

test('menu button opens the nav sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('./')
  const menu = page.getByRole('button', { name: 'Menu' })
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#nav-sheet')).toBeVisible()
  await expect(page.locator('#nav-sheet').getByRole('link', { name: 'Tour' })).toBeVisible()
})

test('404 page links home', async ({ page }) => {
  await page.goto('nope/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/lost/i)
  await expect(page.locator('main a[href="/Bear/"]')).toBeVisible()
})

test('a fresh visitor gets the dark theme', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('[data-theme-toggle]').first()).toHaveAttribute('aria-pressed', 'false')
})

test('theme toggle switches to light and survives a reload', async ({ page }) => {
  await page.goto('./')
  const toggle = page.locator('[data-theme-toggle]').first()
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle.getByText('Dark theme')).toBeVisible()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('[data-theme-toggle]').first()).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-theme-toggle]').first().click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('a saved light theme is applied before the first DOMContentLoaded', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    localStorage.setItem('bear-theme', 'light')
    document.addEventListener('DOMContentLoaded', () => {
      ;(window as unknown as { __themeAtDcl: string | undefined }).__themeAtDcl = document.documentElement.dataset.theme
    })
  })
  const page = await context.newPage()
  // Strip the bundled module scripts so only the inline head script has run.
  await page.route('**/Bear/', async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/<script type="module">[\s\S]*?<\/script>/g, '')
    await route.fulfill({ response, body })
  })
  await page.goto('./')
  expect(await page.evaluate(() => (window as unknown as { __themeAtDcl: string }).__themeAtDcl)).toBe('light')
  await expect(page.locator('[data-theme-toggle]').first().getByText('Dark theme')).toBeVisible()
  await context.close()
})

test('a saved light theme has the toggle pressed at DOMContentLoaded, before any bundle runs', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    localStorage.setItem('bear-theme', 'light')
    document.addEventListener('DOMContentLoaded', () => {
      ;(window as unknown as { __pressedAtDcl: (string | null)[] }).__pressedAtDcl = [...document.querySelectorAll('[data-theme-toggle]')].map((b) =>
        b.getAttribute('aria-pressed')
      )
    })
  })
  const page = await context.newPage()
  await page.route('**/Bear/', async (route) => {
    const response = await route.fetch()
    const body = (await response.text()).replace(/<script type="module">[\s\S]*?<\/script>/g, '')
    await route.fulfill({ response, body })
  })
  await page.goto('./')
  const pressed = await page.evaluate(() => (window as unknown as { __pressedAtDcl: (string | null)[] }).__pressedAtDcl)
  expect(pressed.length).toBeGreaterThan(0)
  expect(pressed.every((v) => v === 'true')).toBe(true)
  await context.close()
})

test('the top bar is translucent glass', async ({ page }) => {
  await page.goto('./')
  const filter = await page.locator('header.topbar').evaluate((el) => getComputedStyle(el).backdropFilter)
  expect(filter).toContain('blur')
})

test('home draws a running starfield that pauses with the motion toggle', async ({ page }) => {
  await page.goto('./')
  const canvas = page.locator('canvas.starfield')
  await expect(canvas).toHaveAttribute('data-state', 'running')
  await expect(canvas).toHaveAttribute('aria-hidden', 'true')
  await page.locator('[data-motion-toggle]').first().click()
  await expect(canvas).toHaveAttribute('data-state', 'paused')
  await page.locator('[data-motion-toggle]').first().click()
  await expect(canvas).toHaveAttribute('data-state', 'running')
})

test('calm docs pages render no starfield', async ({ page }) => {
  await page.goto('./docs/get-started/install/')
  await expect(page.locator('canvas.starfield')).toHaveCount(0)
})

test('footer carries the independence note', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('footer')).toContainText(
    'Bear is an independent project. It is not affiliated with or endorsed by Microsoft.'
  )
})
