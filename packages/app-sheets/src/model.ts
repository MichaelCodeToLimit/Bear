import { adjustFormula, normRange, type Range } from './refs'

export type HAlign = 'left' | 'center' | 'right'

export interface CellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  fill?: string
  align?: HAlign
  wrap?: boolean
  fontSize?: number
  /** Excel-style number format, e.g. "0.00", "$#,##0.00", "0%", "yyyy-mm-dd". */
  numFmt?: string
}

export interface Cell {
  /** What the user typed: "=SUM(A1:A3)", "12.5", "hello". */
  raw: string
  style?: CellStyle
}

export type ChartType = 'bar' | 'column' | 'line' | 'pie'

export interface Chart {
  id: string
  type: ChartType
  /** Source data range, first row = series names, first column = categories. */
  range: Range
  title: string
  x: number
  y: number
  w: number
  h: number
}

export interface Sheet {
  id: string
  name: string
  /** Keyed by "row,col" (0-based). */
  cells: Map<string, Cell>
  colWidths: Map<number, number>
  rowHeights: Map<number, number>
  merges: Range[]
  frozen: { rows: number; cols: number }
  charts: Chart[]
}

export interface Workbook {
  sheets: Sheet[]
}

export const DEFAULT_COL_WIDTH = 88
export const DEFAULT_ROW_HEIGHT = 24

export const key = (row: number, col: number) => `${row},${col}`

export function parseKey(k: string): [number, number] {
  const i = k.indexOf(',')
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))]
}

let idCounter = 0
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`

export function newSheet(name: string): Sheet {
  return {
    id: newId('s'),
    name,
    cells: new Map(),
    colWidths: new Map(),
    rowHeights: new Map(),
    merges: [],
    frozen: { rows: 0, cols: 0 },
    charts: []
  }
}

export function newWorkbook(): Workbook {
  return { sheets: [newSheet('Sheet1')] }
}

export function uniqueSheetName(wb: Workbook, base = 'Sheet'): string {
  for (let i = wb.sheets.length + 1; ; i++) {
    const name = `${base}${i}`
    if (!wb.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) return name
  }
}

/** Extent of used cells (inclusive), or null for an empty sheet. */
export function usedRange(sheet: Sheet): Range | null {
  let r2 = -1
  let c2 = -1
  for (const [k, cell] of sheet.cells) {
    if (!cell.raw) continue
    const [r, c] = parseKey(k)
    if (r > r2) r2 = r
    if (c > c2) c2 = c
  }
  return r2 < 0 ? null : { r1: 0, c1: 0, r2, c2 }
}

/** The merge that covers a cell, if any. */
export function mergeAt(sheet: Sheet, row: number, col: number): Range | undefined {
  return sheet.merges.find((m) => row >= m.r1 && row <= m.r2 && col >= m.c1 && col <= m.c2)
}

/**
 * Insert (count > 0) or delete (count < 0) rows/columns at `at`, shifting cells, sizes and merges,
 * and rewriting every formula in the workbook that points at the changed sheet.
 */
export function shiftAxis(wb: Workbook, sheet: Sheet, axis: 'row' | 'col', at: number, count: number): void {
  const moved = new Map<string, Cell>()
  for (const [k, cell] of sheet.cells) {
    let [r, c] = parseKey(k)
    const v = axis === 'row' ? r : c
    if (count < 0 && v >= at && v < at - count) continue // deleted
    if (v >= at) {
      if (axis === 'row') r += count
      else c += count
    }
    moved.set(key(r, c), cell)
  }
  sheet.cells = moved

  const sizes = axis === 'row' ? sheet.rowHeights : sheet.colWidths
  const shifted = new Map<number, number>()
  for (const [i, size] of sizes) {
    if (count < 0 && i >= at && i < at - count) continue
    shifted.set(i >= at ? i + count : i, size)
  }
  if (axis === 'row') sheet.rowHeights = shifted
  else sheet.colWidths = shifted

  sheet.merges = sheet.merges
    .map((m) => {
      const [a, b] = axis === 'row' ? [m.r1, m.r2] : [m.c1, m.c2]
      if (count < 0 && a >= at && b < at - count) return null
      const na = a >= at ? Math.max(at, a + count) : a
      const nb = b >= at ? Math.max(na, b + count) : b
      return axis === 'row' ? { ...m, r1: na, r2: nb } : { ...m, c1: na, c2: nb }
    })
    .filter((m): m is Range => !!m && (m.r1 !== m.r2 || m.c1 !== m.c2))

  // Cells are treated as immutable (undo snapshots share them), so rewritten formulas get new objects.
  for (const s of wb.sheets) {
    for (const [k, cell] of s.cells) {
      if (!cell.raw.startsWith('=')) continue
      const raw = adjustFormula(cell.raw, axis, at, count, sheet.name, s.name)
      if (raw !== cell.raw) s.cells.set(k, { ...cell, raw })
    }
  }
}

export function cloneCell(c: Cell | undefined): Cell | undefined {
  return c ? { raw: c.raw, style: c.style ? { ...c.style } : undefined } : undefined
}

export function rangeCells(r: Range): [number, number][] {
  const n = normRange(r)
  const out: [number, number][] = []
  for (let row = n.r1; row <= n.r2; row++) for (let col = n.c1; col <= n.c2; col++) out.push([row, col])
  return out
}
