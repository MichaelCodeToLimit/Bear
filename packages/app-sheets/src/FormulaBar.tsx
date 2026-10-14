import { useState } from 'react'
import { Check, FunctionSquare, X } from 'lucide-react'
import { addr, parseRange, rangeAddr } from './refs'
import type { SheetStore } from './store'
import type { EditState } from './Grid'

interface FormulaBarProps {
  store: SheetStore
  editing: EditState | null
  setEditing: (e: EditState | null) => void
  commit: (move?: { dRow: number; dCol: number }) => void
  focusGrid: () => void
}

/** Name box (jump to a cell or range) plus the formula/value editor for the active cell. */
export function FormulaBar({ store, editing, setEditing, commit, focusGrid }: FormulaBarProps) {
  const { anchor } = store.sel
  const sel = store.range
  const selName = sel.r1 === sel.r2 && sel.c1 === sel.c2 ? addr(anchor.row, anchor.col) : rangeAddr(sel)
  // Shows the live selection; holds its own text only while the user is typing in it.
  const [draft, setDraft] = useState<string | null>(null)
  const name = draft ?? selName

  const raw = editing ? editing.text : store.cell(anchor.row, anchor.col)?.raw ?? ''

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 text-[13px] text-ink print:hidden">
      <input
        aria-label="Name box"
        value={name}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const r = parseRange(name.trim().toUpperCase())
            if (r) store.select({ row: r.r1, col: r.c1 }, { row: r.r2, col: r.c2 })
            setDraft(null)
            focusGrid()
          } else if (e.key === 'Escape') {
            setDraft(null)
            focusGrid()
          }
        }}
        className="h-6 w-24 rounded border border-line bg-surface px-1.5 font-mono text-[12px] outline-none focus:border-[var(--accent)]"
      />
      <div className="mx-1 flex items-center gap-0.5 text-muted">
        <button title="Cancel (Esc)" disabled={!editing} onClick={() => { setEditing(null); focusGrid() }} className="rounded p-0.5 hover:bg-hover disabled:opacity-30"><X size={15} /></button>
        <button title="Enter" disabled={!editing} onClick={() => { commit(); focusGrid() }} className="rounded p-0.5 hover:bg-hover disabled:opacity-30"><Check size={15} /></button>
        <FunctionSquare size={16} className="ml-1 text-[var(--accent)]" />
      </div>
      <input
        data-formula-bar
        aria-label="Formula bar"
        value={raw}
        spellCheck={false}
        onChange={(e) => setEditing({ row: anchor.row, col: anchor.col, text: e.target.value, mode: 'edit' })}
        onFocus={() => {
          if (!editing) setEditing({ row: anchor.row, col: anchor.col, text: raw, mode: 'edit' })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit({ dRow: e.shiftKey ? -1 : 1, dCol: 0 })
            focusGrid()
          } else if (e.key === 'Tab') {
            e.preventDefault()
            commit({ dRow: 0, dCol: e.shiftKey ? -1 : 1 })
            focusGrid()
          } else if (e.key === 'Escape') {
            setEditing(null)
            focusGrid()
          }
        }}
        className="h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 font-mono text-[12.5px] outline-none focus:border-[var(--accent)] focus:bg-surface"
      />
    </div>
  )
}

