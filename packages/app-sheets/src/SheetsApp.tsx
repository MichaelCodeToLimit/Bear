import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FileDown, FilePlus2, FolderOpen, Info, Printer, Redo2, Save, SaveAll, Undo2, X } from 'lucide-react'
import { extensionOf, getApp, type OpenedFile } from '@bear/core'
import { Backstage, Button, RecentList, StatusBar, TitleBar, useDocumentFile, useTheme, type BackstageItem } from '@bear/ui'
import { SheetStore } from './store'
import { Grid, type EditState } from './Grid'
import { SheetsRibbon } from './SheetsRibbon'
import { FormulaBar } from './FormulaBar'
import { SheetTabs } from './SheetTabs'
import { ContextMenu, type MenuItem } from '@bear/ui'
import { PrintView } from './PrintView'
import { OPEN_FILTERS, SAVABLE, SAVE_FILTERS, readWorkbook, writeWorkbook } from './file-io'
import { newWorkbook, usedRange, type ChartType } from './model'
import { MAX_COLS, MAX_ROWS } from './refs'
import { formatValue } from './values'
import { SHEET_TEMPLATES, type SheetTemplate } from './templates'

const APP = getApp('sheets')

export type SheetsInput = { kind: 'file'; file: OpenedFile } | { kind: 'template'; template?: SheetTemplate }

/** Close any unbalanced parentheses, as spreadsheets do when you press Enter. */
function closeParens(text: string): string {
  if (!text.startsWith('=')) return text
  let depth = 0
  let inStr = false
  for (const ch of text) {
    if (ch === '"') inStr = !inStr
    else if (!inStr && ch === '(') depth++
    else if (!inStr && ch === ')') depth--
  }
  return depth > 0 ? text + ')'.repeat(depth) : text
}

export function SheetsApp({ input, onHome }: { input: SheetsInput; onHome: () => void }) {
  const [store] = useState(() => new SheetStore(newWorkbook()))
  const version = useSyncExternalStore(store.subscribe, store.getVersion)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [tab, setTab] = useState('home')
  const [backstage, setBackstage] = useState<null | 'info' | 'new' | 'open'>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [showGridlines, setShowGridlines] = useState(true)
  const [showFormulas, setShowFormulas] = useState(false)
  const [changeToken, setChangeToken] = useState(0)
  const [theme, setTheme] = useTheme()
  const pageRows = useRef(20)

  const file = useDocumentFile({
    app: APP,
    untitled: 'Book1',
    defaultExt: 'xlsx',
    saveFilters: SAVE_FILTERS,
    openFilters: OPEN_FILTERS,
    savable: SAVABLE,
    serialize: async (path) => {
      if (extensionOf(path) === 'csv' && store.wb.sheets.length > 1) {
        file.setNotice(`CSV holds one sheet, so only "${store.sheet.name}" was saved.`)
      }
      return writeWorkbook(path, store.wb, store.active, store.engine)
    },
    load: async (f) => {
      setEditing(null)
      store.load(await readWorkbook(f.path, f.data))
    },
    changeToken
  })

  useEffect(() => {
    store.onChange = () => {
      file.setDirty(true)
      setChangeToken((t) => t + 1)
    }
  }, [store, file.setDirty]) // eslint-disable-line react-hooks/exhaustive-deps

  const focusGrid = useCallback(() => {
    ;(document.querySelector('[data-grid]') as HTMLElement | null)?.focus({ preventScroll: true })
  }, [])

  const newFromTemplate = useCallback((t?: SheetTemplate) => {
    setEditing(null)
    store.load((t ?? SHEET_TEMPLATES[0]).build())
    file.markNew(t && t.id !== 'blank' ? t.name : undefined)
    setTimeout(focusGrid)
  }, [store, file.markNew, focusGrid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (input.kind === 'file') void file.openFile(input.file).then(focusGrid)
    else newFromTemplate(input.template)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Editing ----------

  const commit = useCallback(
    (move?: { dRow: number; dCol: number }, fillAll?: boolean) => {
      if (editing) {
        const text = closeParens(editing.text)
        const prev = store.cell(editing.row, editing.col)?.raw ?? ''
        if (fillAll) store.fillSelection(text)
        else if (text !== prev) store.setRaw(editing.row, editing.col, text)
        setEditing(null)
      }
      if (move && !fillAll) store.move(move.dRow, move.dCol, false, false)
    },
    [editing, store]
  )

  const copy = useCallback(async (cut: boolean) => {
    try {
      await navigator.clipboard.writeText(store.copy(cut))
    } catch {
      store.copy(cut)
    }
    focusGrid()
  }, [store, focusGrid])

  const paste = useCallback(async () => {
    try {
      store.paste(await navigator.clipboard.readText())
    } catch {
      if (store.clip) store.paste(store.clip.text)
    }
    focusGrid()
  }, [store, focusGrid])

  /** AutoSum and friends: if there's no obvious range, start the formula and let the user point at one. */
  const autoSum = useCallback((fn: 'SUM' | 'AVERAGE' | 'COUNT' | 'MIN' | 'MAX') => {
    if (editing) commit()
    if (store.autoSum(fn) === 'needs-range') {
      const { row, col } = store.sel.anchor
      setEditing({ row, col, text: `=${fn}(`, mode: 'edit' })
    } else focusGrid()
  }, [store, editing, commit, focusGrid])

  const insertChart = useCallback((type: ChartType) => {
    const r = store.range
    store.addChart(type, { x: store.colX(Math.min(r.c2, 30) + 1) + 24, y: store.rowY(Math.min(r.r1, 2000)) + 8 })
    setTab('chart')
  }, [store])

  const onGridKey = (e: React.KeyboardEvent) => {
    const k = e.key
    const ctrl = e.ctrlKey || e.metaKey
    const run = (fn: () => void) => {
      e.preventDefault()
      fn()
    }

    // Keys typed in the instant before the cell editor takes focus still belong to the edit.
    if (editing) {
      if (k.length === 1 && !ctrl && !e.altKey) return run(() => setEditing({ ...editing, text: editing.text + k }))
      if (k === 'Backspace') return run(() => setEditing({ ...editing, text: editing.text.slice(0, -1) }))
      if (k === 'Enter') return run(() => commit({ dRow: e.shiftKey ? -1 : 1, dCol: 0 }, ctrl))
      if (k === 'Tab') return run(() => commit({ dRow: 0, dCol: e.shiftKey ? -1 : 1 }))
      if (k === 'Escape') return run(() => setEditing(null))
      return
    }

    if (store.selectedChart) {
      if (k === 'Delete' || k === 'Backspace') return run(() => store.deleteChart(store.selectedChart!))
      if (k === 'Escape') return run(() => store.selectChart(null))
    }

    if (ctrl) {
      const lk = k.toLowerCase()
      if (lk === 'z') return run(() => store.undo())
      if (lk === 'y') return run(() => store.redo())
      if (lk === 'b') return run(() => store.toggleStyle('bold'))
      if (lk === 'i') return run(() => store.toggleStyle('italic'))
      if (lk === 'u') return run(() => store.toggleStyle('underline'))
      if (lk === 'd') return run(() => { const r = store.range; if (r.r2 > r.r1) { store.select({ row: r.r1, col: r.c1 }, { row: r.r1, col: r.c2 }); store.fill(r) } })
      if (lk === 'r') return run(() => { const r = store.range; if (r.c2 > r.c1) { store.select({ row: r.r1, col: r.c1 }, { row: r.r2, col: r.c1 }); store.fill(r) } })
      if (lk === 'a') return run(() => {
        const region = store.currentRegion()
        const cur = store.range
        const isRegion = cur.r1 === region.r1 && cur.r2 === region.r2 && cur.c1 === region.c1 && cur.c2 === region.c2
        if (isRegion || (region.r1 === region.r2 && region.c1 === region.c2)) store.select({ row: 0, col: 0 }, { row: MAX_ROWS - 1, col: MAX_COLS - 1 })
        else store.select({ row: region.r1, col: region.c1 }, { row: region.r2, col: region.c2 })
      })
      if (k === ';') return run(() => store.setRaw(store.sel.anchor.row, store.sel.anchor.col, new Date().toISOString().slice(0, 10)))
      if (k === '`') return run(() => setShowFormulas((v) => !v))
      if (k === 'Home') return run(() => store.select({ row: 0, col: 0 }))
      if (k === 'End') return run(() => { const u = usedRange(store.sheet); store.select({ row: u?.r2 ?? 0, col: u?.c2 ?? 0 }) })
    }
    if (e.altKey && (k === '=' || k === '+')) return run(() => autoSum('SUM'))

    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (arrows[k]) return run(() => store.move(arrows[k][0], arrows[k][1], e.shiftKey, ctrl))
    if (k === 'Enter') return run(() => store.move(e.shiftKey ? -1 : 1, 0, false, false))
    if (k === 'Tab') return run(() => store.move(0, e.shiftKey ? -1 : 1, false, false))
    if (k === 'PageDown') return run(() => store.move(pageRows.current, 0, e.shiftKey, false))
    if (k === 'PageUp') return run(() => store.move(-pageRows.current, 0, e.shiftKey, false))
    if (k === 'Home' && !ctrl) return run(() => store.select({ row: store.sel.anchor.row, col: 0 }))
    if (k === 'Delete') return run(() => store.clearContents())
    if (k === 'Escape') return run(() => { store.clip = null; store.select(store.sel.anchor, store.sel.focus) })
    const { row, col } = store.sel.anchor
    if (k === 'F2') return run(() => setEditing({ row, col, text: store.cell(row, col)?.raw ?? '', mode: 'edit' }))
    if (k === 'Backspace') return run(() => setEditing({ row, col, text: '', mode: 'enter' }))
    if (k.length === 1 && !ctrl && !e.altKey) return run(() => setEditing({ row, col, text: k, mode: 'enter' }))
  }

  // App-level shortcuts that work whatever has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      const run = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      if (k === 's' && e.shiftKey) run(() => void file.saveAs())
      else if (k === 's') run(() => { if (editing) commit(); void file.save() })
      else if (k === 'o') run(() => file.browseOpen(() => setBackstage(null)))
      else if (k === 'n') run(() => file.guard('start a new workbook', () => newFromTemplate()))
      else if (k === 'p') run(() => setTimeout(() => window.print(), 50))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [file, editing, commit, newFromTemplate])

  const cellMenu = (x: number, y: number) =>
    setMenu({
      x, y,
      items: [
        { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => void copy(true) },
        { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => void copy(false) },
        { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => void paste() },
        { label: 'Insert row above', onClick: () => store.insert('row', true), divider: true },
        { label: 'Insert row below', onClick: () => store.insert('row', false) },
        { label: 'Insert column left', onClick: () => store.insert('col', true) },
        { label: 'Insert column right', onClick: () => store.insert('col', false) },
        { label: 'Delete row', onClick: () => store.remove('row'), divider: true },
        { label: 'Delete column', onClick: () => store.remove('col') },
        { label: 'Clear contents', shortcut: 'Del', onClick: () => store.clearContents(), divider: true },
        { label: 'Clear all', onClick: () => store.clearAll() },
        { label: 'Sort A to Z', onClick: () => store.sort(false), divider: true },
        { label: 'Sort Z to A', onClick: () => store.sort(true) }
      ]
    })

  const tabMenu = (i: number, x: number, y: number) =>
    setMenu({
      x, y,
      items: [
        { label: 'Rename', onClick: () => setRenaming(i) },
        { label: 'Insert sheet', onClick: () => store.addSheet() },
        { label: 'Move left', disabled: i === 0, onClick: () => store.moveSheet(i, i - 1) },
        { label: 'Move right', disabled: i === store.wb.sheets.length - 1, onClick: () => store.moveSheet(i, i + 1) },
        { label: 'Delete', disabled: store.wb.sheets.length <= 1, divider: true, onClick: () => store.deleteSheet(i) }
      ]
    })

  const stats = store.stats()
  const { doc } = file
  const closeBackstage = () => setBackstage(null)

  const backstageItems: BackstageItem[] = [
    { id: 'info', label: 'Info', icon: Info, onClick: () => setBackstage('info') },
    { id: 'new', label: 'New', icon: FilePlus2, onClick: () => setBackstage('new') },
    { id: 'open', label: 'Open', icon: FolderOpen, onClick: () => setBackstage('open') },
    { id: 'save', label: 'Save', icon: Save, onClick: () => { closeBackstage(); void file.save() }, dividerBefore: true },
    { id: 'saveas', label: 'Save a copy as…', icon: SaveAll, onClick: () => { closeBackstage(); void file.saveAs() } },
    { id: 'pdf', label: 'Export to PDF', icon: FileDown, onClick: () => { closeBackstage(); void file.exportPdf() } },
    { id: 'print', label: 'Print', icon: Printer, onClick: () => { closeBackstage(); setTimeout(() => window.print(), 50) } },
    { id: 'close', label: 'Close', icon: X, onClick: () => file.guard('close this workbook', onHome), dividerBefore: true }
  ]

  return (
    <div className="flex h-full flex-col bg-canvas" style={{ ['--accent' as string]: APP.color }} data-version={version}>
      <div className="contents print:hidden">
        <TitleBar
          app={APP}
          docName={doc.name}
          dirty={file.dirty}
          onHome={() => file.guard('go home', onHome)}
          autosave={file.autosave}
          right={
            <>
              <button title="Undo (Ctrl+Z)" disabled={!store.canUndo} onClick={() => store.undo()} className="rounded p-1.5 hover:bg-white/15 disabled:opacity-40"><Undo2 size={16} /></button>
              <button title="Redo (Ctrl+Y)" disabled={!store.canRedo} onClick={() => store.redo()} className="rounded p-1.5 hover:bg-white/15 disabled:opacity-40"><Redo2 size={16} /></button>
              <button title="Save (Ctrl+S)" onClick={() => void file.save()} className="rounded p-1.5 hover:bg-white/15"><Save size={16} /></button>
            </>
          }
        />
        <SheetsRibbon
          store={store}
          tab={tab}
          setTab={setTab}
          onFile={() => setBackstage('info')}
          accent={APP.color}
          copy={(cut) => void copy(cut)}
          paste={() => void paste()}
          insertChart={insertChart}
          autoSum={autoSum}
          showGridlines={showGridlines}
          setShowGridlines={setShowGridlines}
          showFormulas={showFormulas}
          setShowFormulas={setShowFormulas}
          theme={theme}
          setTheme={setTheme}
        />
        {file.banner}
        <FormulaBar store={store} editing={editing} setEditing={setEditing} commit={commit} focusGrid={focusGrid} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col print:hidden">
        <Grid
          store={store}
          version={version}
          accent={APP.color}
          editing={editing}
          setEditing={setEditing}
          commit={commit}
          showGridlines={showGridlines}
          showFormulas={showFormulas}
          onContextMenu={cellMenu}
          onKeyDown={onGridKey}
          onCopy={(e) => { if (editing) return; e.preventDefault(); e.clipboardData.setData('text/plain', store.copy(false)) }}
          onCut={(e) => { if (editing) return; e.preventDefault(); e.clipboardData.setData('text/plain', store.copy(true)) }}
          onPaste={(e) => { if (editing) return; e.preventDefault(); store.paste(e.clipboardData.getData('text/plain')) }}
          pageRef={pageRows}
        />
        <SheetTabs store={store} accent={APP.color} onError={(m) => file.setError(m)} onMenu={tabMenu} renaming={renaming} setRenaming={setRenaming} />
      </div>

      <div className="contents print:hidden">
        <StatusBar
          left={<span>{editing ? (editing.mode === 'enter' ? 'Enter' : 'Edit') : 'Ready'} · {file.statusText}</span>}
          right={
            stats && stats.count > 0 ? (
              <>
                {stats.numbers > 0 && <span>Average: {formatValue(stats.sum / stats.numbers)}</span>}
                <span>Count: {stats.count}</span>
                {stats.numbers > 0 && <span>Sum: {formatValue(stats.sum)}</span>}
              </>
            ) : null
          }
        />
      </div>

      <PrintView store={store} version={version} />

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      <Backstage open={!!backstage} onClose={closeBackstage} accent={APP.color} items={backstageItems}>
        {backstage === 'info' && (
          <div className="max-w-xl">
            <h1 className="mb-6 text-3xl font-light">Info</h1>
            <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
              <dt className="text-muted">Name</dt><dd>{doc.name}</dd>
              <dt className="text-muted">Location</dt>
              <dd className="break-all">
                {doc.path ?? 'Not saved yet'}
                {doc.path && <button onClick={() => window.bear.showInFolder(doc.path!)} className="ml-3 text-[var(--accent)] hover:underline">Show in folder</button>}
              </dd>
              <dt className="text-muted">Sheets</dt><dd>{store.wb.sheets.map((s) => s.name).join(', ')}</dd>
              <dt className="text-muted">Status</dt><dd>{file.dirty ? 'Unsaved changes' : 'Saved'}</dd>
            </dl>
          </div>
        )}
        {backstage === 'new' && (
          <div>
            <h1 className="mb-6 text-3xl font-light">New</h1>
            <SheetTemplateGrid onPick={(t) => file.guard('start a new workbook', () => { closeBackstage(); newFromTemplate(t) })} />
          </div>
        )}
        {backstage === 'open' && (
          <div className="max-w-3xl">
            <h1 className="mb-6 text-3xl font-light">Open</h1>
            <Button primary accent={APP.color} onClick={() => file.browseOpen(closeBackstage)}>Browse…</Button>
            <h2 className="mb-2 mt-8 text-sm font-semibold text-muted">Recent workbooks</h2>
            <RecentList items={file.recent.filter((r) => r.app === 'sheets')} onOpen={(r) => file.openRecent(r, closeBackstage)} empty="No recent workbooks yet." />
          </div>
        )}
      </Backstage>

      {file.savePrompt}
    </div>
  )
}

/** Template cards with a tiny grid preview. */
export function SheetTemplateGrid({ onPick }: { onPick: (t: SheetTemplate) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
      {SHEET_TEMPLATES.map((t) => (
        <button key={t.id} onClick={() => onPick(t)} aria-label={`${t.name} template`} className="group text-left">
          <div className="mb-2 aspect-[4/3] overflow-hidden rounded border border-line bg-white shadow-sm transition group-hover:border-[var(--accent)] group-hover:shadow-md">
            <TemplatePreview template={t} />
          </div>
          <div className="text-sm font-medium">{t.name}</div>
          <div className="text-xs text-muted">{t.description}</div>
        </button>
      ))}
    </div>
  )
}

function TemplatePreview({ template }: { template: SheetTemplate }) {
  const [store] = useState(() => new SheetStore(template.build()))
  const rows = 9
  const cols = 4
  return (
    <table className="w-full table-fixed border-collapse text-[7px] leading-tight text-[#222]">
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }, (_, c) => {
              const cell = store.cell(r, c)
              return (
                <td key={c} className="h-[11px] truncate border border-[#e5e5e5] px-0.5" style={{ background: cell?.style?.fill, fontWeight: cell?.style?.bold ? 700 : undefined, color: cell?.style?.color }}>
                  {store.display(r, c)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
