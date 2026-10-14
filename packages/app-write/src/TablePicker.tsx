import { useState } from 'react'
import { Grid2x2 } from 'lucide-react'
import { Button, Modal } from '@bear/ui'
import { TABLE_STYLES, type TableStyle } from './tables'

const PICK_COLS = 10
const PICK_ROWS = 8

/** Word-style hover grid: point at a size, click to insert. */
export function TableGridPicker({ onPick, onMore }: { onPick: (rows: number, cols: number) => void; onMore: () => void }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)
  return (
    <div onMouseLeave={() => setHover(null)}>
      <div className="mb-1.5 px-0.5 text-[12px] font-medium text-ink" aria-live="polite">
        {hover ? `${hover.c} × ${hover.r} table` : 'Insert table'}
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${PICK_COLS}, 18px)` }}>
        {Array.from({ length: PICK_ROWS * PICK_COLS }, (_, i) => {
          const r = Math.floor(i / PICK_COLS) + 1
          const c = (i % PICK_COLS) + 1
          const on = !!hover && r <= hover.r && c <= hover.c
          return (
            <button
              key={i}
              aria-label={`${c} by ${r} table`}
              onMouseEnter={() => setHover({ r, c })}
              onFocus={() => setHover({ r, c })}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(r, c)}
              className="h-[18px] w-[18px] rounded-[2px] border"
              style={{
                borderColor: on ? 'var(--accent)' : 'var(--line)',
                background: on ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'var(--paper)'
              }}
            />
          )
        })}
      </div>
      <hr className="my-2 border-line" />
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onMore}
        className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-[13px] text-ink hover:bg-hover"
      >
        <Grid2x2 size={15} className="text-[var(--accent)]" /> Insert table…
      </button>
    </div>
  )
}

/** A miniature table showing what a style looks like. */
export function TableStylePreview({ style }: { style: TableStyle }) {
  return (
    <table className={`tbl-preview tbl-${style}`}>
      <tbody>
        <tr><th /><th /><th /></tr>
        <tr><td /><td /><td /></tr>
        <tr><td /><td /><td /></tr>
        <tr><td /><td /><td /></tr>
      </tbody>
    </table>
  )
}

export function TableStyleGallery({ current, onPick }: { current?: TableStyle; onPick: (s: TableStyle) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {TABLE_STYLES.map((s) => (
        <button
          key={s.id}
          aria-label={`${s.label} style`}
          aria-pressed={current === s.id}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(s.id)}
          className={`rounded border p-1.5 text-left hover:border-[var(--accent)] ${current === s.id ? 'border-[var(--accent)] bg-active' : 'border-line'}`}
        >
          <TableStylePreview style={s.id} />
          <div className="mt-1 text-[11px] text-ink">{s.label}</div>
        </button>
      ))}
    </div>
  )
}

interface InsertTableDialogProps {
  accent: string
  onInsert: (rows: number, cols: number, header: boolean, style: TableStyle) => void
  onClose: () => void
}

export const MAX_TABLE_ROWS = 200
export const MAX_TABLE_COLS = 20

export function InsertTableDialog({ accent, onInsert, onClose }: InsertTableDialogProps) {
  const [rows, setRows] = useState(4)
  const [cols, setCols] = useState(3)
  const [header, setHeader] = useState(false)
  const [style, setStyle] = useState<TableStyle>('grid')
  const clamp = (v: number, max: number) => Math.max(1, Math.min(max, Math.round(v) || 1))
  const submit = () => onInsert(clamp(rows, MAX_TABLE_ROWS), clamp(cols, MAX_TABLE_COLS), header, style)

  return (
    <Modal
      title="Insert table"
      width={380}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary accent={accent} onClick={submit}>Insert</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3" onKeyDown={(e) => e.key === 'Enter' && submit()}>
        <label className="text-xs text-muted">
          Columns
          <input
            type="number" min={1} max={MAX_TABLE_COLS} value={cols} autoFocus
            onChange={(e) => setCols(Number(e.target.value))}
            onBlur={() => setCols(clamp(cols, MAX_TABLE_COLS))}
            className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="text-xs text-muted">
          Rows
          <input
            type="number" min={1} max={MAX_TABLE_ROWS} value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
            onBlur={() => setRows(clamp(rows, MAX_TABLE_ROWS))}
            className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]"
          />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
        Header row
      </label>
      <div className="mb-1.5 mt-3 text-xs text-muted">Style</div>
      <TableStyleGallery current={style} onPick={setStyle} />
    </Modal>
  )
}
