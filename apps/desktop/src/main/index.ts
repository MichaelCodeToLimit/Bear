import { app, BrowserWindow, dialog, ipcMain, shell, webContents } from 'electron'
import { promises as fs, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  DATA_NAME, RECOVERY_NAME, addRecent, appForFile, baseName, launchFiles, parseRecent, removeRecent, setEdition,
  type AppId, type FileFilter, type RecentFile
} from '@bear/core'
import { buildEdition } from '../edition'
import { registerMailIpc } from './mail'
import { writeFileAtomic } from './mail/atomic'

setEdition(buildEdition())

// Every edition keeps its data in Bear's folder, so Office and Studio installs share settings and files.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', join(app.getPath('appData'), 'Bear'))

const recentPath = () => join(app.getPath('userData'), 'recent.json')

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

const recoveryDir = () => join(app.getPath('userData'), 'recovery')

function recoveryFile(name: string): string {
  if (typeof name !== 'string' || !RECOVERY_NAME.test(name)) throw new Error(`Invalid recovery name: ${name}`)
  return join(recoveryDir(), name)
}

/** Which window (webContents id) last wrote each recovery copy. */
const recoveryOwners = new Map<string, number>()

/** A window that closed normally leaves no recovery copies behind; a crash or kill keeps them. */
function removeRecoveriesOf(ownerId: number): void {
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
    title: 'Bear',
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

  // Open external links in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
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

  // ---------- App data (JSON documents in userData/data) ----------

  const dataFile = (name: string) => {
    if (!DATA_NAME.test(name)) throw new Error(`Invalid data name: ${name}`)
    return join(app.getPath('userData'), 'data', `${name}.json`)
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

  // ---------- Crash recovery (Photo copies in userData/recovery) ----------

  ipcMain.handle('recovery:write', async (e, name: string, data: Uint8Array) => {
    await writeFileAtomic(recoveryFile(name), data)
    recoveryOwners.set(name, e.sender.id)
  })

  ipcMain.handle('recovery:list', async (e) => {
    let names: string[]
    try {
      names = await fs.readdir(recoveryDir())
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    // Copies that another open window is still keeping up to date are not left over from a crash.
    const liveElsewhere = (name: string) => {
      const owner = recoveryOwners.get(name)
      return owner !== undefined && owner !== e.sender.id && !!webContents.fromId(owner)
    }
    const found = await Promise.all(
      names
        .filter((n) => RECOVERY_NAME.test(n) && !liveElsewhere(n))
        .map(async (name) => {
          try {
            return { name, savedAt: (await fs.stat(join(recoveryDir(), name))).mtimeMs }
          } catch {
            return null
          }
        })
    )
    return found.filter((f) => f !== null).sort((a, b) => b.savedAt - a.savedAt)
  })

  ipcMain.handle('recovery:read', async (_e, name: string) => new Uint8Array(await fs.readFile(recoveryFile(name))))

  ipcMain.handle('recovery:remove', async (_e, name: string) => {
    await fs.rm(recoveryFile(name), { force: true })
    recoveryOwners.delete(name)
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
    app.setAppUserModelId('org.bearsuite.desktop')
    registerIpc()
    registerMailIpc()
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
