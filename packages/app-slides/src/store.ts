import {
  cloneElement, cloneSlide, hasStyle, hasText, newId, SLIDE_H, SLIDE_W,
  type AnimEffect, type Animation, type Box, type ChartElement, type Crop, type Footer, type ImageElement, type LayoutId,
  type MediaElement, type Presentation, type ShapeKind, type ShowSettings, type Slide, type SlideElement, type TableElement,
  type TextStyle, type Transition
} from './model'
import { layoutBoxes, newSlide } from './layouts'
import { getTheme } from './themes'
import { effectKind } from './animation'
import { sampleChart } from './chart'
import { iconSrc } from './icons'
import { findAll, replaceAll, replaceOne, type FindOptions, type Match } from './find'

interface Snapshot {
  pres: Presentation
  current: number
}

/** What the format painter copies. */
export interface Format {
  style?: TextStyle
  fill?: string | null
  stroke?: string | null
  strokeWidth?: number
  opacity?: number
}

/** Editing the slide master, or one layout's placeholder positions, instead of a slide. */
export type MasterTarget = 'master' | LayoutId

const UNDO_LIMIT = 200
/** Edits with the same key within this window merge into one undo step (typing, nudging). */
const COALESCE_MS = 1200
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024

export function newPresentation(): Presentation {
  return { theme: 'paper', slides: [newSlide('title')] }
}

export const DEFAULT_FOOTER: Footer = { text: '', showText: false, slideNumber: false, date: false, dateText: '', skipTitle: true }

/** Ids for a layout's placeholders while editing them (stable, so they can be selected). */
const layoutElementId = (layout: LayoutId, i: number) => `layout-${layout}-${i}`

const sameBox = (a: Box, b: Box) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1

/**
 * Presentation state. The presentation object is never mutated: every edit builds a new one,
 * so undo/redo just keeps references to earlier versions.
 */
export class SlidesStore {
  pres: Presentation
  current = 0
  selected: string[] = []
  /** Id of the element whose text (or table cell) is being edited. */
  editing: string | null = null
  /** Slide master view: what's being edited instead of a slide. */
  masterTarget: MasterTarget | null = null
  /** Table cell the cursor was last in ([row, col]), for the Table Design commands. */
  tableCell: [number, number] | null = null
  /** Format painter: the next element clicked takes this format. */
  painter: Format | null = null
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

  /** What the stage edits: the current slide, the master, or a layout. */
  get slide(): Slide {
    if (this.masterTarget === 'master') return { id: 'master', elements: this.pres.master?.elements ?? [], notes: '' }
    if (this.masterTarget) {
      const layout = this.masterTarget
      const preview = newSlide(layout, this.pres)
      return { ...preview, id: `layout-${layout}`, elements: preview.elements.map((el, i) => ({ ...el, id: layoutElementId(layout, i) })) }
    }
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
    this.masterTarget = null
    this.painter = null
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

  /** Change the elements of whatever is being edited (slide, master or layout). */
  private withElements(fn: (els: SlideElement[]) => SlideElement[]): Presentation {
    if (this.masterTarget === 'master') return { ...this.pres, master: { elements: fn(this.pres.master?.elements ?? []) } }
    if (this.masterTarget) return this.withLayoutBoxes(this.masterTarget, fn(this.slide.elements))
    return this.withSlide(this.current, (s) => ({ ...s, elements: fn(s.elements) }))
  }

  /**
   * Save a layout's edited placeholder positions. Slides made from that layout whose
   * placeholders are still where the layout used to put them move too.
   */
  private withLayoutBoxes(layout: LayoutId, edited: SlideElement[]): Presentation {
    const old = layoutBoxes(layout, this.pres)
    const boxes = old.map((b, i) => {
      const el = edited.find((e) => e.id === layoutElementId(layout, i))
      return el ? { x: el.x, y: el.y, w: el.w, h: el.h } : b
    })
    const slides = this.pres.slides.map((s) => {
      if (s.layout !== layout) return s
      let i = 0
      const elements = s.elements.map((el) => {
        if (el.kind !== 'text' || !el.placeholder) return el
        const idx = i++
        return old[idx] && boxes[idx] && sameBox(el, old[idx]) ? { ...el, ...boxes[idx] } : el
      })
      return { ...s, elements }
    })
    return { ...this.pres, slides, layoutBoxes: { ...this.pres.layoutBoxes, [layout]: boxes } }
  }

  // ---------- Slides ----------

  goto(index: number) {
    const i = Math.max(0, Math.min(index, this.pres.slides.length - 1))
    if (i === this.current && !this.masterTarget) return
    this.masterTarget = null
    this.current = i
    this.selected = []
    this.editing = null
    this.emit()
  }

  addSlide(layout: LayoutId, after = this.current) {
    const slides = [...this.pres.slides]
    slides.splice(after + 1, 0, newSlide(layout, this.pres))
    this.selected = []
    this.editing = null
    this.masterTarget = null
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

  /** Hide or show slides in the slide show. */
  setHidden(indices: number[], hidden: boolean) {
    const set = new Set(indices)
    this.commit({ ...this.pres, slides: this.pres.slides.map((s, i) => (set.has(i) ? { ...s, hidden: hidden || undefined } : s)) })
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
      if (el.kind === 'image') {
        if (!el.icon) return el
        const color = remap(el.icon.color)
        return color === el.icon.color ? el : { ...el, icon: { ...el.icon, color }, src: iconSrc(el.icon.name, color) }
      }
      if (!hasStyle(el)) return el
      const style = el.style.color ? { ...el.style, color: remap(el.style.color) } : el.style
      return el.kind === 'shape' ? { ...el, fill: remap(el.fill), stroke: remap(el.stroke), style } : { ...el, style }
    }
    // A theme applies to every slide; clear per-slide backgrounds so it shows.
    this.commit({
      ...this.pres,
      theme,
      master: this.pres.master && { elements: this.pres.master.elements.map(recolor) },
      slides: this.pres.slides.map((s) => ({ ...s, background: undefined, elements: s.elements.map(recolor) }))
    })
  }

  // ---------- Slide master & layouts ----------

  /** Enter (or leave, with null) slide master view. */
  editMaster(target: MasterTarget | null) {
    this.masterTarget = target
    this.selected = []
    this.editing = null
    this.emit()
  }

  setFooter(patch: Partial<Footer>) {
    this.commit({ ...this.pres, footer: { ...DEFAULT_FOOTER, ...this.pres.footer, ...patch } })
  }

  /** Put a layout's placeholders back where Bear puts them. */
  resetLayout(layout: LayoutId) {
    const rest = { ...this.pres.layoutBoxes }
    delete rest[layout]
    this.commit({ ...this.pres, layoutBoxes: rest })
  }

  // ---------- Selection ----------

  /** Selecting part of a group selects the whole group. */
  withGroupIds(ids: string[]): string[] {
    const els = this.slide.elements
    const groups = new Set(els.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId!))
    return [...new Set([...ids, ...els.filter((e) => e.groupId && groups.has(e.groupId)).map((e) => e.id)])]
  }

  select(ids: string[], additive = false) {
    const picked = this.withGroupIds(ids)
    this.selected = additive ? [...new Set([...this.selected, ...picked])] : picked
    if (this.editing && !this.selected.includes(this.editing)) this.editing = null
    this.emit()
  }

  toggleSelect(id: string) {
    const ids = this.withGroupIds([id])
    this.selected = this.selected.includes(id) ? this.selected.filter((s) => !ids.includes(s)) : [...new Set([...this.selected, ...ids])]
    this.emit()
  }

  selectAll() {
    this.selected = this.slide.elements.filter((e) => !e.hidden).map((e) => e.id)
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

  /** Fit `natural` within 70% of the slide, centred. */
  private centred(natural: { w: number; h: number }, share = 0.7): Box {
    const scale = Math.min(1, (SLIDE_W * share) / natural.w, (SLIDE_H * share) / natural.h)
    const w = Math.round(natural.w * scale)
    const h = Math.round(natural.h * scale)
    return { x: Math.round((SLIDE_W - w) / 2), y: Math.round((SLIDE_H - h) / 2), w, h }
  }

  addImage(src: string, natural: { w: number; h: number }) {
    this.addElement({ id: newId(), kind: 'image', src, ...this.centred(natural) })
  }

  addIcon(name: string, color: string) {
    this.addElement({ id: newId(), kind: 'image', src: iconSrc(name, color), icon: { name, color }, x: SLIDE_W / 2 - 80, y: SLIDE_H / 2 - 80, w: 160, h: 160 })
  }

  addTable(rows: number, cols: number) {
    const w = Math.min(SLIDE_W - 160, cols * 180)
    const h = Math.min(SLIDE_H - 220, rows * 48)
    const el: TableElement = {
      id: newId(), kind: 'table', x: Math.round((SLIDE_W - w) / 2), y: Math.round(Math.max(170, (SLIDE_H - h) / 2)), w, h,
      rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
      header: true, banded: true, accent: 0, style: { fontSize: 16 }
    }
    this.addElement(el)
  }

  addChart(chartType: ChartElement['chartType']) {
    this.addElement({ id: newId(), kind: 'chart', ...sampleChart(chartType), x: 240, y: 150, w: 800, h: 480 })
  }

  addMedia(src: string, mediaType: MediaElement['mediaType'], fileName: string, natural?: { w: number; h: number }) {
    const box = mediaType === 'audio' ? { x: SLIDE_W / 2 - 60, y: SLIDE_H / 2 - 60, w: 120, h: 120 } : this.centred(natural ?? { w: 1280, h: 720 }, 0.6)
    this.addElement({ id: newId(), kind: 'media', mediaType, src, fileName, ...box })
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

  private unlocked(): string[] {
    return this.selection.filter((e) => !e.locked).map((e) => e.id)
  }

  setText(id: string, text: string) {
    this.update([id], { text } as Partial<SlideElement>, `text:${id}`)
  }

  /** Apply a text style to the selected elements that have text (text, shapes, tables). */
  setTextStyle(patch: Partial<TextStyle>) {
    const ids = this.selection.filter(hasStyle).map((e) => e.id)
    if (!ids.length) return
    this.update(ids, (el) => ({ style: { ...(el as { style: TextStyle }).style, ...patch } }) as Partial<SlideElement>)
  }

  setFill(fill: string | null) {
    const sel = this.selection
    const shapes = sel.filter((e) => e.kind === 'shape').map((e) => e.id)
    const iconEls = sel.filter((e): e is ImageElement => e.kind === 'image' && !!e.icon)
    if (shapes.length) this.update(shapes, (el) => ((el as { shape: ShapeKind }).shape === 'line' ? { stroke: fill } : { fill }) as Partial<SlideElement>)
    // Icons take the fill colour as their own.
    if (iconEls.length && fill) this.update(iconEls.map((e) => e.id), (el) => {
      const icon = (el as ImageElement).icon!
      return { icon: { ...icon, color: fill }, src: iconSrc(icon.name, fill) } as Partial<SlideElement>
    })
  }

  setOutline(stroke: string | null, width?: number) {
    const ids = this.selection.filter((e) => e.kind === 'shape').map((e) => e.id)
    if (ids.length) this.update(ids, { stroke, strokeWidth: stroke ? width ?? 3 : 0 } as Partial<SlideElement>)
  }

  setOpacity(opacity: number) {
    if (this.selected.length) this.update(this.selected, { opacity: opacity >= 1 ? undefined : Math.max(0, opacity) }, 'opacity')
  }

  deleteSelected() {
    const ids = new Set(this.unlocked())
    if (!ids.size) return
    this.selected = this.selected.filter((id) => !ids.has(id))
    this.editing = null
    const next = this.withElements((els) => els.filter((e) => !ids.has(e.id)))
    // Animations of deleted elements go with them.
    this.commit(this.masterTarget ? next : { ...next, slides: next.slides.map((s, i) => (i === this.current && s.animations ? { ...s, animations: s.animations.filter((a) => !ids.has(a.elementId)) } : s)) })
  }

  nudge(dx: number, dy: number) {
    const ids = this.unlocked()
    if (ids.length) this.update(ids, (el) => ({ x: el.x + dx, y: el.y + dy }), 'nudge')
  }

  duplicateSelected() {
    const groups = new Map<string, string>()
    const copies = this.selection.map((e) => ({ ...cloneElement(e, groups), x: e.x + 24, y: e.y + 24, locked: undefined }))
    if (!copies.length) return
    this.selected = copies.map((c) => c.id)
    this.commit(this.withElements((els) => [...els, ...copies]))
  }

  copy() {
    this.clip = this.selection.map((e) => JSON.parse(JSON.stringify(e)) as SlideElement)
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
    const groups = new Map<string, string>()
    const copies = this.clip.map((e) => ({ ...cloneElement(e, groups), x: e.x + (onSame ? 24 : 0), y: e.y + (onSame ? 24 : 0) }))
    this.clip = copies.map((c) => JSON.parse(JSON.stringify(c)) as SlideElement)
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
    const sel = this.selection.filter((e) => !e.locked)
    if (!sel.length) return
    const all = this.selection
    const box = all.length === 1 || new Set(all.map((e) => e.groupId ?? e.id)).size === 1
      ? { x1: 0, y1: 0, x2: SLIDE_W, y2: SLIDE_H }
      : { x1: Math.min(...all.map((e) => e.x)), y1: Math.min(...all.map((e) => e.y)), x2: Math.max(...all.map((e) => e.x + e.w)), y2: Math.max(...all.map((e) => e.y + e.h)) }
    // A group moves as one block.
    const unit = this.boundsOf(sel)
    const groupMove = new Set(sel.map((e) => e.groupId ?? e.id)).size === 1 && sel.length > 1
    this.update(sel.map((e) => e.id), (el) => {
      const b = groupMove ? unit : { x: el.x, y: el.y, w: el.w, h: el.h }
      const dx = { left: box.x1 - b.x, center: Math.round((box.x1 + box.x2 - b.w) / 2) - b.x, right: box.x2 - b.w - b.x }
      const dy = { top: box.y1 - b.y, middle: Math.round((box.y1 + box.y2 - b.h) / 2) - b.y, bottom: box.y2 - b.h - b.y }
      if (edge in dx) return { x: el.x + dx[edge as keyof typeof dx] }
      return { y: el.y + dy[edge as keyof typeof dy] }
    })
  }

  /** The box around some elements. */
  boundsOf(els: SlideElement[]): Box {
    const x = Math.min(...els.map((e) => e.x))
    const y = Math.min(...els.map((e) => e.y))
    return { x, y, w: Math.max(...els.map((e) => e.x + e.w)) - x, h: Math.max(...els.map((e) => e.y + e.h)) - y }
  }

  // ---------- Arrange: rotate, flip, group, lock, layers ----------

  rotate(by: number) {
    const ids = this.unlocked()
    if (ids.length) this.update(ids, (el) => ({ rotation: (((el.rotation ?? 0) + by) % 360 + 360) % 360 || undefined }))
  }

  setRotation(ids: string[], deg: number) {
    this.update(ids, { rotation: ((Math.round(deg) % 360) + 360) % 360 || undefined }, 'rotate')
  }

  flip(axis: 'h' | 'v') {
    const ids = this.unlocked()
    if (ids.length) this.update(ids, (el) => (axis === 'h' ? { flipH: !el.flipH || undefined } : { flipV: !el.flipV || undefined }))
  }

  group() {
    if (this.selected.length < 2) return
    const g = newId('g')
    this.update(this.selected, { groupId: g })
  }

  ungroup() {
    const ids = this.selection.filter((e) => e.groupId).map((e) => e.id)
    if (ids.length) this.update(ids, { groupId: undefined })
  }

  get canGroup() {
    return this.selected.length > 1 && new Set(this.selection.map((e) => e.groupId ?? e.id)).size > 1
  }

  get canUngroup() {
    return this.selection.some((e) => e.groupId)
  }

  toggleLock(ids = this.selected) {
    const els = this.slide.elements.filter((e) => ids.includes(e.id))
    if (!els.length) return
    const lock = !els.every((e) => e.locked)
    this.update(ids, { locked: lock || undefined })
  }

  setElementHidden(id: string, hidden: boolean) {
    if (hidden) this.selected = this.selected.filter((s) => s !== id)
    this.update([id], { hidden: hidden || undefined })
  }

  rename(id: string, name: string) {
    this.update([id], { name: name.trim() || undefined })
  }

  /** Move an element to a stacking position (0 = back). */
  moveLayer(id: string, to: number) {
    this.commit(this.withElements((els) => {
      const from = els.findIndex((e) => e.id === id)
      if (from < 0) return els
      const out = [...els]
      const [el] = out.splice(from, 1)
      out.splice(Math.max(0, Math.min(to, out.length)), 0, el)
      return out
    }))
  }

  /** Resize a group (or any multi-selection) as one block. */
  resizeTogether(ids: string[], from: Box, to: Box, originals: Map<string, Box>) {
    const sx = to.w / Math.max(1, from.w)
    const sy = to.h / Math.max(1, from.h)
    this.update(ids, (el) => {
      const o = originals.get(el.id) ?? el
      return {
        x: Math.round(to.x + (o.x - from.x) * sx),
        y: Math.round(to.y + (o.y - from.y) * sy),
        w: Math.max(4, Math.round(o.w * sx)),
        h: Math.max(1, Math.round(o.h * sy))
      }
    })
  }

  setCrop(id: string, crop: Crop | undefined) {
    this.update([id], { crop } as Partial<SlideElement>, `crop:${id}`)
  }

  // ---------- Format painter ----------

  /** Pick up the selected element's look. */
  copyFormat() {
    const el = this.selection[0]
    if (!el) return
    this.painter = {
      style: hasStyle(el) ? { ...el.style } : undefined,
      fill: el.kind === 'shape' ? el.fill : undefined,
      stroke: el.kind === 'shape' ? el.stroke : undefined,
      strokeWidth: el.kind === 'shape' ? el.strokeWidth : undefined,
      opacity: el.opacity
    }
    this.emit()
  }

  /** Paint the picked-up look onto elements (then the painter is put down). */
  applyFormat(ids: string[]) {
    const f = this.painter
    if (!f) return
    this.painter = null
    this.update(ids, (el) => {
      const patch: Record<string, unknown> = { opacity: f.opacity }
      if (f.style && hasStyle(el)) patch.style = { ...el.style, ...f.style }
      if (el.kind === 'shape' && f.fill !== undefined) Object.assign(patch, { fill: f.fill, stroke: f.stroke, strokeWidth: f.strokeWidth })
      return patch as Partial<SlideElement>
    })
  }

  cancelPainter() {
    if (!this.painter) return
    this.painter = null
    this.emit()
  }

  // ---------- Tables ----------

  private table(id: string): TableElement | null {
    const el = this.slide.elements.find((e) => e.id === id)
    return el?.kind === 'table' ? el : null
  }

  setCell(id: string, r: number, c: number, text: string) {
    const t = this.table(id)
    if (!t) return
    this.update([id], { rows: t.rows.map((row, ri) => row.map((cell, ci) => (ri === r && ci === c ? text : cell))) } as Partial<SlideElement>, `cell:${id}:${r}:${c}`)
  }

  insertRow(id: string, at: number) {
    const t = this.table(id)
    if (!t) return
    const rows = [...t.rows]
    rows.splice(Math.max(0, Math.min(at, rows.length)), 0, Array.from({ length: t.rows[0]?.length ?? 1 }, () => ''))
    this.update([id], { rows, h: Math.min(SLIDE_H, t.h + Math.round(t.h / t.rows.length)) } as Partial<SlideElement>)
  }

  deleteRow(id: string, at: number) {
    const t = this.table(id)
    if (!t || t.rows.length <= 1) return
    this.update([id], { rows: t.rows.filter((_, i) => i !== at), h: Math.max(30, t.h - Math.round(t.h / t.rows.length)) } as Partial<SlideElement>)
  }

  insertColumn(id: string, at: number) {
    const t = this.table(id)
    if (!t) return
    this.update([id], { rows: t.rows.map((row) => { const r = [...row]; r.splice(Math.max(0, Math.min(at, r.length)), 0, ''); return r }) } as Partial<SlideElement>)
  }

  deleteColumn(id: string, at: number) {
    const t = this.table(id)
    if (!t || (t.rows[0]?.length ?? 0) <= 1) return
    this.update([id], { rows: t.rows.map((row) => row.filter((_, i) => i !== at)) } as Partial<SlideElement>)
  }

  setTable(id: string, patch: Partial<Pick<TableElement, 'header' | 'banded' | 'accent'>>) {
    this.update([id], patch as Partial<SlideElement>)
  }

  // ---------- Charts & media ----------

  setChart(id: string, patch: Partial<Pick<ChartElement, 'chartType' | 'title' | 'categories' | 'series' | 'legend'>>) {
    this.update([id], patch as Partial<SlideElement>)
  }

  setMedia(id: string, patch: Partial<Pick<MediaElement, 'autoplay' | 'loop'>>) {
    this.update([id], patch as Partial<SlideElement>)
  }

  // ---------- Animations & transitions ----------

  private withAnimations(fn: (a: Animation[]) => Animation[]) {
    if (this.masterTarget) return
    this.commit(this.withSlide(this.current, (s) => ({ ...s, animations: fn(s.animations ?? []) })))
  }

  /** Add an effect to each selected element, each on its own click. */
  addAnimation(effect: AnimEffect) {
    const ids = this.selected
    if (!ids.length || this.masterTarget) return
    const duration = effect === 'appear' ? 0 : effectKind(effect) === 'emphasis' ? 800 : 500
    this.withAnimations((a) => [...a, ...ids.map((elementId): Animation => ({ id: newId('a'), elementId, effect, start: 'click', duration, delay: 0 }))])
  }

  updateAnimation(id: string, patch: Partial<Omit<Animation, 'id' | 'elementId'>>) {
    this.withAnimations((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  removeAnimation(id: string) {
    this.withAnimations((a) => a.filter((x) => x.id !== id))
  }

  moveAnimation(id: string, dir: -1 | 1) {
    this.withAnimations((a) => {
      const i = a.findIndex((x) => x.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= a.length) return a
      const out = [...a]
      ;[out[i], out[j]] = [out[j], out[i]]
      return out
    })
  }

  setTransition(t: Transition | null, all = false) {
    const apply = (s: Slide): Slide => ({ ...s, transition: t && t.type !== 'none' ? t : undefined })
    this.commit({ ...this.pres, slides: this.pres.slides.map((s, i) => (all || i === this.current ? apply(s) : s)) })
  }

  setAdvanceAfter(seconds: number | null, all = false) {
    const v = seconds && seconds > 0 ? seconds : undefined
    this.commit({ ...this.pres, slides: this.pres.slides.map((s, i) => (all || i === this.current ? { ...s, advanceAfter: v } : s)) })
  }

  // ---------- Show ----------

  setShow(patch: Partial<ShowSettings>) {
    this.commit({ ...this.pres, show: { useTimings: false, loop: false, ...this.pres.show, ...patch } })
  }

  /** Keep rehearsed times (seconds per slide id) and switch the show to use them. */
  saveTimings(timings: Record<string, number>) {
    this.commit({
      ...this.pres,
      show: { loop: false, ...this.pres.show, useTimings: true },
      slides: this.pres.slides.map((s) => (s.id in timings ? { ...s, timing: Math.round(timings[s.id]) } : s))
    })
  }

  clearTimings() {
    this.commit({ ...this.pres, show: { loop: false, ...this.pres.show, useTimings: false }, slides: this.pres.slides.map((s) => ({ ...s, timing: undefined })) })
  }

  // ---------- Find & replace ----------

  find(q: string, o: FindOptions): Match[] {
    return findAll(this.pres, q, o)
  }

  /** Go to a match and select what holds it. */
  showMatch(m: Match) {
    this.masterTarget = null
    this.current = m.slide
    this.editing = null
    this.selected = m.target === 'notes' ? [] : [m.target]
    this.emit()
  }

  replace(m: Match, q: string, r: string) {
    this.commit(replaceOne(this.pres, m, q, r), { current: m.slide })
  }

  replaceAll(q: string, r: string, o: FindOptions): number {
    const { pres, count } = replaceAll(this.pres, q, r, o)
    if (count) this.commit(pres)
    return count
  }
}

/** Does this element have text that's edited in place? (Re-exported for the UI.) */
export { hasText }
