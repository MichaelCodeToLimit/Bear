import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { Engine } from './engine'
import { key, newSheet, type Workbook } from './model'
import { parseCsv, readWorkbook, sheetToCsv, writeWorkbook } from './file-io'

function sample(): Workbook {
  const s = newSheet('Budget')
  const set = (r: number, c: number, raw: string, style?: object) => s.cells.set(key(r, c), { raw, style })
  set(0, 0, 'Item', { bold: true, fill: '#ffeeaa' })
  set(0, 1, 'Cost', { bold: true, align: 'right' })
  set(1, 0, 'Rent')
  set(1, 1, '1200', { numFmt: '$#,##0.00' })
  set(2, 0, 'Food')
  set(2, 1, '350.5', { numFmt: '$#,##0.00' })
  set(3, 0, 'Total', { italic: true, color: '#c00000' })
  set(3, 1, '=SUM(B2:B3)', { numFmt: '$#,##0.00' })
  set(4, 0, "'00123")
  s.colWidths.set(0, 160)
  s.merges.push({ r1: 6, c1: 0, r2: 6, c2: 2 })
  set(6, 0, 'Merged note')
  s.frozen = { rows: 1, cols: 0 }
  s.charts.push({ id: 'c1', type: 'column', range: { r1: 0, c1: 0, r2: 2, c2: 1 }, title: 'Costs', x: 300, y: 20, w: 400, h: 260 })
  const other = newSheet('Other')
  other.cells.set(key(0, 0), { raw: '=Budget!B4/2' })
  return { sheets: [s, other] }
}

describe('xlsx round trip', () => {
  it('keeps values, formulas, styles, widths, merges, freeze panes and charts', async () => {
    const wb = sample()
    const bytes = await writeWorkbook('x.xlsx', wb, 0, new Engine(wb))
    expect(bytes[0]).toBe(0x50)

    // What other spreadsheet apps will see.
    const xl = new ExcelJS.Workbook()
    await xl.xlsx.load(bytes.buffer as ArrayBuffer)
    const ws = xl.getWorksheet('Budget')!
    expect(ws.getCell('B4').value).toEqual({ formula: 'SUM(B2:B3)', result: 1550.5 })
    expect(ws.getCell('A1').font.bold).toBe(true)
    expect(xl.getWorksheet('_bear_meta')!.state).toBe('veryHidden')

    const back = await readWorkbook('x.xlsx', bytes)
    expect(back.sheets.map((s) => s.name)).toEqual(['Budget', 'Other'])
    const b = back.sheets[0]
    expect(b.cells.get(key(3, 1))).toEqual({ raw: '=SUM(B2:B3)', style: { numFmt: '$#,##0.00' } })
    expect(b.cells.get(key(0, 0))?.style).toEqual({ bold: true, fill: '#ffeeaa' })
    expect(b.cells.get(key(3, 0))?.style).toEqual({ italic: true, color: '#c00000' })
    expect(b.cells.get(key(4, 0))?.raw).toBe("'00123")
    expect(b.colWidths.get(0)).toBe(160)
    expect(b.merges).toEqual([{ r1: 6, c1: 0, r2: 6, c2: 2 }])
    expect(b.frozen).toEqual({ rows: 1, cols: 0 })
    expect(b.charts[0]).toMatchObject({ type: 'column', title: 'Costs' })
    expect(new Engine(back).valueOf(back.sheets[1], 0, 0)).toBe(775.25)
  })
})

describe('csv', () => {
  it('parses quoted fields and line endings', () => {
    expect(parseCsv('a,"b,c","say ""hi"""\r\n1,2,3\n')).toEqual([['a', 'b,c', 'say "hi"'], ['1', '2', '3']])
  })

  it('exports displayed values and reads them back', async () => {
    const wb = sample()
    const csv = sheetToCsv(wb.sheets[0], new Engine(wb))
    expect(csv.split('\r\n')[3]).toBe('Total,"$1,550.50"')
    const back = await readWorkbook('x.csv', new TextEncoder().encode(csv))
    expect(back.sheets[0].cells.get(key(1, 0))?.raw).toBe('Rent')
  })
})
