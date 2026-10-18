import { test, expect, type Page } from '@playwright/test'

const RELEASES = 'https://github.com/MichaelCodeToLimit/Bear/releases'
// The cards of the edition panel on show (Everything by default). The other two panels are rendered but hidden.
const SHOWN = '[data-edition-panel]:not([hidden])'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// These tests describe the no-release state (no release exists yet). Once a real release is built into the site,
// the state-specific assertions skip themselves; the release-present markup is covered by PlatformCards.render.test.ts.
async function noRelease(page: Page): Promise<boolean> {
  return (await page.locator(`${SHOWN} [data-os-group] [data-status="soon"]`).count()) === 3
}

test('download page renders the three platform cards with no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  const response = await page.goto('download/')
  expect(response?.status()).toBe(200)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator(`${SHOWN} [data-os-group]`)).toHaveCount(3)
  expect(await page.locator(`${SHOWN} [data-os-group]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-os-group')))).toEqual(['windows', 'mac', 'linux'])
  await expect(page.getByText('pnpm install').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('no release: every card says Coming soon with the right buttons, all pointing at the Releases page', async ({ page }) => {
  await page.goto('download/')
  test.skip(!(await noRelease(page)), 'a release is built into the site')

  const card = (os: string) => page.locator(`${SHOWN} [data-os-group="${os}"]`)
  for (const os of ['windows', 'mac', 'linux']) {
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

  // The "Other" list works without script: open it and its links go to Releases too.
  await card('linux').locator('details summary').click()
  const links = page.locator(`${SHOWN} [data-os-group] a[data-download]`)
  expect(await links.count()).toBe(2 + 2 + 3 + 2)
  for (const a of await links.all()) {
    expect(await a.getAttribute('href')).toBe(RELEASES)
    expect(await a.getAttribute('data-state')).toBe('pending')
  }
  // No dead or hash links anywhere in the cards.
  for (const a of await page.locator(`${SHOWN} [data-os-group] a`).all()) {
    const href = await a.getAttribute('href')
    expect(href && href !== '#').toBeTruthy()
  }
})

test('the cards come before the Build from source block', async ({ page }) => {
  await page.goto('download/')
  const cardsFirst = await page.evaluate(() => {
    const card = document.querySelector('[data-edition-panel]:not([hidden]) [data-os-group]')!
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
    await expect(page.locator(`${SHOWN} [data-os-group="windows"] [data-your-device]`)).toBeVisible()
    await expect(page.locator(`${SHOWN} [data-os-group="windows"]`)).toHaveAttribute('data-yours', '')
    await expect(page.locator(`${SHOWN} [data-yours]`)).toHaveCount(1)
  })
})

test('the cards stack on a phone without horizontal scroll, in dark and light', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  for (const theme of ['dark', 'light']) {
    await page.goto('download/')
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await page.locator(`${SHOWN} [data-os-group="linux"] details summary`).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    const boxes = await page.locator(`${SHOWN} [data-os-group]`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))
    expect(boxes[1].top).toBeGreaterThan(boxes[0].bottom - 1)
    for (const b of boxes) expect(b.right).toBeLessThanOrEqual(375)
  }
})

test('three columns on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('download/')
  const tops = await page.locator(`${SHOWN} [data-os-group]`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
})

test.describe('edition switcher', () => {
  const radio = (page: Page, name: string) => page.getByRole('radiogroup', { name: 'Edition' }).getByRole('radio', { name })

  test('Everything is checked by default; Studio only shows the Studio panel and is remembered', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto('download/')
    await expect(page.getByRole('radio')).toHaveText(['Everything', 'Office only', 'Studio only'])
    await expect(radio(page, 'Everything')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-edition-panel="all"]')).toBeVisible()
    await expect(page.locator('[data-edition-panel="studio"]')).toBeHidden()

    await radio(page, 'Studio only').click()
    await expect(radio(page, 'Studio only')).toHaveAttribute('aria-checked', 'true')
    await expect(radio(page, 'Everything')).toHaveAttribute('aria-checked', 'false')
    await expect(page.locator('[data-edition-panel="studio"]')).toBeVisible()
    await expect(page.locator('[data-edition-panel="all"]')).toBeHidden()
    await expect(page.locator(`${SHOWN} [data-os-group]`)).toHaveCount(3)
    // Every Studio link (if the release has any) is a Studio file; with none, the cards say Coming soon.
    for (const a of await page.locator(`${SHOWN} a[data-state="ready"]`).all()) expect(await a.getAttribute('href')).toMatch(/Bear-Studio|bear-studio/)
    if ((await page.locator(`${SHOWN} a[data-state="ready"]`).count()) === 0) await expect(page.locator(`${SHOWN} [data-status="soon"]`)).toHaveCount(3)
    expect(await page.evaluate(() => localStorage.getItem('bear-edition'))).toBe('studio')

    await page.reload()
    await expect(radio(page, 'Studio only')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-edition-panel="studio"]')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('arrow keys move the choice', async ({ page }) => {
    await page.goto('download/')
    await radio(page, 'Everything').focus()
    await page.keyboard.press('ArrowRight')
    await expect(radio(page, 'Office only')).toBeFocused()
    await expect(radio(page, 'Office only')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-edition-panel="office"]')).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(radio(page, 'Everything')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('End')
    await expect(radio(page, 'Studio only')).toHaveAttribute('aria-checked', 'true')
  })

  test('a broken saved value falls back to Everything', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bear-edition', 'banana'))
    await page.goto('download/')
    await expect(radio(page, 'Everything')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-edition-panel="all"]')).toBeVisible()
  })

  test('the switcher fits a phone without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('download/')
    for (const name of ['Everything', 'Office only', 'Studio only']) {
      await radio(page, name).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    }
    const box = await page.getByRole('radiogroup', { name: 'Edition' }).boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })
  test('Everything shows and the switcher is hidden', async ({ page }) => {
    await page.goto('download/')
    await expect(page.locator('[data-edition-panel="all"]')).toBeVisible()
    await expect(page.locator('[data-edition-panel="office"]')).toBeHidden()
    await expect(page.locator('[data-edition-panel="studio"]')).toBeHidden()
    await expect(page.locator('[data-edition-switch]')).toBeHidden()
  })
})
