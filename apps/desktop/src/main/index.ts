import { app, BrowserWindow, dialog, ipcMain, screen, shell, webContents } from 'electron'
import { promises as fs, rmdirSync, rmSync, statSync, type Dirent } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  DATA_NAME, EDITIONS, RECOVERY_NAME, addRecent, appForFile, baseName, launchFiles, parseRecent, removeRecent, setEdition,
  type AppId, type FileFilter, type RecentFile
} from '@bear/core'
import { buildEdition } from '../edition'
import { bearDataDir } from './data-dir'
import { registerMailIpc } from './mail'
import { writeFileAtomic } from './mail/atomic'
import { KeyedQueue } from './keyed-queue'
import { copyOwnership, ownerFolderName, parseOwnerFolder, probeProcess, thisProcess, type ProbeResult } from './recovery-owners'

const edition = buildEdition()
setEdition(edition)

// Tests only: Electron doesn't take appData from %APPDATA%, so a test that checks the real (no
// --user-data-dir) folder layout points it at a temporary folder with BEAR_TEST_APPDATA. The profile
// moves with it, exactly as Electron would place it there. With --user-data-dir as well, the profile
// stays there and only Bear's data folder moves (<BEAR_TEST_APPDATA>/@bear/desktop): two test processes
// with their own profiles then share one data folder, like two editions side by side. Never set outside tests.
const testAppData = process.env.BEAR_TEST_APPDATA
const userDataSwitch = app.commandLine.hasSwitch('user-data-dir')
if (testAppData) {
  app.setPath('appData', testAppData)
  if (!userDataSwitch) app.setPath('userData', join(testAppData, app.getName()))
}

// Bear's own files are shared by every edition; each edition keeps Electron's default Chromium
// profile, so the editions can run side by side (see data-dir.ts).
const dataDir = bearDataDir({
  appData: app.getPath('appData'),
  userData: app.getPath('userData'),
  userDataSwitch: userDataSwitch && !testAppData
})

const recentPath = () => join(dataDir, 'recent.json')

async function readRecent(): Promise<RecentFile[]> {
  try {
    return parseRecent(await fs.readFile(recentPath(), 'utf8'))
  } catch {
    return []
  }
}

async function writeRecent(list: RecentFile[]): Promise<RecentFile[]> {
  await fs.writeFile(recentPath(), JSON.stringify(list, null, 2), 'utf8')
  return list
}

async function readOpened(path: string) {
  const data = await fs.readFile(path)
  return { path, name: baseName(path), data: new Uint8Array(data) }
}

/** Windows that the user has confirmed may close despite unsaved changes. */
const forceClosing = new WeakSet<BrowserWindow>()

const recoveryDir = () => join(dataDir, 'recovery')

// This process's copies go in recovery/<pid>-<start>/, so another edition running at the same time can
// tell they are still live (see recovery-owners.ts).
const self = thisProcess()
const ownRecoveryDir = () => join(recoveryDir(), ownerFolderName(self))

function checkRecoveryName(name: string): void {
  if (typeof name !== 'string' || !RECOVERY_NAME.test(name)) throw new Error(`Invalid recovery name: ${name}`)
}

/** Where this process keeps the copy called `name`. */
function recoveryFile(name: string): string {
  checkRecoveryName(name)
  return join(ownRecoveryDir(), name)
}

/** Copies left by a crashed process (or a flat copy from an earlier build) that recovery:list offered: name → path. */
const orphanCopies = new Map<string, string>()

/** Which window (webContents id) last wrote each recovery copy. */
const recoveryOwners = new Map<string, number>()

/** Windows that closed normally: a write of theirs still in flight is deleted again when it lands. */
const cleanlyClosed = new Set<number>()

/** Writes and removals of one recovery file run one at a time, so a removal can't be overtaken by a write. */
const recoveryQueue = new KeyedQueue()

const MAX_RECOVERY_BYTES = 2 * 2 ** 30

/** A window that closed normally leaves no recovery copies behind; a crash or kill keeps them. */
function removeRecoveriesOf(ownerId: number): void {
  cleanlyClosed.add(ownerId)
  for (const [name, owner] of recoveryOwners) {
    if (owner !== ownerId) continue
    recoveryOwners.delete(name)
    // Synchronous: this can be the last window, and the app quits right after.
    try {
      rmSync(recoveryFile(name), { force: true })
    } catch (err) {
      console.warn('Could not remove recovery copy', name, err)
    }
  }
  // The folder goes too once it's empty (another window's copy, or a write in flight, keeps it).
  try {
    rmdirSync(ownRecoveryDir())
  } catch {
    // Not empty, or never made.
  }
}

/** The document each new window should open on start, keyed by webContents id. */
const launchFileFor = new Map<number, string>()

/** Files that arrive before the app is ready (macOS sends open-file very early). */
const pendingLaunchFiles: string[] = []

const isFile = (path: string) => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Open documents handed to Bear by the OS. Each gets its own window, so a file opened from
 * Explorer never replaces a document the user is still editing.
 */
function openLaunchFiles(paths: string[]): void {
  if (!app.isReady()) {
    pendingLaunchFiles.push(...paths)
    return
  }
  for (const path of paths) createWindow(path)
}

function createWindow(launchFile?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: EDITIONS[edition].productName,
    backgroundColor: '#f5f4f1',
    // Packaged builds take the icon from the .exe; in development use the source PNG.
    icon: app.isPackaged ? undefined : join(__dirname, '../../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (launchFile) launchFileFor.set(win.webContents.id, launchFile)
  win.once('ready-to-show', () => win.show())

  // The renderer decides whether there is unsaved work; it calls forceClose() if the user confirms.
  win.on('close', (e) => {
    if (forceClosing.has(win)) return
    e.preventDefault()
    win.webContents.send('window:close-request')
  })

  // Only a close the renderer agreed to counts as clean ('close' is not emitted for destroy()).
  const contentsId = win.webContents.id
  win.on('closed', () => {
    if (forceClosing.has(win)) removeRecoveriesOf(contentsId)
  })

  // Open external links in the default browser, never inside the app. The one window Bear opens
  // itself is the slide show's audience screen: a blank page (same origin) the renderer draws
  // into, shown full screen on the second display.
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (url === 'about:blank' && frameName === 'bear-audience') {
      const others = screen.getAllDisplays().filter((d) => d.id !== screen.getDisplayMatching(win.getBounds()).id)
      const target = others[0] ?? screen.getPrimaryDisplay()
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          x: target.bounds.x, y: target.bounds.y, width: target.bounds.width, height: target.bounds.height,
          fullscreen: others.length > 0, frame: false, backgroundColor: '#000000', autoHideMenuBar: true, title: 'Bear slide show'
        }
      }
    }
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function registerIpc(): void {
  const winOf = (e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) =>
    BrowserWindow.fromWebContents(e.sender)!

  ipcMain.handle('file:open', async (e, filters?: FileFilter[]) => {
    const res = await dialog.showOpenDialog(winOf(e), {
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All files', extensions: ['*'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return readOpened(res.filePaths[0])
  })

  ipcMain.handle('file:read', (_e, path: string) => readOpened(path))

  ipcMain.handle('screen:count', () => screen.getAllDisplays().length)

  // A PNG of part of the window (slide pictures export), at the screen's full pixel density.
  ipcMain.handle('window:capture', async (e, rect: { x: number; y: number; width: number; height: number }) => {
    const r = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    return new Uint8Array((await e.sender.capturePage(r)).toPNG())
  })

  ipcMain.handle('file:save', async (_e, path: string, data: Uint8Array) => {
    await writeFileAtomic(path, data)
  })

  ipcMain.handle('file:chooseSavePath', async (e, defaultName: string, filters: FileFilter[]) => {
    const res = await dialog.showSaveDialog(winOf(e), { defaultPath: defaultName, filters })
    return res.canceled || !res.filePath ? null : res.filePath
  })

  ipcMain.handle('file:exportPdf', async (e, defaultName: string) => {
    const win = winOf(e)
    const res = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return null
    // The renderer's print stylesheet hides all app chrome and sets @page size and margins.
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
    await fs.writeFile(res.filePath, pdf)
    return res.filePath
  })

  ipcMain.handle('app:takeLaunchFile', (e) => {
    const path = launchFileFor.get(e.sender.id) ?? null
    launchFileFor.delete(e.sender.id)
    return path
  })

  ipcMain.handle('recent:get', () => readRecent())

  ipcMain.handle('recent:add', async (_e, path: string, appId: AppId) => {
    const entry: RecentFile = { path, name: baseName(path), app: appId ?? appForFile(path) ?? 'write', openedAt: Date.now() }
    app.addRecentDocument(path)
    return writeRecent(addRecent(await readRecent(), entry))
  })

  ipcMain.handle('recent:remove', async (_e, path: string) => writeRecent(removeRecent(await readRecent(), path)))

  ipcMain.handle('shell:showInFolder', (_e, path: string) => shell.showItemInFolder(path))

  ipcMain.handle('shell:openPath', async (_e, path: string) => {
    const err = await shell.openPath(path)
    if (err) throw new Error(err)
  })

  // ---------- App data (JSON documents in <Bear data>/data) ----------
  // Two editions open at the same time may both write one file: the last write wins (no locking).

  const dataFile = (name: string) => {
    if (!DATA_NAME.test(name)) throw new Error(`Invalid data name: ${name}`)
    return join(dataDir, 'data', `${name}.json`)
  }

  ipcMain.handle('data:read', async (_e, name: string) => {
    try {
      return JSON.parse(await fs.readFile(dataFile(name), 'utf8'))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  })

  // Atomic, and retried while Windows has the file briefly locked (see writeFileAtomic).
  ipcMain.handle('data:write', (_e, name: string, value: unknown) => writeFileAtomic(dataFile(name), JSON.stringify(value)))

  ipcMain.handle('data:delete', async (_e, name: string) => {
    await fs.rm(dataFile(name), { force: true })
  })

  // ---------- Crash recovery (Photo copies in <Bear data>/recovery) ----------

  ipcMain.handle('recovery:write', (e, name: string, data: Uint8Array) => {
    const file = recoveryFile(name)
    if (!(data instanceof Uint8Array)) throw new Error('Recovery data must be bytes')
    if (data.byteLength > MAX_RECOVERY_BYTES) throw new Error('Recovery copy is too large')
    const owner = e.sender.id
    const gone = () => cleanlyClosed.has(owner) || e.sender.isDestroyed()
    return recoveryQueue.run(name, async () => {
      if (gone()) return
      await writeFileAtomic(file, data)
      // The window closed normally while this was being written: the copy must not outlive it.
      if (gone()) {
        if (cleanlyClosed.has(owner)) await fs.rm(file, { force: true })
        return
      }
      recoveryOwners.set(name, owner)
    })
  })

  // Copies in this process's folder, folders of processes that are gone, and flat copies from an earlier
  // build. A folder whose process is still running (another edition with Photo open) is never looked into.
  ipcMain.handle('recovery:list', async (e) => {
    let entries: Dirent[]
    try {
      entries = await fs.readdir(recoveryDir(), { withFileTypes: true })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    // Copies that another open window of this process is still keeping up to date are not left over from a crash.
    const liveElsewhere = (name: string) => {
      const owner = recoveryOwners.get(name)
      return owner !== undefined && owner !== e.sender.id && !!webContents.fromId(owner)
    }
    const copiesIn = async (folder: string) => {
      try {
        return (await fs.readdir(folder)).filter((n) => RECOVERY_NAME.test(n))
      } catch {
        return []
      }
    }
    const groups = await Promise.all(
      entries.map(async (ent): Promise<{ name: string; path: string; own: boolean }[]> => {
        if (ent.isFile()) return RECOVERY_NAME.test(ent.name) ? [{ name: ent.name, path: join(recoveryDir(), ent.name), own: false }] : []
        if (!ent.isDirectory()) return []
        const owner = parseOwnerFolder(ent.name)
        const probe: ProbeResult | undefined = owner && owner.pid !== self.pid ? await probeProcess(owner.pid) : undefined
        const who = copyOwnership(ent.name, self, probe)
        if (who === 'live') return []
        const folder = join(recoveryDir(), ent.name)
        const names = await copiesIn(folder)
        if (who === 'self') return names.filter((n) => !liveElsewhere(n)).map((name) => ({ name, path: join(folder, name), own: true }))
        // A crashed process's folder with no copies left (only a half-written temp file, say) is just tidied away.
        if (!names.length) await fs.rm(folder, { recursive: true, force: true }).catch(() => {})
        return names.map((name) => ({ name, path: join(folder, name), own: false }))
      })
    )
    const found = await Promise.all(
      groups.flat().map(async (c) => {
        try {
          return { ...c, savedAt: (await fs.stat(c.path)).mtimeMs }
        } catch {
          return null
        }
      })
    )
    const out: { name: string; savedAt: number }[] = []
    const seen = new Set<string>()
    for (const c of found.filter((f) => f !== null).sort((a, b) => b.savedAt - a.savedAt)) {
      // Names are random per window session; if two folders ever hold the same one, the newer is offered.
      if (seen.has(c.name)) continue
      seen.add(c.name)
      if (c.own) orphanCopies.delete(c.name)
      else orphanCopies.set(c.name, c.path)
      out.push({ name: c.name, savedAt: c.savedAt })
    }
    return out
  })

  // A name is read from where recovery:list found it (a crashed process's folder), else from this process's own.
  ipcMain.handle('recovery:read', async (_e, name: string) => {
    checkRecoveryName(name)
    return new Uint8Array(await fs.readFile(orphanCopies.get(name) ?? recoveryFile(name)))
  })

  ipcMain.handle('recovery:remove', (_e, name: string) => {
    checkRecoveryName(name)
    const orphan = orphanCopies.get(name)
    if (orphan) {
      return recoveryQueue.run(name, async () => {
        await fs.rm(orphan, { force: true })
        orphanCopies.delete(name)
        // The crashed process's folder goes with its last copy (restored or discarded).
        const folder = dirname(orphan)
        if (folder === recoveryDir()) return
        const rest = await fs.readdir(folder).catch(() => [] as string[])
        if (!rest.some((n) => RECOVERY_NAME.test(n))) await fs.rm(folder, { recursive: true, force: true }).catch(() => {})
      })
    }
    const file = recoveryFile(name)
    return recoveryQueue.run(name, async () => {
      await fs.rm(file, { force: true })
      recoveryOwners.delete(name)
    })
  })

  // ---------- Folders (Sites document libraries) ----------

  ipcMain.handle('folder:choose', async (e, title?: string) => {
    const res = await dialog.showOpenDialog(winOf(e), { title, properties: ['openDirectory', 'createDirectory'] })
    return res.canceled || !res.filePaths[0] ? null : res.filePaths[0]
  })

  ipcMain.handle('folder:list', async (_e, dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const out = await Promise.all(
      entries
        .filter((d) => !d.name.startsWith('.') && !d.name.startsWith('~$'))
        .map(async (d) => {
          const path = join(dir, d.name)
          try {
            const st = await fs.stat(path)
            return { name: d.name, path, isDir: d.isDirectory(), size: st.size, modified: st.mtimeMs }
          } catch {
            return null
          }
        })
    )
    return out.filter(Boolean)
  })

  ipcMain.on('window:setTitle', (e, title: string) => winOf(e).setTitle(title))

  ipcMain.on('window:forceClose', (e) => {
    const win = winOf(e)
    forceClosing.add(win)
    win.close()
  })
}

// One Bear process: a second launch (e.g. double-clicking a .docx) hands its files to this one.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const files = launchFiles(argv, isFile)
    if (files.length) return openLaunchFiles(files)
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return createWindow()
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.on('open-file', (e, path) => {
    e.preventDefault()
    openLaunchFiles([path])
  })

  app.whenReady().then(() => {
    app.setAppUserModelId(EDITIONS[edition].appId)
    registerIpc()
    registerMailIpc(dataDir)
    const files = [...pendingLaunchFiles.splice(0), ...launchFiles(process.argv, isFile)]
    if (files.length) files.forEach((f) => createWindow(f))
    else createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
