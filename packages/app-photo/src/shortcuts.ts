export type Command =
  | 'undo' | 'redo' | 'selectAll' | 'deselect' | 'invertSelection' | 'copy' | 'cut' | 'paste' | 'delete'
  | 'zoomIn' | 'zoomOut' | 'fit' | 'actual' | 'swapColors' | 'resetColors' | 'brushSmaller' | 'brushBigger'
  | 'save' | 'saveAs' | 'open' | 'new'

export interface KeyChord {
  key: string
  /** Ctrl, or Cmd on a Mac. */
  ctrl: boolean
  shift: boolean
  alt: boolean
}

const CTRL: Record<string, Command> = {
  a: 'selectAll', d: 'deselect', c: 'copy', x: 'cut', v: 'paste', y: 'redo', z: 'undo',
  '=': 'zoomIn', '+': 'zoomIn', '-': 'zoomOut', '0': 'fit', '1': 'actual',
  s: 'save', o: 'open', n: 'new'
}

/** The command a key chord stands for, or null. Tool letters are the tools' own business. */
export function shortcutFor(e: KeyChord): Command | null {
  if (e.alt) return null
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (e.ctrl) {
    if (e.shift) {
      if (k === 'z') return 'redo'
      if (k === 'i') return 'invertSelection'
      if (k === 's') return 'saveAs'
      // Ctrl+Shift+= types "+": still zoom in.
      return k === '+' ? 'zoomIn' : null
    }
    return CTRL[k] ?? null
  }
  if (k === 'Delete' || k === 'Backspace') return 'delete'
  if (k === 'x') return 'swapColors'
  if (k === 'd') return 'resetColors'
  if (k === '[') return 'brushSmaller'
  if (k === ']') return 'brushBigger'
  return null
}
