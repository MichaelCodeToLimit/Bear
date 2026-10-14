import { describe, expect, it } from 'vitest'
import { Engine } from './engine'
import { key, newSheet, type Workbook } from './model'

/** A small table: names in A, regions in B, sales in C. */
function workbook(): Workbook {
  const s = newSheet('Sheet1')
  const rows = [
    ['Name', 'Region', 'Sales'],
    ['Ann', 'North', '120'],
    ['Bob', 'South', '80'],
    ['Cy', 'North', '200'],
    ['Di', 'East', ''],
    ['Ed', 'South', '50']
  ]
  rows.forEach((r, i) => r.forEach((v, j) => v && s.cells.set(key(i, j), { raw: v })))
  const other = newSheet('Data')
  other.cells.set(key(0, 0), { raw: '42' })
  return { sheets: [s, other] }
}

function evaluate(formula: string) {
  const wb = workbook()
  const s = wb.sheets[0]
  s.cells.set(key(20, 0), { raw: formula })
  return new Engine(wb).valueOf(s, 20, 0)
}

describe('Excel functions', () => {
  it.each([
    ['=MAX(C2:C6)', 200],
    ['=MIN(C2:C6)', 50],
    ['=MEDIAN(C2:C6)', 100],
    ['=LARGE(C2:C6,2)', 120],
    ['=SMALL(C2:C6,1)', 50],
    ['=COUNTA(A1:A6)', 6],
    ['=COUNTBLANK(C2:C6)', 1],
    ['=COUNTIFS(B2:B6,"North",C2:C6,">100")', 2],
    ['=SUMIFS(C2:C6,B2:B6,"South")', 130],
    ['=AVERAGEIFS(C2:C6,B2:B6,"North")', 160],
    ['=MAXIFS(C2:C6,B2:B6,"South")', 80],
    ['=MINIFS(C2:C6,B2:B6,"North")', 120],
    ['=MATCH("Cy",A1:A6,0)', 4],
    ['=INDEX(C1:C6,MATCH("Bob",A1:A6,0))', 80],
    ['=XLOOKUP("Ed",A2:A6,C2:C6)', 50],
    ['=XLOOKUP("Zed",A2:A6,C2:C6,"none")', 'none'],
    ['=CHOOSE(2,"a","b","c")', 'b'],
    ['=SWITCH(B3,"North",1,"South",2,0)', 2],
    ['=TEXTJOIN(", ",TRUE,A2:A4)', 'Ann, Bob, Cy'],
    ['=UPPER(A2)', 'ANN'],
    ['=SUBSTITUTE("a-b-c","-","+")', 'a+b+c'],
    ['=VALUE("12.5")', 12.5],
    ['=ISODD(3)', true],
    ['=RANK(C3,C2:C6)', 3],
    ['=STDEV.S(C2:C6)', 65], // blank C5 ignored: sqrt(12675 / 3)
    ['=ROUND(PMT(0.05/12,60,-10000),2)', 188.71],
    ['=INDIRECT("C4")', 200],
    ['=SUM(INDIRECT("C2:C3"))', 200],
    ['=INDIRECT("Data!A1")', 42]
  ])('%s', (formula, expected) => {
    expect(evaluate(formula)).toEqual(expected)
  })

  it('propagates errors from referenced cells', () => {
    expect(evaluate('=MAX(1/0,2)')).toEqual({ error: '#DIV/0!' })
    expect(evaluate('=XLOOKUP("Zed",A2:A6,C2:C6)')).toEqual({ error: '#N/A' })
  })

  it('implements every commonly used function', () => {
    const common = `SUM SUMIF SUMIFS SUMPRODUCT AVERAGE AVERAGEIF AVERAGEIFS COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS
      MAX MIN MAXIFS MINIFS MEDIAN MODE LARGE SMALL RANK STDEV STDEV.S STDEV.P VAR VAR.S ROUND ROUNDUP ROUNDDOWN INT
      ABS MOD POWER SQRT PRODUCT CEILING FLOOR RAND RANDBETWEEN PI LN LOG LOG10 EXP IF IFS IFERROR IFNA AND OR NOT
      XOR SWITCH CHOOSE VLOOKUP HLOOKUP XLOOKUP INDEX MATCH INDIRECT ROW ROWS COLUMN COLUMNS CONCAT CONCATENATE
      TEXTJOIN LEFT RIGHT MID LEN UPPER LOWER PROPER TRIM SUBSTITUTE REPLACE FIND SEARCH TEXT VALUE REPT EXACT TODAY
      NOW DATE YEAR MONTH DAY WEEKDAY WEEKNUM HOUR MINUTE SECOND EDATE EOMONTH NETWORKDAYS WORKDAY DAYS TIME
      DATEVALUE ISBLANK ISNUMBER ISTEXT ISERROR ISNA ISEVEN ISODD N NA PMT FV PV NPV IRR RATE NPER SIGN TRUNC GCD
      LCM FACT COMBIN`.split(/\s+/)
    const wb = workbook()
    const engine = new Engine(wb)
    const missing = common.filter((fn) => {
      // Calling with no arguments yields an argument error for real functions, #NAME? for unknown ones.
      wb.sheets[0].cells.set(key(30, 0), { raw: `=${fn}()` })
      engine.invalidate()
      const v = engine.valueOf(wb.sheets[0], 30, 0)
      return typeof v === 'object' && v !== null && v.error === '#NAME?'
    })
    expect(missing).toEqual([])
  })
})


