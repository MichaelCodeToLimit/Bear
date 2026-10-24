import { expect, test, type ElectronApplication } from '@playwright/test'
import { close, launch } from './helpers'

let app: ElectronApplication | undefined

test.afterEach(async () => {
  await close(app)
  app = undefined
})

test('the default build shows an Office row and a Bear Studio row', async () => {
  const launched = await launch()
  app = launched.app
  const { page } = launched
  const office = page.getByTestId('suite-office')
  const studio = page.getByTestId('suite-studio')
  await expect(office).toBeVisible()
  await expect(studio).toBeVisible()
  await expect(studio.getByRole('heading', { name: 'Bear Studio' })).toBeVisible()
  await expect(studio).toContainText('Photo')
  await expect(studio).toContainText('Vector')
  await expect(studio.getByRole('button', { name: /Vector/ })).toContainText('Coming soon')
  await expect(office).toContainText('Write')
  await expect(page.getByText('New document')).toBeVisible()
})

test('a studio build shows only the Studio row', async () => {
  test.skip(!process.env.BEAR_EDITION_BUILD, 'needs an app built with BEAR_EDITION=studio')
  const launched = await launch()
  app = launched.app
  await expect(launched.page.getByTestId('suite-studio')).toBeVisible()
  await expect(launched.page.getByTestId('suite-office')).toHaveCount(0)
  await expect(launched.page.getByText('New document')).toHaveCount(0)
  await expect(launched.page.getByText('New spreadsheet')).toHaveCount(0)
  await expect(launched.page.getByText('New presentation')).toHaveCount(0)
})
