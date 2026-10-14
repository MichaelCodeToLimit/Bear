import FormulaParser, { FormulaError } from 'fast-formula-parser'
import { key, type Sheet, type Workbook } from './model'
import { parseLiteral } from './values'
import { EXTRA_FUNCTIONS, formulaArgs } from './functions'
import { parseRange } from './refs'

export interface ErrorValue {
  error: string
}

export type Value = number | string | boolean | null | ErrorValue

export const isError = (v: Value): v is ErrorValue => typeof v === 'object' && v !== null

const CYCLE = '#CYCLE!'

/**
 * Lazily evaluates cells with a per-version cache. Callers bump the cache with `invalidate()` after
 * any edit; values are then recomputed on demand (only what is visible or referenced).
 */
export class Engine {
  private cache = new Map<string, Value>()
  private computing = new Set<string>()
  /** Sheets whose formulas are being evaluated (innermost last), for INDIRECT. */
  private evaluating: Sheet[] = []
  private parser: FormulaParser

  constructor(private wb: Workbook) {
    this.parser = new FormulaParser({
      functions: { ...EXTRA_FUNCTIONS, INDIRECT: (...args: unknown[]) => this.indirect(formulaArgs(args)[0]) },
      onCell: ({ sheet, row, col }) => this.toParser(this.valueByName(sheet, row - 1, col - 1)),
      onRange: ({ sheet, from, to }) => {
        const s = this.sheetByName(sheet)
        if (!s) return [[new FormulaError('#REF!')]]
        // Whole-column/row ranges (A:A) arrive with huge bounds; clamp them to the used area.
        let maxRow = 0
        let maxCol = 0
        for (const k of s.cells.keys()) {
          const i = k.indexOf(',')
          maxRow = Math.max(maxRow, Number(k.slice(0, i)))
          maxCol = Math.max(maxCol, Number(k.slice(i + 1)))
        }
        const r2 = Math.min(to.row - 1, maxRow)
        const c2 = Math.min(to.col - 1, maxCol)
        const out: unknown[][] = []
        for (let r = from.row - 1; r <= r2; r++) {
          const row: unknown[] = []
          for (let c = from.col - 1; c <= c2; c++) row.push(this.toParser(this.valueOf(s, r, c)))
          out.push(row)
        }
        return out.length ? out : [[null]]
      }
    })
  }

  setWorkbook(wb: Workbook): void {
    this.wb = wb
    this.invalidate()
  }

  invalidate(): void {
    this.cache.clear()
  }

  private sheetByName(name: string): Sheet | undefined {
    const n = name.replace(/^'|'$/g, '').toLowerCase()
    return this.wb.sheets.find((s) => s.name.toLowerCase() === n)
  }

  private valueByName(sheet: string, row: number, col: number): Value {
    const s = this.sheetByName(sheet)
    return s ? this.valueOf(s, row, col) : { error: '#REF!' }
  }

  private toParser(v: Value): unknown {
    return isError(v) ? new FormulaError(v.error) : v
  }

  /** The computed value of a cell. */
  valueOf(sheet: Sheet, row: number, col: number): Value {
    const k = `${sheet.id}:${key(row, col)}`
    const cached = this.cache.get(k)
    if (cached !== undefined) return cached
    const raw = sheet.cells.get(key(row, col))?.raw ?? ''
    if (!raw.startsWith('=') || raw.length === 1) {
      const v = parseLiteral(raw).value
      this.cache.set(k, v)
      return v
    }
    if (this.computing.has(k)) return { error: CYCLE }
    this.computing.add(k)
    this.evaluating.push(sheet)
    let v: Value
    try {
      v = this.normalize(this.parser.parse(raw.slice(1), { sheet: sheet.name, row: row + 1, col: col + 1 }))
    } catch (e) {
      // Unknown functions show #NAME? like other spreadsheets.
      const msg = String((e as Error)?.message ?? e)
      v = { error: /not implemented/i.test(msg) ? '#NAME?' : e instanceof FormulaError ? e.error ?? String(e) : '#ERROR!' }
    } finally {
      this.computing.delete(k)
      this.evaluating.pop()
    }
    this.cache.set(k, v)
    return v
  }

  /** INDIRECT("A1" | "Sheet2!B3" | "A1:B4"): the value(s) at a reference given as text. */
  private indirect(arg: unknown): unknown {
    const text = String((arg as { value?: unknown })?.value ?? arg ?? '').trim()
    const bang = text.lastIndexOf('!')
    const sheet = bang >= 0 ? this.sheetByName(text.slice(0, bang)) : this.evaluating[this.evaluating.length - 1]
    const range = parseRange(bang >= 0 ? text.slice(bang + 1) : text)
    if (!sheet || !range) return new FormulaError('#REF!')
    if (range.r1 === range.r2 && range.c1 === range.c2) return this.toParser(this.valueOf(sheet, range.r1, range.c1))
    const out: unknown[][] = []
    for (let r = range.r1; r <= range.r2; r++) {
      const row: unknown[] = []
      for (let c = range.c1; c <= range.c2; c++) row.push(this.toParser(this.valueOf(sheet, r, c)))
      out.push(row)
    }
    return out
  }

  private normalize(r: unknown): Value {
    if (r instanceof FormulaError) return { error: r.error ?? String(r) }
    if (Array.isArray(r)) return this.normalize(Array.isArray(r[0]) ? r[0][0] : r[0])
    if (r === undefined || r === null) return 0
    if (typeof r === 'number') return Number.isFinite(r) ? r : { error: '#NUM!' }
    if (typeof r === 'string' || typeof r === 'boolean') return r
    return String(r)
  }
}
