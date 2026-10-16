import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive, ChevronDown, FileEdit, Flag, Folder, Inbox, Mail, MoreHorizontal, Paperclip, PenSquare,
  ArrowDownToLine, AtSign, RefreshCw, Search, Send, Settings, ShieldAlert, Trash2, UserPlus, X
} from 'lucide-react'
import {
  displayName, getApp,
  type ImportJob, type MailAccount, type MailFolder, type MailMessage, type MessageHeader, type MessagePage, type SpecialUse
} from '@bear/core'
import { ContextMenu, TitleBar, useStoredData, type MenuItem } from '@bear/ui'
import { AccountDialog, MailSettings } from './AccountDialog'
import { BearAccountDialog } from './BearAccountDialog'
import { ImportDialog } from './ImportDialog'
import { Composer } from './Composer'
import { MessageView } from './MessageView'
import { draftFrom, emptyDraft, type Draft } from './compose'

const APP = getApp('mail')
const LOCAL_DRAFTS = '@drafts'
const REFRESH_MS = 60_000

const FOLDER_ICON: Partial<Record<NonNullable<SpecialUse>, typeof Inbox>> = {
  inbox: Inbox, sent: Send, drafts: FileEdit, trash: Trash2, junk: ShieldAlert, archive: Archive, flagged: Flag
}

interface DraftStore {
  drafts: Draft[]
}

/** One line for the sidebar about an import that needs attention or is under way. */
function importLabel(j: ImportJob): string {
  const total = j.folders.reduce((n, f) => n + f.total, 0)
  const done = j.folders.reduce((n, f) => n + f.done, 0)
  if (j.state === 'running') return total ? `Importing ${j.sourceEmail}… ${Math.round((done / total) * 100)}%` : `Importing ${j.sourceEmail}…`
  if (j.state === 'paused') return `Import paused: ${j.sourceEmail}`
  return `Import stopped: ${j.sourceEmail}`
}

function shortDate(t: number): string {
  const d = new Date(t)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (now.getTime() - t < 6 * 86_400_000) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : '2-digit' })
}

export function MailApp({ onHome, openPath }: { onHome: () => void; openPath: (path: string) => void }) {
  const [accounts, setAccounts] = useState<MailAccount[] | null>(null)
  const [acct, setAcct] = useState<string | null>(null)
  const [folders, setFolders] = useState<Record<string, MailFolder[]>>({})
  const [folder, setFolder] = useState('INBOX')
  // Lists remember which account/folder they came from: UIDs are only meaningful within one folder.
  const [page, setPage] = useState<(MessagePage & { acct: string; folder: string }) | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ acct: string; folder: string; items: MessageHeader[] } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [message, setMessage] = useState<MailMessage | null>(null)
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [compose, setCompose] = useState<Draft | null>(null)
  const [dialog, setDialog] = useState<
    null | { kind: 'add' } | { kind: 'bear' } | { kind: 'edit'; account: MailAccount } | { kind: 'settings' } | { kind: 'import'; sourceId?: string; jobId?: string }
  >(null)
  const [imports, setImports] = useState<ImportJob[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const drafts = useStoredData<DraftStore>('mail-drafts', () => ({ drafts: [] }))
  const listRequest = useRef(0)
  const openRequest = useRef(0)

  const account = accounts?.find((a) => a.id === acct) ?? null
  const currentFolder = folders[acct ?? '']?.find((f) => f.path === folder)

  useEffect(() => {
    window.bear.setTitle(`${currentFolder?.name ?? (folder === LOCAL_DRAFTS ? 'Drafts' : 'Mail')} - Bear ${APP.name}`)
  }, [currentFolder?.name, folder])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ---------- Loading ----------

  const loadAccounts = useCallback(async () => {
    const list = await window.bear.mail.listAccounts()
    setAccounts(list)
    setAcct((cur) => (cur && list.some((a) => a.id === cur) ? cur : list[0]?.id ?? null))
    return list
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const loadImports = useCallback(async () => setImports(await window.bear.mail.listImports()), [])
  // Imports run in the background; keep the sidebar note current while one is going.
  const importing = imports.some((j) => j.state === 'running')
  useEffect(() => {
    void loadImports()
    const t = setInterval(() => void loadImports(), importing ? 2000 : 15_000)
    return () => clearInterval(t)
  }, [loadImports, importing])
  const busyImport = imports.find((j) => j.state === 'running') ?? imports.find((j) => j.state === 'paused' || j.state === 'failed')

  const loadFolders = useCallback(async (id: string) => {
    const r = await window.bear.mail.listFolders(id)
    if (r.ok) setFolders((f) => ({ ...f, [id]: r.value }))
    else setError(r.error)
    return r
  }, [])

  const loadList = useCallback(async (id: string, path: string, before?: number | null) => {
    const req = ++listRequest.current
    setLoadingList(true)
    const r = await window.bear.mail.listMessages(id, path, before)
    if (req !== listRequest.current) return
    setLoadingList(false)
    if (!r.ok) return setError(r.error)
    setPage((p) => (before && p && p.acct === id && p.folder === path ? { ...r.value, acct: id, folder: path, messages: [...p.messages, ...r.value.messages] } : { ...r.value, acct: id, folder: path }))
  }, [])

  useEffect(() => {
    if (!acct) return
    void loadFolders(acct)
  }, [acct, loadFolders])

  useEffect(() => {
    setSelected(null)
    setMessage(null)
    setFound(null)
    setQuery('')
    setPage(null)
    if (acct && folder !== LOCAL_DRAFTS) void loadList(acct, folder)
  }, [acct, folder, loadList])

  const searching = !!found && found.acct === acct && found.folder === folder
  const refresh = useCallback(async () => {
    if (!acct) return
    await loadFolders(acct)
    if (folder !== LOCAL_DRAFTS && !searching) await loadList(acct, folder)
  }, [acct, folder, searching, loadFolders, loadList])

  useEffect(() => {
    const t = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  // ---------- Messages ----------

  const results = searching ? found.items : null
  const shownPage = page && page.acct === acct && page.folder === folder ? page : null
  const list = results ?? shownPage?.messages ?? []

  const patchHeader = (uid: number, patch: Partial<MessageHeader>) => {
    setPage((p) => (p ? { ...p, messages: p.messages.map((m) => (m.uid === uid ? { ...m, ...patch } : m)) } : p))
    setFound((r) => (r ? { ...r, items: r.items.map((m) => (m.uid === uid ? { ...m, ...patch } : m)) } : r))
    setMessage((m) => (m && m.uid === uid ? { ...m, ...patch } : m))
  }

  const dropFromList = (uid: number) => {
    setPage((p) => (p ? { ...p, total: p.total - 1, messages: p.messages.filter((m) => m.uid !== uid) } : p))
    setFound((r) => (r ? { ...r, items: r.items.filter((m) => m.uid !== uid) } : r))
    if (selected === uid) {
      setSelected(null)
      setMessage(null)
    }
  }

  const open = async (uid: number) => {
    if (!acct) return
    const req = ++openRequest.current
    setCompose(null)
    setSelected(uid)
    setLoadingMsg(true)
    const r = await window.bear.mail.getMessage(acct, folder, uid)
    // Ignore a slow response to an earlier click.
    if (req !== openRequest.current) return
    setLoadingMsg(false)
    if (!r.ok) return setError(r.error)
    setMessage(r.value)
    const wasUnread = list.find((m) => m.uid === uid)?.seen === false
    patchHeader(uid, { seen: true })
    if (wasUnread) setFolders((f) => ({ ...f, [acct]: (f[acct] ?? []).map((x) => (x.path === folder ? { ...x, unseen: Math.max(0, x.unseen - 1) } : x)) }))
  }

  const act = async (label: string, uid: number, fn: () => Promise<{ ok: boolean; error?: string }>, optimistic: () => void, undo: () => void) => {
    optimistic()
    const r = await fn()
    if (!r.ok) {
      undo()
      setError(`${label}: ${'error' in r ? r.error : 'failed'}`)
    } else if (acct) void loadFolders(acct)
    void uid
  }

  const remove = (uid: number) => {
    if (!acct) return
    const prev = page
    void act('Delete', uid, () => window.bear.mail.remove(acct, folder, [uid]), () => dropFromList(uid), () => setPage(prev))
  }
  const archive = (uid: number) => {
    if (!acct) return
    const prev = page
    void act('Archive', uid, () => window.bear.mail.archive(acct, folder, [uid]), () => dropFromList(uid), () => setPage(prev))
  }
  const setFlag = (m: MessageHeader, patch: { seen?: boolean; flagged?: boolean }) => {
    if (!acct) return
    const before = { seen: m.seen, flagged: m.flagged }
    void act('Update', m.uid, () => window.bear.mail.setFlags(acct, folder, [m.uid], patch), () => patchHeader(m.uid, patch), () => patchHeader(m.uid, before))
  }

  const runSearch = async () => {
    if (!acct || !query.trim()) return setFound(null)
    setLoadingList(true)
    const r = await window.bear.mail.search(acct, folder, query)
    setLoadingList(false)
    if (r.ok) setFound({ acct, folder, items: r.value })
    else setError(r.error)
  }

  // ---------- Composing ----------

  const saveDraft = useCallback((d: Draft) => {
    setCompose(d)
    drafts.update((s) => ({ drafts: [d, ...s.drafts.filter((x) => x.id !== d.id)] }))
  }, [drafts.update]) // eslint-disable-line react-hooks/exhaustive-deps

  const dropDraft = (id: string) => drafts.update((s) => ({ drafts: s.drafts.filter((x) => x.id !== id) }))

  const startCompose = (d: Draft) => {
    setSelected(null)
    setMessage(null)
    setCompose(d)
  }

  const reply = async (mode: 'reply' | 'replyAll' | 'forward') => {
    if (!message || !account) return
    const d = draftFrom(mode, message, account.id, account.email)
    if (mode === 'forward') {
      // Forward the original's attachments too.
      for (const a of message.attachments.filter((x) => !x.inline)) {
        const r = await window.bear.mail.getAttachment(account.id, folder, message.uid, a.id)
        if (r.ok) d.attachments.push({ filename: r.value.filename, contentType: a.contentType, content: toBase64(r.value.data) })
      }
    }
    startCompose(d)
  }

  const send: React.ComponentProps<typeof Composer>['onSend'] = async (d, rec) => {
    const r = await window.bear.mail.send(d.accountId, {
      to: rec.to, cc: rec.cc, bcc: rec.bcc, subject: d.subject, html: d.html, text: rec.text,
      attachments: d.attachments, inReplyTo: d.inReplyTo, references: d.references
    })
    if (!r.ok) return r.error
    dropDraft(d.id)
    setCompose(null)
    setToast('Message sent')
    if (acct) void refresh()
    return null
  }

  const attachment = async (id: string, action: 'save' | 'open') => {
    if (!acct || !message) return
    const r = await window.bear.mail.getAttachment(acct, folder, message.uid, id)
    if (!r.ok) return setError(r.error)
    const ext = r.value.filename.split('.').pop() ?? ''
    const path = await window.bear.chooseSavePath(r.value.filename, [{ name: ext.toUpperCase() || 'File', extensions: [ext || '*'] }])
    if (!path) return
    await window.bear.saveFile(path, r.value.data)
    if (action === 'open') openPath(path)
    else setToast(`Saved ${r.value.filename}`)
  }

  // ---------- Keyboard ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, [contenteditable="true"]')
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (ctrl && k === 'n' && account) {
        e.preventDefault()
        startCompose(emptyDraft(account.id))
      } else if (ctrl && k === 'r' && message) {
        e.preventDefault()
        void reply(e.shiftKey ? 'replyAll' : 'reply')
      } else if (ctrl && e.shiftKey && k === 'f' && message) {
        e.preventDefault()
        void reply('forward')
      } else if (!typing && e.key === 'Delete' && selected !== null && !compose) {
        e.preventDefault()
        remove(selected)
      } else if (!typing && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length && !compose) {
        e.preventDefault()
        const i = list.findIndex((m) => m.uid === selected)
        const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (next) void open(next.uid)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const accountMenu = (a: MailAccount, x: number, y: number) =>
    setMenu({
      x, y,
      items: [
        // A Bear Mail address has no server settings to edit.
        ...(a.auth === 'bear' ? [] : [
          { label: 'Edit account…', onClick: () => setDialog({ kind: 'edit', account: a }) },
          { label: 'Import into Bear Mail…', onClick: () => setDialog({ kind: 'import', sourceId: a.id }) }
        ]),
        {
          label: a.auth === 'bear' ? 'Delete address' : 'Remove account', divider: a.auth !== 'bear',
          onClick: async () => {
            const question = a.auth === 'bear'
              ? `Delete ${a.email}? The address and all of its mail are deleted from this computer. This can't be undone.`
              : `Remove ${a.email} from Bear? Mail on the server isn't affected.`
            if (!window.confirm(question)) return
            await window.bear.mail.removeAccount(a.id)
            await loadAccounts()
          }
        }
      ]
    })

  const localDrafts = useMemo(() => drafts.data?.drafts ?? [], [drafts.data])

  if (accounts === null) return <div className="flex h-full items-center justify-center text-sm text-muted">Loading…</div>

  return (
    <div className="flex h-full flex-col bg-canvas" style={{ ['--accent' as string]: APP.color }}>
      <TitleBar
        app={APP}
        docName={account ? account.email : 'Mail'}
        dirty={false}
        status={loadingList ? 'Updating…' : 'Up to date'}
        onHome={onHome}
        right={account && <button title="New mail (Ctrl+N)" onClick={() => startCompose(emptyDraft(account.id))} className="flex items-center gap-1 rounded bg-white/15 px-2 py-1 text-xs hover:bg-white/25"><PenSquare size={13} /> New mail</button>}
      />
      {error && (
        <div role="alert" className="flex items-center justify-between bg-red-100 px-4 py-1.5 text-[13px] text-red-900 dark:bg-red-950 dark:text-red-100">
          {error}
          <button aria-label="Dismiss" onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {!accounts.length ? (
        <Welcome onCreate={() => setDialog({ kind: 'bear' })} onAdd={() => setDialog({ kind: 'add' })} onSettings={() => setDialog({ kind: 'settings' })} />
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Accounts and folders */}
          <nav aria-label="Folders" className="flex w-60 shrink-0 flex-col border-r border-line bg-surface text-[13px]">
            <div className="p-3">
              <button onClick={() => account && startCompose(emptyDraft(account.id))} className="flex w-full items-center justify-center gap-2 rounded-md py-2 font-medium text-white" style={{ background: APP.color }}>
                <PenSquare size={15} /> New mail
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {accounts.map((a) => (
                <div key={a.id} className="mb-2">
                  <div
                    className="group flex cursor-pointer items-center gap-2 px-3 py-1.5"
                    onClick={() => setAcct(a.id)}
                    onContextMenu={(e) => { e.preventDefault(); accountMenu(a, e.clientX, e.clientY) }}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
                    <span className={`min-w-0 flex-1 truncate ${a.id === acct ? 'font-semibold text-ink' : 'text-muted'}`}>{a.email}</span>
                    <button aria-label={`Options for ${a.email}`} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); accountMenu(a, r.left, r.bottom) }} className="opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} /></button>
                    {a.id !== acct && <ChevronDown size={13} className="text-muted" />}
                  </div>
                  {a.id === acct && (folders[a.id] ?? []).map((f) => {
                    const Icon = (f.specialUse && FOLDER_ICON[f.specialUse]) || Folder
                    return (
                      <button
                        key={f.path}
                        aria-current={folder === f.path ? 'page' : undefined}
                        onClick={() => setFolder(f.path)}
                        className={`flex w-full items-center gap-2.5 py-1.5 pr-3 text-left ${folder === f.path ? 'bg-active font-medium text-ink' : 'text-ink hover:bg-hover'}`}
                        style={{ paddingLeft: 20 + f.depth * 14 }}
                      >
                        <Icon size={15} className="shrink-0 text-[var(--accent)]" />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        {f.unseen > 0 && f.specialUse !== 'trash' && f.specialUse !== 'sent' && <span className="text-[11px] font-semibold text-[var(--accent)]">{f.unseen}</span>}
                      </button>
                    )
                  })}
                  {a.id === acct && localDrafts.length > 0 && (
                    <button
                      aria-current={folder === LOCAL_DRAFTS ? 'page' : undefined}
                      onClick={() => setFolder(LOCAL_DRAFTS)}
                      className={`flex w-full items-center gap-2.5 py-1.5 pl-5 pr-3 text-left ${folder === LOCAL_DRAFTS ? 'bg-active font-medium' : 'hover:bg-hover'}`}
                    >
                      <FileEdit size={15} className="text-[var(--accent)]" />
                      <span className="min-w-0 flex-1 truncate text-ink">Unsent drafts</span>
                      <span className="text-[11px] text-muted">{localDrafts.length}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {busyImport && (
              <button onClick={() => setDialog({ kind: 'import', jobId: busyImport.id })} className="flex items-center gap-2 border-t border-line px-3 py-2 text-left text-[12px] text-muted hover:bg-hover">
                <ArrowDownToLine size={14} className="shrink-0 text-[var(--accent)]" />
                <span className="min-w-0 flex-1 truncate">{importLabel(busyImport)}</span>
              </button>
            )}
            <button onClick={() => setDialog({ kind: 'bear' })} className="flex items-center gap-2 border-t border-line px-3 py-2.5 text-[var(--accent)] hover:bg-hover"><AtSign size={15} /> Create a Bear Mail address</button>
            <div className="flex border-t border-line">
              <button onClick={() => setDialog({ kind: 'add' })} className="flex flex-1 items-center gap-2 px-3 py-2.5 text-[var(--accent)] hover:bg-hover"><UserPlus size={15} /> Add account</button>
              <button aria-label="Mail settings" title="Sign-in settings" onClick={() => setDialog({ kind: 'settings' })} className="px-3 text-muted hover:bg-hover hover:text-ink"><Settings size={15} /></button>
            </div>
          </nav>

          {/* Message list */}
          <section aria-label="Messages" className="flex w-[360px] shrink-0 flex-col border-r border-line bg-surface">
            <div className="border-b border-line px-3 py-2">
              <div className="mb-2 flex items-center justify-between">
                <h1 className="text-[15px] font-semibold text-ink">{folder === LOCAL_DRAFTS ? 'Unsent drafts' : currentFolder?.name ?? folder}</h1>
                <button aria-label="Refresh" title="Refresh" onClick={() => void refresh()} className="rounded p-1 text-muted hover:bg-hover hover:text-ink"><RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} /></button>
              </div>
              {folder !== LOCAL_DRAFTS && (
                <form onSubmit={(e) => { e.preventDefault(); void runSearch() }} className="flex items-center gap-2 rounded border border-line bg-canvas px-2">
                  <Search size={14} className="text-muted" />
                  <input aria-label="Search mail" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setFound(null) }} placeholder={`Search ${currentFolder?.name ?? 'folder'}`} className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none" />
                  {results && <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); setFound(null) }}><X size={13} /></button>}
                </form>
              )}
            </div>
            <ul aria-label="Message list" className="min-h-0 flex-1 overflow-y-auto">
              {folder === LOCAL_DRAFTS
                ? localDrafts.map((d) => (
                    <li key={d.id}>
                      <button onClick={() => startCompose(d)} className="block w-full border-b border-line px-4 py-2.5 text-left hover:bg-hover">
                        <div className="truncate text-[13px] text-red-700">[Draft] <span className="text-ink">{d.to || '(no recipients)'}</span></div>
                        <div className="truncate text-[13px] text-ink">{d.subject || '(no subject)'}</div>
                        <div className="text-[11px] text-muted">{shortDate(d.updated)}</div>
                      </button>
                    </li>
                  ))
                : list.map((m) => (
                    <li key={m.uid}>
                      <button
                        aria-current={selected === m.uid ? 'true' : undefined}
                        onClick={() => void open(m.uid)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setMenu({
                            x: e.clientX, y: e.clientY,
                            items: [
                              { label: m.seen ? 'Mark as unread' : 'Mark as read', onClick: () => setFlag(m, { seen: !m.seen }) },
                              { label: m.flagged ? 'Unflag' : 'Flag', onClick: () => setFlag(m, { flagged: !m.flagged }) },
                              { label: 'Archive', divider: true, onClick: () => archive(m.uid) },
                              { label: 'Delete', shortcut: 'Del', onClick: () => remove(m.uid) },
                              ...(folders[acct ?? ''] ?? []).filter((f) => f.path !== folder).slice(0, 12).map((f, i) => ({
                                label: `Move to ${f.name}`, divider: i === 0,
                                onClick: () => {
                                  const prev = page
                                  void act('Move', m.uid, () => window.bear.mail.move(acct!, folder, [m.uid], f.path), () => dropFromList(m.uid), () => setPage(prev))
                                }
                              }))
                            ]
                          })
                        }}
                        className={`relative block w-full border-b border-line py-2.5 pl-5 pr-3 text-left ${selected === m.uid ? 'bg-active' : 'hover:bg-hover'}`}
                      >
                        {!m.seen && <span aria-label="Unread" className="absolute left-2 top-4 h-1.5 w-1.5 rounded-full" style={{ background: APP.color }} />}
                        <div className="flex items-baseline gap-2">
                          <span className={`min-w-0 flex-1 truncate text-[13px] ${m.seen ? 'text-ink' : 'font-semibold text-ink'}`}>
                            {currentFolder?.specialUse === 'sent' ? `To: ${m.to.map(displayName).join(', ')}` : displayName(m.from[0])}
                          </span>
                          <span className={`shrink-0 text-[11px] ${m.seen ? 'text-muted' : 'font-semibold text-[var(--accent)]'}`}>{shortDate(m.date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`min-w-0 flex-1 truncate text-[13px] ${m.seen ? 'text-muted' : 'font-medium text-ink'}`}>{m.subject || '(no subject)'}</span>
                          {m.hasAttachments && <Paperclip size={12} className="shrink-0 text-muted" />}
                          {m.flagged && <Flag size={12} className="shrink-0 text-red-600" fill="currentColor" />}
                        </div>
                      </button>
                    </li>
                  ))}
              {folder !== LOCAL_DRAFTS && !list.length && !loadingList && (
                <li className="px-4 py-10 text-center text-[13px] text-muted">{results ? 'No messages match.' : 'Nothing in this folder.'}</li>
              )}
              {!results && shownPage?.nextBefore && folder !== LOCAL_DRAFTS && (
                <li className="p-3 text-center">
                  <button onClick={() => acct && void loadList(acct, folder, shownPage.nextBefore)} className="text-[13px] text-[var(--accent)] hover:underline">Load older messages</button>
                </li>
              )}
            </ul>
            {shownPage && !results && folder !== LOCAL_DRAFTS && <div className="border-t border-line px-3 py-1 text-[11px] text-muted">{shownPage.total.toLocaleString()} message{shownPage.total === 1 ? '' : 's'}</div>}
          </section>

          {/* Reading pane / composer */}
          <main className="flex min-w-0 flex-1 flex-col bg-surface">
            {compose && accounts.length ? (
              <Composer
                draft={compose}
                accounts={accounts}
                accent={APP.color}
                onChange={saveDraft}
                onSend={send}
                onDiscard={() => { dropDraft(compose.id); setCompose(null) }}
                onClose={() => setCompose(null)}
              />
            ) : message && selected === message.uid ? (
              <MessageView
                message={message}
                accent={account?.color ?? APP.color}
                onReply={(mode) => void reply(mode)}
                onDelete={() => remove(message.uid)}
                onArchive={() => archive(message.uid)}
                onToggleFlag={() => setFlag(message, { flagged: !message.flagged })}
                onMarkUnread={() => { setFlag(message, { seen: false }); setSelected(null); setMessage(null) }}
                onAttachment={(id, action) => void attachment(id, action)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted">
                <Mail size={36} className="text-[var(--accent)] opacity-40" />
                {loadingMsg ? 'Opening…' : 'Select a message to read it'}
              </div>
            )}
          </main>
        </div>
      )}

      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#1f1f1f] px-4 py-2.5 text-sm text-white shadow-lg">{toast}</div>}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {dialog?.kind === 'add' && (
        <AccountDialog accent={APP.color} onClose={() => setDialog(null)} openSettings={() => setDialog({ kind: 'settings' })} createBear={() => setDialog({ kind: 'bear' })} onSaved={async (a) => { setDialog(null); await loadAccounts(); setAcct(a.id); setFolder('INBOX') }} />
      )}
      {dialog?.kind === 'bear' && (
        <BearAccountDialog accent={APP.color} onClose={() => setDialog(null)} onImport={() => setDialog({ kind: 'import' })} onCreated={async (a) => { setDialog(null); await loadAccounts(); setAcct(a.id); setFolder('INBOX') }} />
      )}
      {dialog?.kind === 'import' && (
        <ImportDialog
          accent={APP.color}
          accounts={accounts}
          sourceId={dialog.sourceId}
          jobId={dialog.jobId}
          onClose={() => { setDialog(null); void loadImports(); void refresh() }}
          onCreated={() => void loadAccounts()}
        />
      )}
      {dialog?.kind === 'edit' && (
        <AccountDialog accent={APP.color} existing={dialog.account} onClose={() => setDialog(null)} openSettings={() => setDialog({ kind: 'settings' })} onSaved={async () => { setDialog(null); await loadAccounts(); if (acct) void refresh() }} />
      )}
      {dialog?.kind === 'settings' && <MailSettings accent={APP.color} onClose={() => setDialog(null)} />}
    </div>
  )
}

function Welcome({ onCreate, onAdd, onSettings }: { onCreate: () => void; onAdd: () => void; onSettings: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <Mail size={44} className="mx-auto text-[var(--accent)]" />
        <h1 className="mt-3 text-2xl font-semibold text-ink">Bear Mail</h1>
        <p className="mt-2 text-sm text-muted">Create your own <strong className="text-ink">@bear.com</strong> address, or connect Gmail, iCloud, Yahoo, Fastmail, Outlook.com or any IMAP account. Passwords are encrypted on this computer and only ever sent to your mail provider.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={onCreate} className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white" style={{ background: APP.color }}><AtSign size={15} /> Create a Bear Mail address</button>
          <button onClick={onAdd} className="flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm text-ink hover:bg-hover"><UserPlus size={15} /> Add an account</button>
          <button onClick={onSettings} className="rounded-md border border-line px-4 py-2 text-sm text-ink hover:bg-hover">Sign-in settings</button>
        </div>
      </div>
    </div>
  )
}

function toBase64(data: Uint8Array): string {
  let s = ''
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000))
  return btoa(s)
}
