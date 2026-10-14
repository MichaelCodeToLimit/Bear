import { Engine, isError, type Value } from './engine'
import {
  DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, cloneCell, key, mergeAt, newId, newSheet, parseKey, rangeCells,
  shiftAxis, uniqueSheetName, usedRange, type Cell, type CellStyle, type Chart, type ChartType, type Sheet,
  type Workbook
} from './model'
import { MAX_COLS, MAX_ROWS, addr, normRange, shiftFormula, type Pos, type Range } from './refs'
import { formatValue, parseLiteral } from './values'

interface Selection {
  anchor: Pos
  focus: Pos
}

/** What Ctrl+C put on the in-app clipboard, so pasting keeps formulas and formatting. */
interface Clip {
  text: string
  origin: Pos
  cells: (Cell | undefined)[][]
  cut: { sheetId: string; range: Range } | null
}

function snapshot(wb: Workbook): Workbook {
  return {
    sheets: wb.sheets.map((s) => ({
      ...s,
      cells: new Map(s.cells),
      colWidths: new Map(s.colWidths),
      rowHeights: new Map(s.rowHeights),
      merges: s.merges.map((m) => ({ ...m })),
      frozen: { ...s.frozen },
      charts: s.charts.map((c) => ({ ...c, range: { ...c.range } }))
    }))
  }
}

const UNDO_LIMIT = 100

/** All workbook state plus selection; React subscribes via `subscribe` / `getVersion`. */
export class SheetStore {
  wb: Workbook
  active = 0
  sel: Selection = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }
  selectedChart: string | null = null
  engine: Engine
  version = 0
  clip: Clip | null = null
  private undoStack: { wb: Workbook; active: number }[] = []
  private redoStack: { wb: Workbook; active: number }[] = []
  private listeners = new Set<() => void>()
  onChange: (() => void) | null = null

  constructor(wb: Workbook) {
    this.wb = wb
    this.engine = new Engine(wb)
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = () => this.version

  private emit() {
    this.version++
    for (const fn of this.listeners) fn()
  }

  get sheet(): Sheet {
    return this.wb.sheets[this.active]
  }

  /** Replace the whole workbook (opening a file); clears history. */
  load(wb: Workbook) {
    this.wb = wb
    this.active = 0
    this.sel = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }
    this.selectedChart = null
    this.undoStack = []
    this.redoStack = []
    this.engine.setWorkbook(wb)
    this.emit()
  }

  /** Run an undoable edit. */
  transact(fn: () => void) {
    this.undoStack.push({ wb: snapshot(this.wb), active: this.active })
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
    this.redoStack = []
    fn()
    this.engine.invalidate()
    this.onChange?.()
    this.emit()
  }

  get canUndo() {
    return this.undoStack.length > 0
  }
  get canRedo() {
    return this.redoStack.length > 0
  }

  undo() {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.redoStack.push({ wb: snapshot(this.wb), active: this.active })
    this.restore(prev)
  }

  redo() {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push({ wb: snapshot(this.wb), active: this.active })
    this.restore(next)
  }

  private restore(s: { wb: Workbook; active: number }) {
    this.wb = s.wb
    this.active = Math.min(s.active, s.wb.sheets.length - 1)
    this.engine.setWorkbook(this.wb)
    this.onChange?.()
    this.emit()
  }

  // ---------- Reading ----------

  value(row: number, col: number, sheet = this.sheet): Value {
    return this.engine.valueOf(sheet, row, col)
  }

  cell(row: number, col: number, sheet = this.sheet): Cell | undefined {
    return sheet.cells.get(key(row, col))
  }

  colWidth(col: number, sheet = this.sheet) {
    return sheet.colWidths.get(col) ?? DEFAULT_COL_WIDTH
  }

  rowHeight(row: number, sheet = this.sheet) {
    return sheet.rowHeights.get(row) ?? DEFAULT_ROW_HEIGHT
  }

  get range(): Range {
    const { anchor, focus } = this.sel
    return this.expandMerges(normRange({ r1: anchor.row, c1: anchor.col, r2: focus.row, c2: focus.col }))
  }

  /**
   * The selection clipped to the used area plus a margin, for cell-by-cell operations, so that
   * formatting a whole column doesn't create 100,000 cells.
   */
  boundedRange(): Range {
    const r = this.range
    const used = usedRange(this.sheet)
    const maxR = Math.max(used?.r2 ?? 0, this.sel.anchor.row, 999)
    const maxC = Math.max(used?.c2 ?? 0, this.sel.anchor.col, 25)
    return { r1: r.r1, c1: r.c1, r2: Math.min(r.r2, Math.max(r.r1, maxR)), c2: Math.min(r.c2, Math.max(r.c1, maxC)) }
  }

  /** Grow a range until it fully contains every merge it touches. */
  private expandMerges(r: Range): Range {
    let out = r
    for (let changed = true; changed; ) {
      changed = false
      for (const m of this.sheet.merges) {
        const hit = m.r1 <= out.r2 && m.r2 >= out.r1 && m.c1 <= out.c2 && m.c2 >= out.c1
        if (hit && (m.r1 < out.r1 || m.r2 > out.r2 || m.c1 < out.c1 || m.c2 > out.c2)) {
          out = { r1: Math.min(out.r1, m.r1), c1: Math.min(out.c1, m.c1), r2: Math.max(out.r2, m.r2), c2: Math.max(out.c2, m.c2) }
          changed = true
        }
      }
    }
    return out
  }

  /** Sum / average / count of the numbers in the selection, for the status bar. */
  stats(): { sum: number; count: number; numbers: number } | null {
    const r = this.range
    if (r.r1 === r.r2 && r.c1 === r.c2) return null
    let sum = 0
    let count = 0
    let numbers = 0
    const cells = (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1)
    // Iterate stored cells for big selections rather than every coordinate.
    const visit = (row: number, col: number) => {
      const v = this.value(row, col)
      if (v === null || v === '') return
      count++
      if (typeof v === 'number') {
        sum += v
        numbers++
      }
    }
    if (cells > 50_000) {
      for (const k of this.sheet.cells.keys()) {
        const [row, col] = parseKey(k)
        if (row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2) visit(row, col)
      }
    } else {
      for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) visit(row, col)
    }
    return { sum, count, numbers }
  }

  // ---------- Selection ----------

  select(anchor: Pos, focus: Pos = anchor) {
    const clamp = (p: Pos) => ({ row: Math.max(0, Math.min(MAX_ROWS - 1, p.row)), col: Math.max(0, Math.min(MAX_COLS - 1, p.col)) })
    this.sel = { anchor: clamp(anchor), focus: clamp(focus) }
    this.selectedChart = null
    this.emit()
  }

  selectChart(id: string | null) {
    this.selectedChart = id
    this.emit()
  }

  setActive(index: number) {
    if (index === this.active || !this.wb.sheets[index]) return
    this.active = index
    this.sel = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }
    this.selectedChart = null
    this.emit()
  }

  /** Move the cursor; with ctrl, jump to the edge of the current data block like a spreadsheet does. */
  move(dRow: number, dCol: number, extend: boolean, jump: boolean) {
    const from = extend ? this.sel.focus : this.sel.anchor
    let { row, col } = from
    if (!extend) {
      // Step over merged cells as one unit.
      const m = mergeAt(this.sheet, row, col)
      if (m) {
        if (dRow > 0) row = m.r2
        if (dCol > 0) col = m.c2
        if (dRow < 0) row = m.r1
        if (dCol < 0) col = m.c1
      }
    }
    if (jump) {
      const filled = (r: number, c: number) => !!this.cell(r, c)?.raw
      const maxR = MAX_ROWS - 1
      const maxC = MAX_COLS - 1
      const inBounds = (r: number, c: number) => r >= 0 && c >= 0 && r <= maxR && c <= maxC
      const startFilled = filled(row, col)
      const nextFilled = inBounds(row + dRow, col + dCol) && filled(row + dRow, col + dCol)
      if (startFilled && nextFilled) {
        while (inBounds(row + dRow, col + dCol) && filled(row + dRow, col + dCol)) {
          row += dRow
          col += dCol
        }
      } else {
        // Jump to the next filled cell, or to the sheet edge (bounded by the used range for speed).
        const used = usedRange(this.sheet)
        const limitR = dRow > 0 ? Math.max(used?.r2 ?? 0, row) + 1 : 0
        const limitC = dCol > 0 ? Math.max(used?.c2 ?? 0, col) + 1 : 0
        row += dRow
        col += dCol
        while (inBounds(row, col) && !filled(row, col) && (dRow ? row !== limitR : col !== limitC)) {
          row += dRow
          col += dCol
        }
        if (!inBounds(row, col) || !filled(row, col)) {
          if (dRow > 0) row = maxR
          if (dRow < 0) row = 0
          if (dCol > 0) col = maxC
          if (dCol < 0) col = 0
        }
      }
    } else {
      row += dRow
      col += dCol
    }
    const target = { row: Math.max(0, Math.min(MAX_ROWS - 1, row)), col: Math.max(0, Math.min(MAX_COLS - 1, col)) }
    if (extend) this.select(this.sel.anchor, target)
    else {
      const m = mergeAt(this.sheet, target.row, target.col)
      this.select(m ? { row: m.r1, col: m.c1 } : target)
    }
  }

  // ---------- Editing ----------

  /** Commit typed text into a cell, applying auto-detected number formats (12%, $5, dates). */
  setRaw(row: number, col: number, raw: string) {
    this.transact(() => this.writeRaw(this.sheet, row, col, raw))
  }

  private writeRaw(sheet: Sheet, row: number, col: number, raw: string) {
    const k = key(row, col)
    const prev = sheet.cells.get(k)
    if (!raw && !prev?.style) {
      sheet.cells.delete(k)
      return
    }
    const style = prev?.style ? { ...prev.style } : undefined
    const detected = raw.startsWith('=') ? undefined : parseLiteral(raw).numFmt
    const merged = detected && !style?.numFmt ? { ...style, numFmt: detected } : style
    sheet.cells.set(k, { raw, style: merged })
  }

  /** Fill every selected cell with the same input (Ctrl+Enter), shifting formulas per cell. */
  fillSelection(raw: string) {
    const r = this.boundedRange()
    this.transact(() => {
      for (const [row, col] of rangeCells(r)) {
        this.writeRaw(this.sheet, row, col, raw.startsWith('=') ? shiftFormula(raw, row - r.r1, col - r.c1) : raw)
      }
    })
  }

  clearContents() {
    const r = this.boundedRange()
    this.transact(() => {
      for (const [row, col] of rangeCells(r)) {
        const k = key(row, col)
        const c = this.sheet.cells.get(k)
        if (!c) continue
        if (c.style) this.sheet.cells.set(k, { raw: '', style: c.style })
        else this.sheet.cells.delete(k)
      }
    })
  }

  clearAll() {
    const r = this.boundedRange()
    this.transact(() => {
      for (const [row, col] of rangeCells(r)) this.sheet.cells.delete(key(row, col))
    })
  }

  // ---------- Formatting ----------

  /** The style shown in the ribbon: the active cell's. */
  get activeStyle(): CellStyle {
    return this.cell(this.sel.anchor.row, this.sel.anchor.col)?.style ?? {}
  }

  setStyle(patch: Partial<CellStyle>) {
    const r = this.boundedRange()
    this.transact(() => {
      for (const [row, col] of rangeCells(r)) {
        const k = key(row, col)
        const prev = this.sheet.cells.get(k)
        const style: CellStyle = { ...prev?.style, ...patch }
        for (const p of Object.keys(style) as (keyof CellStyle)[]) {
          if (style[p] === undefined || style[p] === null || style[p] === false) delete style[p]
        }
        this.sheet.cells.set(k, { raw: prev?.raw ?? '', style: Object.keys(style).length ? style : undefined })
        if (!prev?.raw && !Object.keys(style).length) this.sheet.cells.delete(k)
      }
    })
  }

  toggleStyle(prop: 'bold' | 'italic' | 'underline' | 'strike' | 'wrap') {
    this.setStyle({ [prop]: !this.activeStyle[prop] })
  }

  /** Live resizing while dragging a header edge: one undo step for the whole drag. */
  private live = false

  private beginLive() {
    if (this.live) return
    this.live = true
    this.undoStack.push({ wb: snapshot(this.wb), active: this.active })
    this.redoStack = []
  }

  updateColWidthLive(col: number, w: number) {
    this.beginLive()
    this.sheet.colWidths.set(col, Math.max(16, Math.round(w)))
    this.emit()
  }

  updateRowHeightLive(row: number, h: number) {
    this.beginLive()
    this.sheet.rowHeights.set(row, Math.max(12, Math.round(h)))
    this.emit()
  }

  commitSizes() {
    if (!this.live) return
    this.live = false
    this.onChange?.()
    this.emit()
  }

  setColWidth(col: number, w: number) {
    this.transact(() => this.sheet.colWidths.set(col, Math.max(16, Math.round(w))))
  }

  setRowHeight(row: number, h: number) {
    this.transact(() => this.sheet.rowHeights.set(row, Math.max(12, Math.round(h))))
  }

  /** Fit a column to its widest displayed text (double-click on the header edge). */
  autoFitCol(col: number, measure: (text: string, cell?: Cell) => number) {
    let w = 40
    for (const [k, cell] of this.sheet.cells) {
      const [row, c] = parseKey(k)
      if (c !== col || !cell.raw) continue
      w = Math.max(w, measure(this.display(row, col), cell) + 14)
    }
    this.setColWidth(col, Math.min(w, 600))
  }

  display(row: number, col: number): string {
    const v = this.value(row, col)
    return displayText(v, this.cell(row, col)?.style?.numFmt)
  }

  toggleMerge() {
    const r = this.range
    const existing = this.sheet.merges.filter((m) => m.r1 >= r.r1 && m.r2 <= r.r2 && m.c1 >= r.c1 && m.c2 <= r.c2)
    this.transact(() => {
      if (existing.length) {
        this.sheet.merges = this.sheet.merges.filter((m) => !existing.includes(m))
        return
      }
      if (r.r1 === r.r2 && r.c1 === r.c2) return
      // Like other spreadsheets, merging keeps only the top-left value.
      for (const [row, col] of rangeCells(r)) {
        if (row === r.r1 && col === r.c1) continue
        this.sheet.cells.delete(key(row, col))
      }
      this.sheet.merges.push(r)
      const k = key(r.r1, r.c1)
      const c = this.sheet.cells.get(k)
      this.sheet.cells.set(k, { raw: c?.raw ?? '', style: { ...c?.style, align: 'center' } })
    })
  }

  // ---------- Rows & columns ----------

  insert(axis: 'row' | 'col', before: boolean) {
    const r = this.range
    const at = axis === 'row' ? (before ? r.r1 : r.r2 + 1) : before ? r.c1 : r.c2 + 1
    const count = axis === 'row' ? r.r2 - r.r1 + 1 : r.c2 - r.c1 + 1
    this.transact(() => shiftAxis(this.wb, this.sheet, axis, at, count))
  }

  remove(axis: 'row' | 'col') {
    const r = this.range
    const at = axis === 'row' ? r.r1 : r.c1
    const count = axis === 'row' ? r.r2 - r.r1 + 1 : r.c2 - r.c1 + 1
    this.transact(() => shiftAxis(this.wb, this.sheet, axis, at, -count))
    this.select({ row: axis === 'row' ? r.r1 : this.sel.anchor.row, col: axis === 'col' ? r.c1 : this.sel.anchor.col })
  }

  setFrozen(rows: number, cols: number) {
    this.transact(() => (this.sheet.frozen = { rows, cols }))
  }

  // ---------- Fill handle ----------

  /** Extend the selection's contents into `target` (which contains the selection), like dragging the fill handle. */
  fill(target: Range) {
    const src = this.range
    const t = normRange(target)
    const down = t.r2 > src.r2
    const up = t.r1 < src.r1
    const right = t.c2 > src.c2
    const left = t.c1 < src.c1
    if (!down && !up && !right && !left) return

    this.transact(() => {
      const vertical = down || up
      const lanes = vertical ? [src.c1, src.c2] : [src.r1, src.r2]
      for (let lane = lanes[0]; lane <= lanes[1]; lane++) {
        const srcCells: { pos: Pos; cell?: Cell }[] = []
        const len = vertical ? src.r2 - src.r1 + 1 : src.c2 - src.c1 + 1
        for (let i = 0; i < len; i++) {
          const pos = vertical ? { row: src.r1 + i, col: lane } : { row: lane, col: src.c1 + i }
          srcCells.push({ pos, cell: this.cell(pos.row, pos.col) })
        }
        const nums = srcCells.map((s) => (s.cell && !s.cell.raw.startsWith('=') ? parseLiteral(s.cell.raw).value : null))
        const allNumeric = len >= 2 && nums.every((n) => typeof n === 'number')
        const step = allNumeric ? ((nums[len - 1] as number) - (nums[0] as number)) / (len - 1) : 0

        const targets: Pos[] = []
        if (vertical) {
          if (down) for (let r = src.r2 + 1; r <= t.r2; r++) targets.push({ row: r, col: lane })
          if (up) for (let r = src.r1 - 1; r >= t.r1; r--) targets.push({ row: r, col: lane })
        } else {
          if (right) for (let c = src.c2 + 1; c <= t.c2; c++) targets.push({ row: lane, col: c })
          if (left) for (let c = src.c1 - 1; c >= t.c1; c--) targets.push({ row: lane, col: c })
        }
        const backwards = up || left
        targets.forEach((pos, i) => {
          const k = key(pos.row, pos.col)
          const n = i + 1 // distance from the edge of the source block
          if (allNumeric) {
            const base = backwards ? (nums[0] as number) : (nums[len - 1] as number)
            const v = base + (backwards ? -step : step) * n
            const fmtCell = srcCells[backwards ? 0 : len - 1].cell
            this.sheet.cells.set(k, { raw: String(Number(v.toPrecision(15))), style: fmtCell?.style })
            return
          }
          const idx = backwards ? (len - (n % len)) % len : (n - 1) % len
          const source = srcCells[idx]
          const c = source.cell
          if (!c) {
            this.sheet.cells.delete(k)
            return
          }
          let raw = c.raw
          if (raw.startsWith('=')) raw = shiftFormula(raw, pos.row - source.pos.row, pos.col - source.pos.col)
          else if (len === 1) {
            // "Item 1" -> "Item 2": increment a trailing number on text.
            const m = /^(.*?)(\d+)$/.exec(raw)
            if (m && typeof parseLiteral(raw).value === 'string') {
              const next = Number(m[2]) + (backwards ? -n : n)
              if (next >= 0) raw = m[1] + String(next).padStart(m[2].length, '0')
            }
          }
          this.sheet.cells.set(k, { raw, style: c.style })
        })
      }
    })
    this.select({ row: t.r1, col: t.c1 }, { row: t.r2, col: t.c2 })
  }

  // ---------- Clipboard ----------

  copy(cut = false): string {
    const r = this.range
    const cells: (Cell | undefined)[][] = []
    const lines: string[] = []
    for (let row = r.r1; row <= r.r2; row++) {
      const line: string[] = []
      const rowCells: (Cell | undefined)[] = []
      for (let col = r.c1; col <= r.c2; col++) {
        rowCells.push(cloneCell(this.cell(row, col)))
        const text = this.display(row, col)
        line.push(/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)
      }
      cells.push(rowCells)
      lines.push(line.join('\t'))
    }
    const text = lines.join('\n')
    this.clip = { text, origin: { row: r.r1, col: r.c1 }, cells, cut: cut ? { sheetId: this.sheet.id, range: r } : null }
    this.emit()
    return text
  }

  /** Paste: our own clipboard keeps formulas and styles; anything else is parsed as tab-separated text. */
  paste(text: string) {
    const at = { row: this.range.r1, col: this.range.c1 }
    const ours = this.clip && normalizeEol(this.clip.text) === normalizeEol(text) ? this.clip : null
    const grid: (Cell | undefined)[][] = ours ? ours.cells : parseTsv(text).map((row) => row.map((raw) => (raw ? { raw } : undefined)))
    if (!grid.length) return
    this.transact(() => {
      if (ours?.cut) {
        const src = this.wb.sheets.find((s) => s.id === ours.cut!.sheetId)
        if (src) for (const [row, col] of rangeCells(ours.cut.range)) src.cells.delete(key(row, col))
      }
      grid.forEach((rowCells, i) =>
        rowCells.forEach((cell, j) => {
          const row = at.row + i
          const col = at.col + j
          if (row >= MAX_ROWS || col >= MAX_COLS) return
          const k = key(row, col)
          if (!cell) {
            this.sheet.cells.delete(k)
            return
          }
          let raw = cell.raw
          // Cut moves formulas unchanged; copy shifts their relative references.
          if (ours && !ours.cut && raw.startsWith('=')) raw = shiftFormula(raw, row - (ours.origin.row + i), col - (ours.origin.col + j))
          if (ours) this.sheet.cells.set(k, { raw, style: cell.style })
          else this.writeRaw(this.sheet, row, col, raw)
        })
      )
    })
    if (ours?.cut) this.clip = null
    const h = grid.length
    const w = Math.max(...grid.map((r) => r.length))
    this.select(at, { row: at.row + h - 1, col: at.col + w - 1 })
  }

  // ---------- Sort ----------

  /** Sort the selected rows (or the data block around the cursor) by the active column. */
  sort(descending: boolean) {
    let r = this.range
    if (r.r1 === r.r2) r = this.currentRegion()
    const col = this.sel.anchor.col
    const hasHeader = r.r2 > r.r1 && typeof this.value(r.r1, col) === 'string' && typeof this.value(r.r1 + 1, col) === 'number'
    const start = hasHeader ? r.r1 + 1 : r.r1
    const rows: { from: number; cells: (Cell | undefined)[]; v: Value }[] = []
    for (let row = start; row <= r.r2; row++) {
      const cells: (Cell | undefined)[] = []
      for (let c = r.c1; c <= r.c2; c++) cells.push(this.cell(row, c))
      rows.push({ from: row, cells, v: this.value(row, col) })
    }
    const rank = (v: Value) => (v === null || v === '' ? 3 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2)
    rows.sort((a, b) => {
      const ra = rank(a.v)
      const rb = rank(b.v)
      if (ra !== rb || ra === 3) return ra - rb // blanks always last
      let d = 0
      if (typeof a.v === 'number' && typeof b.v === 'number') d = a.v - b.v
      else if (!isError(a.v) && !isError(b.v)) d = String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: 'base' })
      return descending ? -d : d
    })
    this.transact(() => {
      rows.forEach((entry, i) => {
        const row = start + i
        entry.cells.forEach((cell, j) => {
          const k = key(row, r.c1 + j)
          if (!cell) this.sheet.cells.delete(k)
          else this.sheet.cells.set(k, cell.raw.startsWith('=') ? { ...cell, raw: shiftFormula(cell.raw, row - entry.from, 0) } : cell)
        })
      })
    })
  }

  /** The contiguous block of filled cells around the cursor (like Ctrl+A inside data). */
  currentRegion(): Range {
    let r: Range = { r1: this.sel.anchor.row, c1: this.sel.anchor.col, r2: this.sel.anchor.row, c2: this.sel.anchor.col }
    const filled = (row: number, col: number) => row >= 0 && col >= 0 && !!this.cell(row, col)?.raw
    for (let grew = true; grew; ) {
      grew = false
      const rowHas = (row: number) => { for (let c = r.c1 - 1; c <= r.c2 + 1; c++) if (filled(row, c)) return true; return false }
      const colHas = (col: number) => { for (let row = r.r1 - 1; row <= r.r2 + 1; row++) if (filled(row, col)) return true; return false }
      if (rowHas(r.r1 - 1)) { r = { ...r, r1: r.r1 - 1 }; grew = true }
      if (rowHas(r.r2 + 1)) { r = { ...r, r2: r.r2 + 1 }; grew = true }
      if (colHas(r.c1 - 1)) { r = { ...r, c1: r.c1 - 1 }; grew = true }
      if (colHas(r.c2 + 1)) { r = { ...r, c2: r.c2 + 1 }; grew = true }
    }
    return r
  }

  // ---------- AutoSum ----------

  /** Insert =FN(range) below/right of the selection, or for the numbers above the cursor. */
  /**
   * Returns 'needs-range' when there are no adjacent numbers to use; the caller should then let the
   * user pick the range (as other spreadsheets do) instead of writing an empty =FN().
   */
  autoSum(fn: 'SUM' | 'AVERAGE' | 'COUNT' | 'MIN' | 'MAX' = 'SUM'): 'done' | 'needs-range' {
    const r = this.range
    const isNum = (row: number, col: number) => typeof this.value(row, col) === 'number'
    if (r.r1 === r.r2 && r.c1 === r.c2) {
      const { row, col } = this.sel.anchor
      let top = row - 1
      while (top >= 0 && isNum(top, col)) top--
      let target: string
      if (top < row - 1) target = `=${fn}(${a1(top + 1, col)}:${a1(row - 1, col)})`
      else {
        let leftmost = col - 1
        while (leftmost >= 0 && isNum(row, leftmost)) leftmost--
        if (leftmost === col - 1) return 'needs-range'
        target = `=${fn}(${a1(row, leftmost + 1)}:${a1(row, col - 1)})`
      }
      this.setRaw(row, col, target)
      return 'done'
    }
    // A block: total each column underneath it.
    const below = r.r2 + 1
    this.transact(() => {
      for (let col = r.c1; col <= r.c2; col++) this.writeRaw(this.sheet, below, col, `=${fn}(${a1(r.r1, col)}:${a1(r.r2, col)})`)
    })
    return 'done'
  }

  // ---------- Sheets ----------

  addSheet() {
    this.transact(() => {
      this.wb.sheets.splice(this.active + 1, 0, newSheet(uniqueSheetName(this.wb)))
      this.active++
    })
    this.sel = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }
  }

  renameSheet(index: number, name: string): string | null {
    const clean = name.trim()
    if (!clean) return 'Sheet names cannot be blank.'
    if (/[\\/?*[\]:]/.test(clean)) return 'Sheet names cannot contain \\ / ? * [ ] :'
    if (this.wb.sheets.some((s, i) => i !== index && s.name.toLowerCase() === clean.toLowerCase())) return 'That name is already taken.'
    const old = this.wb.sheets[index].name
    if (old === clean) return null
    const quote = (n: string) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`)
    this.transact(() => {
      this.wb.sheets[index].name = clean
      // Keep formulas that refer to the old name working.
      const pattern = new RegExp(`(^|[^A-Za-z0-9_.'])(${escapeRe(old)}|'${escapeRe(old)}')!`, 'gi')
      for (const s of this.wb.sheets) {
        for (const [k, c] of s.cells) {
          if (c.raw.startsWith('=') && c.raw.includes('!')) {
            const raw = c.raw.replace(pattern, (_m, pre) => `${pre}${quote(clean)}!`)
            if (raw !== c.raw) s.cells.set(k, { ...c, raw })
          }
        }
      }
    })
    return null
  }

  deleteSheet(index: number) {
    if (this.wb.sheets.length <= 1) return
    this.transact(() => {
      this.wb.sheets.splice(index, 1)
      this.active = Math.min(this.active, this.wb.sheets.length - 1)
    })
  }

  moveSheet(from: number, to: number) {
    if (to < 0 || to >= this.wb.sheets.length || from === to) return
    this.transact(() => {
      const [s] = this.wb.sheets.splice(from, 1)
      this.wb.sheets.splice(to, 0, s)
      this.active = to
    })
  }

  // ---------- Charts ----------

  addChart(type: ChartType, origin: { x: number; y: number }) {
    let r = this.range
    if (r.r1 === r.r2 && r.c1 === r.c2) r = this.currentRegion()
    const chart: Chart = { id: newId('c'), type, range: r, title: '', x: origin.x, y: origin.y, w: 480, h: 290 }
    this.transact(() => this.sheet.charts.push(chart))
    this.selectChart(chart.id)
  }

  updateChart(id: string, patch: Partial<Chart>, undoable = true) {
    const apply = () => {
      this.sheet.charts = this.sheet.charts.map((c) => (c.id === id ? { ...c, ...patch } : c))
    }
    if (undoable) this.transact(apply)
    else {
      apply()
      this.emit()
    }
  }

  deleteChart(id: string) {
    this.transact(() => (this.sheet.charts = this.sheet.charts.filter((c) => c.id !== id)))
    this.selectedChart = null
  }

  /** Geometry helpers in sheet pixels (no headers, no scroll). */
  colX(col: number): number {
    let x = 0
    for (let c = 0; c < col; c++) x += this.colWidth(c)
    return x
  }

  rowY(row: number): number {
    // Fast path: only rows with custom heights differ from the default.
    let y = row * DEFAULT_ROW_HEIGHT
    for (const [r, h] of this.sheet.rowHeights) if (r < row) y += h - DEFAULT_ROW_HEIGHT
    return y
  }
}

export function displayText(v: Value, numFmt?: string): string {
  if (numFmt === '@' && typeof v === 'number') return String(v)
  return formatValue(v, numFmt)
}

const a1 = addr

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeEol = (s: string) => s.replace(/\r\n?/g, '\n').replace(/\n$/, '')

/** Parse tab-separated clipboard text, honouring quoted fields. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = normalizeEol(text)
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === '\t') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  rows.push(row)
  return rows
}
