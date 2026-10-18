/** Slides are laid out on a fixed 16:9 canvas of 1280×720 units (96 per inch, like PowerPoint's 13.33×7.5in). */
export const SLIDE_W = 1280
export const SLIDE_H = 720
export const PX_PER_IN = 96

export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'arrow' | 'line'
export type Align = 'left' | 'center' | 'right'
export type VAlign = 'top' | 'middle' | 'bottom'
export type Placeholder = 'title' | 'subtitle' | 'body'
export type LayoutId = 'title' | 'titleContent' | 'section' | 'twoContent' | 'titleOnly' | 'blank'

export interface TextStyle {
  /** Points. */
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  align?: Align
  valign?: VAlign
  bullets?: boolean
  /** Numbered list (1. 2. 3.) instead of bullets. */
  numbered?: boolean
  /** Line spacing multiple (1 = single). */
  lineSpacing?: number
  shadow?: boolean
  /** Text outline colour. */
  outline?: string
  /** 'heading' or 'body' use the theme's fonts; anything else is a font family name. */
  font?: string
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface ElementBase extends Box {
  id: string
  /** Degrees, clockwise. */
  rotation?: number
  flipH?: boolean
  flipV?: boolean
  /** 0–1; 1 (or unset) is fully opaque. */
  opacity?: number
  /** Can't be moved, resized or deleted until unlocked. */
  locked?: boolean
  /** Hidden in the editor and the show (selection pane eye). */
  hidden?: boolean
  /** Name shown in the selection pane. */
  name?: string
  /** Elements sharing a groupId select, move and resize together. */
  groupId?: string
}

export interface TextElement extends ElementBase {
  kind: 'text'
  text: string
  style: TextStyle
  /** Layout placeholder: shows a prompt while empty and takes theme defaults. */
  placeholder?: Placeholder
}

export interface ShapeElement extends ElementBase {
  kind: 'shape'
  shape: ShapeKind
  fill?: string | null
  stroke?: string | null
  strokeWidth?: number
  text: string
  style: TextStyle
}

export interface Crop {
  /** Fractions (0–1) trimmed from each side. */
  l: number
  t: number
  r: number
  b: number
}

export interface ImageElement extends ElementBase {
  kind: 'image'
  src: string
  crop?: Crop
  /** Inserted from the icon picker: regenerated when recoloured. */
  icon?: { name: string; color: string }
}

export interface TableElement extends ElementBase {
  kind: 'table'
  /** rows[r][c] = cell text. */
  rows: string[][]
  /** First row styled as a header. */
  header: boolean
  banded: boolean
  /** Index into the theme's accent colours. */
  accent: number
  style: TextStyle
}

export type ChartType = 'column' | 'bar' | 'line' | 'pie' | 'doughnut'

export interface ChartSeries {
  name: string
  values: number[]
}

export interface ChartElement extends ElementBase {
  kind: 'chart'
  chartType: ChartType
  title: string
  categories: string[]
  series: ChartSeries[]
  legend: boolean
}

export interface MediaElement extends ElementBase {
  kind: 'media'
  mediaType: 'video' | 'audio'
  /** data: URL */
  src: string
  fileName: string
  /** Start playing as soon as the slide appears in a show. */
  autoplay?: boolean
  loop?: boolean
}

export type SlideElement = TextElement | ShapeElement | ImageElement | TableElement | ChartElement | MediaElement

// ---------- Motion ----------

export type TransitionType = 'none' | 'fade' | 'push' | 'wipe' | 'zoom' | 'cover'

export interface Transition {
  type: TransitionType
  /** Milliseconds. */
  duration: number
}

export type AnimKind = 'entrance' | 'emphasis' | 'exit'
export type AnimEffect = 'appear' | 'fade' | 'flyIn' | 'zoom' | 'wipe' | 'pulse' | 'spin' | 'fadeOut' | 'flyOut'
export type AnimStart = 'click' | 'with' | 'after'

export interface Animation {
  id: string
  elementId: string
  effect: AnimEffect
  start: AnimStart
  /** Milliseconds. */
  duration: number
  delay: number
}

export interface Slide {
  id: string
  elements: SlideElement[]
  /** Overrides the theme background. */
  background?: string
  notes: string
  /** The layout it was made from (layout editing moves untouched placeholders). */
  layout?: LayoutId
  transition?: Transition
  /** Played in order; see animation.ts for how they become click steps. */
  animations?: Animation[]
  /** Skipped in the slide show. */
  hidden?: boolean
  /** Seconds recorded by Rehearse timings. */
  timing?: number
  /** Move on automatically after this many seconds (Transitions > Advance after). */
  advanceAfter?: number
}

export interface Footer {
  text: string
  showText: boolean
  slideNumber: boolean
  date: boolean
  /** Fixed date text; empty means today's date. */
  dateText: string
  skipTitle: boolean
}

export interface ShowSettings {
  /** Advance by rehearsed timings / advanceAfter. */
  useTimings: boolean
  /** Start again after the last slide, until Esc (kiosk). */
  loop: boolean
  /** Target length of the talk, for the pace check. */
  targetMinutes?: number
}

export interface Presentation {
  theme: string
  slides: Slide[]
  /** Slide master: elements drawn behind every slide. */
  master?: { elements: SlideElement[] }
  footer?: Footer
  /** Edited placeholder positions per layout (slide master view), in placeholder order. */
  layoutBoxes?: Partial<Record<LayoutId, Box[]>>
  show?: ShowSettings
}

let counter = 0
export const newId = (prefix = 'e') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`

/** Elements whose text is edited in place (text boxes and shapes). */
export const hasText = (el: SlideElement): el is TextElement | ShapeElement => el.kind === 'text' || el.kind === 'shape'

/** Elements with a text style (also tables). */
export const hasStyle = (el: SlideElement): el is TextElement | ShapeElement | TableElement =>
  el.kind === 'text' || el.kind === 'shape' || el.kind === 'table'

/** Deep-copy a slide with fresh ids (duplicate, paste). Animations follow their elements. */
export function cloneSlide(s: Slide): Slide {
  const ids = new Map<string, string>()
  const groups = new Map<string, string>()
  const elements = s.elements.map((el) => {
    const c = cloneElement(el, groups)
    ids.set(el.id, c.id)
    return c
  })
  const animations = s.animations
    ?.filter((a) => ids.has(a.elementId))
    .map((a) => ({ ...a, id: newId('a'), elementId: ids.get(a.elementId)! }))
  return { ...s, id: newId('s'), elements, animations }
}

/** Copy an element with a fresh id; pass a shared map to keep copied groups together (but separate from the originals). */
export function cloneElement<T extends SlideElement>(el: T, groups?: Map<string, string>): T {
  const copy = JSON.parse(JSON.stringify(el)) as T
  copy.id = newId()
  if (copy.groupId) {
    if (groups) {
      if (!groups.has(copy.groupId)) groups.set(copy.groupId, newId('g'))
      copy.groupId = groups.get(copy.groupId)
    } else delete copy.groupId
  }
  return copy
}

/** The text a placeholder shows while it is empty. */
export const PLACEHOLDER_PROMPT: Record<Placeholder, string> = {
  title: 'Click to add title',
  subtitle: 'Click to add subtitle',
  body: 'Click to add text'
}

/** Default name in the selection pane, e.g. "Title 1", "Rectangle 3". */
export function elementName(el: SlideElement, index: number): string {
  if (el.name) return el.name
  const n = index + 1
  switch (el.kind) {
    case 'text': return el.placeholder ? `${el.placeholder[0].toUpperCase()}${el.placeholder.slice(1)} ${n}` : `Text box ${n}`
    case 'shape': return `${{ rect: 'Rectangle', roundRect: 'Rounded rectangle', ellipse: 'Oval', triangle: 'Triangle', arrow: 'Arrow', line: 'Line' }[el.shape]} ${n}`
    case 'image': return el.icon ? `Icon ${n}` : `Picture ${n}`
    case 'table': return `Table ${n}`
    case 'chart': return `Chart ${n}`
    case 'media': return `${el.mediaType === 'video' ? 'Video' : 'Audio'} ${n}`
  }
}

/** The plain text an element holds (for find & replace). */
export function elementText(el: SlideElement): string {
  if (el.kind === 'text' || el.kind === 'shape') return el.text
  if (el.kind === 'table') return el.rows.flat().join('\n')
  if (el.kind === 'chart') return [el.title, ...el.categories, ...el.series.map((s) => s.name)].join('\n')
  return ''
}
