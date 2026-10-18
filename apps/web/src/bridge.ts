import {
  DATA_NAME, MAIL_METHODS, addRecent, appForFile, baseName, parseRecent, removeRecent, withExtension,
  type BearBridge, type FileFilter, type FolderEntry, type OpenedFile, type RecentFile
} from '@bear/core'

/**
 * window.bear for browsers. In Chrome and Edge, Open and Save as use the computer's real files and
 * folders (the File System Access API); Bear remembers each file it was given under a path like
 * "Computer/3f9a1c2e/Report.docx". Other browsers keep documents in the browser's own storage
 * (IndexedDB) under paths like "Bear/Report.docx", and "Show in folder" downloads a copy. App data
 * (notebooks, tasks, boards, sites) and recent files are stored as JSON, like userData on the desktop.
 */

/** Where new documents are saved when the browser can't save to the computer. */
const DOCS = 'Bear'
/** Paths of files and folders on the computer start with this. */
const DISK = 'Computer'

interface StoredFile {
  path: string
  data: Uint8Array
  modified: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('bear', 2)
    req.onupgradeneeded = () => {
      const stores = req.result.objectStoreNames
      if (!stores.contains('files')) req.result.createObjectStore('files', { keyPath: 'path' })
      if (!stores.contains('data')) req.result.createObjectStore('data')
      // Handles to files and folders on the computer, by their Bear path.
      if (!stores.contains('handles')) req.result.createObjectStore('handles', { keyPath: 'path' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function run<T>(store: 'files' | 'data' | 'handles', mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const tx = (await db()).transaction(store, mode)
  const req = op(tx.objectStore(store))
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result as T)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Storage was full or unavailable.'))
  })
}

// ---- Files on the computer (File System Access API: Chrome, Edge, Opera) ----

type Mode = 'read' | 'readwrite'
interface Permissioned {
  queryPermission(o: { mode: Mode }): Promise<PermissionState>
  requestPermission(o: { mode: Mode }): Promise<PermissionState>
}
type FileHandle = FileSystemFileHandle & Permissioned
type DirHandle = FileSystemDirectoryHandle & Permissioned & { values(): AsyncIterable<FileHandle | DirHandle> }
type PickerTypes = { description: string; accept: Record<string, string[]> }[]
interface Pickers {
  showOpenFilePicker(o: { types?: PickerTypes }): Promise<FileHandle[]>
  showSaveFilePicker(o: { suggestedName: string; types?: PickerTypes }): Promise<FileHandle>
  showDirectoryPicker(o: { mode: 'readwrite' }): Promise<DirHandle>
}
const pickers = 'showSaveFilePicker' in window ? (window as unknown as Pickers) : null

interface StoredHandle {
  path: string
  handle: FileHandle | DirHandle
}

const onDisk = (path: string) => path.startsWith(`${DISK}/`)
const cancelled = (e: unknown) => (e as Error).name === 'AbortError'

function pickerTypes(filters?: FileFilter[]): PickerTypes | undefined {
  const types = filters
    ?.filter((f) => f.extensions.length && !f.extensions.includes('*'))
    .map((f) => ({ description: f.name, accept: { 'application/octet-stream': f.extensions.map((e) => `.${e}`) } }))
  return types?.length ? types : undefined
}

/**
 * The Bear path for a file or folder the user picked. A file keeps the path it had if it was picked
 * before, so it appears once in Recent. A folder gets a new one, so picking it again (to allow access
 * again after the browser restarted) makes Sites reload it.
 */
async function remember(handle: FileHandle | DirHandle): Promise<string> {
  if (handle.kind === 'file') {
    for (const known of await run<StoredHandle[]>('handles', 'readonly', (s) => s.getAll())) {
      if (known.handle.kind === 'file' && (await known.handle.isSameEntry(handle))) return known.path
    }
  }
  const path = `${DISK}/${crypto.randomUUID().slice(0, 8)}/${handle.name}`
  await run('handles', 'readwrite', (s) => s.put({ path, handle } satisfies StoredHandle))
  return path
}

/** Has the user let Bear use this file or folder? Asks if not (which needs a click or key press). */
async function allowed(handle: Permissioned, mode: Mode): Promise<boolean> {
  if ((await handle.queryPermission({ mode })) === 'granted') return true
  return (await handle.requestPermission({ mode }).catch(() => 'denied')) === 'granted'
}

/** The handle behind a "Computer/..." path: a picked file, a picked folder, or something inside one. */
async function handleAt(path: string): Promise<FileHandle | DirHandle> {
  const roots = await run<StoredHandle[]>('handles', 'readonly', (s) => s.getAll())
  const root = roots.find((r) => path === r.path || (r.handle.kind === 'directory' && path.startsWith(`${r.path}/`)))
  if (!root) throw new Error(`${baseName(path)} was not found`)
  let handle = root.handle
  const parts = path.slice(root.path.length).split('/').filter(Boolean)
  for (const [i, part] of parts.entries()) {
    const dir = handle as DirHandle
    const last = i === parts.length - 1
    handle = (last ? await dir.getFileHandle(part).catch(() => dir.getDirectoryHandle(part)) : await dir.getDirectoryHandle(part)) as FileHandle | DirHandle
  }
  return handle
}

async function readFromDisk(path: string): Promise<OpenedFile> {
  const handle = await handleAt(path)
  if (handle.kind !== 'file') throw new Error(`${baseName(path)} is a folder`)
  // Ask for edit access now, while the user has just clicked, so later saves (and AutoSave) don't
  // need to ask. Reading alone is enough to open the file if they say no.
  if (!(await allowed(handle, 'readwrite')) && !(await allowed(handle, 'read'))) {
    throw new Error(`Bear wasn't allowed to open ${handle.name}`)
  }
  const file = await handle.getFile()
  return { path, name: handle.name, data: new Uint8Array(await file.arrayBuffer()) }
}

async function saveToDisk(path: string, data: Uint8Array): Promise<void> {
  const handle = await handleAt(path)
  if (handle.kind !== 'file') throw new Error(`${baseName(path)} is a folder`)
  if (!(await allowed(handle, 'readwrite'))) {
    throw new Error(`Bear needs your permission to save ${handle.name}. Press Ctrl+S to allow it.`)
  }
  const writable = await handle.createWritable()
  await writable.write(new Uint8Array(data))
  await writable.close()
}

async function listDiskFolder(path: string): Promise<FolderEntry[]> {
  const dir = await handleAt(path)
  if (dir.kind !== 'directory') throw new Error(`${baseName(path)} is not a folder`)
  if (!(await allowed(dir, 'readwrite')) && !(await allowed(dir, 'read'))) {
    throw new Error(`Your browser needs you to allow the ${dir.name} folder again: choose it again in this site's settings.`)
  }
  const entries: FolderEntry[] = []
  for await (const entry of dir.values()) {
    if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue
    const file = entry.kind === 'file' ? await (entry as FileHandle).getFile() : null
    entries.push({ name: entry.name, path: `${path}/${entry.name}`, isDir: !file, size: file?.size ?? 0, modified: file?.lastModified ?? 0 })
  }
  return entries
}

// ---- Files in the browser's own storage ----

async function readStored(path: string): Promise<OpenedFile> {
  const file = await run<StoredFile | undefined>('files', 'readonly', (s) => s.get(path))
  if (!file) throw new Error(`${path} was not found`)
  return { path, name: baseName(path), data: file.data }
}

async function saveStored(path: string, data: Uint8Array): Promise<void> {
  // Copy, so later edits to the caller's buffer can't change what was saved.
  await run('files', 'readwrite', (s) => s.put({ path, data: data.slice(), modified: Date.now() } satisfies StoredFile))
}

const readDocument = (path: string) => (onDisk(path) ? readFromDisk(path) : readStored(path))
const saveDocument = (path: string, data: Uint8Array) => (onDisk(path) ? saveToDisk(path, data) : saveStored(path, data))

/** Open a file from the computer: the file itself where the browser allows it, else a copy in Bear's storage. */
async function pickFile(filters?: FileFilter[]): Promise<OpenedFile | null> {
  if (pickers) {
    try {
      const [handle] = await pickers.showOpenFilePicker({ types: pickerTypes(filters) })
      return await readFromDisk(await remember(handle))
    } catch (e) {
      if (cancelled(e)) return null
      throw e
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    const exts = filters?.flatMap((f) => f.extensions).filter((e) => e !== '*') ?? []
    if (exts.length) input.accept = exts.map((e) => `.${e}`).join(',')
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const data = new Uint8Array(await file.arrayBuffer())
      const path = `${DOCS}/${file.name}`
      await saveStored(path, data)
      resolve({ path, name: file.name, data })
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Save a copy of a stored document to the computer's Downloads folder. */
async function download(path: string): Promise<void> {
  if (onDisk(path)) {
    window.alert(`${baseName(path)} is saved on your computer, in the folder you chose.`)
    return
  }
  const { name, data } = await readStored(path)
  const url = URL.createObjectURL(new Blob([new Uint8Array(data)]))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const readJson = async <T>(key: string): Promise<T | null> => (await run<T | undefined>('data', 'readonly', (s) => s.get(key))) ?? null
const writeJson = (key: string, value: unknown) => run('data', 'readwrite', (s) => s.put(value, key))

const dataKey = (name: string) => {
  if (!DATA_NAME.test(name)) throw new Error(`Invalid data name: ${name}`)
  return `data/${name}`
}

async function getRecent(): Promise<RecentFile[]> {
  return parseRecent(JSON.stringify((await readJson('recent')) ?? []))
}

async function setRecent(list: RecentFile[]): Promise<RecentFile[]> {
  await writeJson('recent', list)
  return list
}

/** The files and folders directly inside `dir` (in Bear's storage, folders exist only as path prefixes). */
async function listFolder(dir: string): Promise<FolderEntry[]> {
  if (onDisk(dir)) return listDiskFolder(dir)
  const files = await run<StoredFile[]>('files', 'readonly', (s) => s.getAll())
  const prefix = `${dir.replace(/\/+$/, '')}/`
  const entries = new Map<string, FolderEntry>()
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue
    const rest = f.path.slice(prefix.length)
    const slash = rest.indexOf('/')
    const name = slash < 0 ? rest : rest.slice(0, slash)
    if (!name || name.startsWith('.') || name.startsWith('~$')) continue
    const existing = entries.get(name)
    if (slash < 0) entries.set(name, { name, path: f.path, isDir: false, size: f.data.byteLength, modified: f.modified })
    else if (!existing) entries.set(name, { name, path: prefix + name, isDir: true, size: 0, modified: f.modified })
    else existing.modified = Math.max(existing.modified, f.modified)
  }
  return [...entries.values()]
}

const unsupported = (what: string) => () => Promise.reject(new Error(`${what} isn't available in the web version yet.`))

// Browsers only show their own "Leave site?" prompt, so ask it whenever any app has unsaved work.
const closeHandlers = new Set<() => boolean>()
window.addEventListener('beforeunload', (e) => {
  if ([...closeHandlers].some((h) => !h())) e.preventDefault()
})

// Ask the browser not to clear Bear's storage when space runs low.
void navigator.storage?.persist?.()

export const webBridge: BearBridge = {
  platform: 'web',
  openFile: pickFile,
  readFile: readDocument,
  saveFile: saveDocument,
  chooseSavePath: async (defaultName, filters) => {
    if (pickers) {
      try {
        return await remember(await pickers.showSaveFilePicker({ suggestedName: defaultName, types: pickerTypes(filters) }))
      } catch (e) {
        if (cancelled(e)) return null
        throw e
      }
    }
    const answer = window.prompt('Save as', defaultName)
    if (answer === null) return null
    const name = baseName(answer.trim() || defaultName)
    const ext = filters[0]?.extensions[0]
    return `${DOCS}/${ext && !name.toLowerCase().endsWith(`.${ext}`) ? withExtension(name, ext) : name}`
  },
  // The print dialog's "Save as PDF" destination makes the PDF.
  exportPdf: async () => {
    window.print()
    return null
  },
  getRecent,
  addRecent: async (path, app) =>
    setRecent(addRecent(await getRecent(), { path, name: baseName(path), app: app ?? appForFile(path) ?? 'write', openedAt: Date.now() })),
  removeRecent: async (path) => setRecent(removeRecent(await getRecent(), path)),
  showInFolder: download,
  setTitle: (title) => {
    document.title = title
  },
  takeLaunchFile: async () => null,
  readData: <T>(name: string) => readJson<T>(dataKey(name)),
  writeData: (name, value) => writeJson(dataKey(name), value).then(() => {}),
  deleteData: async (name) => {
    await run('data', 'readwrite', (s) => s.delete(dataKey(name)))
  },
  // Sites document libraries: a real folder where the browser allows it, else Bear's storage.
  chooseFolder: async () => {
    if (!pickers) return DOCS
    try {
      return await remember(await pickers.showDirectoryPicker({ mode: 'readwrite' }))
    } catch (e) {
      if (cancelled(e)) return null
      throw e
    }
  },
  listFolder,
  openExternal: download,
  onCloseRequest: (handler) => {
    closeHandlers.add(handler)
    return () => closeHandlers.delete(handler)
  },
  forceClose: () => {},
  mail: Object.fromEntries(MAIL_METHODS.map((m) => [m, unsupported('Mail')])) as unknown as BearBridge['mail']
}
