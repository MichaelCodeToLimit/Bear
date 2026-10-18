import { useEffect, useRef, useState } from 'react'
import { SLIDE_H, SLIDE_W, type Presentation } from './model'
import { SlideView } from './SlideView'
import { getTheme } from './themes'

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

/** Wait for every picture on the slide to finish loading. */
async function imagesReady(root: HTMLElement) {
  await Promise.all(Array.from(root.querySelectorAll('img')).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r }))))
}

/**
 * Saves each slide as a PNG in `folder`: shows the slide as large as the window allows and
 * captures it at the screen's full pixel density (through the main process).
 */
export function PictureExport({ pres, folder, onDone }: { pres: Presentation; folder: string; onDone: (result: { count: number } | { error: string }) => void }) {
  const theme = getTheme(pres.theme)
  const [index, setIndex] = useState(0)
  const host = useRef<HTMLDivElement>(null)
  const width = Math.floor(Math.min(window.innerWidth - 40, ((window.innerHeight - 80) * SLIDE_W) / SLIDE_H))
  const sep = folder.includes('\\') ? '\\' : '/'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await frame()
        const el = host.current?.querySelector('[data-export-slide]') as HTMLElement | null
        if (!el) return
        await imagesReady(el)
        await document.fonts?.ready
        await frame()
        const r = el.getBoundingClientRect()
        const png = await window.bear.capture({ x: r.left, y: r.top, width: r.width, height: r.height })
        if (cancelled) return
        await window.bear.saveFile(`${folder}${folder.endsWith(sep) ? '' : sep}Slide${index + 1}.png`, png)
        if (index + 1 < pres.slides.length) setIndex(index + 1)
        else onDone({ count: pres.slides.length })
      } catch (e) {
        if (!cancelled) onDone({ error: (e as Error).message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={host} role="dialog" aria-label="Exporting pictures" className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-3 bg-[#1d1d1f] print:hidden">
      <div data-export-slide>
        <SlideView slide={pres.slides[index]} theme={theme} width={width} deck={{ pres, index }} />
      </div>
      <p role="status" className="text-sm text-white/70">Saving slide {index + 1} of {pres.slides.length}…</p>
    </div>
  )
}
