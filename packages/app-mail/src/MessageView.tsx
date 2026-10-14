import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Download, File, Flag, Forward, ImageOff, Mail, MailOpen, Paperclip, Reply, ReplyAll, Trash2 } from 'lucide-react'
import { appForFile, displayName, formatAddress, type Address, type MailMessage } from '@bear/core'
import { cleanEmail } from './sanitize'

interface MessageViewProps {
  message: MailMessage
  accent: string
  onReply: (mode: 'reply' | 'replyAll' | 'forward') => void
  onDelete: () => void
  onArchive: () => void
  onToggleFlag: () => void
  onMarkUnread: () => void
  onAttachment: (id: string, action: 'save' | 'open') => void
}

const initials = (a: Address | undefined) => displayName(a).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

export function MessageView({ message: m, accent, onReply, onDelete, onArchive, onToggleFlag, onMarkUnread, onAttachment }: MessageViewProps) {
  const [allowImages, setAllowImages] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(200)
  const clean = useMemo(() => cleanEmail(m.html, m.text, allowImages), [m.html, m.text, allowImages])

  useEffect(() => setAllowImages(false), [m.uid])

  // Size the frame to its content. The frame can't run scripts, so reading its layout is safe.
  const fit = () => {
    const doc = frame.current?.contentDocument
    if (doc) setHeight(Math.max(120, doc.documentElement.scrollHeight + 4))
  }

  const files = m.attachments.filter((a) => !a.inline)
  const Btn = ({ icon: Icon, label, onClick }: { icon: typeof Reply; label: string; onClick: () => void }) => (
    <button title={label} aria-label={label} onClick={onClick} className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[13px] text-ink hover:bg-hover">
      <Icon size={15} className="text-[var(--accent)]" /> <span className="hidden xl:inline">{label}</span>
    </button>
  )

  return (
    <article aria-label="Message" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-line px-3 py-1.5">
        <Btn icon={Reply} label="Reply" onClick={() => onReply('reply')} />
        <Btn icon={ReplyAll} label="Reply all" onClick={() => onReply('replyAll')} />
        <Btn icon={Forward} label="Forward" onClick={() => onReply('forward')} />
        <span className="mx-1 h-5 w-px bg-line" />
        <Btn icon={Archive} label="Archive" onClick={onArchive} />
        <Btn icon={Trash2} label="Delete" onClick={onDelete} />
        <Btn icon={Flag} label={m.flagged ? 'Unflag' : 'Flag'} onClick={onToggleFlag} />
        <Btn icon={m.seen ? Mail : MailOpen} label="Mark unread" onClick={onMarkUnread} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <header className="px-6 pb-3 pt-5">
          <h1 className="text-xl font-semibold text-ink">{m.subject || '(no subject)'}</h1>
          <div className="mt-3 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: accent }}>{initials(m.from[0])}</div>
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">{m.from.map(formatAddress).join(', ')}</span>
                <span className="text-muted">{new Date(m.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              <div className="truncate text-muted">To: {m.to.map(formatAddress).join(', ') || '—'}</div>
              {m.cc.length > 0 && <div className="truncate text-muted">Cc: {m.cc.map(formatAddress).join(', ')}</div>}
            </div>
          </div>
          {files.length > 0 && (
            <ul aria-label="Attachments" className="mt-4 flex flex-wrap gap-2">
              {files.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px]">
                  <File size={15} className="text-muted" />
                  <span className="max-w-[220px] truncate text-ink">{a.filename}</span>
                  <span className="text-muted">{a.size < 1024 * 1024 ? `${Math.max(1, Math.round(a.size / 1024))} KB` : `${(a.size / 1024 / 1024).toFixed(1)} MB`}</span>
                  {appForFile(a.filename) && <button onClick={() => onAttachment(a.id, 'open')} className="text-[var(--accent)] hover:underline">Open</button>}
                  <button aria-label={`Save ${a.filename}`} onClick={() => onAttachment(a.id, 'save')} className="rounded p-0.5 hover:bg-hover"><Download size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </header>
        {clean.remoteImages > 0 && !allowImages && (
          <div role="note" className="mx-6 mb-2 flex items-center gap-2 rounded bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <ImageOff size={14} /> Pictures from the internet were blocked to protect your privacy.
            <button onClick={() => setAllowImages(true)} className="font-medium underline">Show pictures</button>
          </div>
        )}
        <iframe
          ref={frame}
          title="Message body"
          // No allow-scripts: email code never runs. allow-same-origin only lets Bear measure the height.
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          srcDoc={clean.doc}
          onLoad={fit}
          className="block w-full border-0"
          style={{ height }}
        />
        {m.hasAttachments && !files.length && <p className="px-6 pb-4 text-[12px] text-muted"><Paperclip size={12} className="inline" /> Inline pictures only</p>}
      </div>
    </article>
  )
}
