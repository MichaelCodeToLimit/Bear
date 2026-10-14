import { useRef, useState } from 'react'
import { Paperclip, Send, Trash2, X } from 'lucide-react'
import type { MailAccount, OutgoingAttachment } from '@bear/core'
import { PageEditor } from '@bear/app-write'
import { MAX_ATTACHMENTS_BYTES, base64Size, htmlToText, recipients, type Draft } from './compose'

interface ComposerProps {
  draft: Draft
  accounts: MailAccount[]
  accent: string
  onChange: (d: Draft) => void
  /** Resolves with an error message, or null when sent. */
  onSend: (d: Draft, msg: { to: import('@bear/core').Address[]; cc: import('@bear/core').Address[]; bcc: import('@bear/core').Address[]; text: string }) => Promise<string | null>
  onDiscard: () => void
  onClose: () => void
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

export function Composer({ draft, accounts, accent, onChange, onSend, onDiscard, onClose }: ComposerProps) {
  const [showCc, setShowCc] = useState(!!draft.cc || !!draft.bcc)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch, updated: Date.now() })
  const total = draft.attachments.reduce((n, a) => n + base64Size(a.content), 0)

  const send = async () => {
    const r = recipients(draft)
    if (!r.ok) return setError(r.error)
    if (total > MAX_ATTACHMENTS_BYTES) return setError('Attachments are larger than 25 MB, which most mail servers refuse.')
    if (!draft.subject.trim() && !window.confirm('Send without a subject?')) return
    setError(null)
    setSending(true)
    const err = await onSend(draft, { to: r.to, cc: r.cc, bcc: r.bcc, text: htmlToText(draft.html) })
    setSending(false)
    if (err) setError(err)
  }

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const added: OutgoingAttachment[] = []
    for (const f of Array.from(files)) added.push({ filename: f.name, contentType: f.type || 'application/octet-stream', content: await readBase64(f) })
    set({ attachments: [...draft.attachments, ...added] })
  }

  const field = (label: string, key: 'to' | 'cc' | 'bcc') => (
    <label className="flex items-center gap-2 border-b border-line px-4 py-1.5 text-[13px]">
      <span className="w-10 text-muted">{label}</span>
      <input aria-label={label} value={draft[key]} onChange={(e) => set({ [key]: e.target.value })} placeholder={key === 'to' ? 'name@example.com, …' : ''} className="h-7 min-w-0 flex-1 bg-transparent text-ink outline-none" />
      {key === 'to' && !showCc && <button onClick={() => setShowCc(true)} className="text-[12px] text-muted hover:text-ink">Cc/Bcc</button>}
    </label>
  )

  return (
    <section
      aria-label="New message"
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          void send()
        }
      }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
        <button onClick={() => void send()} disabled={sending} className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60" style={{ background: accent }} title="Send (Ctrl+Enter)">
          <Send size={14} /> {sending ? 'Sending…' : 'Send'}
        </button>
        <button onClick={() => fileInput.current?.click()} className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-ink hover:bg-hover"><Paperclip size={14} className="text-[var(--accent)]" /> Attach</button>
        <button onClick={onDiscard} className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-ink hover:bg-hover"><Trash2 size={14} className="text-[var(--accent)]" /> Discard</button>
        <span className="ml-auto text-[11px] text-muted">Draft saved on this computer</span>
        <button aria-label="Close" onClick={onClose} className="rounded p-1 text-muted hover:bg-hover hover:text-ink"><X size={15} /></button>
      </div>
      {error && <p role="alert" className="bg-red-50 px-4 py-2 text-[13px] text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {accounts.length > 1 && (
        <label className="flex items-center gap-2 border-b border-line px-4 py-1.5 text-[13px]">
          <span className="w-10 text-muted">From</span>
          <select aria-label="From" value={draft.accountId} onChange={(e) => set({ accountId: e.target.value })} className="bg-transparent text-ink outline-none">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} &lt;{a.email}&gt;</option>)}
          </select>
        </label>
      )}
      {field('To', 'to')}
      {showCc && field('Cc', 'cc')}
      {showCc && field('Bcc', 'bcc')}
      <input aria-label="Subject" value={draft.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Subject" className="border-b border-line bg-transparent px-4 py-2.5 text-[15px] text-ink outline-none" />
      {draft.attachments.length > 0 && (
        <ul aria-label="Attachments" className="flex flex-wrap gap-2 border-b border-line px-4 py-2">
          {draft.attachments.map((a, i) => (
            <li key={i} className="flex items-center gap-2 rounded border border-line bg-surface px-2 py-1 text-[12px]">
              <Paperclip size={12} className="text-muted" /> <span className="max-w-[200px] truncate text-ink">{a.filename}</span>
              <span className="text-muted">{size(base64Size(a.content))}</span>
              <button aria-label={`Remove ${a.filename}`} onClick={() => set({ attachments: draft.attachments.filter((_, j) => j !== i) })}><X size={12} /></button>
            </li>
          ))}
          {total > MAX_ATTACHMENTS_BYTES && <li className="text-[12px] text-red-600">Over 25 MB</li>}
        </ul>
      )}
      <div className="min-h-0 flex-1 bg-paper text-[#1f1f1f]">
        <PageEditor
          key={draft.id}
          html={draft.html}
          placeholder="Write your message…"
          onError={setError}
          onChange={(html) => set({ html })}
          className="h-full [&_.page-doc]:px-4 [&_.page-doc]:py-3"
        />
      </div>
      <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
    </section>
  )
}
