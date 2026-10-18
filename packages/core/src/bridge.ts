import type { AppId } from './apps'
import type { RecentFile } from './recent'
import type { MailBridge } from './mail'

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface FolderEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: number
}

/** Names usable with readData/writeData: letters, digits, dash, underscore, dot. */
export const DATA_NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/i

/** Names usable with the recovery API: one Photo recovery copy per window session. */
export const RECOVERY_NAME = /^[a-z0-9-]{1,64}\.bearphoto$/

/** Crash-recovery copies of unsaved work, stored in Bear's data folder (userData/recovery). */
export interface RecoveryBridge {
  /** Write (or replace) a recovery copy, atomically. */
  write(name: string, data: Uint8Array): Promise<void>
  /** Recovery copies left behind, newest first. Copies another open window is still writing are left out. */
  list(): Promise<{ name: string; savedAt: number }[]>
  read(name: string): Promise<Uint8Array>
  remove(name: string): Promise<void>
}

export interface OpenedFile {
  path: string
  name: string
  data: Uint8Array
}

/** The typed API the preload script exposes to the renderer as `window.bear`. */
export interface BearBridge {
  platform: string
  openFile(filters?: FileFilter[]): Promise<OpenedFile | null>
  readFile(path: string): Promise<OpenedFile>
  saveFile(path: string, data: Uint8Array): Promise<void>
  /** Ask where to save; returns the chosen path (nothing is written yet). */
  chooseSavePath(defaultName: string, filters: FileFilter[]): Promise<string | null>
  exportPdf(defaultName: string): Promise<string | null>
  getRecent(): Promise<RecentFile[]>
  addRecent(path: string, app: AppId): Promise<RecentFile[]>
  removeRecent(path: string): Promise<RecentFile[]>
  showInFolder(path: string): Promise<void>
  setTitle(title: string): void
  /** The document this window was opened for (from Explorer/Finder), once; null afterwards. */
  takeLaunchFile(): Promise<string | null>
  /** App data (notebooks, task lists, boards, sites), stored as JSON in Bear's data folder. */
  readData<T = unknown>(name: string): Promise<T | null>
  writeData(name: string, value: unknown): Promise<void>
  deleteData(name: string): Promise<void>
  /** Pick a folder; returns its path. */
  chooseFolder(title?: string): Promise<string | null>
  listFolder(path: string): Promise<FolderEntry[]>
  /** Open a file with the system's default app. */
  openExternal(path: string): Promise<void>
  /** Called when the window is about to close. Return false to cancel the close. */
  onCloseRequest(handler: () => boolean): () => void
  /** Tell the main process the user chose to close anyway. */
  forceClose(): void
  mail: MailBridge
  recovery: RecoveryBridge
}

declare global {
  interface Window {
    bear: BearBridge
  }
}
