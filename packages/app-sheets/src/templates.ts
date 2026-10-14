import { key, newId, newSheet, type CellStyle, type Workbook } from './model'

export interface SheetTemplate {
  id: string
  name: string
  description: string
  build: () => Workbook
}

type Row = (string | [string, CellStyle])[]

function fromRows(name: string, rows: Row[], widths: number[] = []): Workbook {
  const sheet = newSheet(name)
  rows.forEach((row, r) =>
    row.forEach((v, c) => {
      const [raw, style] = Array.isArray(v) ? v : [v, undefined]
      if (raw || style) sheet.cells.set(key(r, c), { raw, style })
    })
  )
  widths.forEach((w, c) => w && sheet.colWidths.set(c, w))
  return { sheets: [sheet] }
}

const H: CellStyle = { bold: true, fill: '#d6e9e1', color: '#134e4a' }
const MONEY: CellStyle = { numFmt: '$#,##0.00' }
const TOTAL: CellStyle = { bold: true, numFmt: '$#,##0.00' }

export const SHEET_TEMPLATES: SheetTemplate[] = [
  { id: 'blank', name: 'Blank workbook', description: 'Start from an empty grid', build: () => ({ sheets: [newSheet('Sheet1')] }) },
  {
    id: 'budget',
    name: 'Monthly budget',
    description: 'Income, expenses and a chart',
    build: () => {
      const wb = fromRows(
        'Budget',
        [
          [['Monthly budget', { bold: true, fontSize: 18, color: '#134e4a' }]],
          [],
          [['Category', H], ['Planned', { ...H, align: 'right' }], ['Actual', { ...H, align: 'right' }], ['Difference', { ...H, align: 'right' }]],
          ['Rent', ['1200', MONEY], ['1200', MONEY], ['=B4-C4', MONEY]],
          ['Groceries', ['450', MONEY], ['512.4', MONEY], ['=B5-C5', MONEY]],
          ['Transport', ['160', MONEY], ['138', MONEY], ['=B6-C6', MONEY]],
          ['Utilities', ['210', MONEY], ['198.75', MONEY], ['=B7-C7', MONEY]],
          ['Fun', ['200', MONEY], ['265', MONEY], ['=B8-C8', MONEY]],
          ['Savings', ['500', MONEY], ['500', MONEY], ['=B9-C9', MONEY]],
          [['Total', { bold: true }], ['=SUM(B4:B9)', TOTAL], ['=SUM(C4:C9)', TOTAL], ['=SUM(D4:D9)', TOTAL]]
        ],
        [140, 100, 100, 100]
      )
      wb.sheets[0].frozen = { rows: 3, cols: 0 }
      wb.sheets[0].charts.push({ id: newId('c'), type: 'column', range: { r1: 2, c1: 0, r2: 8, c2: 2 }, title: 'Planned vs actual', x: 470, y: 20, w: 460, h: 280 })
      return wb
    }
  },
  {
    id: 'invoice',
    name: 'Invoice',
    description: 'Line items with tax and total',
    build: () =>
      fromRows(
        'Invoice',
        [
          [['INVOICE', { bold: true, fontSize: 20, color: '#134e4a' }], '', '', ['Invoice #', { bold: true }], '0001'],
          ['Your Company', '', '', ['Date', { bold: true }], [new Date().toISOString().slice(0, 10), { numFmt: 'yyyy-mm-dd', align: 'left' }]],
          ['123 Street, City'],
          [],
          [['Bill to', { bold: true }]],
          ['Client name'],
          [],
          [['Description', H], ['Qty', { ...H, align: 'right' }], ['Unit price', { ...H, align: 'right' }], ['Amount', { ...H, align: 'right' }]],
          ['Design work', '10', ['85', MONEY], ['=B9*C9', MONEY]],
          ['Hosting (12 months)', '1', ['240', MONEY], ['=B10*C10', MONEY]],
          ['', '', '', ['=B11*C11', MONEY]],
          [],
          ['', '', ['Subtotal', { bold: true, align: 'right' }], ['=SUM(D9:D11)', MONEY]],
          ['', ['Tax rate', { align: 'right' }], ['8%', { numFmt: '0%' }], ['=D13*C14', MONEY]],
          ['', '', ['Total', { bold: true, align: 'right' }], ['=D13+D14', { ...TOTAL, fill: '#d6e9e1' }]]
        ],
        [200, 80, 100, 110, 110]
      )
  },
  {
    id: 'tracker',
    name: 'Task tracker',
    description: 'Tasks with owners, dates and status',
    build: () => {
      const wb = fromRows(
        'Tasks',
        [
          [['Task', H], ['Owner', H], ['Due', H], ['Status', H], ['Done %', { ...H, align: 'right' }]],
          ['Draft plan', 'Alex', ['2026-11-02', { numFmt: 'yyyy-mm-dd' }], 'In progress', ['50%', { numFmt: '0%' }]],
          ['Review budget', 'Sam', ['2026-11-05', { numFmt: 'yyyy-mm-dd' }], 'Not started', ['0%', { numFmt: '0%' }]],
          ['Kickoff meeting', 'Jo', ['2026-10-28', { numFmt: 'yyyy-mm-dd' }], 'Done', ['100%', { numFmt: '0%' }]],
          [],
          [['Overall', { bold: true }], '', '', '', ['=AVERAGE(E2:E4)', { bold: true, numFmt: '0%' }]]
        ],
        [200, 100, 100, 110, 80]
      )
      wb.sheets[0].frozen = { rows: 1, cols: 0 }
      return wb
    }
  }
]
