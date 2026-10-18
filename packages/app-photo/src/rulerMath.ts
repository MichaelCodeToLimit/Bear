/** Smallest 1, 2 or 5 times a power of ten that is at least `min` (and at least 1). */
export function niceStep(min: number): number {
  if (!(min > 1)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(min)))
  for (const m of [1, 2, 5, 10]) if (m * p >= min * (1 - 1e-9)) return m * p
  return 10 * p
}

/** Fewest screen pixels between ruler labels. */
export const MIN_LABEL_PX = 50
/** Fewest screen pixels between grid lines. */
export const MIN_GRID_PX = 16
const MIN_MINOR_PX = 6
const MAX_TICKS = 2000

/** Document units between labelled ruler ticks; `zoom` is screen (CSS) pixels per document pixel. */
export const rulerStep = (zoom: number): number => niceStep(MIN_LABEL_PX / zoom)

export interface RulerTick {
  value: number
  /** Labelled tick; the others are short minor marks. */
  major: boolean
}

/** Ruler ticks for the document range [start, end] (whole units, ascending), adapting to `zoom`. */
export function rulerTicks(start: number, end: number, zoom: number): RulerTick[] {
  const step = rulerStep(zoom)
  const lead = Math.pow(10, Math.floor(Math.log10(step)))
  const sub = step / lead === 2 ? step / 2 : step / 5
  const minor = Number.isInteger(sub) && sub >= 1 && sub * zoom >= MIN_MINOR_PX ? sub : step
  const out: RulerTick[] = []
  for (let v = Math.ceil(start / minor) * minor; v <= end && out.length < MAX_TICKS; v += minor) {
    out.push({ value: v + 0, major: v % step === 0 })
  }
  return out
}

/** Document pixels between grid lines: 100, or the next 1/2/5×10ⁿ that keeps lines 16 screen px apart. */
export const gridSpacing = (zoom: number): number => Math.max(100, niceStep(MIN_GRID_PX / zoom))

/** Multiples of `spacing` within [from, to]. */
export function gridValues(from: number, to: number, spacing: number): number[] {
  const out: number[] = []
  for (let v = Math.ceil(from / spacing) * spacing; v <= to && out.length < MAX_TICKS; v += spacing) out.push(v + 0)
  return out
}
