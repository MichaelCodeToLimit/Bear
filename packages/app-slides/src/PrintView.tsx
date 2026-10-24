import type { Presentation } from './model'
import { SlideView } from './SlideView'
import { getTheme } from './themes'

/**
 * What prints (and becomes the PDF): every shown slide on its own landscape page, or notes
 * pages (slide on top, notes underneath, portrait). Hidden on screen.
 */
export function PrintView({ pres, notes }: { pres: Presentation; notes?: boolean }) {
  const theme = getTheme(pres.theme)
  const slides = pres.slides.map((s, index) => ({ s, index })).filter(({ s }) => !s.hidden)
  if (notes) {
    return (
      <div className="slides-print hidden print:block">
        <style>{'@page { size: 8.5in 11in; margin: 0.6in; }'}</style>
        {slides.map(({ s, index }) => (
          <div key={s.id} className="slides-notes-page" style={{ breakAfter: 'page', fontFamily: theme.bodyFont }}>
            <div style={{ border: '1px solid #cbd5e1', width: 696 }}>
              {/* 7.25in wide at 96 CSS px per inch */}
              <SlideView slide={s} theme={theme} width={696} deck={{ pres, index }} />
            </div>
            <div style={{ marginTop: 24, fontSize: 14, color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{s.notes}</div>
            <div style={{ marginTop: 16, fontSize: 11, color: '#6b7280' }}>{index + 1}</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="slides-print hidden print:block">
      <style>{'@page { size: 13.333in 7.5in; margin: 0; }'}</style>
      {slides.map(({ s, index }) => (
        <div key={s.id} className="slides-print-page">
          {/* 13.333in at 96 CSS px per inch */}
          <SlideView slide={s} theme={theme} width={1280} deck={{ pres, index }} />
        </div>
      ))}
    </div>
  )
}
