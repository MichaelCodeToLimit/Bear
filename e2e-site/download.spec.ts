import { test, expect, type Page } from '@playwright/test'

const RELEASES = 'https://github.com/MichaelCodeToLimit/Bear/releases'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// These tests describe the no-release state (no release exists yet). Once a real release is built into the site,
// the state-specific assertions skip themselves; the release-present markup is covered by PlatformCards.render.test.ts.
async function noRelease(page: Page): Promise<boolean> {
  return (await page.locator('[data-os-group] [data-status="soon"]').count()) === 4
}

test('download page renders the four platform cards with no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  const response = await page.goto('download/')
  expect(response?.status()).toBe(200)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('[data-os-group]')).toHaveCount(4)
  expect(await page.locator('[data-os-group]').evaluateAll((els) => els.map((e) => e.getAttribute('data-os-group')))).toEqual(['windows', 'mac', 'linux', 'android'])
  await expect(page.getByText('pnpm install').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('no release: every card says Coming soon with the right buttons, all pointing at the Releases page', async ({ page }) => {
  await page.goto('download/')
  test.skip(!(await noRelease(page)), 'a release is built into the site')

  const card = (os: string) => page.locator(`[data-os-group="${os}"]`)
  for (const os of ['windows', 'mac', 'linux', 'android']) {
    await expect(card(os)).toContainText('Coming soon')
    await expect(card(os)).toContainText('First release coming soon')
  }
  await expect(card('windows').getByRole('link', { name: /^Download \.exe/ })).toBeVisible()
  await expect(card('windows').getByRole('link', { name: /^\.msi for IT/ })).toBeVisible()
  await expect(card('mac').getByRole('link', { name: /^Apple silicon/ })).toBeVisible()
  await expect(card('mac').getByRole('link', { name: /^Intel/ })).toBeVisible()
  await expect(card('linux').getByRole('link', { name: /^\.deb for/ })).toBeVisible()
  await expect(card('linux').getByRole('link', { name: /^AppImage for/ })).toBeVisible()
  await expect(card('linux').getByRole('link', { name: /^Flatpak for/ })).toBeVisible()
  await expect(card('linux').locator('details summary')).toContainText('Other')
  await expect(card('android').getByRole('link', { name: /^Download \.apk for Android/ })).toBeVisible()

  // The "Other" list works without script: open it and its links go to Releases too.
  await card('linux').locator('details summary').click()
  const links = page.locator('[data-os-group] a[data-download]')
  expect(await links.count()).toBe(2 + 2 + 3 + 2 + 1)
  for (const a of await links.all()) {
    expect(await a.getAttribute('href')).toBe(RELEASES)
    expect(await a.getAttribute('data-state')).toBe('pending')
  }
  // No dead or hash links anywhere in the cards.
  for (const a of await page.locator('[data-os-group] a').all()) {
    const href = await a.getAttribute('href')
    expect(href && href !== '#').toBeTruthy()
  }
})

// The live release has Windows, Mac and Linux files but (until the owner attaches it) no .apk.
test('a release without an .apk: only the Android card says Coming soon, with a disabled button', async ({ page }) => {
  await page.goto('download/')
  const soon = await page.locator('[data-os-group] [data-status="soon"]').count()
  const androidSoon = await page.locator('[data-os-group="android"] [data-status="soon"]').count()
  test.skip(soon !== 1 || androidSoon !== 1, 'no release, or the release has an .apk')

  const android = page.locator('[data-os-group="android"]')
  await expect(android).toContainText('Coming soon')
  await expect(android).not.toContainText('First release coming soon')
  const off = android.locator('span[data-state="missing"]')
  await expect(off).toHaveCount(1)
  await expect(off).toHaveAttribute('aria-disabled', 'true')
  await expect(off).toHaveAttribute('title', 'Not in this release')
  await expect(off).toContainText('Download .apk')
  await expect(android.locator('a[data-download]')).toHaveCount(0)
  await expect(android).toContainText('Test build signed with a debug key')
  for (const os of ['windows', 'mac', 'linux']) await expect(page.locator(`[data-os-group="${os}"] [data-status="available"]`)).toHaveCount(1)
})

test('the cards come before the Build from source block', async ({ page }) => {
  await page.goto('download/')
  const cardsFirst = await page.evaluate(() => {
    const card = document.querySelector('[data-os-group]')!
    const source = document.getElementById('dl-source-title')!
    return !!(card.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(cardsFirst).toBe(true)
})

test.describe('on Windows', () => {
  test.use({ userAgent: WINDOWS_UA })
  test('"Your device" shows on exactly the Windows card', async ({ page }) => {
    await page.goto('download/')
    const badges = page.locator('[data-your-device]:visible')
    await expect(badges).toHaveCount(1)
    await expect(page.locator('[data-os-group="windows"] [data-your-device]')).toBeVisible()
    await expect(page.locator('[data-os-group="windows"]')).toHaveAttribute('data-yours', '')
    await expect(page.locator('[data-yours]')).toHaveCount(1)
  })
})

test('the cards stack on a phone without horizontal scroll, in dark and light', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  for (const theme of ['dark', 'light']) {
    await page.goto('download/')
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await page.locator('[data-os-group="linux"] details summary').click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    const boxes = await page.locator('[data-os-group]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))
    expect(boxes).toHaveLength(4)
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].bottom - 1)
    for (const b of boxes) expect(b.right).toBeLessThanOrEqual(375)
  }
})

test.describe('on Android', () => {
  test.use({ userAgent: ANDROID_UA })
  test('"Your device" shows on exactly the Android card', async ({ page }) => {
    await page.goto('download/')
    await expect(page.locator('[data-your-device]:visible')).toHaveCount(1)
    await expect(page.locator('[data-os-group="android"] [data-your-device]')).toBeVisible()
    await expect(page.locator('[data-os-group="android"]')).toHaveAttribute('data-yours', '')
    await expect(page.locator('[data-yours]')).toHaveCount(1)
  })
})

test('two columns of two on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('download/')
  const tops = await page.locator('[data-os-group]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  expect(tops[0]).toBe(tops[1])
  expect(tops[2]).toBe(tops[3])
  expect(tops[2]).toBeGreaterThan(tops[0])
})
