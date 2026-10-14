/** A1-style address helpers and formula reference rewriting. Rows and columns are 0-based internally. */

export interface Pos {
  row: number
  col: number
}

export interface Range {
  r1: number
  c1: number
  r2: number
  c2: number
}

export const MAX_ROWS = 100_000
export const MAX_COLS = 702 // A..ZZ

export function colName(col: number): string {
  let s = ''
  let n = col + 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function colIndex(name: string): number {
  let n = 0
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export function addr(row: number, col: number): string {
  return `${colName(col)}${row + 1}`
}

export function parseAddr(a: string): Pos | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a.trim())
  if (!m) return null
  return { row: Number(m[2]) - 1, col: colIndex(m[1]) }
}

export function normRange(r: Range): Range {
  return {
    r1: Math.min(r.r1, r.r2),
    c1: Math.min(r.c1, r.c2),
    r2: Math.max(r.r1, r.r2),
    c2: Math.max(r.c1, r.c2)
  }
}

export function rangeAddr(r: Range): string {
  const n = normRange(r)
  const a = addr(n.r1, n.c1)
  return n.r1 === n.r2 && n.c1 === n.c2 ? a : `${a}:${addr(n.r2, n.c2)}`
}

export function parseRange(s: string): Range | null {
  const [a, b] = s.split(':')
  const p = parseAddr(a)
  const q = b ? parseAddr(b) : p
  if (!p || !q) return null
  return normRange({ r1: p.row, c1: p.col, r2: q.row, c2: q.col })
}

export function inRange(r: Range, row: number, col: number): boolean {
  const n = normRange(r)
  return row >= n.r1 && row <= n.r2 && col >= n.c1 && col <= n.c2
}

// ---------- Formula rewriting ----------

// A cell reference, optionally sheet-qualified ('My Sheet'!A1 or Sheet1!$A$1), not preceded by a letter,
// digit, dot or underscore (so function names like LOG10 and decimals are left alone).
const REF = /(^|[^A-Za-z0-9_.!'$])((?:'[^']+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g

/** Apply `fn` to every cell reference in a formula, skipping string literals. */
function mapRefs(
  formula: string,
  fn: (ref: { sheet: string | null; colAbs: boolean; col: number; rowAbs: boolean; row: number }) => string
): string {
  // Split on string literals so their contents are never rewritten.
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(REF, (_m, pre: string, sheet: string | undefined, ca: string, c: string, ra: string, r: string) => {
            const col = colIndex(c)
            if (col >= MAX_COLS) return _m // e.g. "ABCD1" isn't a reference
            const out = fn({ sheet: sheet ? sheet.slice(0, -1) : null, colAbs: !!ca, col, rowAbs: !!ra, row: Number(r) - 1 })
            return pre + (sheet ?? '') + out
          })
    )
    .join('')
}

function fmtRef(colAbs: boolean, col: number, rowAbs: boolean, row: number): string {
  if (row < 0 || col < 0) return '#REF!'
  return `${colAbs ? '$' : ''}${colName(col)}${rowAbs ? '$' : ''}${row + 1}`
}

/** Shift relative references, as when copying a formula by (dRow, dCol). Absolute parts ($) stay put. */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  if (!formula.startsWith('=')) return formula
  return mapRefs(formula, (r) =>
    fmtRef(r.colAbs, r.colAbs ? r.col : r.col + dCol, r.rowAbs, r.rowAbs ? r.row : r.row + dRow)
  )
}

/**
 * Adjust references after inserting (count > 0) or deleting (count < 0) rows or columns at `at`
 * on `sheetName`. References into deleted cells become #REF!. Applies to absolute refs too.
 */
export function adjustFormula(
  formula: string,
  axis: 'row' | 'col',
  at: number,
  count: number,
  sheetName: string,
  formulaSheet: string
): string {
  if (!formula.startsWith('=')) return formula
  return mapRefs(formula, (r) => {
    const target = r.sheet ? r.sheet.replace(/^'|'$/g, '') : formulaSheet
    if (target !== sheetName) return fmtRef(r.colAbs, r.col, r.rowAbs, r.row)
    let { row, col } = r
    const v = axis === 'row' ? row : col
    let nv = v
    if (count > 0 && v >= at) nv = v + count
    if (count < 0) {
      if (v >= at && v < at - count) nv = -1
      else if (v >= at - count) nv = v + count
    }
    if (axis === 'row') row = nv
    else col = nv
    return fmtRef(r.colAbs, col, r.rowAbs, row)
  })
}
