import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@bear/ui'

export interface DialogFrameProps {
  title: string
  accent: string
  onApply: () => void
  onCancel: () => void
  /** Undo / redo from the keyboard: the dialog is cancelled first (History.beforeNavigate). */
  onUndo: () => void
  onRedo: () => void
  /** Why Apply is unavailable (locked, hidden or text layer), shown in the dialog. */
  status?: string | null
  /** Waiting for the filter to finish. */
  busy?: boolean
  children: ReactNode
}

/**
 * A dialog that leaves the canvas visible for the live preview: it sits at the top right of the
 * window, over the panels. A transparent layer underneath catches clicks, so tools and the rest of
 * the window are inactive while it is open, and the app's shortcuts are off (they skip while a
 * `[role=dialog]` exists). Its own keys: Escape cancels, Enter applies, Ctrl+Z / Ctrl+Y undo / redo.
 */
export function DialogFrame({ title, accent, onApply, onCancel, onUndo, onRedo, status, busy, children }: DialogFrameProps) {
  const latest = useRef({ onApply, onCancel, onUndo, onRedo, canApply: !status && !busy })
  latest.current = { onApply, onCancel, onUndo, onRedo, canApply: !status && !busy }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const l = latest.current
      const k = e.key.toLowerCase()
      const handled = (fn: () => void) => {
        e.preventDefault()
        e.stopPropagation()
        fn()
      }
      if (k === 'escape') return handled(l.onCancel)
      if (k === 'enter') return handled(() => l.canApply && l.onApply())
      if (e.ctrlKey || e.metaKey) {
        if ((k === 'z' && e.shiftKey) || k === 'y') return handled(l.onRedo)
        if (k === 'z') return handled(l.onUndo)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <div className="fixed inset-0 z-50 print:hidden" data-testid="photo-dialog-blocker">
      <div role="dialog" aria-label={title} className="absolute right-4 top-[132px] w-[320px] rounded-lg border border-line bg-surface text-ink shadow-2xl">
        <h2 className="px-4 pb-1 pt-3 text-[15px] font-semibold">{title}</h2>
        <div className="flex flex-col gap-3 px-4 pb-3 text-sm">
          {children}
          {status && (
            <p data-testid="photo-dialog-status" className="text-[12px] text-red-700 dark:text-red-300">
              {status}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5">
          {busy && <span className="mr-auto text-[12px] text-muted">Working…</span>}
          <Button primary accent={accent} disabled={!!status || busy} onClick={onApply}>
            Apply
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const decimals = (step: number) => (String(step).split('.')[1] ?? '').length

/** A number box that lets the user type freely (a lone "-", an empty box) and reports clamped values. */
function NumberField({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={draft ?? value.toFixed(decimals(step))}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(clamp(n, min, max))
      }}
      onBlur={() => setDraft(null)}
      className="h-7 w-16 rounded border border-line bg-surface px-1.5 text-right text-[13px] text-ink outline-none focus:border-[var(--accent)]"
    />
  )
}

export interface SliderProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
}

/** Label, range slider and number box for one setting. */
export function Slider({ id, label, value, min, max, step = 1, unit, onChange }: SliderProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <NumberField value={value} min={min} max={max} step={step} onChange={onChange} label={label} />
          {unit && <span className="w-4 text-[12px] text-muted">{unit}</span>}
        </span>
      </span>
      <input
        type="range"
        data-testid={`dialog-slider-${id}`}
        aria-label={`${label} slider`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  )
}
