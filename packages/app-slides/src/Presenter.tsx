import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SLIDE_H, SLIDE_W, type Presentation } from './model'
import { SlideView } from './SlideView'
import { getTheme } from './themes'

interface PresenterProps {
  pres: Presentation
  start: number
  onExit: (lastSlide: number) => void
}

/**
 * Full-screen slide show. Next: → ↓ Space Enter PageDown or click. Previous: ← ↑ Backspace PageUp.
 * Home/End jump, a number then Enter goes to that slide, B blacks the screen, Esc ends.
 */
export function Presenter({ pres, start, onExit }: PresenterProps) {
  const [index, setIndex] = useState(start)
  const [black, setBlack] = useState(false)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const typed = useRef('')
  const root = useRef<HTMLDivElement>(null)
  const theme = getTheme(pres.theme)
  const count = pres.slides.length
  // Past the last slide shows an "end of show" screen, as presentation apps do.
  const atEnd = index >= count

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    onExit(Math.min(index, count - 1))
  }, [onExit, index, count])

  useLayoutEffect(() => {
    root.current?.focus()
    root.current?.requestFullscreen?.().catch(() => {
      /* fullscreen can be refused; the overlay still covers the window */
    })
  }, [])

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    const onFs = () => {
      // Leaving fullscreen with the system gesture ends the show too.
      if (!document.fullscreenElement && root.current?.dataset.wasFullscreen) exit()
      if (document.fullscreenElement && root.current) root.current.dataset.wasFullscreen = '1'
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [exit])

  const go = (i: number) => {
    setBlack(false)
    setIndex(Math.max(0, Math.min(i, count)))
  }

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key
    e.preventDefault()
    if (k === 'Escape') return exit()
    if (/^\d$/.test(k)) {
      typed.current += k
      return
    }
    if (k === 'Enter' && typed.current) {
      go(Number(typed.current) - 1)
      typed.current = ''
      return
    }
    typed.current = ''
    if (k === 'b' || k === 'B' || k === '.') return setBlack((b) => !b)
    if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown', 'n', 'N'].includes(k)) {
      if (atEnd) return exit()
      return go(index + 1)
    }
    if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp', 'p', 'P'].includes(k)) return go(index - 1)
    if (k === 'Home') return go(0)
    if (k === 'End') return go(count - 1)
  }

  const width = Math.min(size.w, (size.h * SLIDE_W) / SLIDE_H)

  return (
    <div
      ref={root}
      tabIndex={0}
      role="dialog"
      aria-label="Slide show"
      data-presenting
      onKeyDown={onKey}
      onClick={() => (atEnd ? exit() : go(index + 1))}
      onContextMenu={(e) => {
        e.preventDefault()
        go(index - 1)
      }}
      className="fixed inset-0 z-[100] flex cursor-none items-center justify-center bg-black outline-none"
    >
      {black ? null : atEnd ? (
        <div className="text-center text-sm text-white/70">End of slide show. Click or press any key to exit.</div>
      ) : (
        <SlideView slide={pres.slides[index]} theme={theme} width={width} />
      )}
      <div aria-live="polite" className="absolute bottom-2 right-3 text-xs text-white/40">
        {atEnd ? '' : `${index + 1} / ${count}`}
      </div>
    </div>
  )
}
