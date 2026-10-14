import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, type LucideIcon } from 'lucide-react'

export interface RibbonTab {
  id: string
  label: string
}

interface RibbonProps {
  tabs: RibbonTab[]
  active: string
  onChange: (id: string) => void
  onFile: () => void
  accent: string
  children: ReactNode
}

/** Tabbed command ribbon: a "File" button that opens the backstage, then tabs, then the active tab's groups. */
export function Ribbon({ tabs, active, onChange, onFile, accent, children }: RibbonProps) {
  return (
    <div className="shrink-0 border-b border-line bg-surface print:hidden" style={{ ['--accent' as string]: accent }}>
      <nav className="flex items-end gap-1 px-2 pt-1 text-[13px]">
        <button
          onClick={onFile}
          className="rounded-t px-3 py-1.5 font-medium text-white"
          style={{ background: accent }}
        >
          File
        </button>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            // Switching tabs must not pull focus out of the document.
            onMouseDown={(e) => e.preventDefault()}
            className={`relative px-3 py-1.5 hover:bg-hover ${t.id === active ? 'font-semibold text-[var(--accent)]' : 'text-ink'}`}
          >
            {t.label}
            {t.id === active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-[var(--accent)]" />}
          </button>
        ))}
      </nav>
      <div className="flex h-[92px] items-stretch gap-0 overflow-x-auto overflow-y-hidden px-2 py-1">{children}</div>
    </div>
  )
}

export function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex shrink-0 flex-col border-r border-line px-2 last:border-r-0">
      <div className="flex flex-1 items-center gap-1">{children}</div>
      <div className="pb-0.5 text-center text-[11px] text-muted">{label}</div>
    </section>
  )
}

/** Stack small buttons into rows inside a group. */
export function RibbonRows({ children }: { children: ReactNode }) {
  return <div className="flex flex-col justify-center gap-1">{children}</div>
}

export function RibbonRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

interface RibbonButtonProps {
  icon: LucideIcon
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  large?: boolean
  showLabel?: boolean
  shortcut?: string
}

export function RibbonButton({ icon: Icon, label, onClick, active, disabled, large, showLabel, shortcut }: RibbonButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label
  if (large) {
    return (
      <button
        title={title}
        onClick={onClick}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        className={`flex h-[64px] min-w-[52px] flex-col items-center justify-center gap-1 rounded px-1.5 text-[11px] leading-tight hover:bg-hover disabled:opacity-40 ${active ? 'bg-active' : ''}`}
      >
        <Icon size={24} strokeWidth={1.6} className="text-[var(--accent)]" />
        <span className="max-w-[72px] text-center text-ink">{label}</span>
      </button>
    )
  }
  return (
    <button
      title={title}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      // Keep the editor's selection when clicking ribbon buttons.
      onMouseDown={(e) => e.preventDefault()}
      className={`flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1 text-[12px] text-ink hover:bg-hover disabled:opacity-40 ${active ? 'bg-active' : ''}`}
    >
      <Icon size={16} strokeWidth={1.8} />
      {showLabel && <span>{label}</span>}
    </button>
  )
}

interface RibbonSelectProps {
  value: string
  options: { value: string; label: string; style?: React.CSSProperties }[]
  onChange: (value: string) => void
  title: string
  width?: number
}

export function RibbonSelect({ value, options, onChange, title, width = 120 }: RibbonSelectProps) {
  return (
    <select
      title={title}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width }}
      className="h-7 rounded border border-line bg-surface px-1 text-[12px] text-ink outline-none focus:border-[var(--accent)]"
    >
      {!options.some((o) => o.value === value) && <option value={value}>{value || '—'}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} style={o.style}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

const SWATCHES = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
  '#b91c1c', '#c2410c', '#a16207', '#15803d', '#0f766e', '#1d4ed8', '#6d28d9', '#be185d',
  '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#99f6e4', '#bfdbfe', '#ddd6fe', '#fbcfe8'
]

/**
 * A floating panel anchored under a trigger, rendered at the document root so the ribbon's
 * scroll area can't clip it. Closes on outside click, resize and window blur.
 */
export function usePopover(width: number) {
  const [pos, setPos] = useState<{ left: number; top: number; accent: string } | null>(null)
  const anchor = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!anchor.current?.contains(t) && !panel.current?.contains(t)) setPos(null)
    }
    const dismiss = () => setPos(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', dismiss)
    window.addEventListener('blur', dismiss)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('keydown', onKey)
    }
  }, [pos])

  const toggle = () => {
    if (pos) return setPos(null)
    const r = anchor.current!.getBoundingClientRect()
    // Keep the panel inside the window.
    // The panel renders outside the app root, so carry the app's accent colour along.
    const accent = getComputedStyle(anchor.current!).getPropertyValue('--accent').trim()
    setPos({ left: Math.max(4, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 4, accent })
  }

  const close = () => setPos(null)

  const render = (label: string, content: ReactNode) =>
    pos &&
    createPortal(
      <div
        ref={panel}
        role="dialog"
        aria-label={label}
        className="fixed z-50 rounded-md border border-line bg-surface p-2 text-ink shadow-lg"
        style={{ left: pos.left, top: pos.top, width, ['--accent' as string]: pos.accent || undefined }}
      >
        {content}
      </div>,
      document.body
    )

  return { open: !!pos, anchor, toggle, close, render }
}

interface ColorButtonProps {
  icon: LucideIcon
  label: string
  color: string
  onPick: (color: string | null) => void
}

/** Icon button with a colour bar underneath and a swatch dropdown. */
export function ColorButton({ icon: Icon, label, color, onPick }: ColorButtonProps) {
  const pop = usePopover(188)
  const pick = (c: string | null) => {
    onPick(c)
    pop.close()
  }

  return (
    <div ref={pop.anchor} className="relative flex">
      <button
        title={label}
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPick(color)}
        className="flex h-7 w-7 flex-col items-center justify-center rounded-l text-ink hover:bg-hover"
      >
        <Icon size={15} strokeWidth={1.8} />
        <span className="mt-0.5 h-[3px] w-4 rounded" style={{ background: color }} />
      </button>
      <button
        title={`${label} options`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={pop.toggle}
        className="flex h-7 w-3.5 items-center justify-center rounded-r text-ink hover:bg-hover"
      >
        <ChevronDown size={11} />
      </button>
      {pop.render(
        `${label} colors`,
        <>
          <div className="grid grid-cols-6 gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                title={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                className="h-6 w-6 rounded border border-line"
                style={{ background: c }}
              />
            ))}
          </div>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(null)}
            className="mt-2 w-full rounded px-2 py-1 text-left text-xs text-ink hover:bg-hover"
          >
            No color
          </button>
        </>
      )}
    </div>
  )
}

interface RibbonDropdownProps {
  icon: LucideIcon
  label: string
  /** Panel width in pixels. */
  width: number
  active?: boolean
  /** Panel content; call `close` after an action. */
  children: (close: () => void) => ReactNode
}

/** A large ribbon button that opens a panel (galleries, pickers). */
export function RibbonDropdown({ icon: Icon, label, width, active, children }: RibbonDropdownProps) {
  const pop = usePopover(width)
  return (
    <div ref={pop.anchor} className="flex">
      <button
        title={label}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={pop.toggle}
        className={`flex h-[64px] min-w-[52px] flex-col items-center justify-center gap-0.5 rounded px-1.5 text-[11px] leading-tight hover:bg-hover ${active || pop.open ? 'bg-active' : ''}`}
      >
        <Icon size={24} strokeWidth={1.6} className="text-[var(--accent)]" />
        <span className="flex items-center gap-0.5 text-ink">
          {label}
          <ChevronDown size={10} />
        </span>
      </button>
      {pop.render(label, children(pop.close))}
    </div>
  )
}
