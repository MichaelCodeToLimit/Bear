import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, relative, resolve, isAbsolute } from 'node:path'

const appDir = resolve(__dirname, '../apps/desktop')

/** Electron arguments for a profile in `dir`. */
export function launchArgs(dir: string): string[] {
  // Windows stops painting windows that are covered by others; Playwright then waits forever
  // for animation frames. Keep the test window rendering even when it's behind something.
  return [appDir, `--user-data-dir=${join(dir, 'userdata')}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding', '--disable-background-timer-throttling']
}

export interface Launched {
  app: ElectronApplication
  page: Page
  dir: string
}

/**
 * Launch the built app with a throwaway profile. Set BEAR_ELECTRON to use a specific Electron
 * binary (handy when the workspace copy is locked by a running dev instance). `extraArgs` are
 * Chromium switches, such as `--disable-gpu`. `sharedAppData` (a temporary folder) becomes BEAR_TEST_APPDATA:
 * the profile stays in `dir` but Bear's data folder is `<sharedAppData>/@bear/desktop`, so two launches with
 * the same one share their data like two editions side by side.
 */
export async function launch(reuseDir?: string, files: string[] = [], extraArgs: string[] = [], sharedAppData?: string): Promise<Launched> {
  // Reusing a directory reopens the same profile, to check data survives a restart.
  const dir = reuseDir ?? mkdtempSync(join(tmpdir(), 'bear-e2e-'))
  const env = { ...process.env } as Record<string, string>
  delete env.BEAR_TEST_APPDATA
  if (sharedAppData) env.BEAR_TEST_APPDATA = assertTestFolder(sharedAppData)
  const app = await electron.launch({
    executablePath: process.env.BEAR_ELECTRON || undefined,
    // Files go last, as when Explorer launches Bear for a document.
    args: [...launchArgs(dir), ...extraArgs, ...files],
    cwd: appDir,
    env
  })
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.setBackgroundThrottling(false)))
  page.on('pageerror', (e) => console.error('pageerror:', e.message))
  // A window opened for a document skips past the launcher, so there's nothing stable to wait for.
  if (!files.length) await page.waitForSelector('[data-testid^=suite-]')
  return { app, page, dir }
}

/** The real per-user application data folder (%APPDATA% on Windows), which a test must never use. */
export const realAppData = resolve(process.env.APPDATA ?? join(homedir(), process.platform === 'darwin' ? 'Library/Application Support' : '.config'))

const inside = (child: string, parent: string) => {
  const r = relative(parent.toLowerCase(), resolve(child).toLowerCase())
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

/** Abort unless `folder` is a temporary folder, well away from the real application data folder. */
export function assertTestFolder(folder: string): string {
  const abs = resolve(folder)
  if (inside(abs, realAppData) || !inside(abs, resolve(tmpdir()))) throw new Error(`Refusing to use ${abs} for test data: it must be a temp folder, not under ${realAppData}`)
  return abs
}

export async function close(app: ElectronApplication | undefined) {
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
  await app?.close().catch(() => {})
}

/** Make the next save dialog "choose" this path without showing native UI. */
export async function stubSaveDialog(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog
  }, path)
}

export async function stubOpenDialog(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog
  }, path)
}
