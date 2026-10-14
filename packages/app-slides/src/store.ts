import {
  cloneElement, cloneSlide, hasText, newId, SLIDE_H, SLIDE_W,
  type Presentation, type ShapeKind, type Slide, type SlideElement, type TextStyle
} from './model'
import { newSlide, type LayoutId } from './layouts'
import { getTheme } from './themes'

interface Snapshot {
  pres: Presentation
  current: number
}

const UNDO_LIMIT = 200
/** Edits with the same key within this window merge into one undo step (typing, nudging). */
const COALESCE_MS = 1200

export function newPresentation(): Presentation {
  return { theme: 'paper', slides: [newSlide('title')] }
}

/**
 * Presentation state. The presentation object is never mutated: every edit builds a new one,
 * so undo/redo just keeps references to earlier versions.
 */
export class SlidesStore {
  pres: Presentation
  current = 0
  selected: string[] = []
  /** Id of the element whose text is being edited. */
  editing: string | null = null
  version = 0
  onChange: (() => void) | null = null
  private clip: SlideElement[] = []
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private lastKey: { key: string; at: number } | null = null
  private live = false
  private listeners = new Set<() => void>()

  constructor(pres: Presentation = newPresentation()) {
    this.pres = pres
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getVersion = () => this.version

  private emit() {
    this.version++
    for (const fn of this.listeners) fn()
  }

  get slide(): Slide {
    return this.pres.slides[this.current]
  }

  get selection(): SlideElement[] {
    return this.slide.elements.filter((e) => this.selected.includes(e.id))
  }

  load(pres: Presentation) {
    this.pres = pres.slides.length ? pres : newPresentation()
    this.current = 0
    this.selected = []
    this.editing = null
    this.undoStack = []
    this.redoStack = []
    this.lastKey = null
    this.emit()
  }

  // ---------- History ----------

  private commit(next: Presentation, opts: { current?: number; coalesce?: string } = {}) {
    const now = Date.now()
    const merge = opts.coalesce && this.lastKey?.key === opts.coalesce && now - this.lastKey.at < COALESCE_MS
    if (!merge && !this.live) {
      this.undoStack.push({ pres: this.pres, current: this.current })
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
    }
    this.lastKey = opts.coalesce ? { key: opts.coalesce, at: now } : null
    this.redoStack = []
    this.pres = next
    if (opts.current !== undefined) this.current = opts.current
    this.current = Math.max(0, Math.min(this.current, next.slides.length - 1))
    this.onChange?.()
    this.emit()
  }

  get canUndo() {
    return this.undoStack.length > 0
  }
  get canRedo() {
    return this.redoStack.length > 0
  }

  undo() {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.redoStack.push({ pres: this.pres, current: this.current })
    this.restore(prev)
  }

  redo() {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push({ pres: this.pres, current: this.current })
    this.restore(next)
  }

  private restore(s: Snapshot) {
    this.pres = s.pres
    this.current = Math.min(s.current, s.pres.slides.length - 1)
    this.lastKey = null
    const ids = new Set(this.slide.elements.map((e) => e.id))
    this.selected = this.selected.filter((id) => ids.has(id))
    this.editing = null
    this.onChange?.()
    this.emit()
  }

  /** Start a drag: the whole gesture becomes a single undo step. */
  beginLive() {
    if (this.live) return
    this.undoStack.push({ pres: this.pres, current: this.current })
    this.redoStack = []
    this.live = true
  }

  endLive() {
    this.live = false
  }

  // ---------- Helpers ----------

  private withSlide(index: number, fn: (s: Slide) => Slide): Presentation {
    return { ...this.pres, slides: this.pres.slides.map((s, i) => (i === index ? fn(s) : s)) }
  }

  private withElements(fn: (els: SlideElement[]) => SlideElement[]): Presentation {
    return this.withSlide(this.current, (s) => ({ ...s, elements: fn(s.elements) }))
  }

  // ---------- Slides ----------

  goto(index: number) {
    const i = Math.max(0, Math.min(index, this.pres.slides.length - 1))
    if (i === this.current) return
    this.current = i
    this.selected = []
    this.editing = null
    this.emit()
  }

  addSlide(layout: LayoutId, after = this.current) {
    const slides = [...this.pres.slides]
    slides.splice(after + 1, 0, newSlide(layout))
    this.selected = []
    this.editing = null
    this.commit({ ...this.pres, slides }, { current: after + 1 })
  }

  duplicateSlide(index = this.current) {
    const slides = [...this.pres.slides]
    slides.splice(index + 1, 0, cloneSlide(slides[index]))
    this.selected = []
    this.commit({ ...this.pres, slides }, { current: index + 1 })
  }

  deleteSlide(index = this.current) {
    if (this.pres.slides.length <= 1) return
    const slides = this.pres.slides.filter((_, i) => i !== index)
    this.selected = []
    this.editing = null
    this.commit({ ...this.pres, slides }, { current: Math.min(index, slides.length - 1) })
  }

  moveSlide(from: number, to: number) {
    if (from === to || to < 0 || to >= this.pres.slides.length) return
    const slides = [...this.pres.slides]
    const [s] = slides.splice(from, 1)
    slides.splice(to, 0, s)
    this.commit({ ...this.pres, slides }, { current: to })
  }

  setNotes(notes: string) {
    this.commit(this.withSlide(this.current, (s) => ({ ...s, notes })), { coalesce: `notes:${this.slide.id}` })
  }

  setBackground(color: string | null) {
    this.commit(this.withSlide(this.current, (s) => ({ ...s, background: color ?? undefined })))
  }

  setTheme(theme: string) {
    // Colours that came from the old theme's palette follow the new theme, as in other
    // presentation apps; colours picked by hand stay as they are.
    const from = getTheme(this.pres.theme).accents.map((c) => c.toLowerCase())
    const to = getTheme(theme).accents
    const remap = <T extends string | null | undefined>(c: T): T => {
      const i = c ? from.indexOf(c.toLowerCase()) : -1
      return (i >= 0 ? to[i] : c) as T
    }
    const recolor = (el: SlideElement): SlideElement => {
      if (el.kind === 'image') return el
      const style = el.style.color ? { ...el.style, color: remap(el.style.color) } : el.style
      return el.kind === 'shape' ? { ...el, fill: remap(el.fill), stroke: remap(el.stroke), style } : { ...el, style }
    }
    // A theme applies to every slide; clear per-slide backgrounds so it shows.
    this.commit({ theme, slides: this.pres.slides.map((s) => ({ ...s, background: undefined, elements: s.elements.map(recolor) })) })
  }

  // ---------- Selection ----------

  select(ids: string[], additive = false) {
    this.selected = additive ? [...new Set([...this.selected, ...ids])] : ids
    if (this.editing && !this.selected.includes(this.editing)) this.editing = null
    this.emit()
  }

  toggleSelect(id: string) {
    this.selected = this.selected.includes(id) ? this.selected.filter((s) => s !== id) : [...this.selected, id]
    this.emit()
  }

  selectAll() {
    this.selected = this.slide.elements.map((e) => e.id)
    this.emit()
  }

  startEditing(id: string | null) {
    this.editing = id
    if (id) this.selected = [id]
    this.lastKey = null
    this.emit()
  }

  // ---------- Elements ----------

  addElement(el: SlideElement) {
    this.selected = [el.id]
    this.commit(this.withElements((els) => [...els, el]))
  }

  addTextBox() {
    const el: SlideElement = { id: newId(), kind: 'text', x: SLIDE_W / 2 - 200, y: SLIDE_H / 2 - 40, w: 400, h: 80, text: '', style: { fontSize: 24 } }
    this.addElement(el)
    this.startEditing(el.id)
  }

  addShape(shape: ShapeKind, fill: string) {
    const line = shape === 'line'
    const el: SlideElement = {
      id: newId(), kind: 'shape', shape,
      x: SLIDE_W / 2 - 120, y: SLIDE_H / 2 - (line ? 2 : 80), w: 240, h: line ? 4 : 160,
      fill: line ? null : fill, stroke: line ? fill : null, strokeWidth: line ? 4 : 0,
      text: '', style: { fontSize: 20, align: 'center', valign: 'middle', color: '#ffffff' }
    }
    this.addElement(el)
  }

  addImage(src: string, natural: { w: number; h: number }) {
    // Fit within 70% of the slide, centred.
    const scale = Math.min(1, (SLIDE_W * 0.7) / natural.w, (SLIDE_H * 0.7) / natural.h)
    const w = Math.round(natural.w * scale)
    const h = Math.round(natural.h * scale)
    this.addElement({ id: newId(), kind: 'image', src, x: Math.round((SLIDE_W - w) / 2), y: Math.round((SLIDE_H - h) / 2), w, h })
  }

  /** Patch elements by id. `coalesce` merges rapid repeats (typing, nudges) into one undo step. */
  update(ids: string[], patch: Partial<SlideElement> | ((el: SlideElement) => Partial<SlideElement>), coalesce?: string) {
    const set = new Set(ids)
    this.commit(
      this.withElements((els) =>
        els.map((el) => (set.has(el.id) ? ({ ...el, ...(typeof patch === 'function' ? patch(el) : patch) } as SlideElement) : el))
      ),
      { coalesce }
    )
  }

  setText(id: string, text: string) {
    this.update([id], { text } as Partial<SlideElement>, `text:${id}`)
  }

  /** Apply a text style to the selected text-bearing elements. */
  setTextStyle(patch: Partial<TextStyle>) {
    const ids = this.selection.filter(hasText).map((e) => e.id)
    if (!ids.length) return
    this.update(ids, (el) => ({ style: { ...(el as { style: TextStyle }).style, ...patch } }) as Partial<SlideElement>)
  }

  setFill(fill: string | null) {
    const ids = this.selection.filter((e) => e.kind === 'shape').map((e) => e.id)
    if (ids.length) this.update(ids, (el) => ((el as { shape: ShapeKind }).shape === 'line' ? { stroke: fill } : { fill }) as Partial<SlideElement>)
  }

  setOutline(stroke: string | null, width?: number) {
    const ids = this.selection.filter((e) => e.kind === 'shape').map((e) => e.id)
    if (ids.length) this.update(ids, { stroke, strokeWidth: stroke ? width ?? 3 : 0 } as Partial<SlideElement>)
  }

  deleteSelected() {
    if (!this.selected.length) return
    const set = new Set(this.selected)
    this.selected = []
    this.editing = null
    this.commit(this.withElements((els) => els.filter((e) => !set.has(e.id))))
  }

  nudge(dx: number, dy: number) {
    if (!this.selected.length) return
    this.update(this.selected, (el) => ({ x: el.x + dx, y: el.y + dy }), 'nudge')
  }

  duplicateSelected() {
    const copies = this.selection.map((e) => ({ ...cloneElement(e), x: e.x + 24, y: e.y + 24 }))
    if (!copies.length) return
    this.selected = copies.map((c) => c.id)
    this.commit(this.withElements((els) => [...els, ...copies]))
  }

  copy() {
    this.clip = this.selection.map((e) => ({ ...e }))
    return this.clip.length
  }

  cut() {
    if (this.copy()) this.deleteSelected()
  }

  get canPaste() {
    return this.clip.length > 0
  }

  paste() {
    if (!this.clip.length) return
    // Paste on the same slide offsets the copies so they don't sit exactly on top.
    const onSame = this.clip.some((c) => this.slide.elements.some((e) => e.id === c.id || (e.x === c.x && e.y === c.y)))
    const copies = this.clip.map((e) => ({ ...cloneElement(e), x: e.x + (onSame ? 24 : 0), y: e.y + (onSame ? 24 : 0) }))
    this.clip = copies.map((c) => ({ ...c }))
    this.selected = copies.map((c) => c.id)
    this.commit(this.withElements((els) => [...els, ...copies]))
  }

  /** Change stacking order: +1 forward, -1 backward, 'front' / 'back'. */
  reorder(dir: 1 | -1 | 'front' | 'back') {
    const set = new Set(this.selected)
    if (!set.size) return
    this.commit(
      this.withElements((els) => {
        const picked = els.filter((e) => set.has(e.id))
        const rest = els.filter((e) => !set.has(e.id))
        if (dir === 'front') return [...rest, ...picked]
        if (dir === 'back') return [...picked, ...rest]
        const out = [...els]
        const indices = out.map((e, i) => (set.has(e.id) ? i : -1)).filter((i) => i >= 0)
        const order = dir === 1 ? [...indices].reverse() : indices
        for (const i of order) {
          const j = i + dir
          if (j < 0 || j >= out.length || set.has(out[j].id)) continue
          ;[out[i], out[j]] = [out[j], out[i]]
        }
        return out
      })
    )
  }

  /** Align the selection to the slide (one element) or to each other (several). */
  align(edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
    const sel = this.selection
    if (!sel.length) return
    const box = sel.length === 1
      ? { x1: 0, y1: 0, x2: SLIDE_W, y2: SLIDE_H }
      : { x1: Math.min(...sel.map((e) => e.x)), y1: Math.min(...sel.map((e) => e.y)), x2: Math.max(...sel.map((e) => e.x + e.w)), y2: Math.max(...sel.map((e) => e.y + e.h)) }
    this.update(this.selected, (el) => {
      switch (edge) {
        case 'left': return { x: box.x1 }
        case 'center': return { x: Math.round((box.x1 + box.x2 - el.w) / 2) }
        case 'right': return { x: box.x2 - el.w }
        case 'top': return { y: box.y1 }
        case 'middle': return { y: Math.round((box.y1 + box.y2 - el.h) / 2) }
        case 'bottom': return { y: box.y2 - el.h }
      }
    })
  }
}
