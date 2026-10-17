import {
  DATA_NAME, MAIL_METHODS, addRecent, appForFile, baseName, parseRecent, removeRecent, withExtension,
  type BearBridge, type FileFilter, type FolderEntry, type OpenedFile, type RecentFile
} from '@bear/core'

/**
 * window.bear for browsers. Documents live in the browser's own storage (IndexedDB) under paths
 * like "Bear/Report.docx", so Save and AutoSave work without a folder on disk. "Show in folder"
 * downloads a copy, and Open can also take any file from the computer. App data (notebooks, tasks,
 * boards, sites) and recent files are stored as JSON, like userData on the desktop.
 */

/** Where new documents are saved. */
const DOCS = 'Bear'

interface StoredFile {
  path: string
  data: Uint8Array
  modified: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('bear', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('files', { keyPath: 'path' })
      req.result.createObjectStore('data')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function run<T>(store: 'files' | 'data', mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const tx = (await db()).transaction(store, mode)
  const req = op(tx.objectStore(store))
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result as T)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Storage was full or unavailable.'))
  })
}

async function readDocument(path: string): Promise<OpenedFile> {
  const file = await run<StoredFile | undefined>('files', 'readonly', (s) => s.get(path))
  if (!file) throw new Error(`${path} was not found`)
  return { path, name: baseName(path), data: file.data }
}

async function saveDocument(path: string, data: Uint8Array): Promise<void> {
  // Copy, so later edits to the caller's buffer can't change what was saved.
  await run('files', 'readwrite', (s) => s.put({ path, data: data.slice(), modified: Date.now() } satisfies StoredFile))
}

/** A file from the computer: Bear works on a copy in its own storage. */
function pickFile(filters?: FileFilter[]): Promise<OpenedFile | null> {
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
      await saveDocument(path, data)
      resolve({ path, name: file.name, data })
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Save a copy of a stored document to the computer's Downloads folder. */
async function download(path: string): Promise<void> {
  const { name, data } = await readDocument(path)
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

/** The files and folders directly inside `dir` (folders exist only as path prefixes). */
async function listFolder(dir: string): Promise<FolderEntry[]> {
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
  // Sites document libraries: the browser has no folders of its own, so libraries use Bear's storage.
  chooseFolder: async () => DOCS,
  listFolder,
  openExternal: download,
  onCloseRequest: (handler) => {
    closeHandlers.add(handler)
    return () => closeHandlers.delete(handler)
  },
  forceClose: () => {},
  mail: Object.fromEntries(MAIL_METHODS.map((m) => [m, unsupported('Mail')])) as unknown as BearBridge['mail']
}
