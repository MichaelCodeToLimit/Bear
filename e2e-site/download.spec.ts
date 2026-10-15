import { test, expect } from '@playwright/test'

test('download page renders a release or the fallback with no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  const response = await page.goto('download/')
  expect(response?.status()).toBe(200)

  const groups = page.locator('[data-os-group]')
  const fallback = page.getByText('The first release is on its way')
  await expect(groups.first().or(fallback.first())).toBeVisible()
  await expect(page.getByText('pnpm install').first()).toBeVisible()
  expect(errors).toEqual([])
})
