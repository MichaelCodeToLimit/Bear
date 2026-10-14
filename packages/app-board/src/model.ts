export interface BoardInfo {
  id: string
  name: string
  created: number
  modified: number
  /** Small PNG data URL for the gallery. */
  preview: string | null
}

export interface BoardsIndex {
  version: 1
  boards: BoardInfo[]
}

/** What gets saved for one board: Excalidraw's scene, minus transient UI state. */
export interface BoardScene {
  elements: unknown[]
  appState: { viewBackgroundColor?: string; gridModeEnabled?: boolean }
  files: Record<string, unknown>
}

let n = 0
export const uid = () => `w${Date.now().toString(36)}${(n++).toString(36)}`

export const initialIndex = (): BoardsIndex => ({ version: 1, boards: [] })

export function upgradeIndex(raw: unknown): BoardsIndex | null {
  const d = raw as Partial<BoardsIndex> | null
  return d && Array.isArray(d.boards) ? { version: 1, boards: d.boards } : null
}

export const emptyScene = (): BoardScene => ({ elements: [], appState: { viewBackgroundColor: '#ffffff' }, files: {} })

export function upgradeScene(raw: unknown): BoardScene | null {
  const s = raw as Partial<BoardScene> | null
  return s && Array.isArray(s.elements) ? { elements: s.elements, appState: s.appState ?? {}, files: s.files ?? {} } : null
}

/** Storage key for a board's scene. */
export const sceneKey = (id: string) => `board-${id}`

export function addBoard(d: BoardsIndex, name: string): { data: BoardsIndex; board: BoardInfo } {
  const now = Date.now()
  const used = new Set(d.boards.map((b) => b.name))
  let title = name.trim() || 'Untitled board'
  for (let i = 2; used.has(title); i++) title = `${name.trim() || 'Untitled board'} ${i}`
  const board: BoardInfo = { id: uid(), name: title, created: now, modified: now, preview: null }
  return { data: { ...d, boards: [board, ...d.boards] }, board }
}

export function patchBoard(d: BoardsIndex, id: string, patch: Partial<BoardInfo>): BoardsIndex {
  return { ...d, boards: d.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)) }
}

export function removeBoard(d: BoardsIndex, id: string): BoardsIndex {
  return { ...d, boards: d.boards.filter((b) => b.id !== id) }
}

/** Most recently edited first. */
export const sortedBoards = (d: BoardsIndex) => [...d.boards].sort((a, b) => b.modified - a.modified)
