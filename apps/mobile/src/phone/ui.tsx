import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, MoreVertical, type LucideIcon } from 'lucide-react'
import { goBack, pushBack } from './nav'

/** Building blocks for Bear's phone screens: app bars, lists, bottom sheets, menus and prompts. */

export type Icon = LucideIcon

// ---------- Screens ----------

interface PageProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Show a back arrow (Android's Back does the same). */
  back?: boolean
  actions?: ReactNode
  children: ReactNode
  /** Pinned under the content (toolbars, add-task bars). */
  bottom?: ReactNode
  fab?: ReactNode
  /** Coloured app bar for an app's top level. */
  tinted?: boolean
  /** Content scrolls (default) or fills the space (editors, canvases). */
  scroll?: boolean
  /** Replaces the title with an editable field. */
  titleEditor?: ReactNode
}

export function Page({ title, subtitle, back, actions, children, bottom, fab, tinted, scroll = true, titleEditor }: PageProps) {
  return (
    <div className="phone-page flex h-full flex-col bg-canvas">
      <header
        className={`phone-bar flex shrink-0 items-center gap-1 px-1 ${tinted ? 'bg-[var(--accent)] text-white' : 'border-b border-line bg-surface text-ink'}`}
      >
        {back ? <IconButton icon={ArrowLeft} label="Back" onClick={() => goBack()} /> : <div className="w-3" />}
        <div className="min-w-0 flex-1 px-1">
          {titleEditor ?? (
            <>
              <h1 className="truncate text-[19px] font-semibold leading-tight">{title}</h1>
              {subtitle && <div className={`truncate text-[12.5px] ${tinted ? 'text-white/80' : 'text-muted'}`}>{subtitle}</div>}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center">{actions}</div>
      </header>
      <main className={`relative min-h-0 flex-1 ${scroll ? 'overflow-y-auto overscroll-contain' : 'flex flex-col overflow-hidden'}`}>{children}</main>
      {fab && <div className="pointer-events-none absolute bottom-0 right-0 z-10 p-4 phone-fab-zone">{fab}</div>}
      {bottom}
    </div>
  )
}

export function IconButton({ icon: I, label, onClick, active, disabled, size = 22, className = '' }: { icon: Icon; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; size?: number; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-35 ${active ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : ''} ${className}`}
    >
      <I size={size} strokeWidth={2} />
    </button>
  )
}

export function Fab({ icon: I, label, onClick, extended = true }: { icon: Icon; label: string; onClick: () => void; extended?: boolean }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`pointer-events-auto flex h-14 items-center gap-2 rounded-2xl bg-[var(--accent)] text-white shadow-lg shadow-black/25 transition active:scale-95 ${extended ? 'px-5' : 'w-14 justify-center'}`}
    >
      <I size={22} />
      {extended && <span className="text-[15px] font-semibold">{label}</span>}
    </button>
  )
}

// ---------- Lists ----------

/** Fires after a finger rests on the element for half a second (and suppresses the tap that follows). */
export function useLongPress(onLong?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const start = useRef({ x: 0, y: 0 })
  if (!onLong) return { handlers: {}, fired }
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  return {
    fired,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false
        start.current = { x: e.clientX, y: e.clientY }
        cancel()
        timer.current = setTimeout(() => {
          fired.current = true
          navigator.vibrate?.(15)
          onLong()
        }, 500)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (Math.abs(e.clientX - start.current.x) + Math.abs(e.clientY - start.current.y) > 10) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault()
    }
  }
}

interface RowProps {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  /** Long-press, and the ⋮ button when `moreButton` is set. */
  onMore?: () => void
  moreButton?: boolean
  label?: string
}

export function Row({ leading, title, subtitle, trailing, onClick, onMore, moreButton, label }: RowProps) {
  const lp = useLongPress(onMore)
  return (
    <div className="flex items-center gap-1 pr-1 active:bg-hover" {...lp.handlers}>
      <button
        aria-label={label}
        onClick={() => {
          if (!lp.fired.current) onClick?.()
        }}
        className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3.5 py-2.5 pl-4 text-left"
      >
        {leading}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15.5px] text-ink">{title}</div>
          {subtitle && <div className="mt-0.5 truncate text-[13px] text-muted">{subtitle}</div>}
        </div>
        {trailing}
      </button>
      {moreButton && onMore && <IconButton icon={MoreVertical} label="More options" onClick={onMore} size={20} className="text-muted" />}
    </div>
  )
}

export function Section({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-3">
      {(title || action) && (
        <div className="flex items-center justify-between px-4 pb-1 pt-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
          {action}
        </div>
      )}
      <div className="mx-3 overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line/60">{children}</div>
    </section>
  )
}

export function Divider() {
  return <div className="ml-4 h-px bg-line/70" />
}

export function Empty({ icon: I, title, text, action }: { icon: Icon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-10 py-16 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
        <I size={36} />
      </div>
      <div className="text-[17px] font-semibold text-ink">{title}</div>
      {text && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Button({ children, onClick, kind = 'primary', disabled, className = '', submit }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'tonal' | 'text' | 'danger'; disabled?: boolean; className?: string; submit?: boolean }) {
  const styles = {
    primary: 'bg-[var(--accent)] text-white',
    tonal: 'bg-[var(--accent)]/12 text-[var(--accent)]',
    text: 'text-[var(--accent)]',
    danger: 'bg-red-600 text-white'
  }
  return (
    <button type={submit ? 'submit' : 'button'} disabled={disabled} onClick={onClick} className={`h-11 rounded-full px-5 text-[15px] font-semibold transition active:scale-95 disabled:opacity-40 ${styles[kind]} ${className}`}>
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-full bg-hover p-1">
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-8 flex-1 rounded-full px-3 text-[13.5px] font-medium transition ${o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const SWATCHES = ['#1f1f1f', '#6b7280', '#ffffff', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#db2777', '#92400e']

export function Swatches({ colors = SWATCHES, value, onPick, none }: { colors?: string[]; value?: string | null; onPick: (c: string | null) => void; none?: string }) {
  return (
    <div className="grid grid-cols-6 gap-3 px-4 py-2">
      {none && (
        <button onClick={() => onPick(null)} className="col-span-6 h-10 rounded-xl border border-line text-[14px] text-ink">
          {none}
        </button>
      )}
      {colors.map((c) => (
        <button
          key={c}
          aria-label={`Colour ${c}`}
          onClick={() => onPick(c)}
          className="flex aspect-square items-center justify-center rounded-full ring-1 ring-black/15"
          style={{ background: c }}
        >
          {value?.toLowerCase() === c.toLowerCase() && <Check size={18} className={c === '#ffffff' ? 'text-black' : 'text-white'} />}
        </button>
      ))}
    </div>
  )
}

// ---------- Bottom sheets ----------

/** A panel that slides up from the bottom. Closing (backdrop tap, Back) calls `onClose`. */
export function Sheet({ open, onClose, title, children, full }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; full?: boolean }) {
  const [shown, setShown] = useState(open)
  useEffect(() => {
    if (open) setShown(true)
    else {
      const t = setTimeout(() => setShown(false), 180)
      return () => clearTimeout(t)
    }
  }, [open])
  if (!shown) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? 'phone-fade-in' : 'opacity-0'}`} onClick={onClose} />
      <div
        className={`phone-sheet relative flex flex-col rounded-t-3xl bg-surface text-ink shadow-2xl transition-transform duration-200 ${full ? 'h-[92%]' : 'max-h-[85%]'} ${open ? 'phone-slide-up' : 'translate-y-full'}`}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line" />
        {title && <div className="shrink-0 px-5 pb-1 pt-3 text-[17px] font-semibold">{title}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">{children}</div>
      </div>
    </div>
  )
}

export interface MenuItem {
  label: string
  icon?: Icon
  danger?: boolean
  disabled?: boolean
  /** Shown on the right, e.g. a checkmark for the current choice. */
  checked?: boolean
  onClick: () => void
}

function MenuList({ items, onPick }: { items: MenuItem[]; onPick: (i: MenuItem) => void }) {
  return (
    <div className="py-1">
      {items.map((it) => (
        <button
          key={it.label}
          disabled={it.disabled}
          onClick={() => onPick(it)}
          className={`flex h-[52px] w-full items-center gap-4 px-5 text-left text-[15.5px] active:bg-hover disabled:opacity-40 ${it.danger ? 'text-red-600' : 'text-ink'}`}
        >
          {it.icon && <it.icon size={21} className={it.danger ? '' : 'text-muted'} />}
          <span className="flex-1">{it.label}</span>
          {it.checked && <Check size={20} className="text-[var(--accent)]" />}
        </button>
      ))}
    </div>
  )
}

// ---------- Overlays: menus, prompts, confirmations and toasts from anywhere ----------

type Overlay =
  | { kind: 'menu'; title?: string; items: MenuItem[] }
  | { kind: 'ask'; title: string; value: string; placeholder?: string; ok: string; resolve: (v: string | null) => void; multiline?: boolean; inputMode?: 'text' | 'decimal' | 'url' }
  | { kind: 'confirm'; title: string; text?: string; ok: string; resolve: (v: boolean) => void }
  | { kind: 'custom'; title?: string; render: (close: (after?: () => void) => void) => ReactNode; full?: boolean }

let setOverlayGlobal: ((o: Overlay | null) => void) | null = null
let currentOverlay: Overlay | null = null
let showToastGlobal: ((t: string) => void) | null = null

function showOverlay(o: Overlay) {
  if (currentOverlay) {
    // Swap one sheet for another without growing the Back stack.
    currentOverlay = o
    setOverlayGlobal?.(o)
    return
  }
  currentOverlay = o
  pushBack(() => {
    const was = currentOverlay
    currentOverlay = null
    setOverlayGlobal?.(null)
    if (was?.kind === 'ask') was.resolve(null)
    if (was?.kind === 'confirm') was.resolve(false)
  })
  setOverlayGlobal?.(o)
}

/** Close the open menu/prompt/sheet, then run `after` once it's gone. */
function closeOverlay(after?: () => void) {
  if (!currentOverlay) return after?.()
  const o = currentOverlay
  // Resolve before Back fires so the popstate handler doesn't resolve again with "cancelled".
  if (o.kind === 'ask' || o.kind === 'confirm') currentOverlay = { ...o, resolve: () => {} } as Overlay
  goBack(after)
}

export function menu(items: MenuItem[], title?: string) {
  showOverlay({ kind: 'menu', items: items.filter(Boolean), title })
}

export function ask(title: string, opts: { value?: string; placeholder?: string; ok?: string; multiline?: boolean; inputMode?: 'text' | 'decimal' | 'url' } = {}): Promise<string | null> {
  return new Promise((resolve) => showOverlay({ kind: 'ask', title, value: opts.value ?? '', placeholder: opts.placeholder, ok: opts.ok ?? 'OK', resolve, multiline: opts.multiline, inputMode: opts.inputMode }))
}

export function confirm(title: string, text?: string, ok = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => showOverlay({ kind: 'confirm', title, text, ok, resolve }))
}

/** A sheet with any content. `render` gets a close function; pass it what to do once closed. */
export function sheet(render: (close: (after?: () => void) => void) => ReactNode, title?: string, full?: boolean) {
  showOverlay({ kind: 'custom', render, title, full })
}

export function closeSheet(after?: () => void) {
  closeOverlay(after)
}

export function toast(text: string) {
  showToastGlobal?.(text)
}

/** Mount once at the root. */
export function OverlayHost() {
  const [o, setO] = useState<Overlay | null>(null)
  const [last, setLast] = useState<Overlay | null>(null)
  const [toastText, setToast] = useState<string | null>(null)
  useEffect(() => {
    setOverlayGlobal = (x) => {
      setO(x)
      if (x) setLast(x)
    }
    let t: ReturnType<typeof setTimeout>
    showToastGlobal = (text) => {
      setToast(text)
      clearTimeout(t)
      t = setTimeout(() => setToast(null), 2600)
    }
    return () => {
      setOverlayGlobal = null
      showToastGlobal = null
    }
  }, [])
  const shown = o ?? last
  return (
    <>
      <Sheet open={!!o} onClose={() => closeOverlay()} title={shown && 'title' in shown ? shown.title : undefined} full={shown?.kind === 'custom' && shown.full}>
        {shown?.kind === 'menu' && <MenuList items={shown.items} onPick={(it) => closeOverlay(it.onClick)} />}
        {shown?.kind === 'ask' && <AskBody key={shown.title + shown.value} o={shown} />}
        {shown?.kind === 'confirm' && (
          <div className="px-5 pb-3">
            {shown.text && <p className="text-[14.5px] leading-relaxed text-muted">{shown.text}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button kind="text" onClick={() => closeOverlay()}>Cancel</Button>
              <Button
                kind={shown.ok === 'Delete' ? 'danger' : 'primary'}
                onClick={() => {
                  const r = shown.resolve
                  closeOverlay(() => r(true))
                }}
              >
                {shown.ok}
              </Button>
            </div>
          </div>
        )}
        {shown?.kind === 'custom' && shown.render((after) => closeOverlay(after))}
      </Sheet>
      {toastText && (
        <div className="phone-toast pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-6">
          <div className="phone-fade-in rounded-xl bg-[#2b2b2e] px-4 py-3 text-[14px] text-white shadow-xl">{toastText}</div>
        </div>
      )}
    </>
  )
}

function AskBody({ o }: { o: Extract<Overlay, { kind: 'ask' }> }) {
  const [v, setV] = useState(o.value)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.focus()
      ref.current?.select()
    }, 220)
    return () => clearTimeout(t)
  }, [])
  const submit = () => {
    const r = o.resolve
    closeOverlay(() => r(v))
  }
  const cls = 'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[16px] text-ink outline-none focus:border-[var(--accent)]'
  return (
    <form
      className="px-5 pb-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {o.multiline ? (
        <textarea ref={ref} value={v} onChange={(e) => setV(e.target.value)} placeholder={o.placeholder} rows={5} className={cls} />
      ) : (
        <input ref={ref} value={v} onChange={(e) => setV(e.target.value)} placeholder={o.placeholder} inputMode={o.inputMode} className={cls} />
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button kind="text" onClick={() => closeOverlay()}>Cancel</Button>
        <Button submit>{o.ok}</Button>
      </div>
    </form>
  )
}

export function when(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const days = (now.getTime() - ms) / 86_400_000
  if (days < 6) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}
