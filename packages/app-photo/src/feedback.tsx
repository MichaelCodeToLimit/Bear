import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Button, Modal } from '@bear/ui'

export interface Notices {
  items: { id: number; text: string }[]
  /** Show a message in the notice bar (the same text is shown only once at a time). */
  notify: (text: string) => void
  dismiss: (id: number) => void
  clear: () => void
}

export function useNotices(): Notices {
  const [items, setItems] = useState<{ id: number; text: string }[]>([])
  const next = useRef(1)
  const notify = useCallback((text: string) => {
    setItems((list) => (list.some((n) => n.text === text) ? list : [...list, { id: next.current++, text }]))
  }, [])
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((n) => n.id !== id)), [])
  const clear = useCallback(() => setItems([]), [])
  return { items, notify, dismiss, clear }
}

/** Dismissible notices (PSD parts that didn't carry over, slower drawing mode…). */
export function NoticeBar({ notices }: { notices: Notices }) {
  if (!notices.items.length) return null
  return (
    <div data-testid="photo-notice" role="status" className="shrink-0 bg-amber-50 text-[13px] text-amber-900 print:hidden dark:bg-amber-950 dark:text-amber-100">
      {notices.items.map((n) => (
        <div key={n.id} className="flex items-center justify-between gap-3 px-4 py-1.5">
          <span>{n.text}</span>
          <button onClick={() => notices.dismiss(n.id)} className="rounded px-1 hover:bg-black/10" aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  )
}

export interface ConfirmOptions {
  title: string
  body: ReactNode
  confirm: string
  cancel?: string
}

/** A promise-based two-button dialog: `ask()` resolves true for the first button, false otherwise. */
export function useConfirm(accent: string) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), [])
  const answer = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }
  const dialog = pending && (
    <Modal
      title={pending.title}
      onClose={() => answer(false)}
      footer={
        <>
          <Button primary accent={accent} onClick={() => answer(true)}>{pending.confirm}</Button>
          <Button onClick={() => answer(false)}>{pending.cancel ?? 'Cancel'}</Button>
        </>
      }
    >
      {pending.body}
    </Modal>
  )
  return { ask, dialog }
}
