import { newId, SLIDE_H, SLIDE_W, type Box, type LayoutId, type Presentation, type Slide, type TextElement } from './model'

export type { LayoutId }

export const LAYOUTS: { id: LayoutId; name: string }[] = [
  { id: 'title', name: 'Title slide' },
  { id: 'titleContent', name: 'Title and content' },
  { id: 'section', name: 'Section header' },
  { id: 'twoContent', name: 'Two content' },
  { id: 'titleOnly', name: 'Title only' },
  { id: 'blank', name: 'Blank' }
]

const M = 80 // side margin

function box(placeholder: TextElement['placeholder'], x: number, y: number, w: number, h: number, style: TextElement['style']): TextElement {
  return { id: newId(), kind: 'text', placeholder, x, y, w, h, text: '', style }
}

const title = (y = 48, h = 110) => box('title', M, y, SLIDE_W - 2 * M, h, { fontSize: 40, bold: true, valign: 'middle' })
const body = (x: number, w: number) => box('body', x, 190, w, SLIDE_H - 190 - 64, { fontSize: 22, bullets: true })

/** A layout's placeholders in their built-in positions. */
function defaults(layout: LayoutId): TextElement[] {
  switch (layout) {
    case 'title':
      return [
        box('title', M, 210, SLIDE_W - 2 * M, 150, { fontSize: 54, bold: true, align: 'center', valign: 'bottom' }),
        box('subtitle', M, 380, SLIDE_W - 2 * M, 90, { fontSize: 24, align: 'center' })
      ]
    case 'titleContent':
      return [title(), body(M, SLIDE_W - 2 * M)]
    case 'section':
      return [
        box('title', M, 250, SLIDE_W - 2 * M, 130, { fontSize: 48, bold: true, valign: 'bottom' }),
        box('subtitle', M, 400, SLIDE_W - 2 * M, 70, { fontSize: 22 })
      ]
    case 'twoContent': {
      const w = (SLIDE_W - 2 * M - 48) / 2
      return [title(), body(M, w), body(M + w + 48, w)]
    }
    case 'titleOnly':
      return [title()]
    case 'blank':
      return []
  }
}

/** Where each placeholder of a layout sits: edited positions from the slide master, else the defaults. */
export function layoutBoxes(layout: LayoutId, pres?: Pick<Presentation, 'layoutBoxes'>): Box[] {
  const custom = pres?.layoutBoxes?.[layout]
  return defaults(layout).map((el, i) => custom?.[i] ?? { x: el.x, y: el.y, w: el.w, h: el.h })
}

export function newSlide(layout: LayoutId, pres?: Pick<Presentation, 'layoutBoxes'>): Slide {
  const boxes = layoutBoxes(layout, pres)
  const elements = defaults(layout).map((el, i) => ({ ...el, ...boxes[i] }))
  return { id: newId('s'), elements, notes: '', layout }
}

/** The layout's placeholders, positioned (used to draw and edit layouts in slide master view). */
export function layoutPreview(layout: LayoutId, pres?: Pick<Presentation, 'layoutBoxes'>): Slide {
  return { ...newSlide(layout, pres), id: `layout-${layout}` }
}
