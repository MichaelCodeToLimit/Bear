import * as formulajs from '@formulajs/formulajs'
import { FormulaError } from 'fast-formula-parser'

/**
 * Excel functions that fast-formula-parser lacks, filled in from formulajs (MIT).
 * Names with dots (STDEV.S) are looked up as nested properties.
 */
const FROM_FORMULAJS = [
  'MAX', 'MIN', 'MAXIFS', 'MINIFS', 'MEDIAN', 'MODE', 'MODE.SNGL', 'LARGE', 'SMALL', 'RANK', 'RANK.EQ',
  'STDEV', 'STDEV.S', 'STDEV.P', 'STDEVA', 'VAR', 'VAR.S', 'VAR.P', 'PERCENTILE', 'QUARTILE',
  'COUNTA', 'COUNTBLANK', 'COUNTIFS', 'SUMIFS', 'AVERAGEIFS', 'AVERAGEA', 'MAXA', 'MINA',
  'SWITCH', 'CHOOSE', 'MATCH', 'TEXTJOIN', 'UPPER', 'SUBSTITUTE', 'VALUE', 'ISODD',
  'PMT', 'FV', 'PV', 'NPV', 'IRR', 'RATE', 'NPER', 'IPMT', 'PPMT', 'XNPV', 'XIRR'
]

/** A parser argument: fast-formula-parser hands custom functions wrapped values. */
interface Arg {
  value: unknown
  isRangeRef?: boolean
}

const flat = (v: unknown): unknown[] => (Array.isArray(v) ? v.flat(Infinity) : [v])

const unwrap = (a: unknown) => (a && typeof a === 'object' && 'value' in (a as Arg) ? (a as Arg).value : a)

/**
 * For some names (CHOOSE, INDIRECT…) the parser passes itself as an extra first argument.
 * Drop it so every function sees just the formula's arguments.
 */
export function formulaArgs(args: unknown[]): unknown[] {
  const first = args[0] as Record<string, unknown> | undefined
  return first && typeof first === 'object' && 'functions' in first && typeof first.parse === 'function' ? args.slice(1) : args
}

/**
 * Statistics functions ignore blank and text cells inside ranges (but not typed arguments),
 * matching Excel: MEDIAN(A1:A5) skips empty cells instead of counting them as 0.
 */
const NUMBERS_ONLY_IN_RANGES = new Set([
  'MAX', 'MIN', 'MEDIAN', 'MODE', 'MODE.SNGL', 'LARGE', 'SMALL', 'STDEV', 'STDEV.S', 'STDEV.P',
  'VAR', 'VAR.S', 'VAR.P', 'PERCENTILE', 'QUARTILE', 'RANK', 'RANK.EQ'
])

const numbersOnly = (a: unknown) =>
  a && typeof a === 'object' && (a as Arg).isRangeRef
    ? flat((a as Arg).value).filter((v) => typeof v === 'number' || v instanceof FormulaError)
    : unwrap(a)

function firstError(values: unknown[]): FormulaError | null {
  for (const v of values) {
    if (v instanceof FormulaError) return v
    if (Array.isArray(v)) {
      const inner = firstError(v.flat(Infinity))
      if (inner) return inner
    }
  }
  return null
}

/** Convert a formulajs result into something the parser understands. */
function toParser(result: unknown): unknown {
  if (result instanceof Error) return new FormulaError(result.message.startsWith('#') ? result.message : '#VALUE!')
  if (result === undefined) return new FormulaError('#VALUE!')
  if (typeof result === 'number' && !Number.isFinite(result)) return new FormulaError('#NUM!')
  return result
}

function lookup(name: string): ((...args: unknown[]) => unknown) | undefined {
  let fn: unknown = formulajs
  for (const part of name.split('.')) fn = (fn as Record<string, unknown> | undefined)?.[part]
  return typeof fn === 'function' ? (fn as (...args: unknown[]) => unknown) : undefined
}

/** Legacy Excel names that formulajs only provides under their modern dotted names. */
const ALIASES: Record<string, string> = {
  MODE: 'MODE.SNGL',
  RANK: 'RANK.EQ',
  STDEV: 'STDEV.S',
  VAR: 'VAR.S',
  PERCENTILE: 'PERCENTILE.INC',
  QUARTILE: 'QUARTILE.INC'
}

function adapt(name: string) {
  const fn = lookup(ALIASES[name] ?? name)
  if (!fn) throw new Error(`formulajs has no ${name}`)
  const pick = NUMBERS_ONLY_IN_RANGES.has(name) ? numbersOnly : unwrap
  return (...raw: unknown[]) => {
    const values = formulaArgs(raw).map(pick)
    // Errors in arguments propagate, as in Excel (COUNTA/COUNTBLANK just count cells).
    if (name !== 'COUNTA' && name !== 'COUNTBLANK') {
      const err = firstError(values)
      if (err) return err
    }
    try {
      return toParser(fn(...values))
    } catch (e) {
      return toParser(e)
    }
  }
}


/** XLOOKUP(lookup, lookup_array, return_array, [if_not_found], [match_mode], [search_mode]) */
function XLOOKUP(...args: unknown[]) {
  const [needle, haystack, results, ifNotFound, matchMode = 0, searchMode = 1] = formulaArgs(args).map(unwrap)
  const keys = flat(haystack)
  const vals = flat(results)
  const norm = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : v)
  const order = searchMode === -1 ? [...keys.keys()].reverse() : [...keys.keys()]
  let found = order.find((i) => norm(keys[i]) === norm(needle))
  if (found === undefined && (matchMode === -1 || matchMode === 1) && typeof needle === 'number') {
    // -1: exact or next smaller, 1: exact or next larger.
    let best: number | undefined
    for (const i of order) {
      const k = keys[i]
      if (typeof k !== 'number') continue
      const ok = matchMode === -1 ? k <= needle : k >= needle
      const better = best === undefined || (matchMode === -1 ? k > (keys[best] as number) : k < (keys[best] as number))
      if (ok && better) best = i
    }
    found = best
  }
  if (found === undefined) return ifNotFound !== undefined && ifNotFound !== null ? ifNotFound : new FormulaError('#N/A')
  return vals[found] ?? new FormulaError('#N/A')
}

export const EXTRA_FUNCTIONS: Record<string, (...args: unknown[]) => unknown> = {
  ...Object.fromEntries(FROM_FORMULAJS.map((n) => [n, adapt(n)])),
  XLOOKUP
}
