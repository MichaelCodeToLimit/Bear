import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  shortcut?: string
  disabled?: boolean
  divider?: boolean
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  // Keep the menu on screen.
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - items.length * 30 - 16)

  return (
    <div ref={ref} role="menu" className="fixed z-50 w-56 rounded-md border border-line bg-surface py-1 text-[13px] text-ink shadow-xl" style={{ left, top }}>
      {items.map((item, i) => (
        <div key={i}>
          {item.divider && <hr className="my-1 border-line" />}
          <button
            role="menuitem"
            disabled={item.disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClose()
              item.onClick()
            }}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-hover disabled:opacity-40"
          >
            {item.label}
            {item.shortcut && <span className="text-[11px] text-muted">{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>
  )
}
