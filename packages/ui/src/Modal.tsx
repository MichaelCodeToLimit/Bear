import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export function Modal({ title, onClose, children, footer, width = 420 }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 print:hidden" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="rounded-lg border border-line bg-surface text-ink shadow-2xl"
        style={{ width }}
      >
        <h2 className="px-5 pb-2 pt-4 text-base font-semibold">{title}</h2>
        <div className="px-5 pb-4 text-sm">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Button({
  children,
  onClick,
  primary,
  accent,
  disabled
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
  accent?: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-3.5 py-1.5 text-sm disabled:opacity-40 ${primary ? 'text-white hover:brightness-110' : 'border border-line text-ink hover:bg-hover'}`}
      style={primary ? { background: accent ?? '#0f766e' } : undefined}
    >
      {children}
    </button>
  )
}
