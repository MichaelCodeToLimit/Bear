import { useEffect, useRef, useState } from 'react'
import { EyeOff, Sparkles } from 'lucide-react'
import type { SlidesStore } from './store'
import { SlideView } from './SlideView'
import { LAYOUTS, newSlide } from './layouts'
import type { Theme } from './themes'

interface ThumbnailsProps {
  store: SlidesStore
  version: number
  theme: Theme
  accent: string
  onMenu: (index: number, x: number, y: number) => void
}

/** Slide master view: the master, then each layout. */
function MasterList({ store, theme, accent }: { store: SlidesStore; theme: Theme; accent: string }) {
  const items = [{ id: 'master' as const, name: 'Slide master' }, ...LAYOUTS]
  return (
    <div role="listbox" aria-label="Master and layouts" className="w-[210px] shrink-0 overflow-y-auto border-r border-line bg-surface px-3 py-3 print:hidden">
      {items.map((it) => {
        const active = store.masterTarget === it.id
        const slide = it.id === 'master' ? { id: 'master', elements: store.pres.master?.elements ?? [], notes: '' } : newSlide(it.id, store.pres)
        return (
          <button key={it.id} role="option" aria-selected={active} aria-label={it.name} onClick={() => store.editMaster(it.id)} className={`mb-3 block text-left ${it.id === 'master' ? '' : 'pl-4'}`}>
            <div className="rounded-sm" style={{ outline: active ? `2.5px solid ${accent}` : '1px solid var(--line)', outlineOffset: active ? 1 : 0 }}>
              <SlideView slide={slide} theme={theme} width={it.id === 'master' ? 164 : 148} prompts />
            </div>
            <div className="mt-1 text-[11px] text-muted">{it.name}</div>
          </button>
        )
      })}
    </div>
  )
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

  if (store.masterTarget) return <MasterList store={store} theme={theme} accent={accent} />

  return (
    <div ref={listRef} role="listbox" aria-label="Slides" className="w-[210px] shrink-0 overflow-y-auto border-r border-line bg-surface px-3 py-3 print:hidden">
      {store.pres.slides.map((s, i) => (
        <div
          key={s.id}
          data-thumb={i}
          role="option"
          aria-selected={i === store.current}
          aria-label={`Slide ${i + 1}${s.hidden ? ' (hidden)' : ''}`}
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
          <div className="flex w-4 shrink-0 flex-col items-end gap-1 pt-0.5">
            <span className={`text-[11px] ${i === store.current ? 'font-semibold text-ink' : 'text-muted'} ${s.hidden ? 'line-through' : ''}`}>{i + 1}</span>
            {(s.transition || s.animations?.length) && <Sparkles size={10} className="text-muted" aria-label="Has motion" />}
            {s.hidden && <EyeOff size={10} className="text-muted" aria-label="Hidden" />}
          </div>
          <div
            className={`rounded-sm ${s.hidden ? 'opacity-50' : ''}`}
            style={{ outline: i === store.current ? `2.5px solid ${accent}` : '1px solid var(--line)', outlineOffset: i === store.current ? 1 : 0 }}
          >
            <SlideView slide={s} theme={theme} width={164} deck={{ pres: store.pres, index: i }} />
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
