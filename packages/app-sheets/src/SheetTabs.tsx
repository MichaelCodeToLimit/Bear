import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { SheetStore } from './store'

interface SheetTabsProps {
  store: SheetStore
  accent: string
  onError: (msg: string) => void
  onMenu: (index: number, x: number, y: number) => void
  renaming: number | null
  setRenaming: (i: number | null) => void
}

export function SheetTabs({ store, accent, onError, onMenu, renaming, setRenaming }: SheetTabsProps) {
  const [draft, setDraft] = useState('')
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  const finish = (i: number) => {
    const err = store.renameSheet(i, draft)
    if (err) onError(err)
    setRenaming(null)
  }

  return (
    <div className="flex h-8 shrink-0 items-stretch gap-0.5 overflow-x-auto border-t border-line bg-surface px-2 text-[13px] print:hidden">
      <button title="New sheet" aria-label="New sheet" onClick={() => store.addSheet()} className="my-1 flex w-7 items-center justify-center rounded text-muted hover:bg-hover hover:text-ink">
        <Plus size={16} />
      </button>
      {store.wb.sheets.map((s, i) => {
        const active = i === store.active
        return (
          <div
            key={s.id}
            draggable={renaming !== i}
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom !== null) store.moveSheet(dragFrom, i)
              setDragFrom(null)
            }}
            onClick={() => store.setActive(i)}
            onDoubleClick={() => {
              setDraft(s.name)
              setRenaming(i)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              store.setActive(i)
              onMenu(i, e.clientX, e.clientY)
            }}
            role="tab"
            aria-selected={active}
            className={`flex cursor-pointer items-center border-b-2 px-3 ${active ? 'bg-canvas font-semibold' : 'border-transparent text-muted hover:bg-hover hover:text-ink'}`}
            style={active ? { borderColor: accent, color: accent } : undefined}
          >
            {renaming === i ? (
              <input
                autoFocus
                aria-label="Sheet name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => finish(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') finish(i)
                  if (e.key === 'Escape') setRenaming(null)
                  e.stopPropagation()
                }}
                onFocus={(e) => e.target.select()}
                className="w-28 rounded border border-line bg-surface px-1 text-ink outline-none"
              />
            ) : (
              s.name
            )}
          </div>
        )
      })}
    </div>
  )
}
