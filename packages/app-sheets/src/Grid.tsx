import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { DEFAULT_ROW_HEIGHT, mergeAt, usedRange, type Cell } from './model'
import { MAX_COLS, MAX_ROWS, addr, colName, normRange, rangeAddr, type Pos, type Range } from './refs'
import type { SheetStore } from './store'
import { defaultAlign } from './values'
import { ChartLayer } from './ChartLayer'

export const HEADER_W = 46
export const HEADER_H = 24
const FONT = "Calibri, Carlito, 'Segoe UI', sans-serif"
const GRID = '#e1dfdd'
const HEADER_BG = '#f3f2f1'
const HEADER_ACTIVE = '#d6e9e1'
const TEXT = '#1f1f1f'

export interface EditState {
  row: number
  col: number
  text: string
  /** 'enter': typed straight into a cell (arrows commit); 'edit': F2/double-click (arrows move the caret). */
  mode: 'enter' | 'edit'
}

interface GridProps {
  store: SheetStore
  version: number
  accent: string
  editing: EditState | null
  setEditing: (e: EditState | null) => void
  commit: (move?: { dRow: number; dCol: number }, fillAll?: boolean) => void
  showGridlines: boolean
  showFormulas: boolean
  onContextMenu: (x: number, y: number) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onCopy: (e: React.ClipboardEvent) => void
  onCut: (e: React.ClipboardEvent) => void
  onPaste: (e: React.ClipboardEvent) => void
  /** Rows that fit on screen, for Page Up / Page Down. */
  pageRef?: React.MutableRefObject<number>
}

type Drag =
  | { kind: 'select'; anchor: Pos }
  | { kind: 'point'; anchor: Pos; base: string }
  | { kind: 'cols'; from: number }
  | { kind: 'rows'; from: number }
  | { kind: 'fill'; target: Range | null }
  | { kind: 'resize-col'; col: number; startX: number; startW: number }
  | { kind: 'resize-row'; row: number; startY: number; startH: number }

const ptToPx = (pt: number) => (pt * 4) / 3

export function cellFont(cell?: Cell): string {
  const s = cell?.style
  return `${s?.italic ? 'italic ' : ''}${s?.bold ? 'bold ' : ''}${ptToPx(s?.fontSize ?? 11)}px ${FONT}`
}

/** Whether a formula being typed is at a point where clicking a cell should insert its reference. */
export function expectsReference(text: string): boolean {
  return text.startsWith('=') && /[=(+\-*/,:^&<>]\s*$/.test(text)
}

export function Grid({ store, version, accent, editing, setEditing, commit, showGridlines, showFormulas, onContextMenu, onKeyDown, onCopy, onCut, onPaste, pageRef }: GridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [scroll, setScroll] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const editingRef = useRef(editing)
  editingRef.current = editing
  dragRef.current = drag
  const sheet = store.sheet
  const frozen = sheet.frozen

  // ---------- Geometry ----------

  const fw = store.colX(frozen.cols)
  const fh = store.rowY(frozen.rows)

  /** Screen position of a cell's top-left (relative to the canvas). */
  const cellX = useCallback((col: number) => HEADER_W + store.colX(col) - (col < frozen.cols ? 0 : scroll.x), [store, frozen.cols, scroll.x, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const cellY = useCallback((row: number) => HEADER_H + store.rowY(row) - (row < frozen.rows ? 0 : scroll.y), [store, frozen.rows, scroll.y, version]) // eslint-disable-line react-hooks/exhaustive-deps

  const colAt = useCallback(
    (px: number) => {
      const content = px - HEADER_W < fw ? px - HEADER_W : px - HEADER_W + scroll.x
      let x = 0
      for (let c = 0; c < MAX_COLS; c++) {
        x += store.colWidth(c)
        if (x > content) return c
      }
      return MAX_COLS - 1
    },
    [store, fw, scroll.x, version] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const rowAt = useCallback(
    (py: number) => {
      const content = py - HEADER_H < fh ? py - HEADER_H : py - HEADER_H + scroll.y
      let r = Math.max(0, Math.floor(content / DEFAULT_ROW_HEIGHT))
      while (r > 0 && store.rowY(r) > content) r--
      while (r < MAX_ROWS - 1 && store.rowY(r + 1) <= content) r++
      return Math.min(r, MAX_ROWS - 1)
    },
    [store, fh, scroll.y, version] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Extent of the scrollable content: the used area plus room to grow, all rows.
  const used = usedRange(sheet)
  const extentCols = Math.min(MAX_COLS, Math.max(52, (used?.c2 ?? 0) + 30, store.sel.focus.col + 15))
  const contentW = store.colX(extentCols)
  const contentH = store.rowY(MAX_ROWS)

  // ---------- Size tracking ----------

  useLayoutEffect(() => {
    const el = scrollRef.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---------- Drawing ----------

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(size.w * dpr)
    canvas.height = Math.floor(size.h * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(ctx)
  })

  function visibleCols(fromCol: number, x0: number, x1: number): number[] {
    const out: number[] = []
    for (let c = fromCol; c < MAX_COLS; c++) {
      const x = cellX(c)
      if (x >= x1) break
      if (x + store.colWidth(c) > x0) out.push(c)
    }
    return out
  }

  function visibleRows(fromRow: number, y0: number, y1: number): number[] {
    const out: number[] = []
    // Start near the first visible row instead of scanning from the top.
    let r = fromRow
    if (fromRow >= frozen.rows) r = Math.max(frozen.rows, rowAt(Math.max(y0, HEADER_H + fh)) - 1)
    for (; r < MAX_ROWS; r++) {
      const y = cellY(r)
      if (y >= y1) break
      if (y + store.rowHeight(r) > y0) out.push(r)
    }
    return out
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const { w, h } = size
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)

    const bodyX = HEADER_W + fw
    const bodyY = HEADER_H + fh
    const frozenCols = Array.from({ length: frozen.cols }, (_, i) => i)
    const frozenRows = Array.from({ length: frozen.rows }, (_, i) => i)
    const scrollCols = visibleCols(frozen.cols, bodyX, w)
    const scrollRows = visibleRows(frozen.rows, bodyY, h)

    // Four panes: frozen corner, frozen rows, frozen cols, scrolling body.
    const panes: [number[], number[], number, number, number, number][] = [
      [scrollRows, scrollCols, bodyX, bodyY, w, h],
      [frozenRows, scrollCols, bodyX, HEADER_H, w, bodyY],
      [scrollRows, frozenCols, HEADER_W, bodyY, bodyX, h],
      [frozenRows, frozenCols, HEADER_W, HEADER_H, bodyX, bodyY]
    ]
    for (const [rows, cols, x0, y0, x1, y1] of panes) {
      if (!rows.length || !cols.length) continue
      ctx.save()
      ctx.beginPath()
      ctx.rect(x0, y0, x1 - x0, y1 - y0)
      ctx.clip()
      drawCells(ctx, rows, cols)
      drawSelection(ctx)
      ctx.restore()
    }

    drawHeaders(ctx, [...frozenCols, ...scrollCols], [...frozenRows, ...scrollRows])

    if (frozen.rows || frozen.cols) {
      ctx.strokeStyle = '#9e9e9e'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      if (frozen.rows) {
        ctx.moveTo(0, bodyY)
        ctx.lineTo(w, bodyY)
      }
      if (frozen.cols) {
        ctx.moveTo(bodyX, 0)
        ctx.lineTo(bodyX, h)
      }
      ctx.stroke()
    }
  }

  function drawCells(ctx: CanvasRenderingContext2D, rows: number[], cols: number[]) {
    const merges = sheet.merges
    // Backgrounds and gridlines.
    for (const r of rows) {
      const y = cellY(r)
      const rh = store.rowHeight(r)
      for (const c of cols) {
        const x = cellX(c)
        const cw = store.colWidth(c)
        const cell = store.cell(r, c)
        if (cell?.style?.fill) {
          ctx.fillStyle = cell.style.fill
          ctx.fillRect(x, y, cw, rh)
        }
        if (showGridlines) {
          ctx.strokeStyle = GRID
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x + cw - 0.5, y)
          ctx.lineTo(x + cw - 0.5, y + rh)
          ctx.moveTo(x, y + rh - 0.5)
          ctx.lineTo(x + cw, y + rh - 0.5)
          ctx.stroke()
        }
      }
    }

    // Merged areas paint over their inner gridlines.
    for (const m of merges) {
      if (m.r2 < rows[0] || m.r1 > rows[rows.length - 1] || m.c2 < cols[0] || m.c1 > cols[cols.length - 1]) continue
      const x = cellX(m.c1)
      const y = cellY(m.r1)
      const mw = store.colX(m.c2 + 1) - store.colX(m.c1)
      const mh = store.rowY(m.r2 + 1) - store.rowY(m.r1)
      ctx.fillStyle = store.cell(m.r1, m.c1)?.style?.fill ?? '#ffffff'
      ctx.fillRect(x, y, mw - 1, mh - 1)
      drawText(ctx, m.r1, m.c1, x, y, mw, mh, mw)
    }

    // Text, with left-aligned overflow into empty neighbours.
    for (const r of rows) {
      const y = cellY(r)
      const rh = store.rowHeight(r)
      for (const c of cols) {
        const cell = store.cell(r, c)
        if (!cell?.raw) continue
        if (mergeAt(sheet, r, c)) continue
        const x = cellX(c)
        const cw = store.colWidth(c)
        let room = cw
        const align = cell.style?.align ?? defaultAlign(store.value(r, c))
        if (align === 'left' && !cell.style?.wrap) {
          for (let n = c + 1; n < MAX_COLS && room < 2000 && !store.cell(r, n)?.raw && !mergeAt(sheet, r, n); n++) room += store.colWidth(n)
        }
        drawText(ctx, r, c, x, y, cw, rh, room)
      }
    }
  }

  function drawText(ctx: CanvasRenderingContext2D, r: number, c: number, x: number, y: number, cw: number, rh: number, room: number) {
    const cell = store.cell(r, c)
    if (!cell?.raw) return
    const style = cell.style
    const value = store.value(r, c)
    let text = showFormulas && cell.raw.startsWith('=') ? cell.raw : store.display(r, c)
    const align = style?.align ?? (showFormulas && cell.raw.startsWith('=') ? 'left' : defaultAlign(value))
    ctx.font = cellFont(cell)
    ctx.fillStyle = style?.color ?? (typeof value === 'object' && value ? '#c42b1c' : TEXT)
    ctx.textBaseline = 'middle'
    const pad = 4

    ctx.save()
    ctx.beginPath()
    const clipX = align === 'right' ? x + cw - room : x
    ctx.rect(clipX, y, room, rh)
    ctx.clip()

    const lines: string[] = []
    if (style?.wrap) {
      for (const para of text.split('\n')) {
        let line = ''
        for (const word of para.split(' ')) {
          const next = line ? `${line} ${word}` : word
          if (ctx.measureText(next).width > cw - pad * 2 && line) {
            lines.push(line)
            line = word
          } else line = next
        }
        lines.push(line)
      }
    } else {
      // Numbers that don't fit show as #### like other spreadsheets.
      if (typeof value === 'number' && !showFormulas && ctx.measureText(text).width > cw - pad * 2) {
        text = '#'.repeat(Math.max(1, Math.floor((cw - pad * 2) / ctx.measureText('#').width)))
      }
      lines.push(text.replace(/\n/g, ' '))
    }

    const lineH = ptToPx(style?.fontSize ?? 11) * 1.25
    const totalH = lines.length * lineH
    let ty = style?.wrap ? y + Math.max(lineH / 2 + 2, rh / 2 - totalH / 2 + lineH / 2) : y + rh / 2 + 1
    for (const line of lines) {
      const tw = ctx.measureText(line).width
      const tx = align === 'right' ? x + cw - pad - tw : align === 'center' ? x + (cw - tw) / 2 : x + pad
      ctx.fillText(line, tx, ty)
      if (style?.underline || style?.strike) {
        ctx.strokeStyle = ctx.fillStyle as string
        ctx.lineWidth = 1
        ctx.beginPath()
        const ly = style.underline ? ty + lineH * 0.38 : ty
        ctx.moveTo(tx, ly)
        ctx.lineTo(tx + tw, ly)
        ctx.stroke()
      }
      ty += lineH
    }
    ctx.restore()
  }

  function rectOf(r: Range) {
    const n = normRange(r)
    const x = cellX(n.c1)
    const y = cellY(n.r1)
    const x2 = cellX(n.c2) + store.colWidth(n.c2)
    const y2 = cellY(n.r2) + store.rowHeight(n.r2)
    return { x, y, w: x2 - x, h: y2 - y }
  }

  function drawSelection(ctx: CanvasRenderingContext2D) {
    if (store.selectedChart) return
    const sel = store.range
    const rr = rectOf(sel)
    const { anchor } = store.sel
    const am = mergeAt(sheet, anchor.row, anchor.col) ?? { r1: anchor.row, c1: anchor.col, r2: anchor.row, c2: anchor.col }
    const ar = rectOf(am)

    if (sel.r1 !== sel.r2 || sel.c1 !== sel.c2) {
      ctx.fillStyle = 'rgba(15,118,110,0.12)'
      ctx.fillRect(rr.x, rr.y, rr.w, rr.h)
      // The active cell stays clear.
      ctx.clearRect(ar.x, ar.y, ar.w - 1, ar.h - 1)
      ctx.fillStyle = store.cell(am.r1, am.c1)?.style?.fill ?? '#ffffff'
      ctx.fillRect(ar.x, ar.y, ar.w - 1, ar.h - 1)
      const cell = store.cell(am.r1, am.c1)
      if (cell?.raw) drawText(ctx, am.r1, am.c1, ar.x, ar.y, ar.w, ar.h, ar.w)
    }
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.strokeRect(rr.x + 0.5, rr.y + 0.5, rr.w - 2, rr.h - 2)
    // Fill handle.
    if (!editing) {
      ctx.fillStyle = accent
      ctx.fillRect(rr.x + rr.w - 5, rr.y + rr.h - 5, 7, 7)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(rr.x + rr.w - 6, rr.y + rr.h - 6, 1, 8)
      ctx.fillRect(rr.x + rr.w - 6, rr.y + rr.h - 6, 8, 1)
    }

    // Copy marquee.
    const clip = store.clip
    if (clip && (!clip.cut || clip.cut.sheetId === sheet.id)) {
      const src = clip.cut?.range ?? { r1: clip.origin.row, c1: clip.origin.col, r2: clip.origin.row + clip.cells.length - 1, c2: clip.origin.col + (clip.cells[0]?.length ?? 1) - 1 }
      const cr = rectOf(src)
      ctx.setLineDash([5, 3])
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.strokeRect(cr.x + 1, cr.y + 1, cr.w - 3, cr.h - 3)
      ctx.setLineDash([])
    }

    // Fill-drag preview.
    const d = dragRef.current
    if (d?.kind === 'fill' && d.target) {
      const fr = rectOf(d.target)
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = '#555'
      ctx.lineWidth = 1
      ctx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1)
      ctx.setLineDash([])
    }
  }

  function drawHeaders(ctx: CanvasRenderingContext2D, cols: number[], rows: number[]) {
    const { w, h } = size
    const sel = store.range
    const wholeCols = sel.r1 === 0 && sel.r2 === MAX_ROWS - 1
    const wholeRows = sel.c1 === 0 && sel.c2 === MAX_COLS - 1
    ctx.font = `12px 'Segoe UI', sans-serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    ctx.fillStyle = HEADER_BG
    ctx.fillRect(0, 0, w, HEADER_H)
    ctx.fillRect(0, 0, HEADER_W, h)

    for (const c of cols) {
      const x = cellX(c)
      if (x + store.colWidth(c) < HEADER_W) continue
      const cw = store.colWidth(c)
      const on = c >= sel.c1 && c <= sel.c2
      if (on) {
        ctx.fillStyle = wholeCols ? accent : HEADER_ACTIVE
        ctx.fillRect(x, 0, cw, HEADER_H)
      }
      ctx.fillStyle = wholeCols && on ? '#fff' : on ? accent : '#444'
      ctx.fillText(colName(c), x + cw / 2, HEADER_H / 2 + 1)
      ctx.fillStyle = '#d4d2d0'
      ctx.fillRect(x + cw - 1, 4, 1, HEADER_H - 8)
      if (on) {
        ctx.fillStyle = accent
        ctx.fillRect(x, HEADER_H - 2, cw, 2)
      }
    }
    for (const r of rows) {
      const y = cellY(r)
      if (y + store.rowHeight(r) < HEADER_H) continue
      const rh = store.rowHeight(r)
      const on = r >= sel.r1 && r <= sel.r2
      if (on) {
        ctx.fillStyle = wholeRows ? accent : HEADER_ACTIVE
        ctx.fillRect(0, y, HEADER_W, rh)
      }
      ctx.fillStyle = wholeRows && on ? '#fff' : on ? accent : '#444'
      ctx.fillText(String(r + 1), HEADER_W / 2, y + rh / 2 + 1)
      ctx.fillStyle = '#d4d2d0'
      ctx.fillRect(4, y + rh - 1, HEADER_W - 8, 1)
      if (on) {
        ctx.fillStyle = accent
        ctx.fillRect(HEADER_W - 2, y, 2, rh)
      }
    }
    // Corner (select all).
    ctx.fillStyle = HEADER_BG
    ctx.fillRect(0, 0, HEADER_W, HEADER_H)
    ctx.fillStyle = '#b5b3b1'
    ctx.beginPath()
    ctx.moveTo(HEADER_W - 4, HEADER_H - 4)
    ctx.lineTo(HEADER_W - 4, 8)
    ctx.lineTo(HEADER_W - 16, HEADER_H - 4)
    ctx.fill()
    ctx.fillStyle = '#d4d2d0'
    ctx.fillRect(0, HEADER_H - 1, w, 1)
    ctx.fillRect(HEADER_W - 1, 0, 1, h)
    ctx.textAlign = 'start'
  }

  // ---------- Keeping the active cell in view ----------

  const ensureVisible = useCallback(
    (row: number, col: number) => {
      const el = scrollRef.current
      if (!el) return
      if (col >= frozen.cols) {
        const x = store.colX(col) - fw
        const right = x + store.colWidth(col)
        const view = el.clientWidth - HEADER_W - fw
        if (x < el.scrollLeft) el.scrollLeft = x
        else if (right > el.scrollLeft + view) el.scrollLeft = right - view
      }
      if (row >= frozen.rows) {
        const y = store.rowY(row) - fh
        const bottom = y + store.rowHeight(row)
        const view = el.clientHeight - HEADER_H - fh
        if (y < el.scrollTop) el.scrollTop = y
        else if (bottom > el.scrollTop + view) el.scrollTop = bottom - view
      }
    },
    [store, frozen.cols, frozen.rows, fw, fh]
  )

  if (pageRef) pageRef.current = Math.max(1, Math.floor((size.h - HEADER_H - fh) / DEFAULT_ROW_HEIGHT) - 1)

  const focus = store.sel.focus
  useEffect(() => {
    if (!drag) ensureVisible(focus.row, focus.col)
  }, [focus.row, focus.col, ensureVisible]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Mouse ----------

  const hit = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { px: e.clientX - rect.left, py: e.clientY - rect.top }
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button === 2) return
    const { px, py } = hit(e)
    if (px > size.w || py > size.h) return // scrollbar
    e.preventDefault()

    // While typing a formula, clicking a cell inserts its reference; dragging makes it a range.
    // Focus stays in the cell editor so typing can continue.
    if (editing && px > HEADER_W && py > HEADER_H && expectsReference(editing.text)) {
      const r = rowAt(py)
      const c = colAt(px)
      setEditing({ ...editing, text: editing.text + addr(r, c), mode: 'edit' })
      setDrag({ kind: 'point', anchor: { row: r, col: c }, base: editing.text })
      return
    }

    scrollRef.current?.focus({ preventScroll: true })

    // Header edges: resize.
    if (py < HEADER_H && px > HEADER_W) {
      const c = colAt(px - 4)
      const edge = cellX(c) + store.colWidth(c)
      if (Math.abs(px - edge) <= 4) {
        if (e.detail === 2) {
          const ctx = canvasRef.current!.getContext('2d')!
          store.autoFitCol(c, (text, cell) => {
            ctx.font = cellFont(cell)
            return ctx.measureText(text).width
          })
          return
        }
        setDrag({ kind: 'resize-col', col: c, startX: px, startW: store.colWidth(c) })
        return
      }
    }
    if (px < HEADER_W && py > HEADER_H) {
      const r = rowAt(py - 4)
      const edge = cellY(r) + store.rowHeight(r)
      if (Math.abs(py - edge) <= 3) {
        setDrag({ kind: 'resize-row', row: r, startY: py, startH: store.rowHeight(r) })
        return
      }
    }

    if (editing) commit()

    if (px < HEADER_W && py < HEADER_H) {
      store.select({ row: 0, col: 0 }, { row: MAX_ROWS - 1, col: MAX_COLS - 1 })
      return
    }
    if (py < HEADER_H) {
      const c = colAt(px)
      const from = e.shiftKey ? store.sel.anchor.col : c
      store.select({ row: 0, col: from }, { row: MAX_ROWS - 1, col: c })
      setDrag({ kind: 'cols', from })
      return
    }
    if (px < HEADER_W) {
      const r = rowAt(py)
      const from = e.shiftKey ? store.sel.anchor.row : r
      store.select({ row: from, col: 0 }, { row: r, col: MAX_COLS - 1 })
      setDrag({ kind: 'rows', from })
      return
    }

    // Fill handle.
    const rr = rectOf(store.range)
    if (Math.abs(px - (rr.x + rr.w - 1)) <= 5 && Math.abs(py - (rr.y + rr.h - 1)) <= 5) {
      setDrag({ kind: 'fill', target: null })
      return
    }

    const r = rowAt(py)
    const c = colAt(px)
    if (e.detail === 2) {
      const cell = store.cell(r, c)
      setEditing({ row: store.sel.anchor.row, col: store.sel.anchor.col, text: cell?.raw ?? '', mode: 'edit' })
      return
    }
    if (e.shiftKey) store.select(store.sel.anchor, { row: r, col: c })
    else {
      const m = mergeAt(sheet, r, c)
      store.select(m ? { row: m.r1, col: m.c1 } : { row: r, col: c }, m ? { row: m.r2, col: m.c2 } : undefined)
    }
    setDrag({ kind: 'select', anchor: store.sel.anchor })
  }

  useEffect(() => {
    if (!drag) return
    let raf = 0
    const onMove = (e: MouseEvent) => {
      const { px, py } = hit(e)
      const d = dragRef.current!
      if (d.kind === 'resize-col') {
        store.updateColWidthLive(d.col, d.startW + (px - d.startX))
        return
      }
      if (d.kind === 'resize-row') {
        store.updateRowHeightLive(d.row, d.startH + (py - d.startY))
        return
      }
      // Auto-scroll when dragging past the edges.
      const el = scrollRef.current!
      cancelAnimationFrame(raf)
      const edgeScroll = () => {
        const dx = px > size.w - 10 ? 20 : px < HEADER_W + fw ? -20 : 0
        const dy = py > size.h - 10 ? 20 : py < HEADER_H + fh ? -20 : 0
        if (dx || dy) {
          el.scrollLeft += dx
          el.scrollTop += dy
          raf = requestAnimationFrame(edgeScroll)
        }
      }
      raf = requestAnimationFrame(edgeScroll)

      const r = rowAt(Math.max(HEADER_H + 1, Math.min(py, size.h - 1)))
      const c = colAt(Math.max(HEADER_W + 1, Math.min(px, size.w - 1)))
      if (d.kind === 'select') store.select(d.anchor, { row: r, col: c })
      else if (d.kind === 'point' && editingRef.current) {
        const ref = rangeAddr({ r1: d.anchor.row, c1: d.anchor.col, r2: r, c2: c })
        setEditing({ ...editingRef.current, text: d.base + ref })
      }
      else if (d.kind === 'cols') store.select({ row: 0, col: d.from }, { row: MAX_ROWS - 1, col: c })
      else if (d.kind === 'rows') store.select({ row: d.from, col: 0 }, { row: r, col: MAX_COLS - 1 })
      else if (d.kind === 'fill') {
        const src = store.range
        // Extend along whichever axis the pointer moved further from the source block.
        const dRow = r > src.r2 ? r - src.r2 : r < src.r1 ? r - src.r1 : 0
        const dCol = c > src.c2 ? c - src.c2 : c < src.c1 ? c - src.c1 : 0
        let target: Range | null = null
        if (Math.abs(dRow) >= Math.abs(dCol) && dRow) target = dRow > 0 ? { ...src, r2: r } : { ...src, r1: r }
        else if (dCol) target = dCol > 0 ? { ...src, c2: c } : { ...src, c1: c }
        setDrag({ kind: 'fill', target })
      }
    }
    const onUp = () => {
      cancelAnimationFrame(raf)
      const d = dragRef.current
      if (d?.kind === 'fill' && d.target) store.fill(d.target)
      if (d?.kind === 'resize-col') store.commitSizes()
      if (d?.kind === 'resize-row') store.commitSizes()
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag?.kind, size, colAt, rowAt]) // eslint-disable-line react-hooks/exhaustive-deps

  function onHover(e: React.MouseEvent) {
    if (drag) return
    const { px, py } = hit(e)
    const el = canvasRef.current!
    let cursor = 'cell'
    if (py < HEADER_H && px > HEADER_W) {
      const c = colAt(px - 4)
      cursor = Math.abs(px - (cellX(c) + store.colWidth(c))) <= 4 ? 'col-resize' : 'default'
    } else if (px < HEADER_W && py > HEADER_H) {
      const r = rowAt(py - 4)
      cursor = Math.abs(py - (cellY(r) + store.rowHeight(r))) <= 3 ? 'row-resize' : 'default'
    } else {
      const rr = rectOf(store.range)
      if (Math.abs(px - (rr.x + rr.w - 1)) <= 5 && Math.abs(py - (rr.y + rr.h - 1)) <= 5) cursor = 'crosshair'
    }
    el.style.cursor = cursor
  }

  // ---------- Editor overlay ----------

  let editorStyle: CSSProperties | null = null
  if (editing && editing.row === store.sel.anchor.row && editing.col === store.sel.anchor.col) {
    const m = mergeAt(sheet, editing.row, editing.col) ?? { r1: editing.row, c1: editing.col, r2: editing.row, c2: editing.col }
    const r = rectOf(m)
    const cell = store.cell(editing.row, editing.col)
    editorStyle = {
      left: r.x,
      top: r.y,
      minWidth: r.w,
      minHeight: r.h,
      font: cellFont(cell),
      color: cell?.style?.color ?? TEXT,
      background: cell?.style?.fill ?? '#fff',
      borderColor: accent
    }
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        tabIndex={0}
        data-grid
        aria-label="Spreadsheet grid"
        className="sheet-scroll absolute inset-0 overflow-auto outline-none"
        onScroll={(e) => setScroll({ x: e.currentTarget.scrollLeft, y: e.currentTarget.scrollTop })}
        onMouseDown={onMouseDown}
        onMouseMove={onHover}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onContextMenu={(e) => {
          e.preventDefault()
          const { px, py } = hit(e)
          if (px > HEADER_W && py > HEADER_H) {
            const r = rowAt(py)
            const c = colAt(px)
            if (!(r >= store.range.r1 && r <= store.range.r2 && c >= store.range.c1 && c <= store.range.c2)) store.select({ row: r, col: c })
          }
          onContextMenu(e.clientX, e.clientY)
        }}
      >
        {/* Spacer gives the native scrollbars the full sheet extent. */}
        <div style={{ width: HEADER_W + contentW, height: HEADER_H + contentH }} />
        <canvas
          ref={canvasRef}
          className="sticky left-0 top-0 block"
          style={{ width: size.w, height: size.h, marginTop: -(HEADER_H + contentH) }}
        />
      </div>

      <ChartLayer store={store} version={version} scroll={scroll} accent={accent} />

      {editorStyle && editing && (
        <CellEditor
          style={editorStyle}
          editing={editing}
          setEditing={setEditing}
          commit={commit}
          cancel={() => {
            setEditing(null)
            scrollRef.current?.focus()
          }}
          refocusGrid={() => scrollRef.current?.focus()}
        />
      )}
    </div>
  )
}

function CellEditor({
  style, editing, setEditing, commit, cancel, refocusGrid
}: {
  style: CSSProperties
  editing: EditState
  setEditing: (e: EditState) => void
  commit: (move?: { dRow: number; dCol: number }, fillAll?: boolean) => void
  cancel: () => void
  refocusGrid: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    // Typing in the formula bar also shows this overlay; don't steal focus from it.
    if ((document.activeElement as HTMLElement | null)?.hasAttribute('data-formula-bar')) return
    const el = ref.current!
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  // Grow with content.
  useLayoutEffect(() => {
    const el = ref.current!
    el.style.width = '0px'
    el.style.width = `${Math.max(el.scrollWidth + 6, Number(style.minWidth) || 0)}px`
    el.style.height = '0px'
    el.style.height = `${Math.max(el.scrollHeight, Number(style.minHeight) || 0)}px`
  })

  return (
    <textarea
      ref={ref}
      data-cell-editor
      aria-label="Cell editor"
      value={editing.text}
      spellCheck={false}
      onChange={(e) => setEditing({ ...editing, text: e.target.value })}
      onKeyDown={(e) => {
        const k = e.key
        if (k === 'Enter' && e.altKey) {
          // Alt+Enter: line break inside the cell.
          e.preventDefault()
          const el = e.currentTarget
          const pos = el.selectionStart
          setEditing({ ...editing, text: editing.text.slice(0, pos) + '\n' + editing.text.slice(el.selectionEnd) })
          requestAnimationFrame(() => el.setSelectionRange(pos + 1, pos + 1))
          return
        }
        if (k === 'Enter') {
          e.preventDefault()
          commit({ dRow: e.shiftKey ? -1 : 1, dCol: 0 }, e.ctrlKey)
          refocusGrid()
        } else if (k === 'Tab') {
          e.preventDefault()
          commit({ dRow: 0, dCol: e.shiftKey ? -1 : 1 })
          refocusGrid()
        } else if (k === 'Escape') {
          e.preventDefault()
          cancel()
        } else if (editing.mode === 'enter' && k.startsWith('Arrow') && !expectsReference(editing.text)) {
          e.preventDefault()
          const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k]!
          commit({ dRow: d[0], dCol: d[1] })
          refocusGrid()
        } else if (k === 'F2') {
          e.preventDefault()
          setEditing({ ...editing, mode: editing.mode === 'enter' ? 'edit' : 'enter' })
        }
        e.stopPropagation()
      }}
      className="absolute z-20 resize-none overflow-hidden whitespace-pre border-2 px-[3px] py-[2px] leading-[1.35] shadow-md outline-none"
      style={style}
    />
  )
}

