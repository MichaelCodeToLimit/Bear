import { useEffect, useRef, useState } from 'react'
import type { SlidesStore } from './store'
import { SlideView } from './SlideView'
import type { Theme } from './themes'

interface ThumbnailsProps {
  store: SlidesStore
  version: number
  theme: Theme
  accent: string
  onMenu: (index: number, x: number, y: number) => void
}

/** The slide strip on the left: click to open, drag to reorder, right-click for slide commands. */
export function Thumbnails({ store, version, theme, accent, onMenu }: ThumbnailsProps) {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the current slide's thumbnail in view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-thumb="${store.current}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [store.current, version]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={listRef} role="listbox" aria-label="Slides" className="w-[210px] shrink-0 overflow-y-auto border-r border-line bg-surface px-3 py-3 print:hidden">
      {store.pres.slides.map((s, i) => (
        <div
          key={s.id}
          data-thumb={i}
          role="option"
          aria-selected={i === store.current}
          aria-label={`Slide ${i + 1}`}
          draggable
          onDragStart={() => setDragFrom(i)}
          onDragOver={(e) => {
            e.preventDefault()
            const r = e.currentTarget.getBoundingClientRect()
            setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1)
          }}
          onDrop={() => {
            if (dragFrom !== null && dropAt !== null) store.moveSlide(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt)
            setDragFrom(null)
            setDropAt(null)
          }}
          onDragEnd={() => {
            setDragFrom(null)
            setDropAt(null)
          }}
          onClick={() => {
            store.goto(i)
            ;(document.querySelector('[data-slide-stage]') as HTMLElement | null)?.focus()
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            store.goto(i)
            onMenu(i, e.clientX, e.clientY)
          }}
          className="relative mb-3 flex cursor-pointer gap-2"
        >
          {dropAt === i && dragFrom !== null && <div className="absolute -top-2 left-5 right-0 h-0.5 rounded" style={{ background: accent }} />}
          <span className={`w-4 shrink-0 pt-0.5 text-right text-[11px] ${i === store.current ? 'font-semibold text-ink' : 'text-muted'}`}>{i + 1}</span>
          <div
            className="rounded-sm"
            style={{ outline: i === store.current ? `2.5px solid ${accent}` : '1px solid var(--line)', outlineOffset: i === store.current ? 1 : 0 }}
          >
            <SlideView slide={s} theme={theme} width={164} />
          </div>
          {s.notes && <span title="Has speaker notes" className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
          {dropAt === store.pres.slides.length && i === store.pres.slides.length - 1 && dragFrom !== null && (
            <div className="absolute -bottom-2 left-5 right-0 h-0.5 rounded" style={{ background: accent }} />
          )}
        </div>
      ))}
    </div>
  )
}
