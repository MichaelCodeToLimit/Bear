import type { AppId } from './apps'
import { enabledApps } from './editions'

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function extensionOf(path: string): string {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/** Which ready app opens a given file path, or null if none can. */
export function appForFile(path: string): AppId | null {
  const ext = extensionOf(path)
  const app = enabledApps().find((a) => a.ready && a.extensions.includes(ext))
  return app ? app.id : null
}

/**
 * Documents to open from a launch command line (Explorer's "Open with", a double-click on a
 * .docx, or a second launch while Bear is running). Drops the executable, switches and anything
 * that isn't an existing file a Bear app can open.
 */
export function launchFiles(argv: string[], isFile: (path: string) => boolean): string[] {
  return argv.slice(1).filter((a) => !a.startsWith('-') && appForFile(a) !== null && isFile(a))
}

/** Replace (or add) the extension on a path or file name. */
export function withExtension(path: string, ext: string): string {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? path.slice(0, path.length - (name.length - dot)) : path
  return `${stem}.${ext}`
}
