import { useState } from 'react'
import { BEAR_DOMAIN, bearUsernameProblem, type MailAccount } from '@bear/core'
import { Button, Modal } from '@bear/ui'

interface Props {
  accent: string
  onClose: () => void
  onCreated: (a: MailAccount) => void
  /** Bring an existing account's mail into Bear Mail instead. */
  onImport?: () => void
}

/** Create a new name@bear.com address, hosted by Bear itself. */
export function BearAccountDialog({ accent, onClose, onCreated, onImport }: Props) {
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problem = bearUsernameProblem(username)
  const address = `${username.trim().toLowerCase() || 'you'}@${BEAR_DOMAIN}`

  const create = async () => {
    setTouched(true)
    setError(null)
    if (problem) return
    setBusy(true)
    const r = await window.bear.mail.createBearAccount({ username: username.trim(), name: name.trim() })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onCreated(r.value)
  }

  return (
    <Modal
      title="Create a Bear Mail address"
      width={480}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary accent={accent} disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create address'}</Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void create() }}>
        <label className="block text-xs text-muted">Your name (shown to people you email)
          <input autoFocus aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
        </label>
        <label className="block text-xs text-muted">Choose your address
          <div className="mt-1 flex h-8 items-center rounded border border-line bg-surface focus-within:border-[var(--accent)]">
            <input
              aria-label="User name"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
              onBlur={() => setTouched(true)}
              placeholder="you"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-ink outline-none"
            />
            <span className="pr-2 text-sm text-muted">@{BEAR_DOMAIN}</span>
          </div>
        </label>
        {touched && problem ? (
          <p className="text-[12px] text-red-700 dark:text-red-300">{problem}</p>
        ) : (
          <p className="text-[12px] text-muted">Your address will be <strong className="text-ink">{address}</strong>.</p>
        )}
        {onImport && (
          <button type="button" onClick={onImport} className="w-full rounded border border-dashed border-[var(--accent)] px-3 py-2 text-left text-[13px] text-ink hover:bg-hover">
            <strong className="text-[var(--accent)]">Already use Gmail or Outlook?</strong> Import its mail into a Bear Mail address instead.
          </button>
        )}
        <div className="rounded border border-line bg-canvas px-3 py-2 text-[12px] text-muted">
          Bear Mail addresses live on this computer for now. You can email any other Bear Mail address created here.
          Sending to Gmail, Outlook and other services needs a Bear Mail server on the internet, which is coming later.
        </div>
        {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
