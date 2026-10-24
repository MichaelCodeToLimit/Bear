import { Directory, Filesystem } from '@capacitor/filesystem'
import { appForFile, baseName, extensionOf, stripExtension, type AppId, type FolderEntry } from '@bear/core'

/** Documents live in the phone's Documents/Bear folder (the bridge reads and writes them there). */
export const DOCS = 'Bear'

export async function listDocs(dir = DOCS): Promise<FolderEntry[]> {
  await Filesystem.mkdir({ path: DOCS, directory: Directory.Documents, recursive: true }).catch(() => {})
  const entries = await window.bear.listFolder(dir)
  return entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || b.modified - a.modified)
}

export async function deleteDoc(path: string): Promise<void> {
  await Filesystem.deleteFile({ path, directory: Directory.Documents })
  await window.bear.removeRecent(path)
}

/** Rename keeping the extension; returns the new path. */
export async function renameDoc(path: string, name: string): Promise<string> {
  const dir = path.slice(0, path.length - baseName(path).length)
  const ext = extensionOf(path)
  const to = await uniquePath(`${dir}${safeName(name)}.${ext}`)
  await Filesystem.rename({ from: path, to, directory: Directory.Documents, toDirectory: Directory.Documents })
  await window.bear.removeRecent(path)
  const app = appForFile(to)
  if (app) await window.bear.addRecent(to, app)
  return to
}

export const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled'

async function exists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: Directory.Documents })
    return true
  } catch {
    return false
  }
}

/** `Bear/Report.docx`, or `Bear/Report (2).docx` if that's taken. */
export async function uniquePath(path: string): Promise<string> {
  if (!(await exists(path))) return path
  const ext = extensionOf(path)
  const stem = stripExtension(path)
  for (let i = 2; ; i++) {
    const p = `${stem} (${i}).${ext}`
    if (!(await exists(p))) return p
  }
}

/** Save a new document in Documents/Bear and add it to Recent. */
export async function saveNew(name: string, ext: string, data: Uint8Array, app: AppId): Promise<string> {
  const path = await uniquePath(`${DOCS}/${safeName(stripExtension(name))}.${ext}`)
  await window.bear.saveFile(path, data)
  await window.bear.addRecent(path, app)
  return path
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
