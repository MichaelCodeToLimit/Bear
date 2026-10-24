import { appForFile, baseName, extensionOf, stripExtension, type AppId, type FolderEntry } from '@bear/core'
import { deleteStored, renameStored, storedExists } from './bridge'

// The phone UI's file helpers (apps/mobile/src/phone/files.ts) for browsers: the same functions,
// with documents in the browser's storage instead of the phone's Documents folder. The web build
// swaps this file in for the Android one (see vite.config.ts).

/** Documents live under Bear/ in the browser's storage. */
export const DOCS = 'Bear'

export async function listDocs(dir = DOCS): Promise<FolderEntry[]> {
  const entries = await window.bear.listFolder(dir)
  return entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || b.modified - a.modified)
}

export async function deleteDoc(path: string): Promise<void> {
  await deleteStored(path)
  await window.bear.removeRecent(path)
}

/** Rename keeping the extension; returns the new path. */
export async function renameDoc(path: string, name: string): Promise<string> {
  const dir = path.slice(0, path.length - baseName(path).length)
  const ext = extensionOf(path)
  const to = await uniquePath(`${dir}${safeName(name)}.${ext}`)
  await renameStored(path, to)
  await window.bear.removeRecent(path)
  const app = appForFile(to)
  if (app) await window.bear.addRecent(to, app)
  return to
}

export const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled'

/** `Bear/Report.docx`, or `Bear/Report (2).docx` if that's taken. */
export async function uniquePath(path: string): Promise<string> {
  if (!(await storedExists(path))) return path
  const ext = extensionOf(path)
  const stem = stripExtension(path)
  for (let i = 2; ; i++) {
    const p = `${stem} (${i}).${ext}`
    if (!(await storedExists(p))) return p
  }
}

/** Save a new document under Bear/ and add it to Recent. */
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
