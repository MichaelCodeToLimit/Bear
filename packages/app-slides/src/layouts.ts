import { newId, SLIDE_H, SLIDE_W, type Slide, type TextElement } from './model'

export type LayoutId = 'title' | 'titleContent' | 'section' | 'twoContent' | 'titleOnly' | 'blank'

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

export function newSlide(layout: LayoutId): Slide {
  const elements: TextElement[] = []
  switch (layout) {
    case 'title':
      elements.push(
        box('title', M, 210, SLIDE_W - 2 * M, 150, { fontSize: 54, bold: true, align: 'center', valign: 'bottom' }),
        box('subtitle', M, 380, SLIDE_W - 2 * M, 90, { fontSize: 24, align: 'center' })
      )
      break
    case 'titleContent':
      elements.push(title(), body(M, SLIDE_W - 2 * M))
      break
    case 'section':
      elements.push(
        box('title', M, 250, SLIDE_W - 2 * M, 130, { fontSize: 48, bold: true, valign: 'bottom' }),
        box('subtitle', M, 400, SLIDE_W - 2 * M, 70, { fontSize: 22 })
      )
      break
    case 'twoContent': {
      const w = (SLIDE_W - 2 * M - 48) / 2
      elements.push(title(), body(M, w), body(M + w + 48, w))
      break
    }
    case 'titleOnly':
      elements.push(title())
      break
    case 'blank':
      break
  }
  return { id: newId('s'), elements, notes: '' }
}
