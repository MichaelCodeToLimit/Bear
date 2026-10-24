import type { FilterId } from '../ops/filters'

export interface SliderSpec {
  id: string
  label: string
  min: number
  max: number
  step: number
  default: number
  unit?: string
}

export interface FilterSpec {
  /** Dialog title, also the history label. */
  title: string
  sliders: SliderSpec[]
  /** On/off options, sent to the filter as 1 or 0. */
  toggles?: { id: string; label: string; default: boolean }[]
  /** The filter takes a `seed`: fixed for one dialog session so the preview doesn't flicker. */
  seeded?: boolean
}

const radius = (d: number): SliderSpec => ({ id: 'radius', label: 'Radius', min: 0.1, max: 250, step: 0.1, default: d, unit: 'px' })

export const FILTER_SPECS: Record<FilterId, FilterSpec> = {
  gaussian: { title: 'Gaussian Blur', sliders: [radius(2)] },
  box: { title: 'Box Blur', sliders: [radius(2)] },
  motion: {
    title: 'Motion Blur',
    sliders: [
      { id: 'angle', label: 'Angle', min: 0, max: 360, step: 1, default: 0, unit: '°' },
      { id: 'distance', label: 'Distance', min: 1, max: 999, step: 1, default: 10, unit: 'px' }
    ]
  },
  sharpen: { title: 'Sharpen', sliders: [{ id: 'amount', label: 'Amount', min: 0, max: 100, step: 1, default: 50 }] },
  unsharp: {
    title: 'Unsharp Mask',
    sliders: [
      { id: 'amount', label: 'Amount', min: 1, max: 500, step: 1, default: 100, unit: '%' },
      radius(1),
      { id: 'threshold', label: 'Threshold', min: 0, max: 255, step: 1, default: 0 }
    ]
  },
  noise: {
    title: 'Add Noise',
    sliders: [{ id: 'amount', label: 'Amount', min: 0, max: 100, step: 1, default: 10 }],
    toggles: [{ id: 'mono', label: 'Monochromatic', default: false }],
    seeded: true
  },
  pixelate: { title: 'Pixelate', sliders: [{ id: 'size', label: 'Cell size', min: 2, max: 200, step: 1, default: 10, unit: 'px' }] }
}

export const FILTER_IDS = Object.keys(FILTER_SPECS) as FilterId[]

export function isFilterId(k: string): k is FilterId {
  return k in FILTER_SPECS
}

/** Starting parameters for a filter (the seed, if any, is added by the session). */
export function filterDefaults(id: FilterId): Record<string, number> {
  const s = FILTER_SPECS[id]
  const p: Record<string, number> = {}
  for (const sl of s.sliders) p[sl.id] = sl.default
  for (const t of s.toggles ?? []) p[t.id] = t.default ? 1 : 0
  return p
}
