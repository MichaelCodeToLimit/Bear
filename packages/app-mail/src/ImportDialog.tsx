import { useEffect, useState } from 'react'
import { BEAR_DOMAIN, bearUsernameProblem, type ImportJob, type MailAccount } from '@bear/core'
import { Button, Modal } from '@bear/ui'

interface Props {
  accent: string
  accounts: MailAccount[]
  /** Account to copy from (e.g. picked from its menu). */
  sourceId?: string
  /** Show this import's progress instead of the setup form. */
  jobId?: string
  onClose: () => void
  /** A new Bear Mail address was created; the app should show it. */
  onCreated: () => void
}

const RANGES = [
  { label: 'The last 3 months', months: 3 },
  { label: 'The last year', months: 12 },
  { label: 'The last 5 years', months: 60 },
  { label: 'Everything', months: 0 }
]

const STATE_TEXT: Record<ImportJob['state'], string> = {
  running: 'Copying your mail…',
  paused: 'Paused: Bear was closed before this finished.',
  syncing: 'Done. New mail keeps coming in every few minutes while Bear is open.',
  done: 'Done.',
  failed: 'Stopped because of a problem.',
  cancelled: 'Stopped. What was already copied stays.'
}

/** Copy an account's mail (Gmail, Outlook, …) into a Bear Mail address, and watch it happen. */
export function ImportDialog({ accent, accounts, sourceId, jobId, onClose, onCreated }: Props) {
  const sources = accounts.filter((a) => a.auth !== 'bear')
  const targets = accounts.filter((a) => a.auth === 'bear')
  const [source, setSource] = useState(sourceId ?? sources[0]?.id ?? '')
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [username, setUsername] = useState(() => (sources.find((a) => a.id === (sourceId ?? sources[0]?.id))?.email.split('@')[0] ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, ''))
  const [existing, setExisting] = useState(targets[0]?.email ?? '')
  const [months, setMonths] = useState(12)
  const [keepSyncing, setKeepSyncing] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [watching, setWatching] = useState<string | null>(jobId ?? null)
  const [job, setJob] = useState<ImportJob | null>(null)

  const from = sources.find((a) => a.id === source)
  const problem = mode === 'new' ? bearUsernameProblem(username) : existing ? null : 'Choose an address.'

  // Follow the import while it runs.
  useEffect(() => {
    if (!watching) return
    let stop = false
    const poll = async () => {
      const j = (await window.bear.mail.listImports()).find((x) => x.id === watching) ?? null
      if (!stop) setJob(j)
    }
    void poll()
    const t = setInterval(() => void poll(), 700)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [watching])

  const begin = async () => {
    setError(null)
    if (!from) return setError('Add your Gmail, Outlook or other account first, then come back here.')
    if (problem) return setError(problem)
    setBusy(true)
    const r = await window.bear.mail.startImport({
      sourceId: from.id,
      target: mode === 'new' ? { create: { username: username.trim(), name: from.name } } : { address: existing },
      since: months ? Date.now() - months * 30.44 * 86400_000 : null,
      keepSyncing
    })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    if (mode === 'new') onCreated()
    setWatching(r.value.id)
  }

  if (watching) {
    const total = job?.folders.reduce((n, f) => n + f.total, 0) ?? 0
    const done = job?.folders.reduce((n, f) => n + f.done, 0) ?? 0
    const pct = total ? Math.round((done / total) * 100) : 0
    const active = job?.state === 'running'
    return (
      <Modal
        title="Import into Bear Mail"
        width={520}
        onClose={onClose}
        footer={
          <>
            {job && (job.state === 'running' || job.state === 'syncing') && (
              <Button onClick={() => void window.bear.mail.cancelImport(job.id)}>{job.state === 'syncing' ? 'Stop bringing in new mail' : 'Stop import'}</Button>
            )}
            {job && (job.state === 'paused' || job.state === 'failed') && <Button onClick={() => void window.bear.mail.resumeImport(job.id)}>Carry on</Button>}
            <Button primary accent={accent} onClick={onClose}>{active ? 'Keep going in the background' : 'Close'}</Button>
          </>
        }
      >
        {!job ? <p className="text-sm text-muted">Loading…</p> : (
          <div className="space-y-3 text-[13px] text-ink">
            <p><strong>{job.sourceEmail}</strong> → <strong>{job.targetAddress}</strong></p>
            <div>
              <div role="progressbar" aria-label="Import progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded bg-hover">
                <div className="h-full rounded transition-[width]" style={{ width: `${active && !total ? 5 : job.state === 'running' ? pct : 100}%`, background: accent }} />
              </div>
              <p role="status" className="mt-1.5 text-[12px] text-muted">
                {active && !total ? 'Getting ready…' : `${STATE_TEXT[job.state]} ${total ? `${done.toLocaleString()} of ${total.toLocaleString()} messages.` : ''}`}
              </p>
              {job.error && <p role="alert" className="mt-1 rounded bg-red-50 px-2 py-1 text-[12px] text-red-800 dark:bg-red-950 dark:text-red-200">{job.error}</p>}
            </div>
            {job.folders.length > 0 && (
              <ul aria-label="Folders" className="max-h-44 overflow-y-auto rounded border border-line text-[12px]">
                {job.folders.map((f) => (
                  <li key={f.source} className="flex justify-between border-b border-line px-2 py-1 last:border-0">
                    <span>{f.target === 'INBOX' ? 'Inbox' : f.target}</span>
                    <span className="text-muted">{f.done.toLocaleString()} / {f.total.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[12px] text-muted">
              Mail people send to {job.sourceEmail} still arrives there.{job.keepSyncing ? ' Bear copies it into your Bear Mail address every few minutes while Bear is open.' : ''} To reply to people outside Bear Mail, use {job.sourceEmail}; Bear Mail can't reach other services yet.
            </p>
          </div>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      title="Import into Bear Mail"
      width={520}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary accent={accent} disabled={busy || !from} onClick={() => void begin()}>{busy ? 'Starting…' : 'Start import'}</Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] text-ink">
        <p className="text-muted">Copy all your mail and folders from another account into a Bear Mail address on this computer. Nothing is deleted from the other account.</p>
        {!sources.length ? (
          <p role="alert" className="rounded bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-100">Add your Gmail, Outlook or other account first (Add account), then come back here.</p>
        ) : (
          <label className="block text-xs text-muted">Copy mail from
            <select aria-label="Copy mail from" value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 h-8 w-full rounded border border-line bg-surface px-1 text-sm text-ink">
              {sources.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
            </select>
          </label>
        )}
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-xs text-muted">Into</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="into" checked={mode === 'new'} onChange={() => setMode('new')} /> A new Bear Mail address
          </label>
          {mode === 'new' && (
            <div className="ml-6 flex h-8 items-center rounded border border-line bg-surface focus-within:border-[var(--accent)]">
              <input aria-label="New address" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} placeholder="you" spellCheck={false} className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
              <span className="pr-2 text-sm text-muted">@{BEAR_DOMAIN}</span>
            </div>
          )}
          {targets.length > 0 && (
            <label className="flex items-center gap-2">
              <input type="radio" name="into" checked={mode === 'existing'} onChange={() => setMode('existing')} /> A Bear Mail address I already have
            </label>
          )}
          {mode === 'existing' && (
            <select aria-label="Existing address" value={existing} onChange={(e) => setExisting(e.target.value)} className="ml-6 h-8 w-[calc(100%-1.5rem)] rounded border border-line bg-surface px-1 text-sm">
              {targets.map((a) => <option key={a.id} value={a.email}>{a.email}</option>)}
            </select>
          )}
        </fieldset>
        <label className="block text-xs text-muted">Which mail
          <select aria-label="Which mail" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="mt-1 h-8 w-full rounded border border-line bg-surface px-1 text-sm text-ink">
            {RANGES.map((r) => <option key={r.months} value={r.months}>{r.label}</option>)}
          </select>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={keepSyncing} onChange={(e) => setKeepSyncing(e.target.checked)} className="mt-0.5" />
          <span>Keep bringing in new mail every few minutes<span className="block text-[12px] text-muted">So mail sent to {from?.email ?? 'your old address'} shows up in Bear Mail too.</span></span>
        </label>
        <p className="text-[12px] text-muted">Mail is copied to this computer. A big mailbox can take a while and use a lot of disk space; you can keep using Bear meanwhile.</p>
        {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      </div>
    </Modal>
  )
}
