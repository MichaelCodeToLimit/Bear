import { describe, expect, it } from 'vitest'
import { adjustFormula, colIndex, colName, parseRange, rangeAddr, shiftFormula } from './refs'
import { Engine } from './engine'
import { key, newSheet, shiftAxis, type Workbook } from './model'
import { formatValue, parseLiteral, stepDecimals } from './values'

function wbWith(cells: Record<string, string>, name = 'Sheet1'): Workbook {
  const s = newSheet(name)
  for (const [a, raw] of Object.entries(cells)) {
    const r = parseRange(a)!
    s.cells.set(key(r.r1, r.c1), { raw })
  }
  return { sheets: [s] }
}

describe('addresses', () => {
  it('converts column names', () => {
    expect(colName(0)).toBe('A')
    expect(colName(25)).toBe('Z')
    expect(colName(26)).toBe('AA')
    expect(colName(701)).toBe('ZZ')
    expect(colIndex('AB')).toBe(27)
    expect(rangeAddr({ r1: 2, c1: 3, r2: 0, c2: 1 })).toBe('B1:D3')
  })
})

describe('formula rewriting', () => {
  it('shifts relative references when copying', () => {
    expect(shiftFormula('=A1+$B$2+C$3+$D4', 1, 2)).toBe('=C2+$B$2+E$3+$D5')
    expect(shiftFormula('=SUM(A1:B2)', 3, 0)).toBe('=SUM(A4:B5)')
  })

  it('leaves strings, function names and sheet-qualified names intact', () => {
    expect(shiftFormula('="A1"&A1', 1, 0)).toBe('="A1"&A2')
    expect(shiftFormula('=LOG10(A1)', 1, 0)).toBe('=LOG10(A2)')
    expect(shiftFormula("='My Data'!A1+Sheet2!B2", 1, 1)).toBe("='My Data'!B2+Sheet2!C3")
  })

  it('produces #REF! when a copy moves off the grid', () => {
    expect(shiftFormula('=A1', -1, 0)).toBe('=#REF!')
  })

  it('adjusts references for inserted and deleted rows', () => {
    expect(adjustFormula('=A1+A5+$A$9', 'row', 2, 2, 'Sheet1', 'Sheet1')).toBe('=A1+A7+$A$11')
    expect(adjustFormula('=A1+A3+A5', 'row', 2, -1, 'Sheet1', 'Sheet1')).toBe('=A1+#REF!+A4')
    expect(adjustFormula('=Other!A5+A5', 'row', 0, 1, 'Other', 'Sheet1')).toBe('=Other!A6+A5')
  })
})

describe('literal parsing and formatting', () => {
  it('detects typed values', () => {
    expect(parseLiteral('42').value).toBe(42)
    expect(parseLiteral('1,234.5').value).toBe(1234.5)
    expect(parseLiteral('12%')).toEqual({ value: 0.12, numFmt: '0%' })
    expect(parseLiteral('$1,000')).toEqual({ value: 1000, numFmt: '$#,##0.00' })
    expect(parseLiteral('2026-10-14')).toEqual({ value: 46309, numFmt: 'yyyy-mm-dd' })
    expect(parseLiteral('true').value).toBe(true)
    expect(parseLiteral("'007").value).toBe('007')
    expect(parseLiteral('hello').value).toBe('hello')
    expect(parseLiteral('1.2.3').value).toBe('1.2.3')
  })

  it('formats numbers', () => {
    expect(formatValue(0.1 + 0.2)).toBe('0.3')
    expect(formatValue(1234.5, '$#,##0.00')).toBe('$1,234.50')
    expect(formatValue(0.256, '0.0%')).toBe('25.6%')
    expect(formatValue(46309, 'yyyy-mm-dd')).toBe('2026-10-14')
    expect(formatValue({ error: '#DIV/0!' })).toBe('#DIV/0!')
    expect(stepDecimals(undefined, 1)).toBe('0.0')
    expect(stepDecimals('$#,##0.00', -1)).toBe('$#,##0.0')
    expect(stepDecimals('0%', 1)).toBe('0.0%')
  })
})

describe('engine', () => {
  it('evaluates formulas, ranges and functions', () => {
    const wb = wbWith({ A1: '10', A2: '20', A3: '=SUM(A1:A2)', B1: '=A3*2', B2: '=IF(B1>50,"big","small")', B3: '=AVERAGE(A:A)' })
    const e = new Engine(wb)
    const s = wb.sheets[0]
    expect(e.valueOf(s, 2, 0)).toBe(30)
    expect(e.valueOf(s, 0, 1)).toBe(60)
    expect(e.valueOf(s, 1, 1)).toBe('big')
    expect(e.valueOf(s, 2, 1)).toBe(20)
  })

  it('reports errors and cycles', () => {
    const wb = wbWith({ A1: '=1/0', A2: '=A1+1', B1: '=B2', B2: '=B1', C1: '=NOPE(1)', C2: '=1+' })
    const e = new Engine(wb)
    const s = wb.sheets[0]
    expect(e.valueOf(s, 0, 0)).toEqual({ error: '#DIV/0!' })
    expect(e.valueOf(s, 1, 0)).toEqual({ error: '#DIV/0!' })
    expect(e.valueOf(s, 0, 1)).toEqual({ error: '#CYCLE!' })
    expect(e.valueOf(s, 0, 2)).toHaveProperty('error')
    expect(e.valueOf(s, 1, 2)).toHaveProperty('error')
  })

  it('references other sheets and recomputes after invalidation', () => {
    const wb = wbWith({ A1: '=Data!A1*2' })
    const data = newSheet('Data')
    data.cells.set(key(0, 0), { raw: '21' })
    wb.sheets.push(data)
    const e = new Engine(wb)
    expect(e.valueOf(wb.sheets[0], 0, 0)).toBe(42)
    data.cells.set(key(0, 0), { raw: '5' })
    e.invalidate()
    expect(e.valueOf(wb.sheets[0], 0, 0)).toBe(10)
  })
})

describe('structural edits', () => {
  it('inserts and deletes rows, keeping formulas pointed at the same data', () => {
    const wb = wbWith({ A1: '1', A2: '2', A3: '=A1+A2' })
    const s = wb.sheets[0]
    shiftAxis(wb, s, 'row', 1, 1) // insert a row above A2
    expect(s.cells.get(key(3, 0))?.raw).toBe('=A1+A3')
    expect(new Engine(wb).valueOf(s, 3, 0)).toBe(3)
    shiftAxis(wb, s, 'row', 0, -1) // delete row 1
    expect(s.cells.get(key(2, 0))?.raw).toBe('=#REF!+A2')
  })
})
