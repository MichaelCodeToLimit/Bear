/** Slides are laid out on a fixed 16:9 canvas of 1280×720 units (96 per inch, like PowerPoint's 13.33×7.5in). */
export const SLIDE_W = 1280
export const SLIDE_H = 720
export const PX_PER_IN = 96

export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'arrow' | 'line'
export type Align = 'left' | 'center' | 'right'
export type VAlign = 'top' | 'middle' | 'bottom'
export type Placeholder = 'title' | 'subtitle' | 'body'

export interface TextStyle {
  /** Points. */
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  align?: Align
  valign?: VAlign
  bullets?: boolean
  /** 'heading' or 'body' use the theme's fonts; anything else is a font family name. */
  font?: string
}

interface ElementBase {
  id: string
  x: number
  y: number
  w: number
  h: number
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

export interface ImageElement extends ElementBase {
  kind: 'image'
  src: string
}

export type SlideElement = TextElement | ShapeElement | ImageElement

export interface Slide {
  id: string
  elements: SlideElement[]
  /** Overrides the theme background. */
  background?: string
  notes: string
}

export interface Presentation {
  theme: string
  slides: Slide[]
}

let counter = 0
export const newId = (prefix = 'e') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`

export const hasText = (el: SlideElement): el is TextElement | ShapeElement => el.kind !== 'image'

/** Deep-copy a slide with fresh ids (duplicate, paste). */
export function cloneSlide(s: Slide): Slide {
  return { ...s, id: newId('s'), elements: s.elements.map(cloneElement) }
}

export function cloneElement<T extends SlideElement>(el: T): T {
  return { ...el, id: newId(), ...('style' in el ? { style: { ...el.style } } : {}) }
}

/** The text a placeholder shows while it is empty. */
export const PLACEHOLDER_PROMPT: Record<Placeholder, string> = {
  title: 'Click to add title',
  subtitle: 'Click to add subtitle',
  body: 'Click to add text'
}
