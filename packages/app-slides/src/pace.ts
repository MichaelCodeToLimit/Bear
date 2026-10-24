import type { Presentation } from './model'

export type Pace = 'ok' | 'rushed' | 'lingered'

export interface PaceRow {
  slideId: string
  index: number
  seconds: number
  pace: Pace
}

/** Under this share of the average time per slide counts as rushed. */
export const RUSHED = 0.4
/** Over this share counts as lingering. */
export const LINGERED = 2

/**
 * Compare rehearsed times with a target talk length: each shown slide's fair share is the
 * target divided by the number of shown slides.
 */
export function paceReport(pres: Presentation, timings: Record<string, number>, targetMinutes?: number): { rows: PaceRow[]; total: number; target: number | null } {
  const shown = pres.slides.map((s, index) => ({ s, index })).filter(({ s }) => !s.hidden)
  const total = shown.reduce((n, { s }) => n + (timings[s.id] ?? 0), 0)
  const target = targetMinutes && targetMinutes > 0 ? targetMinutes * 60 : null
  const share = target ? target / Math.max(1, shown.length) : null
  const rows = shown.map(({ s, index }): PaceRow => {
    const seconds = timings[s.id] ?? 0
    const pace: Pace = !share ? 'ok' : seconds < share * RUSHED ? 'rushed' : seconds > share * LINGERED ? 'lingered' : 'ok'
    return { slideId: s.id, index, seconds, pace }
  })
  return { rows, total, target }
}

export const formatDuration = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
