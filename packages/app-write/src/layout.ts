export type PageSize = 'Letter' | 'A4'
export type Margins = 'normal' | 'narrow' | 'wide'

export interface PageLayout {
  size: PageSize
  landscape: boolean
  margins: Margins
}

export const DEFAULT_LAYOUT: PageLayout = { size: 'Letter', landscape: false, margins: 'normal' }

/** Page dimensions in inches (portrait). */
const SIZES: Record<PageSize, { w: number; h: number }> = {
  Letter: { w: 8.5, h: 11 },
  A4: { w: 8.27, h: 11.69 }
}

/** Margin on every side, in inches. */
const MARGINS: Record<Margins, number> = { normal: 1, narrow: 0.5, wide: 1.5 }

export function pageInches(layout: PageLayout): { w: number; h: number; margin: number } {
  const s = SIZES[layout.size]
  const [w, h] = layout.landscape ? [s.h, s.w] : [s.w, s.h]
  return { w, h, margin: MARGINS[layout.margins] }
}

/** Usable text width in CSS pixels (96 px per inch). */
export function contentWidthPx(layout: PageLayout): number {
  const p = pageInches(layout)
  return Math.round((p.w - 2 * p.margin) * 96)
}
