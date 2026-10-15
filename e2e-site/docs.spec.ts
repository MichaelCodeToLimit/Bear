import { test, expect } from '@playwright/test'

test('docs/ lands on the Install page', async ({ page }) => {
  await page.goto('docs/')
  await page.waitForURL(/docs\/get-started\/install\/$/)
  await expect(page.locator('h1')).toHaveText('Install')
})

test('sidebar has 4 group headings and marks the current page', async ({ page }) => {
  await page.goto('docs/get-started/install/')
  await expect(page.locator('.docs-nav__group')).toHaveCount(4)
  await expect(page.locator('.docs-nav a[aria-current="page"]')).toHaveText('Install')
})

test('every sidebar link returns 200', async ({ page, request }) => {
  await page.goto('docs/get-started/install/')
  const hrefs = await page.locator('.docs-nav a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))
  expect(hrefs.length).toBe(15)
  for (const href of hrefs) {
    const res = await request.get(href)
    expect(res.status(), href).toBe(200)
  }
})

test('prev and next links connect pages', async ({ page }) => {
  await page.goto('docs/get-started/install/')
  await page.locator('.docs-pager a[rel="next"]').click()
  await expect(page).toHaveURL(/docs\/get-started\/first-document\/$/)
  await expect(page.locator('.docs-pager a[rel="prev"]')).toBeVisible()
})

test('search finds the Sheets guide for "formula"', async ({ page }) => {
  await page.goto('docs/get-started/install/')
  await page.locator('[data-docs-search] input:visible').first().fill('formula')
  const result = page.locator('.pagefind-ui__result-link[href$="docs/apps/sheets/"]').first()
  await expect(result).toBeVisible({ timeout: 10_000 })
})

test('no horizontal scroll at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  for (const path of ['docs/get-started/install/', 'docs/apps/sheets/', 'docs/contribute/new-app/']) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflow, path).toBe(false)
  }
})
