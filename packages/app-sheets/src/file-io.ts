import ExcelJS from 'exceljs'
import { extensionOf, type FileFilter } from '@bear/core'
import { isError, type Engine, type Value } from './engine'
import {
  DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, key, newSheet, parseKey, type Cell, type CellStyle, type Chart,
  type Sheet, type Workbook
} from './model'
import { parseRange } from './refs'
import { dateToSerial, formatValue } from './values'

export const SAVE_FILTERS: FileFilter[] = [
  { name: 'Excel workbook', extensions: ['xlsx'] },
  { name: 'CSV (current sheet)', extensions: ['csv'] }
]

export const OPEN_FILTERS: FileFilter[] = [
  { name: 'Spreadsheets', extensions: ['xlsx', 'csv'] },
  { name: 'All files', extensions: ['*'] }
]

export const SAVABLE = new Set(['xlsx', 'csv'])

/** Hidden sheet that carries Bear-only data (charts) inside .xlsx files. */
const META_SHEET = '_bear_meta'

// Excel measures column width in "characters" of the default font; ~7px each plus padding.
const pxToChars = (px: number) => Math.round(((px - 5) / 7) * 100) / 100
const charsToPx = (ch: number) => Math.round(ch * 7 + 5)
// Row heights are in points.
const pxToPt = (px: number) => Math.round(px * 0.75 * 100) / 100
const ptToPx = (pt: number) => Math.round(pt / 0.75)

const argbToHex = (argb?: string) => (argb && /^[0-9A-F]{8}$/i.test(argb) ? `#${argb.slice(2).toLowerCase()}` : undefined)
const hexToArgb = (hex?: string) => (hex ? `FF${hex.replace('#', '').toUpperCase().padStart(6, '0')}` : undefined)

// ---------- Import ----------

export async function readWorkbook(path: string, data: Uint8Array): Promise<Workbook> {
  const ext = extensionOf(path)
  if (ext === 'csv') return { sheets: [csvToSheet(new TextDecoder().decode(data), 'Sheet1')] }
  return readXlsx(data)
}

async function readXlsx(data: Uint8Array): Promise<Workbook> {
  const xl = new ExcelJS.Workbook()
  await xl.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
  const sheets: Sheet[] = []
  let meta: { charts?: Record<string, Chart[]> } = {}

  xl.eachSheet((ws) => {
    if (ws.name === META_SHEET) {
      try {
        meta = JSON.parse(String(ws.getCell('A1').value ?? '{}'))
      } catch {
        /* ignore corrupt metadata */
      }
      return
    }
    const sheet = newSheet(ws.name)
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (row.height && Math.abs(ptToPx(row.height) - DEFAULT_ROW_HEIGHT) > 1) sheet.rowHeights.set(rowNumber - 1, ptToPx(row.height))
      row.eachCell({ includeEmpty: false }, (c, colNumber) => {
        if (c.isMerged && c.master !== c) return
        const cell = readCell(c)
        if (cell) sheet.cells.set(key(rowNumber - 1, colNumber - 1), cell)
      })
    })
    ws.columns?.forEach((col, i) => {
      if (col.width && Math.abs(charsToPx(col.width) - DEFAULT_COL_WIDTH) > 2) sheet.colWidths.set(i, charsToPx(col.width))
    })
    for (const m of ws.model.merges ?? []) {
      const r = parseRange(m)
      if (r) sheet.merges.push(r)
    }
    const view = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number } | undefined
    if (view?.state === 'frozen') sheet.frozen = { rows: view.ySplit ?? 0, cols: view.xSplit ?? 0 }
    sheet.charts = meta.charts?.[ws.name] ?? []
    sheets.push(sheet)
  })
  // Metadata may come after the sheets it describes.
  for (const s of sheets) if (!s.charts.length && meta.charts?.[s.name]) s.charts = meta.charts[s.name]
  return { sheets: sheets.length ? sheets : [newSheet('Sheet1')] }
}

function readCell(c: ExcelJS.Cell): Cell | null {
  const style = readStyle(c)
  const v = c.value as unknown
  let raw = ''
  if (v === null || v === undefined) raw = ''
  else if (typeof v === 'number') raw = String(v)
  else if (typeof v === 'boolean') raw = v ? 'TRUE' : 'FALSE'
  else if (typeof v === 'string') raw = needsQuote(v) ? `'${v}` : v
  else if (v instanceof Date) {
    raw = String(dateToSerial(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) + (v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds()) / 86400)
    if (!style.numFmt) style.numFmt = 'yyyy-mm-dd'
  } else if (typeof v === 'object') {
    const o = v as { formula?: string; sharedFormula?: string; result?: unknown; richText?: { text: string }[]; text?: string; error?: string }
    if (o.formula) raw = `=${o.formula}`
    else if (o.sharedFormula) raw = `=${(c as unknown as { formula: string }).formula ?? ''}`
    else if (o.richText) raw = o.richText.map((t) => t.text).join('')
    else if (o.error) raw = o.error
    else if (o.text !== undefined) raw = String(o.text)
  }
  if (!raw && !Object.keys(style).length) return null
  return { raw, style: Object.keys(style).length ? style : undefined }
}

/** Text that would otherwise be read as a number/date/formula must keep a leading apostrophe. */
function needsQuote(s: string): boolean {
  return s.startsWith('=') || /^[+-]?[\d$.,]+%?$/.test(s.trim()) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(s.trim())
}

function readStyle(c: ExcelJS.Cell): CellStyle {
  const s: CellStyle = {}
  const f = c.font
  if (f?.bold) s.bold = true
  if (f?.italic) s.italic = true
  if (f?.underline) s.underline = true
  if (f?.strike) s.strike = true
  const color = argbToHex(f?.color?.argb)
  if (color && color !== '#000000') s.color = color
  if (f?.size && f.size !== 11) s.fontSize = f.size
  const fill = c.fill as ExcelJS.FillPattern | undefined
  if (fill?.type === 'pattern' && fill.pattern === 'solid') {
    const hex = argbToHex(fill.fgColor?.argb)
    if (hex) s.fill = hex
  }
  const h = c.alignment?.horizontal
  if (h === 'left' || h === 'center' || h === 'right') s.align = h
  if (c.alignment?.wrapText) s.wrap = true
  if (c.numFmt && c.numFmt !== 'General') s.numFmt = c.numFmt
  return s
}

// ---------- Export ----------

export async function writeWorkbook(path: string, wb: Workbook, active: number, engine: Engine): Promise<Uint8Array> {
  if (extensionOf(path) === 'csv') return new TextEncoder().encode(sheetToCsv(wb.sheets[active], engine))
  return writeXlsx(wb, engine)
}

async function writeXlsx(wb: Workbook, engine: Engine): Promise<Uint8Array> {
  const xl = new ExcelJS.Workbook()
  xl.creator = 'Bear Sheets'
  xl.created = new Date()
  const charts: Record<string, Chart[]> = {}

  for (const sheet of wb.sheets) {
    const ws = xl.addWorksheet(sheet.name, {
      views: sheet.frozen.rows || sheet.frozen.cols
        ? [{ state: 'frozen', xSplit: sheet.frozen.cols, ySplit: sheet.frozen.rows }]
        : undefined
    })
    for (const [col, w] of sheet.colWidths) ws.getColumn(col + 1).width = pxToChars(w)
    for (const [row, h] of sheet.rowHeights) ws.getRow(row + 1).height = pxToPt(h)

    for (const [k, cell] of sheet.cells) {
      const [row, col] = parseKey(k)
      const c = ws.getCell(row + 1, col + 1)
      c.value = cellValue(cell, engine.valueOf(sheet, row, col))
      writeStyle(c, cell.style)
    }
    for (const m of sheet.merges) ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1)
    if (sheet.charts.length) charts[sheet.name] = sheet.charts
  }

  if (Object.keys(charts).length) {
    const meta = xl.addWorksheet(META_SHEET, { state: 'veryHidden' })
    meta.getCell('A1').value = JSON.stringify({ charts })
  }
  return new Uint8Array(await xl.xlsx.writeBuffer())
}

function cellValue(cell: Cell, computed: Value): ExcelJS.CellValue {
  const raw = cell.raw
  if (!raw) return null
  if (raw.startsWith('=') && raw.length > 1) {
    // Store the cached result too, so other apps show values before recalculating.
    const result = isError(computed) ? { error: computed.error } : computed ?? undefined
    return { formula: raw.slice(1), result } as ExcelJS.CellFormulaValue
  }
  if (raw.startsWith("'")) return raw.slice(1)
  if (isError(computed)) return { error: computed.error } as ExcelJS.CellErrorValue
  return computed as ExcelJS.CellValue
}

function writeStyle(c: ExcelJS.Cell, s?: CellStyle) {
  if (!s) return
  if (s.bold || s.italic || s.underline || s.strike || s.color || s.fontSize) {
    c.font = {
      bold: s.bold, italic: s.italic, underline: s.underline, strike: s.strike,
      size: s.fontSize, color: s.color ? { argb: hexToArgb(s.color) } : undefined
    }
  }
  if (s.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(s.fill) } }
  if (s.align || s.wrap) c.alignment = { horizontal: s.align, wrapText: s.wrap }
  if (s.numFmt) c.numFmt = s.numFmt
}

// ---------- CSV ----------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function csvToSheet(text: string, name: string): Sheet {
  const sheet = newSheet(name)
  parseCsv(text).forEach((row, r) =>
    row.forEach((v, c) => {
      if (v !== '') sheet.cells.set(key(r, c), { raw: v.startsWith('=') ? `'${v}` : v })
    })
  )
  return sheet
}

export function sheetToCsv(sheet: Sheet, engine: Engine): string {
  let maxR = -1
  let maxC = -1
  for (const k of sheet.cells.keys()) {
    const [r, c] = parseKey(k)
    maxR = Math.max(maxR, r)
    maxC = Math.max(maxC, c)
  }
  const lines: string[] = []
  for (let r = 0; r <= maxR; r++) {
    const fields: string[] = []
    for (let c = 0; c <= maxC; c++) {
      const text = formatValue(engine.valueOf(sheet, r, c), sheet.cells.get(key(r, c))?.style?.numFmt)
      fields.push(/[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)
    }
    lines.push(fields.join(','))
  }
  return lines.join('\r\n') + (lines.length ? '\r\n' : '')
}

