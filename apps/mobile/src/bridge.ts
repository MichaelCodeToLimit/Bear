import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import {
  DATA_NAME, MAIL_METHODS, addRecent, appForFile, baseName, parseRecent, removeRecent, withExtension,
  type BearBridge, type FileFilter, type FolderEntry, type OpenedFile, type RecentFile
} from '@bear/core'

/**
 * window.bear for Android. Paths are relative to the phone's Documents folder; Bear's own files
 * go in Documents/Bear. App data (notebooks, tasks, boards, sites) and recent files live in the
 * app's private storage, like userData on the desktop.
 */

/** Where new documents are saved (Documents/Bear). */
const DOCS = 'Bear'

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function readText(path: string, directory: Directory): Promise<string | null> {
  try {
    const { data } = await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 })
    return typeof data === 'string' ? data : await data.text()
  } catch {
    return null // missing file
  }
}

async function writeText(path: string, directory: Directory, data: string): Promise<void> {
  await Filesystem.writeFile({ path, directory, data, encoding: Encoding.UTF8, recursive: true })
}

async function readDocument(path: string): Promise<OpenedFile> {
  const { data } = await Filesystem.readFile({ path, directory: Directory.Documents })
  const bytes = typeof data === 'string' ? fromBase64(data) : new Uint8Array(await data.arrayBuffer())
  return { path, name: baseName(path), data: bytes }
}

async function saveDocument(path: string, data: Uint8Array): Promise<void> {
  await Filesystem.writeFile({ path, directory: Directory.Documents, data: toBase64(data), recursive: true })
}

/** A file the user picked elsewhere on the phone: Bear works on a copy in Documents/Bear. */
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

const recentFile = 'recent.json'

async function getRecent(): Promise<RecentFile[]> {
  return parseRecent((await readText(recentFile, Directory.Data)) ?? '[]')
}

async function setRecent(list: RecentFile[]): Promise<RecentFile[]> {
  await writeText(recentFile, Directory.Data, JSON.stringify(list))
  return list
}

const dataFile = (name: string) => {
  if (!DATA_NAME.test(name)) throw new Error(`Invalid data name: ${name}`)
  return `data/${name}.json`
}

const unsupported = (what: string) => () => Promise.reject(new Error(`${what} isn't available on Android yet.`))

export const androidBridge: BearBridge = {
  platform: 'android',
  openFile: pickFile,
  readFile: readDocument,
  saveFile: saveDocument,
  chooseSavePath: async (defaultName, filters) => {
    // Android's prompt doesn't prefill its default value, so name it and accept an empty answer.
    const answer = window.prompt(`Save in Documents/${DOCS} as (leave empty for "${defaultName}")`, defaultName)
    if (answer === null) return null
    const name = answer.trim() || defaultName
    const ext = filters[0]?.extensions[0]
    const withExt = ext && !name.toLowerCase().endsWith(`.${ext}`) ? withExtension(name, ext) : name
    return `${DOCS}/${baseName(withExt)}`
  },
  exportPdf: async () => {
    window.alert("Export to PDF isn't available on Android yet.")
    return null
  },
  getRecent,
  addRecent: async (path, app) =>
    setRecent(addRecent(await getRecent(), { path, name: baseName(path), app: app ?? appForFile(path) ?? 'write', openedAt: Date.now() })),
  removeRecent: async (path) => setRecent(removeRecent(await getRecent(), path)),
  showInFolder: async (path) => window.alert(`Saved in your phone's Documents folder:\n${path}`),
  setTitle: (title) => {
    document.title = title
  },
  takeLaunchFile: async () => null,
  readData: async <T>(name: string) => {
    const text = await readText(dataFile(name), Directory.Data)
    return text === null ? null : (JSON.parse(text) as T)
  },
  writeData: (name, value) => writeText(dataFile(name), Directory.Data, JSON.stringify(value)),
  deleteData: async (name) => {
    await Filesystem.deleteFile({ path: dataFile(name), directory: Directory.Data }).catch(() => {})
  },
  // Sites document libraries: Android has no folder picker for apps, so libraries use Documents/Bear.
  chooseFolder: async () => {
    await Filesystem.mkdir({ path: DOCS, directory: Directory.Documents, recursive: true }).catch(() => {})
    return DOCS
  },
  listFolder: async (dir) => {
    const { files } = await Filesystem.readdir({ path: dir, directory: Directory.Documents })
    return files
      .filter((f) => !f.name.startsWith('.') && !f.name.startsWith('~$'))
      .map((f): FolderEntry => ({ name: f.name, path: `${dir}/${f.name}`, isDir: f.type === 'directory', size: f.size, modified: f.mtime }))
  },
  openExternal: unsupported('Opening files in other apps'),
  // Android apps aren't "closed" with unsaved work the way desktop windows are; AutoSave covers it.
  onCloseRequest: () => () => {},
  forceClose: () => {},
  mail: Object.fromEntries(MAIL_METHODS.map((m) => [m, unsupported('Mail')])) as unknown as BearBridge['mail']
}
