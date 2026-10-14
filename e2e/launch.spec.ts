import { expect, test, type ElectronApplication } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { close, launch, launchArgs } from './helpers'

// Opening documents the way Explorer/Finder does: as a path on Bear's command line.

let app: ElectronApplication | undefined

test.afterEach(() => close(app))

function writeDoc(name: string, text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'bear-doc-')), name)
  writeFileSync(path, text)
  return path
}

test('a document on the command line opens straight into its app', async () => {
  const doc = writeDoc('welcome.txt', 'Opened from Explorer')
  const launched = await launch(undefined, [doc])
  app = launched.app
  await expect(launched.page.locator('.write-doc')).toContainText('Opened from Explorer')
})

test('opening a document while Bear runs adds a window to the running Bear', async () => {
  const launched = await launch()
  app = launched.app
  const doc = writeDoc('second.txt', 'Handed to the running Bear')

  // A second launch with the same profile hands its file over and exits.
  const electronPath = process.env.BEAR_ELECTRON || (createRequire(resolve(__dirname, '../apps/desktop/package.json'))('electron') as string)
  const second = spawn(electronPath, [...launchArgs(launched.dir), doc], { cwd: resolve(__dirname, '../apps/desktop') })
  const exited = new Promise<number | null>((r) => second.on('exit', r))

  const page = await app.waitForEvent('window')
  await expect(page.locator('.write-doc')).toContainText('Handed to the running Bear')
  expect(await exited).toBe(0)
  // The launcher window the user already had is untouched.
  await expect(launched.page.getByText('Apps').first()).toBeVisible()
})
