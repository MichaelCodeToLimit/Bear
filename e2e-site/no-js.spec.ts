import { test, expect } from '@playwright/test'

test.use({ javaScriptEnabled: false })

test('reveal content is visible without JavaScript', async ({ page }) => {
  await page.goto('./')
  const items = page.locator('[data-reveal]')
  expect(await items.count()).toBeGreaterThan(0)
  for (const item of await items.all()) await expect(item).toBeVisible()
  await expect(items.first()).toHaveCSS('opacity', '1')
})
