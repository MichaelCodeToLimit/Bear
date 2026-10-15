import FormulaParser, { FormulaError } from 'fast-formula-parser'

const SIZE = 3
const CYCLE = '#CYCLE!'
const REF = '#REF!'

/** Shows a number with at most 6 significant digits. */
function formatNumber(n: number): string {
  return Number.isFinite(n) ? String(Number(n.toPrecision(6))) : '#NUM!'
}

/** Maps anything thrown or returned by the engine to a spreadsheet error code. */
function errorCode(e: unknown): string {
  // Unknown functions arrive as a generic #ERROR! whose message says "not implemented".
  if (/not implemented/i.test(String((e as Error)?.message ?? e))) return '#NAME?'
  if (e instanceof FormulaError) return e.error || '#ERROR!'
  return '#ERROR!'
}

type Cell = number | string | FormulaError | null

/**
 * Evaluates a 3x3 grid of cell inputs (A1 is `inputs[0][0]`, C3 is `inputs[2][2]`) and returns the
 * text to display for each cell. Never throws: every failure becomes an error code in its cell.
 */
export function evaluateGrid(inputs: string[][]): string[][] {
  const raw = (r: number, c: number): string => String(inputs[r]?.[c] ?? '')
  const cache = new Map<string, Cell>()
  const computing = new Set<string>()
  let badRange = false

  const inGrid = (row: number, col: number) => row >= 0 && row < SIZE && col >= 0 && col < SIZE

  const valueOf = (r: number, c: number): Cell => {
    const k = `${r},${c}`
    const cached = cache.get(k)
    if (cached !== undefined) return cached
    const text = raw(r, c)
    let v: Cell
    if (text.startsWith('=') && text.length > 1) {
      if (computing.has(k)) return new FormulaError(CYCLE)
      computing.add(k)
      const outer = badRange
      try {
        badRange = false
        const result = parser.parse(text.slice(1), { sheet: 'Sheet1', row: r + 1, col: c + 1 })
        const sawBad = badRange
        if (sawBad) throw new FormulaError(REF)
        const first = Array.isArray(result) ? (Array.isArray(result[0]) ? result[0][0] : result[0]) : result
        if (first instanceof FormulaError) v = first
        else if (typeof first === 'number') v = first
        else if (typeof first === 'boolean') v = first ? 'TRUE' : 'FALSE'
        else v = first === undefined || first === null ? 0 : String(first)
      } catch (e) {
        v = new FormulaError(errorCode(e))
      } finally {
        badRange = outer
        computing.delete(k)
      }
    } else if (text.trim() !== '' && Number.isFinite(Number(text))) {
      v = Number(text)
    } else {
      v = text === '' ? null : text
    }
    cache.set(k, v)
    return v
  }

  const parser = new FormulaParser({
    onCell: ({ row, col }) => (inGrid(row - 1, col - 1) ? valueOf(row - 1, col - 1) : new FormulaError(REF)),
    onRange: ({ from, to }) => {
      if (!inGrid(from.row - 1, from.col - 1) || !inGrid(to.row - 1, to.col - 1)) {
        // The engine swallows errors raised here, so flag it and let valueOf report #REF!.
        badRange = true
        return [[new FormulaError(REF)]]
      }
      const out: unknown[][] = []
      for (let r = from.row - 1; r <= to.row - 1; r++) {
        const line: unknown[] = []
        for (let c = from.col - 1; c <= to.col - 1; c++) line.push(valueOf(r, c))
        out.push(line)
      }
      return out
    }
  })

  const out: string[][] = []
  for (let r = 0; r < SIZE; r++) {
    const line: string[] = []
    for (let c = 0; c < SIZE; c++) {
      let v: Cell
      try {
        v = valueOf(r, c)
      } catch {
        v = new FormulaError('#ERROR!')
      }
      line.push(v === null ? '' : v instanceof FormulaError ? v.error || '#ERROR!' : typeof v === 'number' ? formatNumber(v) : v)
    }
    out.push(line)
  }
  return out
}
