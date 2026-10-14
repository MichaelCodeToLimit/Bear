import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ChevronRight, ExternalLink, File, FileSpreadsheet, FileText, Folder, FolderOpen, Globe, Home, Link2,
  ListTodo, Newspaper, Pencil, Plus, Presentation, RefreshCw, Settings, StickyNote, Trash2, X
} from 'lucide-react'
import { appForFile, extensionOf, getApp, type FolderEntry } from '@bear/core'
import { Button, Modal, TitleBar, statusLabel, useStoredData } from '@bear/ui'
import { PageEditor } from '@bear/app-write'
import {
  SITE_COLORS, addLink, addPage, createSite, deletePage, deleteSite, fileSize, initialSites, isWebLink, news, pages,
  patchSite, removeLink, updatePage, upgradeSites, type PageKind, type Site, type SitesData
} from './model'

const APP = getApp('sites')

/** The parts of Tasks data a site shows. Read-only here; Tasks owns the data. */
interface TasksSnapshot {
  lists: { id: string; name: string }[]
  tasks: { id: string; listId: string; title: string; done: boolean; due: string | null }[]
}

type SiteView = { tab: 'home' } | { tab: 'docs'; dir: string | null } | { tab: 'pages' } | { tab: 'news' } | { tab: 'settings' } | { tab: 'page'; id: string; editing: boolean }

interface SitesAppProps {
  onHome: () => void
  /** Open a file path in the right Bear app (or report that it can't). */
  openFile: (path: string) => void
  openApp: (id: 'tasks') => void
}

export function SitesApp({ onHome, openFile, openApp }: SitesAppProps) {
  const store = useStoredData<SitesData>('sites', initialSites, upgradeSites)
  const [siteId, setSiteId] = useState<string | null>(null)
  const [view, setView] = useState<SiteView>({ tab: 'home' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const d = store.data
  const site = d?.sites.find((s) => s.id === siteId) ?? null

  useEffect(() => {
    window.bear.setTitle(`${site ? site.name : 'Sites'} - Bear ${APP.name}`)
  }, [site?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Web links open in the browser; files open in Bear when it can, otherwise in their usual app. */
  const openTarget = useCallback(
    (target: string) => {
      if (isWebLink(target)) {
        window.open(target, '_blank')
        return
      }
      if (appForFile(target)) openFile(target)
      else window.bear.openExternal(target).catch((e) => setError(`Couldn't open ${target}: ${(e as Error).message}`))
    },
    [openFile]
  )

  if (!d) return <div className="flex h-full items-center justify-center text-sm text-muted">Loading…</div>
  const update = store.update
  const setSite = (patch: Partial<Site>) => site && update((x) => patchSite(x, site.id, patch))
  const createPage = (kind: PageKind) => {
    if (!site) return
    const r = addPage(d, site.id, kind, '')
    update(() => r.data)
    setView({ tab: 'page', id: r.page.id, editing: true })
  }

  return (
    <div className="flex h-full flex-col bg-canvas" style={{ ['--accent' as string]: APP.color }}>
      <TitleBar app={APP} docName={site?.name ?? 'Sites'} dirty={false} status={statusLabel(store.status)} onHome={onHome} />
      {(store.error || error) && (
        <div className="flex items-center justify-between bg-red-100 px-4 py-1.5 text-[13px] text-red-900">
          {store.error ?? error}
          <button aria-label="Dismiss" onClick={() => { store.dismissError(); setError(null) }}>×</button>
        </div>
      )}

      {!site ? (
        <Hub sites={d.sites} onOpen={(id) => { setSiteId(id); setView({ tab: 'home' }) }} onCreate={() => setCreating(true)} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Site banner */}
          <header className="shrink-0 px-8 py-5 text-white" style={{ background: `linear-gradient(120deg, ${site.color}, color-mix(in oklab, ${site.color} 60%, black))` }}>
            <button onClick={() => setSiteId(null)} className="mb-2 flex items-center gap-1 text-[12px] text-white/80 hover:text-white"><ArrowLeft size={13} /> All sites</button>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/20 text-xl font-semibold">{site.name.slice(0, 1).toUpperCase()}</div>
              <div>
                <h1 className="text-2xl font-semibold">{site.name}</h1>
                {site.description && <p className="text-sm text-white/85">{site.description}</p>}
              </div>
            </div>
          </header>
          <div className="flex min-h-0 flex-1">
            <nav aria-label="Site navigation" className="w-48 shrink-0 border-r border-line bg-surface py-3 text-[13px]">
              {([
                ['home', 'Home', Home],
                ['docs', 'Documents', Folder],
                ['pages', 'Pages', StickyNote],
                ['news', 'News', Newspaper],
                ['settings', 'Site settings', Settings]
              ] as const).map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  aria-current={view.tab === tab || (tab === 'pages' && view.tab === 'page') ? 'page' : undefined}
                  onClick={() => setView(tab === 'docs' ? { tab, dir: null } : { tab } as SiteView)}
                  className={`mx-2 flex w-[calc(100%-16px)] items-center gap-2.5 rounded px-2 py-2 text-left ${view.tab === tab ? 'bg-active font-medium' : 'hover:bg-hover'}`}
                >
                  <Icon size={15} style={{ color: site.color }} /> <span className="text-ink">{label}</span>
                </button>
              ))}
            </nav>
            <main className="min-w-0 flex-1 overflow-y-auto">
              {view.tab === 'home' && <SiteHome site={site} update={update} setSite={setSite} setView={setView} openTarget={openTarget} openApp={openApp} onCreate={createPage} />}
              {view.tab === 'docs' && <Documents site={site} dir={view.dir} setDir={(dir) => setView({ tab: 'docs', dir })} setSite={setSite} openTarget={openTarget} />}
              {(view.tab === 'pages' || view.tab === 'news') && (
                <PageList
                  site={site}
                  kind={view.tab === 'news' ? 'news' : 'page'}
                  onOpen={(id) => setView({ tab: 'page', id, editing: false })}
                  onCreate={createPage}
                />
              )}
              {view.tab === 'page' && (
                <PageView
                  key={view.id}
                  site={site}
                  pageId={view.id}
                  editing={view.editing}
                  setEditing={(editing) => setView({ ...view, editing })}
                  update={update}
                  onError={setError}
                  onDeleted={(kind) => setView({ tab: kind === 'news' ? 'news' : 'pages' })}
                />
              )}
              {view.tab === 'settings' && (
                <SiteSettings
                  site={site}
                  setSite={setSite}
                  onDelete={() => {
                    if (!window.confirm(`Delete the site "${site.name}"? Its pages and news are deleted; files in its document library are not touched.`)) return
                    update((x) => deleteSite(x, site.id))
                    setSiteId(null)
                  }}
                />
              )}
            </main>
          </div>
        </div>
      )}

      {creating && (
        <CreateSiteDialog
          onClose={() => setCreating(false)}
          onCreate={(name, description, color) => {
            const r = createSite(d, name, description, color)
            update(() => r.data)
            setCreating(false)
            setSiteId(r.site.id)
            setView({ tab: 'home' })
          }}
        />
      )}
    </div>
  )
}

function Hub({ sites, onOpen, onCreate }: { sites: Site[]; onOpen: (id: string) => void; onCreate: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-10 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Sites</h1>
          <p className="text-sm text-muted">Team spaces for news, pages, documents and links.</p>
        </div>
        <Button primary accent={APP.color} onClick={onCreate}><span className="flex items-center gap-1.5"><Plus size={15} /> Create site</span></Button>
      </div>
      {sites.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
          {sites.map((s) => (
            <button key={s.id} onClick={() => onOpen(s.id)} aria-label={`Open site ${s.name}`} className="overflow-hidden rounded-lg border border-line bg-surface text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex h-20 items-end p-3" style={{ background: `linear-gradient(120deg, ${s.color}, color-mix(in oklab, ${s.color} 60%, black))` }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/25 font-semibold text-white">{s.name.slice(0, 1).toUpperCase()}</span>
              </div>
              <div className="p-3">
                <div className="truncate font-medium text-ink">{s.name}</div>
                <div className="line-clamp-2 min-h-[2.5em] text-xs text-muted">{s.description || 'No description'}</div>
                <div className="mt-2 text-[11px] text-muted">{news(s).length} news · {pages(s).length} pages{s.library ? ' · documents' : ''}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center text-sm text-muted">No sites yet. Create one for your team, a project or a club.</div>
      )}
    </div>
  )
}

function CreateSiteDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, description: string, color: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(SITE_COLORS[0])
  return (
    <Modal
      title="Create a site"
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary accent={APP.color} disabled={!name.trim()} onClick={() => onCreate(name, description, color)}>Create</Button>
        </>
      }
    >
      <label className="block text-xs text-muted">Site name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onCreate(name, description, color)} className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
      </label>
      <label className="mt-3 block text-xs text-muted">Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
      </label>
      <div className="mt-3 text-xs text-muted">Colour</div>
      <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Site colour">
        {SITE_COLORS.map((c) => (
          <button key={c} role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className="h-7 w-7 rounded-full" style={{ background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
        ))}
      </div>
    </Modal>
  )
}

type Update = (fn: (d: SitesData) => SitesData) => void

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function SiteHome({ site, update, setSite, setView, openTarget, openApp, onCreate }: {
  site: Site; update: Update; setSite: (p: Partial<Site>) => void; setView: (v: SiteView) => void; onCreate: (kind: PageKind) => void
  openTarget: (t: string) => void; openApp: (id: 'tasks') => void
}) {
  const [editingWelcome, setEditingWelcome] = useState(false)
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [files, setFiles] = useState<FolderEntry[] | null>(null)
  const [tasks, setTasks] = useState<TasksSnapshot | null>(null)
  const posts = news(site).slice(0, 3)

  useEffect(() => {
    if (!site.library) return setFiles(null)
    window.bear.listFolder(site.library).then((f) => setFiles(f.filter((x) => !x.isDir).sort((a, b) => b.modified - a.modified).slice(0, 6))).catch(() => setFiles([]))
  }, [site.library])

  useEffect(() => {
    if (!site.taskList) return setTasks(null)
    window.bear.readData<TasksSnapshot>('tasks').then(setTasks).catch(() => setTasks(null))
  }, [site.taskList])

  const listTasks = tasks?.tasks.filter((t) => t.listId === site.taskList && !t.done) ?? []
  const listName = tasks?.lists.find((l) => l.id === site.taskList)?.name

  return (
    <div className="grid gap-5 p-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <Card title="Home" action={<button onClick={() => setEditingWelcome(!editingWelcome)} className="flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline"><Pencil size={12} /> {editingWelcome ? 'Done' : 'Edit'}</button>}>
          <div className={editingWelcome ? 'rounded border border-line bg-paper text-[#1f1f1f]' : ''}>
            <PageEditor key={`${site.id}-${editingWelcome}`} html={site.welcome} editable={editingWelcome} toolbar={editingWelcome} onChange={(html) => setSite({ welcome: html })} className={editingWelcome ? 'max-h-[420px] [&_.page-doc]:p-4' : '[&_.page-doc]:p-0 [&_.write-doc]:text-ink'} />
          </div>
        </Card>
        <Card title="News" action={<div className="flex gap-3 text-[12px]"><button onClick={() => onCreate('news')} className="text-[var(--accent)] hover:underline">+ Add news</button><button onClick={() => setView({ tab: 'news' })} className="text-muted hover:text-ink">See all</button></div>}>
          {posts.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {posts.map((p) => (
                <button key={p.id} onClick={() => setView({ tab: 'page', id: p.id, editing: false })} className="rounded-md border border-line bg-canvas p-3 text-left hover:border-[var(--accent)]">
                  <div className="mb-2 h-1.5 w-10 rounded" style={{ background: site.color }} />
                  <div className="line-clamp-2 font-medium text-ink">{p.title}</div>
                  <div className="mt-1 line-clamp-3 text-xs text-muted">{p.text || 'No content yet'}</div>
                  <div className="mt-2 text-[11px] text-muted">{new Date(p.created).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          ) : <p className="text-sm text-muted">No news yet. Share an update with your team.</p>}
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="Quick links">
          <ul className="space-y-1">
            {site.links.map((l) => (
              <li key={l.id} className="group flex items-center gap-2">
                {isWebLink(l.url) ? <Globe size={14} className="shrink-0 text-muted" /> : <Link2 size={14} className="shrink-0 text-muted" />}
                <button onClick={() => openTarget(l.url)} title={l.url} className="min-w-0 flex-1 truncate text-left text-sm text-[var(--accent)] hover:underline">{l.title}</button>
                <button aria-label={`Remove link ${l.title}`} onClick={() => update((x) => removeLink(x, site.id, l.id))} className="opacity-0 group-hover:opacity-100"><X size={13} /></button>
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => { e.preventDefault(); update((x) => addLink(x, site.id, linkTitle, linkUrl)); setLinkTitle(''); setLinkUrl('') }} className="mt-3 space-y-1.5">
            <input aria-label="Link title" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Title" className="h-7 w-full rounded border border-line bg-canvas px-2 text-[13px] text-ink outline-none focus:border-[var(--accent)]" />
            <div className="flex gap-1.5">
              <input aria-label="Link address" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Web address or file path" className="h-7 min-w-0 flex-1 rounded border border-line bg-canvas px-2 text-[13px] text-ink outline-none focus:border-[var(--accent)]" />
              <button type="submit" disabled={!linkUrl.trim()} className="rounded border border-line px-2 text-[12px] text-ink hover:bg-hover disabled:opacity-40">Add</button>
            </div>
          </form>
        </Card>

        <Card title="Documents" action={site.library ? <button onClick={() => setView({ tab: 'docs', dir: null })} className="text-[12px] text-muted hover:text-ink">See all</button> : undefined}>
          {!site.library ? (
            <button onClick={() => setView({ tab: 'docs', dir: null })} className="text-sm text-[var(--accent)] hover:underline">Connect a folder as this site's document library</button>
          ) : files && files.length ? (
            <ul className="space-y-1">{files.map((f) => <FileRow key={f.path} f={f} onOpen={() => openTarget(f.path)} compact />)}</ul>
          ) : <p className="text-sm text-muted">{files ? 'The library is empty.' : 'Loading…'}</p>}
        </Card>

        <Card title={listName ? `Tasks · ${listName}` : 'Tasks'} action={<button onClick={() => openApp('tasks')} className="flex items-center gap-1 text-[12px] text-muted hover:text-ink">Open Tasks <ExternalLink size={11} /></button>}>
          {!site.taskList ? (
            <p className="text-sm text-muted">Choose a task list in <button onClick={() => setView({ tab: 'settings' })} className="text-[var(--accent)] hover:underline">Site settings</button> to show it here.</p>
          ) : listTasks.length ? (
            <ul className="space-y-1.5">
              {listTasks.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm text-ink"><ListTodo size={14} className="text-muted" /> <span className="min-w-0 flex-1 truncate">{t.title}</span>{t.due && <span className="text-[11px] text-muted">{t.due}</span>}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No open tasks.</p>}
        </Card>
      </div>
    </div>
  )
}

function fileIcon(name: string) {
  const ext = extensionOf(name)
  if (ext === 'docx' || ext === 'txt' || ext === 'md' || ext === 'pdf') return { Icon: FileText, color: getApp('write').color }
  if (ext === 'xlsx' || ext === 'csv') return { Icon: FileSpreadsheet, color: getApp('sheets').color }
  if (ext === 'pptx') return { Icon: Presentation, color: getApp('slides').color }
  return { Icon: File, color: '#6b7280' }
}

function FileRow({ f, onOpen, compact }: { f: FolderEntry; onOpen: () => void; compact?: boolean }) {
  const { Icon, color } = f.isDir ? { Icon: Folder, color: '#d97706' } : fileIcon(f.name)
  return (
    <li>
      <button onClick={onOpen} className={`flex w-full items-center gap-2.5 rounded px-2 text-left hover:bg-hover ${compact ? 'py-1' : 'py-2'}`}>
        <Icon size={compact ? 15 : 18} style={{ color }} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.name}</span>
        {!compact && <span className="w-40 shrink-0 text-[12px] text-muted">{new Date(f.modified).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>}
        {!compact && <span className="w-20 shrink-0 text-right text-[12px] text-muted">{f.isDir ? '' : fileSize(f.size)}</span>}
      </button>
    </li>
  )
}

function Documents({ site, dir, setDir, setSite, openTarget }: { site: Site; dir: string | null; setDir: (d: string | null) => void; setSite: (p: Partial<Site>) => void; openTarget: (t: string) => void }) {
  const [entries, setEntries] = useState<FolderEntry[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const current = dir ?? site.library
  const load = useCallback(() => {
    if (!current) return
    setErr(null)
    window.bear.listFolder(current)
      .then((e) => setEntries([...e].sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true })))))
      .catch((e) => { setEntries([]); setErr((e as Error).message) })
  }, [current])
  useEffect(load, [load])

  const connect = async () => {
    const folder = await window.bear.chooseFolder(`Choose a folder for ${site.name}'s documents`)
    if (folder) {
      setSite({ library: folder })
      setDir(null)
    }
  }

  if (!site.library) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <FolderOpen size={40} className="mx-auto text-[var(--accent)]" />
        <h2 className="mt-3 text-lg font-semibold text-ink">Connect a document library</h2>
        <p className="mt-1 text-sm text-muted">Pick a folder (for example a shared or synced folder) and its files will show here. Documents, spreadsheets and presentations open in Bear.</p>
        <div className="mt-4"><Button primary accent={APP.color} onClick={() => void connect()}>Choose folder…</Button></div>
      </div>
    )
  }

  // Breadcrumbs from the library root to the current folder.
  const root = site.library
  const rel = current && current.length > root.length ? current.slice(root.length).replace(/^[\\/]+/, '').split(/[\\/]/) : []
  const sep = root.includes('\\') ? '\\' : '/'
  return (
    <div className="p-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">Documents</h2>
        <button aria-label="Refresh" onClick={load} className="rounded p-1 text-muted hover:bg-hover hover:text-ink"><RefreshCw size={14} /></button>
        <button onClick={() => void window.bear.showInFolder(current!)} className="ml-auto text-[12px] text-muted hover:text-ink">Show in folder</button>
      </div>
      <nav aria-label="Folder path" className="mb-3 flex flex-wrap items-center gap-1 text-[13px]">
        <button onClick={() => setDir(null)} className="text-[var(--accent)] hover:underline">{root.split(/[\\/]/).pop()}</button>
        {rel.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={12} className="text-muted" />
            <button onClick={() => setDir(root + sep + rel.slice(0, i + 1).join(sep))} className="text-[var(--accent)] hover:underline">{part}</button>
          </span>
        ))}
      </nav>
      {err && <p className="mb-2 text-sm text-red-600">Couldn't read this folder: {err}</p>}
      <ul aria-label="Files" className="divide-y divide-line rounded-lg border border-line bg-surface">
        {entries?.map((f) => <FileRow key={f.path} f={f} onOpen={() => (f.isDir ? setDir(f.path) : openTarget(f.path))} />)}
        {entries && !entries.length && !err && <li className="px-3 py-6 text-center text-sm text-muted">This folder is empty.</li>}
      </ul>
    </div>
  )
}

function PageList({ site, kind, onOpen, onCreate }: { site: Site; kind: PageKind; onOpen: (id: string) => void; onCreate: (kind: PageKind) => void }) {
  const list = kind === 'news' ? news(site) : pages(site)
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">{kind === 'news' ? 'News' : 'Pages'}</h2>
        <Button primary accent={APP.color} onClick={() => onCreate(kind)}><span className="flex items-center gap-1.5"><Plus size={14} /> {kind === 'news' ? 'New post' : 'New page'}</span></Button>
      </div>
      {list.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {list.map((p) => (
            <li key={p.id}>
              <button onClick={() => onOpen(p.id)} className="block w-full px-4 py-3 text-left hover:bg-hover">
                <div className="font-medium text-ink">{p.title}</div>
                <div className="line-clamp-1 text-[12px] text-muted">{p.text || 'No content yet'}</div>
                <div className="text-[11px] text-muted">{kind === 'news' ? 'Posted' : 'Edited'} {new Date(kind === 'news' ? p.created : p.modified).toLocaleDateString()}</div>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">Nothing here yet.</p>}
    </div>
  )
}

function PageView({ site, pageId, editing, setEditing, update, onError, onDeleted }: {
  site: Site; pageId: string; editing: boolean; setEditing: (e: boolean) => void; update: Update
  onError: (m: string) => void; onDeleted: (kind: PageKind) => void
}) {
  const page = useMemo(() => site.pages.find((p) => p.id === pageId), [site.pages, pageId])
  if (!page) return <p className="p-6 text-sm text-muted">This page was deleted.</p>
  return (
    <article className="mx-auto max-w-3xl p-6">
      <div className="mb-1 flex items-center gap-3 text-[12px] text-muted">
        <span className="rounded px-1.5 py-0.5 text-white" style={{ background: site.color }}>{page.kind === 'news' ? 'News' : 'Page'}</span>
        <span>{new Date(page.created).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>
        <div className="ml-auto flex gap-2">
          <Button primary={!editing} accent={APP.color} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</Button>
          <button
            aria-label="Delete page"
            onClick={() => {
              if (!window.confirm(`Delete "${page.title}"?`)) return
              update((x) => deletePage(x, site.id, page.id))
              onDeleted(page.kind)
            }}
            className="rounded p-2 text-muted hover:bg-hover hover:text-red-600"
          ><Trash2 size={15} /></button>
        </div>
      </div>
      {editing ? (
        <input aria-label="Page title" defaultValue={page.title} autoFocus={!page.text} onChange={(e) => update((x) => updatePage(x, site.id, page.id, { title: e.target.value }))} className="w-full bg-transparent text-3xl font-semibold text-ink outline-none" />
      ) : (
        <h1 className="text-3xl font-semibold text-ink">{page.title}</h1>
      )}
      <div className={`mt-4 rounded-lg ${editing ? 'border border-line bg-paper text-[#1f1f1f]' : ''}`}>
        <PageEditor
          key={`${page.id}-${editing}`}
          html={page.html}
          editable={editing}
          toolbar={editing}
          placeholder="Write your page…"
          onError={onError}
          onChange={(html, text) => update((x) => updatePage(x, site.id, page.id, { html, text }))}
          className={editing ? 'min-h-[300px] [&_.page-doc]:p-5' : '[&_.page-doc]:p-0 [&_.write-doc]:text-ink'}
        />
      </div>
    </article>
  )
}

function SiteSettings({ site, setSite, onDelete }: { site: Site; setSite: (p: Partial<Site>) => void; onDelete: () => void }) {
  const [lists, setLists] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    window.bear.readData<TasksSnapshot>('tasks').then((t) => setLists(t?.lists ?? [])).catch(() => setLists([]))
  }, [])
  return (
    <div className="max-w-xl space-y-5 p-6 text-sm">
      <h2 className="text-lg font-semibold text-ink">Site settings</h2>
      <label className="block text-xs text-muted">Name
        <input aria-label="Site name" defaultValue={site.name} onBlur={(e) => setSite({ name: e.target.value.trim() || site.name })} className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
      </label>
      <label className="block text-xs text-muted">Description
        <input aria-label="Site description" defaultValue={site.description} onBlur={(e) => setSite({ description: e.target.value.trim() })} className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-[var(--accent)]" />
      </label>
      <div>
        <div className="text-xs text-muted">Colour</div>
        <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Site colour">
          {SITE_COLORS.map((c) => <button key={c} role="radio" aria-checked={site.color === c} aria-label={c} onClick={() => setSite({ color: c })} className="h-7 w-7 rounded-full" style={{ background: c, outline: site.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />)}
        </div>
      </div>
      <div>
        <div className="text-xs text-muted">Document library</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-ink">{site.library ?? 'Not connected'}</span>
          <Button onClick={async () => { const f = await window.bear.chooseFolder('Choose a folder'); if (f) setSite({ library: f }) }}>{site.library ? 'Change…' : 'Choose…'}</Button>
          {site.library && <Button onClick={() => setSite({ library: null })}>Disconnect</Button>}
        </div>
      </div>
      <label className="block text-xs text-muted">Task list shown on the home page
        <select aria-label="Task list" value={site.taskList ?? ''} onChange={(e) => setSite({ taskList: e.target.value || null })} className="mt-1 h-8 w-full rounded border border-line bg-surface px-1 text-sm text-ink outline-none">
          <option value="">None</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <hr className="border-line" />
      <button onClick={onDelete} className="flex items-center gap-2 text-sm text-red-600 hover:underline"><Trash2 size={14} /> Delete this site</button>
    </div>
  )
}
