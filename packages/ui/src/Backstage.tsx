import { useEffect, type ReactNode } from 'react'
import { ArrowLeft, type LucideIcon } from 'lucide-react'

export interface BackstageItem {
  id: string
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
  dividerBefore?: boolean
}

interface BackstageProps {
  open: boolean
  onClose: () => void
  accent: string
  items: BackstageItem[]
  children?: ReactNode
}

/** Full-window "File" view: a coloured command column on the left and info on the right. */
export function Backstage({ open, onClose, accent, items, children }: BackstageProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex bg-surface print:hidden">
      <aside className="flex w-56 shrink-0 flex-col py-3 text-white" style={{ background: accent }}>
        <button onClick={onClose} className="mx-3 mb-4 flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15" title="Back">
          <ArrowLeft size={20} />
        </button>
        {items.map((item) => (
          <div key={item.id}>
            {item.dividerBefore && <hr className="mx-4 my-2 border-white/25" />}
            <button
              onClick={() => {
                item.onClick()
              }}
              disabled={item.disabled}
              className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-white/15 disabled:opacity-40"
            >
              <item.icon size={18} strokeWidth={1.7} />
              {item.label}
            </button>
          </div>
        ))}
      </aside>
      <main className="flex-1 overflow-auto p-10 text-ink">{children}</main>
    </div>
  )
}
