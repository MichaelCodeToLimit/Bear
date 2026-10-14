import { SSF } from 'fast-formula-parser'
import type { ErrorValue, Value } from './engine'

/** Days between the Excel epoch (1899-12-30) and the Unix epoch. */
const EXCEL_EPOCH_OFFSET = 25569

export function dateToSerial(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) / 86_400_000 + EXCEL_EPOCH_OFFSET
}

export function serialToDate(serial: number): Date {
  return new Date((serial - EXCEL_EPOCH_OFFSET) * 86_400_000)
}

const ERRORS = ['#DIV/0!', '#N/A', '#NAME?', '#NULL!', '#NUM!', '#REF!', '#VALUE!', '#ERROR!', '#CYCLE!']

/**
 * Interpret typed text the way a spreadsheet does: numbers, percentages, currency, booleans and
 * ISO / US dates become typed values, with a suggested number format.
 */
export function parseLiteral(raw: string): { value: Value; numFmt?: string } {
  const s = raw.trim()
  if (s === '') return { value: null }
  if (raw.startsWith("'")) return { value: raw.slice(1) } // leading apostrophe forces text
  const up = s.toUpperCase()
  if (up === 'TRUE' || up === 'FALSE') return { value: up === 'TRUE' }
  if (ERRORS.includes(up)) return { value: { error: up } as ErrorValue }

  const num = /^[+-]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?(e[+-]?\d+)?$/i
  if (num.test(s) && /\d/.test(s)) return { value: Number(s.replace(/,/g, '')) }

  let m = /^([+-]?[\d,]*\.?\d+)\s*%$/.exec(s)
  if (m) return { value: Number(m[1].replace(/,/g, '')) / 100, numFmt: '0%' }

  m = /^(-?)\$\s*([\d,]*\.?\d+)$/.exec(s)
  if (m) return { value: Number(m[1] + m[2].replace(/,/g, '')), numFmt: '$#,##0.00' }

  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) {
    return { value: dateToSerial(+m[1], +m[2], +m[3]), numFmt: 'yyyy-mm-dd' }
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) {
    return { value: dateToSerial(+m[3], +m[1], +m[2]), numFmt: 'm/d/yyyy' }
  }
  return { value: raw }
}

/** Format a computed value for display in a cell. */
export function formatValue(v: Value, numFmt?: string): string {
  if (v === null) return ''
  if (typeof v === 'object') return v.error
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'string') return v
  try {
    if (numFmt && numFmt !== 'General') return SSF.format(numFmt, v)
  } catch {
    /* fall through to General */
  }
  return formatGeneral(v)
}

function formatGeneral(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n)
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 1e11 || abs < 1e-9)) return n.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E')
  return String(Number(n.toPrecision(11)))
}

/** Numbers right-align, everything else left — unless the cell says otherwise. */
export function defaultAlign(v: Value): 'left' | 'right' | 'center' {
  if (typeof v === 'number') return 'right'
  if (typeof v === 'boolean' || (typeof v === 'object' && v !== null)) return 'center'
  return 'left'
}

export function asNumber(v: Value): number | null {
  return typeof v === 'number' ? v : null
}

/** Number format presets offered in the ribbon. */
export const NUMBER_FORMATS: { value: string; label: string }[] = [
  { value: 'General', label: 'General' },
  { value: '0.00', label: 'Number' },
  { value: '$#,##0.00', label: 'Currency' },
  { value: '#,##0', label: 'Thousands' },
  { value: '0%', label: 'Percent' },
  { value: '0.00%', label: 'Percent (0.00)' },
  { value: 'yyyy-mm-dd', label: 'Date (ISO)' },
  { value: 'm/d/yyyy', label: 'Short date' },
  { value: 'mmmm d, yyyy', label: 'Long date' },
  { value: 'h:mm AM/PM', label: 'Time' },
  { value: '0.00E+00', label: 'Scientific' },
  { value: '@', label: 'Text' }
]

/** Add or remove one decimal place from a number format. */
export function stepDecimals(fmt: string | undefined, dir: 1 | -1): string {
  const base = !fmt || fmt === 'General' ? '0' : fmt
  const m = /0(\.0*)?(?![^"]*")/.exec(base)
  if (!m) return base
  const decimals = m[1] ? m[1].length - 1 : 0
  const next = Math.max(0, decimals + dir)
  const rep = next ? `0.${'0'.repeat(next)}` : '0'
  return base.slice(0, m.index) + rep + base.slice(m.index + m[0].length)
}
