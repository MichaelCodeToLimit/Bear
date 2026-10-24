import type { Presentation, Slide, SlideElement } from './model'

export interface FindOptions {
  matchCase: boolean
}

/** Where a match is: an element's text, one table cell, or the slide's notes. */
export interface Match {
  slide: number
  target: string | 'notes'
  cell?: [number, number]
  /** Character offset of the match in that text. */
  start: number
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pattern = (q: string, o: FindOptions) => new RegExp(escape(q), o.matchCase ? 'g' : 'gi')

function offsets(text: string, q: string, o: FindOptions): number[] {
  if (!q) return []
  return [...text.matchAll(pattern(q, o))].map((m) => m.index!)
}

/** Every match, in slide order (text boxes and shapes, table cells, then notes). */
export function findAll(pres: Presentation, q: string, o: FindOptions): Match[] {
  const out: Match[] = []
  pres.slides.forEach((s, slide) => {
    for (const el of s.elements) {
      if (el.kind === 'text' || el.kind === 'shape') for (const start of offsets(el.text, q, o)) out.push({ slide, target: el.id, start })
      if (el.kind === 'table') {
        el.rows.forEach((row, r) => row.forEach((cell, c) => {
          for (const start of offsets(cell, q, o)) out.push({ slide, target: el.id, cell: [r, c], start })
        }))
      }
    }
    for (const start of offsets(s.notes, q, o)) out.push({ slide, target: 'notes', start })
  })
  return out
}

const replaceIn = (text: string, q: string, r: string, o: FindOptions) => text.replace(pattern(q, o), () => r)

function replaceInElement(el: SlideElement, q: string, r: string, o: FindOptions): SlideElement {
  if (el.kind === 'text' || el.kind === 'shape') return { ...el, text: replaceIn(el.text, q, r, o) }
  if (el.kind === 'table') return { ...el, rows: el.rows.map((row) => row.map((cell) => replaceIn(cell, q, r, o))) }
  return el
}

/** Replace every match; returns the new presentation and how many were replaced. */
export function replaceAll(pres: Presentation, q: string, r: string, o: FindOptions): { pres: Presentation; count: number } {
  const count = findAll(pres, q, o).length
  if (!count) return { pres, count }
  const slides = pres.slides.map((s): Slide => ({ ...s, notes: replaceIn(s.notes, q, r, o), elements: s.elements.map((el) => replaceInElement(el, q, r, o)) }))
  return { pres: { ...pres, slides }, count }
}

/** Replace just one match. */
export function replaceOne(pres: Presentation, m: Match, q: string, r: string): Presentation {
  const swap = (text: string) => text.slice(0, m.start) + r + text.slice(m.start + q.length)
  const slides = pres.slides.map((s, i): Slide => {
    if (i !== m.slide) return s
    if (m.target === 'notes') return { ...s, notes: swap(s.notes) }
    return {
      ...s,
      elements: s.elements.map((el) => {
        if (el.id !== m.target) return el
        if ((el.kind === 'text' || el.kind === 'shape') && !m.cell) return { ...el, text: swap(el.text) }
        if (el.kind === 'table' && m.cell) {
          const [row, col] = m.cell
          return { ...el, rows: el.rows.map((rw, ri) => rw.map((cell, ci) => (ri === row && ci === col ? swap(cell) : cell))) }
        }
        return el
      })
    }
  })
  return { ...pres, slides }
}
