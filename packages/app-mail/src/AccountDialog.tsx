import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, ShieldAlert } from 'lucide-react'
import {
  guessProvider, isEmail, isLocalHost,
  type AuthMethod, type MailAccount, type MailAccountInput, type Security, type ServerSettings
} from '@bear/core'
import { Button, Modal } from '@bear/ui'

interface Props {
  accent: string
  /** Editing an existing account (password may be left blank to keep it). */
  existing?: MailAccount
  onClose: () => void
  onSaved: (a: MailAccount) => void
  openSettings: () => void
  /** Offered to people without an email address yet. */
  createBear?: () => void
}

const SECURITY: { value: Security; label: string }[] = [
  { value: 'tls', label: 'SSL/TLS' },
  { value: 'starttls', label: 'STARTTLS' },
  { value: 'none', label: 'None (local servers only)' }
]

function ServerFields({ label, value, onChange }: { label: string; value: ServerSettings; onChange: (v: ServerSettings) => void }) {
  return (
    <fieldset className="grid grid-cols-[1fr_80px_150px] gap-2">
      <legend className="mb-1 text-xs font-medium text-muted">{label}</legend>
      <input aria-label={`${label} server`} value={value.host} onChange={(e) => onChange({ ...value, host: e.target.value.trim() })} className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
      <input aria-label={`${label} port`} type="number" value={value.port} onChange={(e) => onChange({ ...value, port: Number(e.target.value) })} className="h-8 rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
      <select aria-label={`${label} security`} value={value.security} onChange={(e) => onChange({ ...value, security: e.target.value as Security })} className="h-8 rounded border border-line bg-surface px-1 text-sm text-ink outline-none">
        {SECURITY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </fieldset>
  )
}

export function AccountDialog({ accent, existing, onClose, onSaved, openSettings, createBear }: Props) {
  const [email, setEmail] = useState(existing?.email ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [password, setPassword] = useState('')
  const [advanced, setAdvanced] = useState(!!existing)
  const [username, setUsername] = useState<string | null>(existing?.username ?? null)
  const [imap, setImap] = useState<ServerSettings | null>(existing?.imap ?? null)
  const [smtp, setSmtp] = useState<ServerSettings | null>(existing?.smtp ?? null)
  const [auth, setAuth] = useState<AuthMethod>(existing?.auth ?? 'password')
  const [oauthSession, setOauthSession] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'signin' | 'save'>(null)
  const [error, setError] = useState<string | null>(null)

  // Until the user edits them, server settings follow the email address.
  const guess = useMemo(() => guessProvider(email), [email])
  const effImap = imap ?? guess.preset.imap
  const effSmtp = smtp ?? guess.preset.smtp
  const effUser = username ?? email.trim()
  const oauthProvider = guess.preset.oauth
  const oauthOnly = guess.preset.oauthOnly
  const insecure = (s: ServerSettings) => s.security === 'none' && !isLocalHost(s.host)

  const input = (): MailAccountInput => ({
    name: name.trim() || email.split('@')[0],
    email: email.trim(),
    username: effUser,
    auth,
    password: auth === 'password' ? password : undefined,
    oauthSession: oauthSession ?? undefined,
    imap: effImap,
    smtp: effSmtp
  })

  const signIn = async (provider: 'microsoft' | 'google') => {
    setBusy('signin')
    setError(null)
    const r = await window.bear.mail.signIn(provider)
    setBusy(null)
    if (!r.ok) return setError(r.error)
    setOauthSession(r.value.session)
    setAuth(provider === 'google' ? 'oauth-google' : 'oauth-microsoft')
    if (r.value.email) setEmail(r.value.email)
    if (r.value.name && !name) setName(r.value.name)
    setUsername(r.value.email || null)
  }

  const save = async () => {
    setError(null)
    if (!isEmail(email)) return setError('Enter a valid email address.')
    if (auth === 'password' && !password && !existing) return setError(oauthOnly ? 'This provider needs "Sign in with Microsoft".' : 'Enter your password or app password.')
    if (insecure(effImap) || insecure(effSmtp)) return setError('Unencrypted connections are only allowed to servers on this computer. Choose SSL/TLS or STARTTLS.')
    setBusy('save')
    const r = await window.bear.mail.saveAccount(input(), existing?.id)
    setBusy(null)
    if (!r.ok) return setError(r.error)
    onSaved(r.value)
  }

  return (
    <Modal
      title={existing ? 'Edit account' : 'Add an email account'}
      width={520}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary accent={accent} disabled={busy !== null} onClick={() => void save()}>{busy === 'save' ? 'Connecting…' : existing ? 'Save' : 'Connect'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {createBear && !existing && (
          <button onClick={createBear} className="w-full rounded border border-dashed border-[var(--accent)] px-3 py-2 text-left text-[13px] text-ink hover:bg-hover">
            <strong className="text-[var(--accent)]">No email address yet?</strong> Create a free Bear Mail address (you@bear.com) instead.
          </button>
        )}
        <label className="block text-xs text-muted">Email address
          <input autoFocus aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
        </label>
        <label className="block text-xs text-muted">Your name (shown to people you email)
          <input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
        </label>

        {email.includes('@') && (
          <div className="rounded border border-line bg-canvas px-3 py-2 text-[12px] text-muted">
            {guess.key ? <>Recognised <strong className="text-ink">{guess.preset.name}</strong>. </> : <>Using a best guess for <strong className="text-ink">{email.split('@')[1]}</strong>; check Advanced if it doesn't connect. </>}
            {guess.preset.appPasswordUrl && auth === 'password' && (
              <>Use an <button onClick={() => window.open(guess.preset.appPasswordUrl, '_blank')} className="inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline">app password <ExternalLink size={11} /></button> rather than your normal password.</>
            )}
          </div>
        )}

        {oauthProvider && (
          <div className="flex items-center gap-3">
            <Button disabled={busy !== null} onClick={() => void signIn(oauthProvider)}>
              {busy === 'signin' ? 'Waiting for the browser…' : `Sign in with ${oauthProvider === 'google' ? 'Google' : 'Microsoft'}`}
            </Button>
            {oauthSession ? <span className="text-[12px] text-green-700">Signed in{email ? ` as ${email}` : ''}.</span> : (
              <button onClick={openSettings} className="text-[12px] text-muted hover:text-ink hover:underline">Set up sign-in…</button>
            )}
          </div>
        )}

        {!oauthOnly && !oauthSession && (
          <label className="block text-xs text-muted">{guess.preset.appPasswordUrl ? 'App password' : 'Password'}{existing ? ' (leave blank to keep the saved one)' : ''}
            <input aria-label="Password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setAuth('password') }} className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
          </label>
        )}
        {oauthOnly && !oauthSession && (
          <p className="text-[12px] text-muted">Microsoft accounts don't allow password sign-in for mail apps any more. Use "Sign in with Microsoft".</p>
        )}

        <button onClick={() => setAdvanced(!advanced)} className="flex items-center gap-1 text-[12px] text-muted hover:text-ink">
          {advanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Advanced settings
        </button>
        {advanced && (
          <div className="space-y-3 rounded border border-line p-3">
            <label className="block text-xs text-muted">User name
              <input aria-label="User name" value={effUser} onChange={(e) => setUsername(e.target.value)} className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
            </label>
            <ServerFields label="Incoming (IMAP)" value={effImap} onChange={setImap} />
            <ServerFields label="Outgoing (SMTP)" value={effSmtp} onChange={setSmtp} />
            {(effImap.security === 'none' || effSmtp.security === 'none') && (
              <p className="flex items-center gap-1.5 text-[12px] text-amber-700"><ShieldAlert size={13} /> Without encryption, your password travels in plain text. Only use this for servers on this computer.</p>
            )}
          </div>
        )}

        {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      </div>
    </Modal>
  )
}

/** App IDs for "Sign in with Microsoft/Google": each user registers their own (free) app. */
export function MailSettings({ accent, onClose }: { accent: string; onClose: () => void }) {
  const [ms, setMs] = useState('')
  const [gId, setGId] = useState('')
  const [gSecret, setGSecret] = useState('')
  useEffect(() => {
    void window.bear.mail.getOAuthClients().then((c) => {
      setMs(c.microsoft?.clientId ?? '')
      setGId(c.google?.clientId ?? '')
      setGSecret(c.google?.clientSecret ?? '')
    })
  }, [])
  const save = async () => {
    await window.bear.mail.setOAuthClients({
      microsoft: ms.trim() ? { clientId: ms.trim() } : undefined,
      google: gId.trim() ? { clientId: gId.trim(), clientSecret: gSecret.trim() } : undefined
    })
    onClose()
  }
  const link = (url: string, text: string) => (
    <button onClick={() => window.open(url, '_blank')} className="inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline">{text} <ExternalLink size={11} /></button>
  )
  return (
    <Modal title="Mail sign-in settings" width={560} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button primary accent={accent} onClick={() => void save()}>Save</Button></>}>
      <div className="space-y-4 text-[13px] text-ink">
        <section>
          <h3 className="font-semibold">Microsoft (Outlook.com, Hotmail, Microsoft 365)</h3>
          <ol className="ml-4 mt-1 list-decimal space-y-0.5 text-[12px] text-muted">
            <li>Open {link('https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', 'App registrations')} and choose New registration.</li>
            <li>Supported accounts: "Accounts in any organizational directory and personal Microsoft accounts".</li>
            <li>Redirect URI: platform "Public client/native (mobile &amp; desktop)", value <code>http://localhost</code>.</li>
            <li>Under API permissions add <code>IMAP.AccessAsUser.All</code> and <code>SMTP.Send</code> (Office 365 Exchange Online / Outlook).</li>
            <li>Copy the Application (client) ID here.</li>
          </ol>
          <input aria-label="Microsoft application ID" value={ms} onChange={(e) => setMs(e.target.value)} placeholder="Application (client) ID" className="mt-2 h-8 w-full rounded border border-line bg-surface px-2 outline-none focus:border-[var(--accent)]" />
        </section>
        <section>
          <h3 className="font-semibold">Google (Gmail)</h3>
          <ol className="ml-4 mt-1 list-decimal space-y-0.5 text-[12px] text-muted">
            <li>In {link('https://console.cloud.google.com/apis/credentials', 'Google Cloud credentials')}, create an OAuth client ID of type "Desktop app".</li>
            <li>Enable the Gmail API and add the <code>https://mail.google.com/</code> scope to the consent screen (add yourself as a test user).</li>
            <li>Copy the client ID and client secret here. (Or skip this and use a Gmail app password.)</li>
          </ol>
          <input aria-label="Google client ID" value={gId} onChange={(e) => setGId(e.target.value)} placeholder="Client ID" className="mt-2 h-8 w-full rounded border border-line bg-surface px-2 outline-none focus:border-[var(--accent)]" />
          <input aria-label="Google client secret" value={gSecret} onChange={(e) => setGSecret(e.target.value)} placeholder="Client secret" className="mt-2 h-8 w-full rounded border border-line bg-surface px-2 outline-none focus:border-[var(--accent)]" />
        </section>
      </div>
    </Modal>
  )
}
