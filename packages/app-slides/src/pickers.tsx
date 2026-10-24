import { useMemo, useState } from 'react'
import { icons } from 'lucide-react'
import type { Crop, ImageElement } from './model'
import type { SlidesStore } from './store'
import { ICON_NAMES, iconWords } from './icons'

const PICK_COLS = 10
const PICK_ROWS = 8

/** Hover grid: point at a size, click to insert a table. */
export function TableSizePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)
  return (
    <div onMouseLeave={() => setHover(null)}>
      <div className="mb-1.5 px-0.5 text-[12px] font-medium text-ink" aria-live="polite">{hover ? `${hover.c} × ${hover.r} table` : 'Insert table'}</div>
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
              style={{ borderColor: on ? 'var(--accent)' : 'var(--line)', background: on ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'var(--surface)' }}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Search the icon set and click one to insert it. */
export function IconPicker({ onPick }: { onPick: (name: string) => void }) {
  const [q, setQ] = useState('')
  const found = useMemo(() => {
    const words = q.trim().toLowerCase()
    return (words ? ICON_NAMES.filter((n) => iconWords(n).includes(words)) : ICON_NAMES).slice(0, 120)
  }, [q])
  return (
    <div className="w-[300px]">
      <input autoFocus aria-label="Search icons" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search icons (e.g. star, chart, bear)" className="mb-2 h-8 w-full rounded border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-[var(--accent)]" />
      <div className="grid max-h-[260px] grid-cols-8 gap-1 overflow-y-auto" role="listbox" aria-label="Icons">
        {found.map((name) => {
          const Icon = icons[name as keyof typeof icons]
          return (
            <button key={name} role="option" aria-selected={false} title={iconWords(name)} aria-label={`${iconWords(name)} icon`} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(name)} className="flex h-8 w-8 items-center justify-center rounded text-ink hover:bg-hover">
              <Icon size={18} />
            </button>
          )
        })}
        {!found.length && <p className="col-span-8 p-2 text-[12px] text-muted">No icons match.</p>}
      </div>
      <p className="mt-2 text-[11px] text-muted">Icons from Lucide (open source).</p>
    </div>
  )
}

const SIDES: { key: keyof Crop; label: string }[] = [
  { key: 'l', label: 'Left' }, { key: 't', label: 'Top' }, { key: 'r', label: 'Right' }, { key: 'b', label: 'Bottom' }
]

/** Trim each side of a picture. */
export function CropControls({ store, el }: { store: SlidesStore; el: ImageElement }) {
  const crop: Crop = el.crop ?? { l: 0, t: 0, r: 0, b: 0 }
  const set = (key: keyof Crop, pct: number) => {
    const next = { ...crop, [key]: Math.max(0, Math.min(0.9, pct / 100)) }
    // Never crop away the whole picture.
    if (next.l + next.r > 0.95 || next.t + next.b > 0.95) return
    store.setCrop(el.id, next.l || next.t || next.r || next.b ? next : undefined)
  }
  return (
    <div className="w-[240px] space-y-2 text-[12px] text-ink">
      {SIDES.map((s) => (
        <label key={s.key} className="flex items-center gap-2">
          <span className="w-12">{s.label}</span>
          <input type="range" aria-label={`Crop ${s.label.toLowerCase()}`} min={0} max={90} value={Math.round(crop[s.key] * 100)} onChange={(e) => set(s.key, Number(e.target.value))} className="flex-1" />
          <span className="w-9 text-right text-muted">{Math.round(crop[s.key] * 100)}%</span>
        </label>
      ))}
      <button onClick={() => store.setCrop(el.id, undefined)} className="rounded border border-line px-2 py-1 hover:bg-hover">Reset crop</button>
    </div>
  )
}

/** How see-through the selected objects are. */
export function TransparencyControl({ store }: { store: SlidesStore }) {
  const current = store.selection[0]?.opacity ?? 1
  return (
    <label className="flex w-[220px] items-center gap-2 text-[12px] text-ink">
      Transparency
      <input type="range" aria-label="Transparency" min={0} max={90} value={Math.round((1 - current) * 100)} onChange={(e) => store.setOpacity(1 - Number(e.target.value) / 100)} className="flex-1" />
      <span className="w-9 text-right text-muted">{Math.round((1 - current) * 100)}%</span>
    </label>
  )
}
