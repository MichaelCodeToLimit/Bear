import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, ArrowDownZA, ArrowRight, Bold, Check, ClipboardPaste, Copy, Eraser,
  FileDown, Italic, Merge, MoreVertical, PaintBucket, Palette, Pencil, Plus, Redo2, Rows3, Columns3, Sigma, Trash2, Underline,
  Undo2, WrapText, X, ZoomIn, Hash, Pin
} from 'lucide-react'
import { baseName, extensionOf, stripExtension } from '@bear/core'
import { SheetStore } from '@bear/app-sheets/src/store'
import { readWorkbook, writeWorkbook, SAVABLE } from '@bear/app-sheets/src/file-io'
import { SHEET_TEMPLATES } from '@bear/app-sheets/src/templates'
import { mergeAt, newWorkbook, DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT } from '@bear/app-sheets/src/model'
import { MAX_COLS, MAX_ROWS, addr, colName, parseAddr, rangeAddr } from '@bear/app-sheets/src/refs'
import { NUMBER_FORMATS, defaultAlign } from '@bear/app-sheets/src/values'
import { isError } from '@bear/app-sheets/src/engine'
import type { DocInput } from '../Shell'
import { renameDoc, saveNew } from '../files'
import { IconButton, Page, Swatches, ask, confirm, menu, sheet, toast, useLongPress } from '../ui'

type Status = 'saved' | 'saving' | 'unsaved' | 'error'
const AUTOSAVE_MS = 1500
const HEAD_W = 44
const HEAD_H = 28

export default function SheetsPhone({ input }: { input: DocInput }) {
  const [doc, setDoc] = useState<{ store: SheetStore; path: string | null; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if ('file' in input) {
      readWorkbook(input.file.path, input.file.data)
        .then((wb) => {
          setDoc({ store: new SheetStore(wb), path: input.file.path, name: stripExtension(input.file.name) })
          void window.bear.addRecent(input.file.path, 'sheets')
        })
        .catch((e) => setError(`Couldn't open ${input.file.name}: ${(e as Error).message}`))
    } else {
      const t = SHEET_TEMPLATES.find((x) => x.id === input.template)
      setDoc({ store: new SheetStore(t ? t.build() : newWorkbook()), path: null, name: !t || t.id === 'blank' ? 'Untitled spreadsheet' : t.name })
    }
  }, [input])
  if (error) return <Page title="Sheets" back><div className="m-4 rounded-xl bg-red-100 p-4 text-[14px] text-red-900">{error}</div></Page>
  if (!doc) return <Page title="Opening…" back>{null}</Page>
  return <Workbook {...doc} isNew={!('file' in input)} />
}

/** Cumulative offsets for the first `n` rows or columns, at the current zoom. */
function offsets(n: number, size: (i: number) => number, z: number): number[] {
  const out = new Array<number>(n + 1)
  out[0] = 0
  for (let i = 0; i < n; i++) out[i + 1] = out[i] + Math.round(size(i) * z)
  return out
}

/** Index of the last offset <= x. */
function locate(off: number[], x: number): number {
  let lo = 0
  let hi = off.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (off[mid] <= x) lo = mid
    else hi = mid - 1
  }
  return Math.max(0, lo)
}

function Workbook({ store, path: initialPath, name: initialName, isNew }: { store: SheetStore; path: string | null; name: string; isNew: boolean }) {
  const version = useSyncExternalStore(store.subscribe, store.getVersion)
  const [path, setPath] = useState(initialPath)
  const [name, setName] = useState(initialName)
  const [status, setStatus] = useState<Status>(isNew ? 'unsaved' : 'saved')
  const [editing, setEditing] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const state = useRef({ path, name })
  state.current = { path, name }
  const saving = useRef<Promise<void>>(Promise.resolve())
  const input = useRef<HTMLInputElement>(null)

  const save = useCallback(async () => {
    dirty.current = false
    setStatus('saving')
    const run = async () => {
      let p = state.current.path
      try {
        if (!p || !SAVABLE.has(extensionOf(p))) {
          const data = await writeWorkbook(`${state.current.name}.xlsx`, store.wb, store.active, store.engine)
          p = await saveNew(state.current.name, 'xlsx', data, 'sheets')
          setPath(p)
          setName(stripExtension(baseName(p)))
        } else {
          await window.bear.saveFile(p, await writeWorkbook(p, store.wb, store.active, store.engine))
        }
        setStatus(dirty.current ? 'unsaved' : 'saved')
      } catch (e) {
        dirty.current = true
        setStatus('error')
        toast(`Couldn't save: ${(e as Error).message}`)
      }
    }
    saving.current = saving.current.then(run)
    return saving.current
  }, [store])

  useEffect(() => {
    store.onChange = () => {
      dirty.current = true
      setStatus('unsaved')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void save(), AUTOSAVE_MS)
    }
    // A new workbook from a template is saved straight away, like a new document.
    if (isNew) store.onChange()
    return () => {
      store.onChange = null
      if (timer.current) clearTimeout(timer.current)
      if (dirty.current) void save()
    }
  }, [store, save]) // eslint-disable-line react-hooks/exhaustive-deps

  // A hardware keyboard (Chromebooks, tablets, Bluetooth keyboards) works like on the desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing !== null || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return
      const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, 1], Enter: [1, 0] }
      if (moves[e.key]) {
        e.preventDefault()
        store.move(moves[e.key][0], moves[e.key][1], e.shiftKey && e.key.startsWith('Arrow'), false)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        store.clearContents()
      } else if (e.key === 'F2') {
        e.preventDefault()
        startEdit()
      } else if (e.key.length === 1) {
        e.preventDefault()
        startEdit(e.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const sel = store.sel
  const cur = store.cell(sel.anchor.row, sel.anchor.col)
  const range = store.range
  const multi = range.r1 !== range.r2 || range.c1 !== range.c2

  const startEdit = (initial?: string) => {
    // Render the input now and focus it in the same event, so fast typing lands in it (and the
    // phone keyboard opens, which needs focus during the tap).
    flushSync(() => setEditing(initial ?? store.cell(store.sel.anchor.row, store.sel.anchor.col)?.raw ?? ''))
    input.current?.focus()
    const n = input.current?.value.length ?? 0
    input.current?.setSelectionRange(n, n)
  }
  const commit = (dRow = 1, dCol = 0) => {
    if (editing === null) return
    const { row, col } = store.sel.anchor
    if (editing !== (store.cell(row, col)?.raw ?? '')) store.setRaw(row, col, editing)
    setEditing(null)
    store.move(dRow, dCol, false, false)
    input.current?.blur()
  }
  const insertAtCursor = (text: string) => {
    const el = input.current
    if (!el || editing === null) return
    const a = el.selectionStart ?? editing.length
    const b = el.selectionEnd ?? editing.length
    const next = editing.slice(0, a) + text + editing.slice(b)
    setEditing(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + text.length, a + text.length)
    })
  }

  const rename = async () => {
    const v = await ask('Rename spreadsheet', { value: name, ok: 'Rename' })
    if (!v?.trim() || v.trim() === name) return
    if (!path) return setName(v.trim())
    try {
      await saving.current
      const p = await renameDoc(path, v.trim())
      setPath(p)
      setName(stripExtension(baseName(p)))
    } catch (e) {
      toast(`Couldn't rename: ${(e as Error).message}`)
    }
  }

  const statusText = { saved: path ? 'Saved' : 'Not saved yet', saving: 'Saving…', unsaved: path ? 'Editing' : 'Not saved yet', error: 'Not saved' }[status]
  const stats = multi ? store.stats() : null

  return (
    <Page
      title={<button onClick={() => void rename()} className="max-w-full truncate text-left">{name}</button>}
      subtitle={`${statusText} · ${path ? extensionOf(path).toUpperCase() : 'XLSX'}`}
      back
      scroll={false}
      actions={
        <>
          <IconButton icon={Undo2} label="Undo" disabled={!store.canUndo} onClick={() => store.undo()} />
          <IconButton icon={Redo2} label="Redo" disabled={!store.canRedo} onClick={() => store.redo()} />
          <IconButton
            icon={MoreVertical}
            label="More"
            onClick={() =>
              menu([
                { label: 'Rename', icon: Pencil, onClick: () => void rename() },
                {
                  label: 'Go to cell',
                  icon: Hash,
                  onClick: async () => {
                    const a = await ask('Go to cell', { placeholder: 'e.g. B12', ok: 'Go' })
                    const p = a ? parseAddr(a.trim().toUpperCase()) : null
                    if (p) store.select(p)
                    else if (a) toast(`“${a}” isn't a cell address`)
                  }
                },
                {
                  label: `Zoom (${Math.round(zoom * 100)}%)`,
                  icon: ZoomIn,
                  onClick: () => menu([0.6, 0.8, 1, 1.25, 1.5].map((z) => ({ label: `${Math.round(z * 100)}%`, checked: zoom === z, onClick: () => setZoom(z) })), 'Zoom')
                },
                {
                  label: store.sheet.frozen.rows || store.sheet.frozen.cols ? 'Unfreeze panes' : 'Freeze top row',
                  icon: Pin,
                  onClick: () => store.setFrozen(store.sheet.frozen.rows || store.sheet.frozen.cols ? 0 : 1, 0)
                },
                {
                  label: 'Save a copy as CSV',
                  icon: FileDown,
                  onClick: async () => {
                    try {
                      const p = await saveNew(`${name} - ${store.sheet.name}`, 'csv', await writeWorkbook('x.csv', store.wb, store.active, store.engine), 'sheets')
                      toast(`Saved ${baseName(p)} in Documents/Bear`)
                    } catch (e) {
                      toast(`Couldn't save: ${(e as Error).message}`)
                    }
                  }
                },
                {
                  label: 'Save a copy as Excel',
                  icon: FileDown,
                  onClick: async () => {
                    try {
                      const p = await saveNew(`${name} copy`, 'xlsx', await writeWorkbook('x.xlsx', store.wb, store.active, store.engine), 'sheets')
                      toast(`Saved ${baseName(p)} in Documents/Bear`)
                    } catch (e) {
                      toast(`Couldn't save: ${(e as Error).message}`)
                    }
                  }
                }
              ])
            }
          />
        </>
      }
      bottom={
        editing !== null ? (
          <QuickKeys onKey={insertAtCursor} onEnter={() => commit(1, 0)} onNext={() => commit(0, 1)} onCancel={() => { setEditing(null); input.current?.blur() }} />
        ) : (
          <>
            {stats && (
              <div className="flex shrink-0 justify-center gap-4 border-t border-line bg-surface px-3 py-1.5 text-[12.5px] text-muted">
                {stats.numbers > 0 && <span>Sum <b className="text-ink">{+stats.sum.toFixed(6)}</b></span>}
                {stats.numbers > 0 && <span>Avg <b className="text-ink">{+(stats.sum / stats.numbers).toFixed(4)}</b></span>}
                <span>Count <b className="text-ink">{stats.count}</b></span>
              </div>
            )}
            <Toolbar store={store} />
            <SheetTabs store={store} />
          </>
        )
      }
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-2 py-1.5">
        <button
          onClick={async () => {
            const a = await ask('Go to cell', { placeholder: 'e.g. B12', ok: 'Go', value: addr(sel.anchor.row, sel.anchor.col) })
            const p = a ? parseAddr(a.trim().toUpperCase()) : null
            if (p) store.select(p)
          }}
          className="h-9 min-w-[64px] rounded-lg bg-hover px-2 text-[13.5px] font-semibold text-ink"
        >
          {multi ? rangeAddr(range) : addr(sel.anchor.row, sel.anchor.col)}
        </button>
        <span className="text-[14px] font-semibold italic text-muted">fx</span>
        {editing !== null ? (
          <input
            ref={input}
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit(1, 0)
              }
            }}
            enterKeyHint="next"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--accent)] bg-canvas px-2 font-mono text-[14.5px] text-ink outline-none"
          />
        ) : (
          <button onClick={() => startEdit()} className="h-9 min-w-0 flex-1 truncate rounded-lg px-2 text-left font-mono text-[14px] text-ink">
            {cur?.raw ?? ''}
          </button>
        )}
      </div>
      <Grid
        store={store}
        version={version}
        zoom={zoom}
        onTapSelected={() => startEdit()}
        onTapCell={(row, col) => {
          if (editing !== null && editing.startsWith('=') && editing.length > 1) {
            insertAtCursor(addr(row, col))
            return true
          }
          if (editing === null) return false
          commit(0, 0)
          store.select({ row, col })
          return true
        }}
      />
    </Page>
  )
}

function Grid({ store, version, zoom, onTapSelected, onTapCell }: { store: SheetStore; version: number; zoom: number; onTapSelected: () => void; onTapCell: (row: number, col: number) => boolean }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, w: 400, h: 700 })
  const sheet = store.sheet

  // How much grid to lay out: the used area plus room to grow, extended as you scroll.
  const [extra, setExtra] = useState({ rows: 0, cols: 0 })
  const used = useMemo(() => {
    let r = 0
    let c = 0
    for (const k of sheet.cells.keys()) {
      const i = k.indexOf(',')
      r = Math.max(r, +k.slice(0, i))
      c = Math.max(c, +k.slice(i + 1))
    }
    return { r, c }
  }, [sheet, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const nRows = Math.min(MAX_ROWS, Math.max(used.r + 60, store.sel.focus.row + 30, 100) + extra.rows)
  const nCols = Math.min(MAX_COLS, Math.max(used.c + 8, store.sel.focus.col + 6, 26) + extra.cols)
  const rowOff = useMemo(() => offsets(nRows, (r) => store.rowHeight(r), zoom), [nRows, zoom, sheet, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const colOff = useMemo(() => offsets(nCols, (c) => store.colWidth(c), zoom), [nCols, zoom, sheet, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const W = colOff[nCols]
  const H = rowOff[nRows]

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const update = () => {
      setView({ x: el.scrollLeft, y: el.scrollTop, w: el.clientWidth, h: el.clientHeight })
      if (el.scrollTop + el.clientHeight > el.scrollHeight - 400) setExtra((e) => ({ ...e, rows: e.rows + 100 }))
      if (el.scrollLeft + el.clientWidth > el.scrollWidth - 300) setExtra((e) => ({ ...e, cols: e.cols + 10 }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  // Keep the selected cell on screen when it moves (Enter, Next, Go to).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const { row, col } = store.sel.focus
    if (row >= nRows || col >= nCols) return
    const x1 = colOff[col]
    const x2 = colOff[col + 1]
    const y1 = rowOff[row]
    const y2 = rowOff[row + 1]
    const vw = el.clientWidth - HEAD_W
    const vh = el.clientHeight - HEAD_H
    if (x1 < el.scrollLeft) el.scrollLeft = x1
    else if (x2 > el.scrollLeft + vw) el.scrollLeft = x2 - vw
    if (y1 < el.scrollTop) el.scrollTop = y1
    else if (y2 > el.scrollTop + vh) el.scrollTop = y2 - vh
  }, [store.sel.focus.row, store.sel.focus.col]) // eslint-disable-line react-hooks/exhaustive-deps

  const r0 = locate(rowOff, view.y)
  const r1 = Math.min(nRows - 1, locate(rowOff, view.y + view.h) + 1)
  const c0 = locate(colOff, view.x)
  const c1 = Math.min(nCols - 1, locate(colOff, view.x + view.w) + 1)

  const cellAt = (clientX: number, clientY: number) => {
    const el = scroller.current!
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left - HEAD_W + el.scrollLeft
    const y = clientY - rect.top - HEAD_H + el.scrollTop
    return { row: Math.min(nRows - 1, locate(rowOff, Math.max(0, y))), col: Math.min(nCols - 1, locate(colOff, Math.max(0, x))) }
  }

  const range = store.range
  const fs = Math.round(14 * zoom)
  const cells: ReactNode[] = []
  const drawn = new Set<string>()
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const m = mergeAt(sheet, r, c)
      let rr = r
      let cc = c
      let rEnd = r
      let cEnd = c
      if (m) {
        rr = m.r1
        cc = m.c1
        rEnd = Math.min(m.r2, nRows - 1)
        cEnd = Math.min(m.c2, nCols - 1)
        const k = `${rr},${cc}`
        if (drawn.has(k)) continue
        drawn.add(k)
      }
      const cell = store.cell(rr, cc)
      const v = cell?.raw ? store.value(rr, cc) : null
      if (!cell?.raw && !cell?.style?.fill && !m) continue
      const st = cell?.style ?? {}
      const text = cell?.raw ? store.display(rr, cc) : ''
      const align = st.align ?? (isError(v as never) ? 'center' : defaultAlign(v))
      // Like a spreadsheet, left-aligned text spills into empty cells to its right.
      let spill = cEnd
      if (!m && !st.wrap && !st.fill && align === 'left' && text) while (spill + 1 < nCols && spill - cc < 12 && !store.cell(rr, spill + 1)?.raw && !mergeAt(sheet, rr, spill + 1)) spill++
      cells.push(
        <div
          key={`${rr},${cc}`}
          className="absolute overflow-hidden px-1"
          style={{
            left: colOff[cc],
            top: rowOff[rr],
            width: colOff[spill + 1] - colOff[cc],
            height: rowOff[rEnd + 1] - rowOff[rr],
            background: st.fill ?? (m ? 'var(--paper)' : undefined),
            color: st.color ?? (isError(v as never) ? '#dc2626' : '#1f1f1f'),
            fontWeight: st.bold ? 700 : undefined,
            fontStyle: st.italic ? 'italic' : undefined,
            textDecoration: [st.underline && 'underline', st.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
            fontSize: st.fontSize ? Math.round(st.fontSize * 1.33 * zoom) : fs,
            textAlign: align,
            whiteSpace: st.wrap ? 'normal' : 'nowrap',
            lineHeight: st.wrap ? 1.2 : `${rowOff[rEnd + 1] - rowOff[rr] - 1}px`,
            borderRight: m || st.fill ? '1px solid #e2e0dc' : undefined,
            borderBottom: m || st.fill ? '1px solid #e2e0dc' : undefined,
            textOverflow: 'clip'
          }}
        >
          {text}
        </div>
      )
    }
  }

  const selBox = {
    left: colOff[Math.min(range.c1, nCols)],
    top: rowOff[Math.min(range.r1, nRows)],
    width: colOff[Math.min(range.c2 + 1, nCols)] - colOff[Math.min(range.c1, nCols)],
    height: rowOff[Math.min(range.r2 + 1, nRows)] - rowOff[Math.min(range.r1, nRows)]
  }

  const dragging = useRef(false)
  const colLong = useLongPress(() => headerMenu(store, 'col'))
  const rowLong = useLongPress(() => headerMenu(store, 'row'))

  return (
    <div ref={scroller} className="phone-grid relative min-h-0 flex-1 overflow-auto overscroll-none bg-white" style={{ touchAction: 'pan-x pan-y' }}>
      <div className="relative" style={{ width: W + HEAD_W, height: H + HEAD_H }}>
        {/* Column letters */}
        <div className="sticky top-0 z-[3] flex" style={{ height: HEAD_H, width: W + HEAD_W }}>
          <button
            aria-label="Select all"
            onClick={() => store.select({ row: 0, col: 0 }, { row: MAX_ROWS - 1, col: MAX_COLS - 1 })}
            className="sticky left-0 z-[4] shrink-0 border-b border-r border-[#d4d1cb] bg-[#f1efeb]"
            style={{ width: HEAD_W, height: HEAD_H }}
          />
          <div className="relative" style={{ width: W }} {...colLong.handlers}>
            {Array.from({ length: c1 - c0 + 1 }, (_, i) => c0 + i).map((c) => {
              const on = c >= range.c1 && c <= range.c2
              return (
                <button
                  key={c}
                  onClick={() => !colLong.fired.current && (store.sel.anchor.col === c && store.sel.anchor.row === 0 && store.sel.focus.row === MAX_ROWS - 1 ? headerMenu(store, 'col') : store.select({ row: 0, col: c }, { row: MAX_ROWS - 1, col: c }))}
                  className={`absolute top-0 border-b border-r border-[#d4d1cb] text-[12px] ${on ? 'bg-[var(--accent)]/20 font-semibold text-[var(--accent)]' : 'bg-[#f1efeb] text-[#555]'}`}
                  style={{ left: colOff[c], width: colOff[c + 1] - colOff[c], height: HEAD_H }}
                >
                  {colName(c)}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex" style={{ height: H }}>
          {/* Row numbers */}
          <div className="sticky left-0 z-[2] shrink-0" style={{ width: HEAD_W, height: H }} {...rowLong.handlers}>
            {Array.from({ length: r1 - r0 + 1 }, (_, i) => r0 + i).map((r) => {
              const on = r >= range.r1 && r <= range.r2
              return (
                <button
                  key={r}
                  onClick={() => !rowLong.fired.current && (store.sel.anchor.row === r && store.sel.anchor.col === 0 && store.sel.focus.col === MAX_COLS - 1 ? headerMenu(store, 'row') : store.select({ row: r, col: 0 }, { row: r, col: MAX_COLS - 1 }))}
                  className={`absolute left-0 border-b border-r border-[#d4d1cb] text-[12px] ${on ? 'bg-[var(--accent)]/20 font-semibold text-[var(--accent)]' : 'bg-[#f1efeb] text-[#555]'}`}
                  style={{ top: rowOff[r], height: rowOff[r + 1] - rowOff[r], width: HEAD_W }}
                >
                  {r + 1}
                </button>
              )
            })}
          </div>
          {/* Cells */}
          <div
            className="relative"
            style={{
              width: W,
              height: H,
              backgroundImage: `linear-gradient(to right, #e7e5e1 1px, transparent 1px), linear-gradient(to bottom, #e7e5e1 1px, transparent 1px)`,
              backgroundSize: `${Math.round(DEFAULT_COL_WIDTH * zoom)}px ${Math.round(DEFAULT_ROW_HEIGHT * zoom)}px`,
              backgroundPosition: '-1px -1px'
            }}
            onClick={(e) => {
              if (dragging.current) return
              const { row, col } = cellAt(e.clientX, e.clientY)
              if (onTapCell(row, col)) return
              const a = store.sel.anchor
              const single = store.range.r1 === store.range.r2 && store.range.c1 === store.range.c2
              const m = mergeAt(sheet, row, col)
              const target = m ? { row: m.r1, col: m.c1 } : { row, col }
              if (single && a.row === target.row && a.col === target.col) onTapSelected()
              else store.select(target)
            }}
          >
            {/* Custom sizes break the even background grid, so draw real lines in that case. */}
            {(sheet.colWidths.size > 0 || sheet.rowHeights.size > 0) && <Lines colOff={colOff} rowOff={rowOff} c0={c0} c1={c1} r0={r0} r1={r1} />}
            {cells}
            <div className="pointer-events-none absolute border-2 border-[var(--accent)] bg-[var(--accent)]/[0.07]" style={selBox} />
            {/* Drag the handle to select more cells. */}
            <div
              role="slider"
              aria-label="Extend selection"
              className="absolute z-[1] flex h-9 w-9 items-center justify-center"
              style={{ left: selBox.left + selBox.width - 18, top: selBox.top + selBox.height - 18, touchAction: 'none' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
                dragging.current = true
              }}
              onPointerMove={(e) => {
                if (!dragging.current) return
                store.select(store.sel.anchor, cellAt(e.clientX, e.clientY))
              }}
              onPointerUp={() => setTimeout(() => (dragging.current = false), 50)}
              onPointerCancel={() => (dragging.current = false)}
            >
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--accent)] shadow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Lines({ colOff, rowOff, c0, c1, r0, r1 }: { colOff: number[]; rowOff: number[]; c0: number; c1: number; r0: number; r1: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 bg-white">
      {Array.from({ length: c1 - c0 + 2 }, (_, i) => c0 + i).map((c) => (
        <div key={`c${c}`} className="absolute bottom-0 top-0 w-px bg-[#e7e5e1]" style={{ left: colOff[c] - 1 }} />
      ))}
      {Array.from({ length: r1 - r0 + 2 }, (_, i) => r0 + i).map((r) => (
        <div key={`r${r}`} className="absolute left-0 right-0 h-px bg-[#e7e5e1]" style={{ top: rowOff[r] - 1 }} />
      ))}
    </div>
  )
}

function headerMenu(store: SheetStore, axis: 'row' | 'col') {
  const r = store.range
  const which = axis === 'row' ? `row ${r.r1 + 1}${r.r2 > r.r1 && r.r2 < MAX_ROWS - 1 ? `–${r.r2 + 1}` : ''}` : `column ${colName(r.c1)}`
  menu(
    [
      { label: axis === 'row' ? 'Insert row above' : 'Insert column left', icon: Plus, onClick: () => store.insert(axis, true) },
      { label: axis === 'row' ? 'Insert row below' : 'Insert column right', icon: Plus, onClick: () => store.insert(axis, false) },
      { label: `Delete ${which}`, icon: Trash2, danger: true, onClick: () => store.remove(axis) },
      {
        label: axis === 'row' ? 'Row height' : 'Column width',
        icon: axis === 'row' ? Rows3 : Columns3,
        onClick: async () => {
          const cur = axis === 'row' ? store.rowHeight(r.r1) : store.colWidth(r.c1)
          const v = await ask(axis === 'row' ? 'Row height (pixels)' : 'Column width (pixels)', { value: String(cur), inputMode: 'decimal', ok: 'Set' })
          const n = Math.round(Number(v))
          if (!v || !Number.isFinite(n) || n < 8 || n > 800) return
          store.transact(() => {
            if (axis === 'row') for (let i = r.r1; i <= Math.min(r.r2, r.r1 + 500); i++) store.sheet.rowHeights.set(i, n)
            else for (let i = r.c1; i <= Math.min(r.c2, r.c1 + 100); i++) store.sheet.colWidths.set(i, n)
          })
        }
      },
      ...(axis === 'col'
        ? [
            { label: 'Sort A → Z', icon: ArrowDownAZ, onClick: () => store.sort(false) },
            { label: 'Sort Z → A', icon: ArrowDownZA, onClick: () => store.sort(true) }
          ]
        : [])
    ],
    which[0].toUpperCase() + which.slice(1)
  )
}

const KEYS = ['=', '(', ')', ',', ':', '+', '-', '*', '/', '$', '"', '&', '<', '>', '%']
const FUNCS = ['SUM(', 'AVERAGE(', 'COUNT(', 'MIN(', 'MAX(', 'IF(', 'ROUND(', 'TODAY()', 'VLOOKUP(', 'SUMIF(', 'CONCAT(']

function QuickKeys({ onKey, onEnter, onNext, onCancel }: { onKey: (t: string) => void; onEnter: () => void; onNext: () => void; onCancel: () => void }) {
  const [fx, setFx] = useState(false)
  return (
    <div className="phone-bottom shrink-0 border-t border-line bg-surface">
      <div className="flex items-center gap-1 px-1 py-1">
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => setFx(!fx)} className={`h-10 shrink-0 rounded-lg px-3 text-[14px] font-semibold italic ${fx ? 'bg-[var(--accent)] text-white' : 'bg-hover text-ink'}`}>
          fx
        </button>
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {(fx ? FUNCS : KEYS).map((k) => (
            <button key={k} onMouseDown={(e) => e.preventDefault()} onClick={() => onKey(k)} className="h-10 min-w-10 shrink-0 rounded-lg bg-hover px-2.5 font-mono text-[15px] text-ink active:bg-active">
              {k}
            </button>
          ))}
        </div>
        <IconButton icon={X} label="Cancel" onClick={onCancel} />
        <IconButton icon={ArrowRight} label="Enter and move right" onClick={onNext} />
        <button onMouseDown={(e) => e.preventDefault()} onClick={onEnter} aria-label="Enter" className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
          <Check size={22} />
        </button>
      </div>
    </div>
  )
}

function Toolbar({ store }: { store: SheetStore }) {
  const st = store.activeStyle
  const B = (p: { icon: typeof Bold; label: string; active?: boolean; onClick: () => void }) => <IconButton {...p} size={21} className="text-ink" />
  const color = (kind: 'fill' | 'color') =>
    sheet(
      (close) => (
        <Swatches
          colors={kind === 'fill' ? ['#fef3c7', '#fde68a', '#dcfce7', '#bbf7d0', '#dbeafe', '#bfdbfe', '#fce7f3', '#ede9fe', '#f3f4f6', '#d1d5db', '#fecaca', '#d6e9e1'] : undefined}
          value={kind === 'fill' ? st.fill : st.color}
          none={kind === 'fill' ? 'No fill' : 'Automatic'}
          onPick={(c) => close(() => store.setStyle({ [kind]: c ?? undefined }))}
        />
      ),
      kind === 'fill' ? 'Fill colour' : 'Text colour'
    )
  const copy = async () => {
    const text = store.copy()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* the in-app clipboard still works */
    }
    toast('Copied')
  }
  const paste = async () => {
    let text = store.clip?.text ?? ''
    try {
      text = (await navigator.clipboard.readText()) || text
    } catch {
      /* fall back to Bear's own clipboard */
    }
    if (text) store.paste(text)
  }
  return (
    <div className="shrink-0 border-t border-line bg-surface">
      <div className="no-scrollbar flex items-center overflow-x-auto px-1">
        <B
          icon={Sigma}
          label="AutoSum"
          onClick={() =>
            menu(
              (['SUM', 'AVERAGE', 'COUNT', 'MIN', 'MAX'] as const).map((fn) => ({
                label: { SUM: 'Sum', AVERAGE: 'Average', COUNT: 'Count numbers', MIN: 'Min', MAX: 'Max' }[fn],
                onClick: () => {
                  if (store.autoSum(fn) === 'needs-range') toast('Select the numbers first, or a cell below or beside them.')
                }
              })),
              'AutoSum'
            )
          }
        />
        <B icon={Bold} label="Bold" active={st.bold} onClick={() => store.toggleStyle('bold')} />
        <B icon={Italic} label="Italic" active={st.italic} onClick={() => store.toggleStyle('italic')} />
        <B icon={Underline} label="Underline" active={st.underline} onClick={() => store.toggleStyle('underline')} />
        <B icon={PaintBucket} label="Fill colour" onClick={() => color('fill')} />
        <B icon={Palette} label="Text colour" onClick={() => color('color')} />
        <B
          icon={st.align === 'center' ? AlignCenter : st.align === 'right' ? AlignRight : AlignLeft}
          label="Alignment"
          onClick={() =>
            menu(
              [
                { label: 'Automatic', checked: !st.align, onClick: () => store.setStyle({ align: undefined }) },
                { label: 'Left', icon: AlignLeft, checked: st.align === 'left', onClick: () => store.setStyle({ align: 'left' }) },
                { label: 'Centre', icon: AlignCenter, checked: st.align === 'center', onClick: () => store.setStyle({ align: 'center' }) },
                { label: 'Right', icon: AlignRight, checked: st.align === 'right', onClick: () => store.setStyle({ align: 'right' }) }
              ],
              'Alignment'
            )
          }
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => menu(NUMBER_FORMATS.map((f) => ({ label: f.label, checked: (st.numFmt ?? 'General') === f.value, onClick: () => store.setStyle({ numFmt: f.value === 'General' ? undefined : f.value }) })), 'Number format')}
          className="h-9 shrink-0 rounded-full px-3 text-[13.5px] font-medium text-ink active:bg-hover"
        >
          {NUMBER_FORMATS.find((f) => f.value === (st.numFmt ?? 'General'))?.label ?? 'Custom'} ▾
        </button>
        <B icon={WrapText} label="Wrap text" active={st.wrap} onClick={() => store.toggleStyle('wrap')} />
        <B icon={Merge} label="Merge cells" onClick={() => store.toggleMerge()} />
        <B icon={Copy} label="Copy" onClick={() => void copy()} />
        <B icon={ClipboardPaste} label="Paste" onClick={() => void paste()} />
        <B icon={Eraser} label="Clear" onClick={() => store.clearContents()} />
        <B icon={Rows3} label="Rows" onClick={() => headerMenu(store, 'row')} />
        <B icon={Columns3} label="Columns" onClick={() => headerMenu(store, 'col')} />
      </div>
    </div>
  )
}

function SheetTabs({ store }: { store: SheetStore }) {
  const tabMenu = (i: number) =>
    menu(
      [
        {
          label: 'Rename',
          icon: Pencil,
          onClick: async () => {
            const v = await ask('Rename sheet', { value: store.wb.sheets[i].name, ok: 'Rename' })
            if (v === null) return
            const err = store.renameSheet(i, v)
            if (err) toast(err)
          }
        },
        { label: 'Move left', disabled: i === 0, onClick: () => store.moveSheet(i, i - 1) },
        { label: 'Move right', disabled: i === store.wb.sheets.length - 1, onClick: () => store.moveSheet(i, i + 1) },
        {
          label: 'Delete sheet',
          icon: Trash2,
          danger: true,
          disabled: store.wb.sheets.length <= 1,
          onClick: async () => {
            if (await confirm(`Delete “${store.wb.sheets[i].name}”?`, 'Everything on this sheet is deleted. Undo brings it back.')) store.deleteSheet(i)
          }
        }
      ],
      store.wb.sheets[i].name
    )
  return (
    <div className="phone-bottom flex shrink-0 items-center border-t border-line bg-canvas">
      <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 py-1.5">
        {store.wb.sheets.map((s, i) => (
          <SheetTab key={s.id} name={s.name} active={i === store.active} onClick={() => (i === store.active ? tabMenu(i) : store.setActive(i))} onLong={() => tabMenu(i)} />
        ))}
      </div>
      <IconButton icon={Plus} label="Add sheet" onClick={() => store.addSheet()} />
    </div>
  )
}

function SheetTab({ name, active, onClick, onLong }: { name: string; active: boolean; onClick: () => void; onLong: () => void }) {
  const lp = useLongPress(onLong)
  return (
    <button
      {...lp.handlers}
      onClick={() => !lp.fired.current && onClick()}
      className={`h-9 shrink-0 rounded-full px-4 text-[14px] font-medium ${active ? 'bg-[var(--accent)] text-white' : 'bg-hover text-ink'}`}
    >
      {name}
    </button>
  )
}

