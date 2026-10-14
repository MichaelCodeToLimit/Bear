import type { Presentation } from './model'
import { SlideView } from './SlideView'
import { getTheme } from './themes'

/** Every slide on its own landscape page; hidden on screen, used for Print and Export to PDF. */
export function PrintView({ pres }: { pres: Presentation }) {
  const theme = getTheme(pres.theme)
  return (
    <div className="slides-print hidden print:block">
      <style>{'@page { size: 13.333in 7.5in; margin: 0; }'}</style>
      {pres.slides.map((s) => (
        <div key={s.id} className="slides-print-page">
          {/* 13.333in at 96 CSS px per inch */}
          <SlideView slide={s} theme={theme} width={1280} />
        </div>
      ))}
    </div>
  )
}
