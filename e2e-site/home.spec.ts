import { test, expect } from '@playwright/test'
import { gzipSync } from 'node:zlib'

test('hero: pill, headline with gradient line, one h1', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toContainText('Your office suite.')
  await expect(page.locator('h1 .grad')).toHaveText('No subscription.')
  await expect(page.locator('.hero a.pill')).toHaveAttribute('href', /docs\/apps\/mail\/$/)
})

test('product window shows the Bear apps panel with five Open links', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await expect(page.locator('.product-window')).toBeVisible()
  const links = page.locator('.apps-panel a')
  await expect(links).toHaveCount(5)
  const ids = ['write', 'sheets', 'slides', 'notes', 'mail']
  for (let i = 0; i < ids.length; i++) await expect(links.nth(i)).toHaveAttribute('href', new RegExp(`tour/#${ids[i]}$`))
})

test('marquee lists formats and pauses with the motion toggle', async ({ page }) => {
  await page.goto('./')
  const marquee = page.locator('.marquee')
  for (const t of ['.docx', '.xlsx', '.pptx', 'IMAP', 'Linux', 'Android']) await expect(marquee).toContainText(t)
  const track = page.locator('.marquee__track')
  await expect(track).toHaveCSS('animation-play-state', 'running')
  await page.locator('[data-motion-toggle]').first().click()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
  await expect(track).toHaveCSS('animation-play-state', 'paused')
})

test('SUM counter runs its own animation and no @keyframes name is defined twice', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.edit__stack')).toHaveCSS('animation-name', 'how-sum-tick')
  const names = await page.evaluate(() => {
    const out: string[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) if (rule instanceof CSSKeyframesRule) out.push(rule.name)
    }
    return out
  })
  expect(names.length).toBeGreaterThan(5)
  expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([])
})

test('diagram labels are readable and nodes do not overlap at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('./')
  const nodes = page.locator('.suite-diagram .node')
  expect(parseFloat(await nodes.first().evaluate((n) => getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(10.4)
  const boxes = (await nodes.all()).length ? await nodes.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON())) : []
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
      expect(overlap, `${i} vs ${j}`).toBe(false)
    }
})

test('how it works has three cards', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.how-card')).toHaveCount(3)
})

test('suite diagram links all 13 apps and marks the 4 not ready as soon', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.suite-diagram a[href*="tour/#"]')).toHaveCount(13)
  await expect(page.locator('.suite-diagram a[data-soon]')).toHaveCount(4)
  await expect(page.locator('#suite-title')).toHaveText('Thirteen apps. One download.')
})

test('the hero and final CTA each have one plain Download button linking to the full download page', async ({ page }) => {
  await page.goto('./')
  for (const section of ['.hero', '.cta']) {
    const download = page.locator(`${section} a.btn--primary`)
    await expect(download, `${section} has exactly one primary button`).toHaveCount(1)
    await expect(download).toHaveText('Download')
    await expect(download).toHaveAttribute('href', '/Bear/download/')
  }
  // The platform-specific buttons live on the Download page only.
  await expect(page.getByText('Download for Windows')).toHaveCount(0)
  await expect(page.getByText('.msi for IT')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Other systems/ })).toHaveCount(0)
  await expect(page.locator('header.topbar').getByRole('link', { name: /^Download/ }).first()).toHaveAttribute('href', '/Bear/download/')
})

test('the hero buttons sit side by side at the same height at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  const primary = await page.locator('.hero a.btn--primary').boundingBox()
  const ghost = await page.locator('.hero__actions a.btn--ghost').first().boundingBox()
  expect(primary && ghost).toBeTruthy()
  expect(ghost!.height).toBeLessThanOrEqual(primary!.height * 1.3)
  expect(Math.abs(ghost!.y - primary!.y)).toBeLessThan(primary!.height)
})

test('with JavaScript off and reduced motion, the marquee is paused', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4321/Bear/')
  await expect(page.locator('.marquee__track')).toHaveCSS('animation-play-state', 'paused')
  await context.close()
})

test('home has no horizontal scroll at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('./')
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(0)
})

test('home ships at most 60 KB of gzipped JavaScript', async ({ page }) => {
  const bodies: Buffer[] = []
  page.on('response', async (res) => {
    if (res.url().split('?')[0].endsWith('.js')) bodies.push(await res.body())
  })
  await page.goto('./', { waitUntil: 'networkidle' })
  // Astro inlines small scripts into the HTML, so count those too.
  const inline = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script:not([src])')).map((s) => s.textContent ?? '')
  )
  const total =
    bodies.reduce((sum, b) => sum + gzipSync(b).length, 0) +
    inline.reduce((sum, s) => sum + gzipSync(s).length, 0)
  console.log(`home js gzipped bytes: ${total}`)
  expect(total).toBeLessThanOrEqual(60 * 1024)
})

test('the Bear Studio band introduces Photo and links to its tour entry and guide', async ({ page }) => {
  await page.goto('./')
  const band = page.locator('[data-studio-band]')
  await expect(band.locator('.eyebrow')).toHaveText('Bear Studio')
  await expect(band.locator('h2')).toHaveText('Creative apps, free forever. First up: Photo.')
  await expect(band.getByRole('link', { name: 'See Photo in the tour' })).toHaveAttribute('href', '/Bear/tour/#photo')
  await expect(band.getByRole('link', { name: 'Read the Photo guide' })).toHaveAttribute('href', '/Bear/docs/apps/photo/')
  await expect(band).not.toContainText(/Adobe|Photoshop/)
})

test('the Bear Studio band fits a phone in dark and light', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  for (const theme of ['dark', 'light']) {
    await page.goto('./')
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    const box = await page.locator('[data-studio-band]').boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  }
})

test('the Bear Studio stroke stops animating with motion off', async ({ page }) => {
  await page.goto('./')
  const stroke = page.locator('.studio__stroke path')
  await expect(stroke).toHaveCSS('animation-name', 'studio-paint')
  await page.locator('[data-motion-toggle]').first().click()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off')
  await expect(stroke).toHaveCSS('animation-name', 'none')
})
