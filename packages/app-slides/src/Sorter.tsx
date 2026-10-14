import { useState } from 'react'
import type { SlidesStore } from './store'
import { SlideView } from './SlideView'
import type { Theme } from './themes'

/** Slide sorter: a grid of all slides; drag to reorder, double-click to open one. */
export function Sorter({ store, theme, accent, onOpen }: { store: SlidesStore; theme: Theme; accent: string; onOpen: (i: number) => void }) {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  return (
    <div className="min-h-0 flex-1 overflow-auto p-8 print:hidden" role="listbox" aria-label="Slide sorter">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
        {store.pres.slides.map((s, i) => (
          <div
            key={s.id}
            role="option"
            aria-selected={i === store.current}
            aria-label={`Slide ${i + 1}`}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom !== null) store.moveSlide(dragFrom, i)
              setDragFrom(null)
            }}
            onClick={() => store.goto(i)}
            onDoubleClick={() => onOpen(i)}
            className="cursor-pointer"
          >
            <div className="rounded-sm shadow" style={{ outline: i === store.current ? `3px solid ${accent}` : '1px solid var(--line)', outlineOffset: 2 }}>
              <SlideView slide={s} theme={theme} width={240} />
            </div>
            <div className="mt-1.5 text-center text-xs text-muted">{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
