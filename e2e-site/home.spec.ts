import { test, expect } from '@playwright/test'
import { gzipSync } from 'node:zlib'

test('hero headline', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText('Your office suite, no subscription.')
})

test('app strip links every app to the tour', async ({ page }) => {
  await page.goto('./')
  const links = page.locator('[data-app-strip] a')
  await expect(links).toHaveCount(12)
  await expect(links.filter({ hasText: 'Sheets' }).first()).toHaveAttribute('href', /tour\/#sheets$/)
})

test('why-bear cards reveal on scroll', async ({ page }) => {
  await page.goto('./')
  const cards = page.locator('[data-why] [data-reveal]')
  await expect(cards).toHaveCount(4)
  await page.locator('[data-why]').scrollIntoViewIfNeeded()
  await page.mouse.wheel(0, 200)
  for (const card of await cards.all()) await expect(card).toHaveClass(/is-visible/)
})

test('download buttons link to the download page', async ({ page }) => {
  await page.goto('./')
  const buttons = page.getByRole('link', { name: 'Download Bear' })
  expect(await buttons.count()).toBeGreaterThanOrEqual(2)
  for (const b of await buttons.all()) await expect(b).toHaveAttribute('href', '/Bear/download/')
})

test('comparison table compares against a generic suite', async ({ page }) => {
  await page.goto('./')
  const table = page.locator('table')
  await expect(table).toContainText('typical subscription suite')
  await expect(table.locator('tbody tr')).toHaveCount(4)
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
