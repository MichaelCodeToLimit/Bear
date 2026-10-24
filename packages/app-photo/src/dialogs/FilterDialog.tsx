import { useEffect, useState } from 'react'
import type { FilterId } from '../ops/filters'
import { DialogFrame, Slider } from './DialogFrame'
import { FILTER_SPECS, filterDefaults } from './filterSpecs'

export interface FilterDialogProps {
  id: FilterId
  accent: string
  status: string | null
  /** Waiting for the filter to finish on Apply. */
  busy: boolean
  /** Noise seed for this session (ignored by filters without one). */
  seed: number
  /** Every change (and the opening settings), for the debounced preview. */
  onChange: (params: Record<string, number>) => void
  onApply: (params: Record<string, number>) => void
  onCancel: () => void
  onUndo: () => void
  onRedo: () => void
}

/** One dialog for every filter, built from its slider spec in FILTER_SPECS. */
export function FilterDialog(p: FilterDialogProps) {
  const spec = FILTER_SPECS[p.id]
  const [params, setParams] = useState<Record<string, number>>(() => ({ ...filterDefaults(p.id), ...(spec.seeded ? { seed: p.seed } : {}) }))
  // Preview the opening settings once.
  useEffect(() => p.onChange(params), []) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: number) => {
    const next = { ...params, [k]: v }
    setParams(next)
    p.onChange(next)
  }
  return (
    <DialogFrame
      title={spec.title}
      accent={p.accent}
      status={p.status}
      busy={p.busy}
      onApply={() => p.onApply(params)}
      onCancel={p.onCancel}
      onUndo={p.onUndo}
      onRedo={p.onRedo}
    >
      {/* While Apply waits for the filter the settings are locked, so Apply can't be overtaken; Cancel stays available and stops it. */}
      <fieldset disabled={p.busy} className="flex flex-col gap-3 disabled:opacity-60">
        {spec.sliders.map((s) => (
          <Slider key={s.id} id={s.id} label={s.label} value={params[s.id]} min={s.min} max={s.max} step={s.step} unit={s.unit} onChange={(v) => set(s.id, v)} />
        ))}
        {spec.toggles?.map((t) => (
          <label key={t.id} className="flex items-center gap-2">
            <input type="checkbox" data-testid={`dialog-toggle-${t.id}`} checked={params[t.id] !== 0} onChange={(e) => set(t.id, e.target.checked ? 1 : 0)} />
            {t.label}
          </label>
        ))}
      </fieldset>
    </DialogFrame>
  )
}
