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

test('print uses dark ink on white even when the saved theme is dark', async ({ page }) => {
  await page.goto('./')
  await page.emulateMedia({ media: 'print' })
  const { color, canvas, bar } = await page.evaluate(() => ({
    color: getComputedStyle(document.body).color,
    canvas: getComputedStyle(document.querySelector('canvas.starfield')!).display,
    bar: getComputedStyle(document.querySelector('header.topbar')!).display
  }))
  const lum = (rgb: string): number => {
    const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number)
    const f = (v: number): number => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  expect(1.05 / (lum(color) + 0.05)).toBeGreaterThanOrEqual(4.5)
  expect(canvas).toBe('none')
  expect(bar).toBe('none')
})

test('the starfield keeps its stars when only the height changes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bear-motion', 'off'))
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('./')
  const canvas = page.locator('canvas.starfield')
  await expect(canvas).toHaveAttribute('data-stars', /.+/)
  const before = await canvas.getAttribute('data-stars')
  await page.setViewportSize({ width: 390, height: 700 })
  // The resize is debounced; wait until the canvas bitmap has actually been resized instead of sleeping a fixed time.
  const dpr = await page.evaluate(() => Math.min(window.devicePixelRatio || 1, 2))
  await expect.poll(() => canvas.evaluate((c) => (c as HTMLCanvasElement).height)).toBe(Math.round(700 * dpr))
  const after = await canvas.getAttribute('data-stars')
  // Compare star by star (the fingerprint lists the first six stars in a fixed order):
  // a star that was already inside the shorter viewport keeps its place, and one that was below the new bottom edge
  // is moved up into view. Filtering by y first would be flaky, because those moved stars would then join the "kept" set.
  const stars = (s: string): { x: number; y: number }[] =>
    s.split(';').map((p) => {
      const [x, y] = p.split(',').map(Number)
      return { x, y }
    })
  const b = stars(before!)
  const a = stars(after!)
  expect(a).toHaveLength(b.length)
  b.forEach((star, i) => {
    if (star.y <= 700) expect(a[i]).toEqual(star)
    else expect(a[i].y).toBeLessThanOrEqual(700)
  })
  // A width change does rebuild.
  await page.setViewportSize({ width: 500, height: 700 })
  await expect.poll(() => canvas.getAttribute('data-stars')).not.toBe(after)
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
