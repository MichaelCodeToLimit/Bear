import { useState } from 'react'
import { EyeOff, Timer } from 'lucide-react'
import type { SlidesStore } from './store'
import { SlideView } from './SlideView'
import type { Theme } from './themes'
import { formatDuration, paceReport } from './pace'

/** Slide sorter: a grid of all slides; drag to reorder, double-click to open one. Shows rehearsed times. */
export function Sorter({ store, theme, accent, onOpen }: { store: SlidesStore; theme: Theme; accent: string; onOpen: (i: number) => void }) {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const timings = Object.fromEntries(store.pres.slides.filter((s) => s.timing).map((s) => [s.id, s.timing!]))
  const pace = new Map(paceReport(store.pres, timings, store.pres.show?.targetMinutes).rows.map((r) => [r.slideId, r.pace]))
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
            <div className={`w-fit rounded-sm shadow ${s.hidden ? 'opacity-50' : ''}`} style={{ outline: i === store.current ? `3px solid ${accent}` : '1px solid var(--line)', outlineOffset: 2 }}>
              <SlideView slide={s} theme={theme} width={240} deck={{ pres: store.pres, index: i }} />
            </div>
            <div className="mt-1.5 flex w-[240px] items-center justify-between text-xs text-muted">
              <span className="flex items-center gap-1">{i + 1}{s.hidden && <EyeOff size={11} aria-label="Hidden" />}</span>
              {s.timing !== undefined && (
                <span data-timing={i} className={`flex items-center gap-1 ${pace.get(s.id) === 'rushed' ? 'text-amber-700' : pace.get(s.id) === 'lingered' ? 'text-red-700' : ''}`}>
                  <Timer size={11} /> {formatDuration(s.timing)}{pace.get(s.id) === 'rushed' ? ' · rushed' : pace.get(s.id) === 'lingered' ? ' · too long' : ''}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
