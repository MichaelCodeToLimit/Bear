import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  AppWindow, FileSpreadsheet, FileText, Folder, FolderOpen, Globe, Home, LayoutGrid, ListTodo, Moon, NotebookPen,
  Pencil, Plus, Presentation, Search, Sun, SunMoon, Trash2, Upload, type LucideIcon
} from 'lucide-react'
import { APPS, appForFile, baseName, getApp, stripExtension, type AppId, type FolderEntry, type OpenedFile, type RecentFile } from '@bear/core'
import { useTheme, type ThemeMode } from '@bear/ui/src/theme'
import { TEMPLATES } from '@bear/app-write/src/templates'
import { SHEET_TEMPLATES } from '@bear/app-sheets/src/templates'
import { DECK_TEMPLATES } from '@bear/app-slides/src/templates'
import bearMark from '../../../desktop/build/icon-128.png'
import { useLayer } from './nav'
import { DOCS, deleteDoc, fileSize, listDocs, renameDoc } from './files'
import { Empty, Fab, IconButton, OverlayHost, Page, Row, Section, ask, confirm, menu, sheet, toast, when } from './ui'

const WritePhone = lazy(() => import('./apps/write'))
const SheetsPhone = lazy(() => import('./apps/sheets'))
const SlidesPhone = lazy(() => import('./apps/slides'))
const NotesPhone = lazy(() => import('./apps/notes'))
const TasksPhone = lazy(() => import('./apps/tasks'))
const BoardPhone = lazy(() => import('./apps/board'))
const SitesPhone = lazy(() => import('./apps/sites'))

/** What a document app starts with: a file, or a template. */
export type DocInput = { file: OpenedFile } | { template: string }

export type Launch =
  | { app: 'write' | 'sheets' | 'slides'; input: DocInput }
  | { app: 'notes' | 'tasks' | 'board' | 'sites' }

export const BEAR = '#8a4b1f'

export const APP_ICONS: Record<string, LucideIcon> = {
  write: FileText, sheets: FileSpreadsheet, slides: Presentation, notes: NotebookPen, tasks: ListTodo, board: Pencil, sites: Globe
}

/** The seven apps on the phone (Mail needs the desktop's IMAP/SMTP engine). */
export const PHONE_APPS: AppId[] = ['write', 'sheets', 'slides', 'notes', 'tasks', 'board', 'sites']

export function AppTile({ id, size = 44 }: { id: AppId; size?: number }) {
  const I = APP_ICONS[id] ?? AppWindow
  return (
    <div className="flex shrink-0 items-center justify-center rounded-[28%] text-white shadow-sm" style={{ width: size, height: size, background: getApp(id).color }}>
      <I size={size * 0.52} strokeWidth={2} />
    </div>
  )
}

function Loading() {
  return <div className="flex h-full items-center justify-center bg-canvas text-[15px] text-muted">Loading…</div>
}

type Tab = 'home' | 'files' | 'apps'

export function PhoneShell() {
  const [tab, setTab] = useState<Tab>('home')
  const app = useLayer<Launch & { key: number }>()
  const [theme, setTheme] = useTheme()
  const [refresh, setRefresh] = useState(0)

  const launch = useCallback((l: Launch) => app.open({ ...l, key: Date.now() }), [app.open]) // eslint-disable-line react-hooks/exhaustive-deps

  const openPath = useCallback(
    async (path: string) => {
      try {
        const file = await window.bear.readFile(path)
        const id = appForFile(path)
        if (id === 'write' || id === 'sheets' || id === 'slides') launch({ app: id, input: { file } })
        else toast(`Bear can't open ${baseName(path)}`)
      } catch (e) {
        toast(`Couldn't open ${baseName(path)}: ${(e as Error).message}`)
        await window.bear.removeRecent(path)
        setRefresh((r) => r + 1)
      }
    },
    [launch]
  )

  // Coming back from an app: refresh Recent and Files.
  useEffect(() => {
    if (!app.value) setRefresh((r) => r + 1)
  }, [app.value])

  const ctx: ShellCtx = { launch, openPath, refresh, bump: () => setRefresh((r) => r + 1) }

  return (
    <div className="h-full" style={{ ['--accent' as string]: app.value ? getApp(app.value.app).color : BEAR }}>
      {app.value ? (
        <Suspense fallback={<Loading />}>{renderApp(app.value, ctx)}</Suspense>
      ) : (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            {tab === 'home' && <HomeTab ctx={ctx} theme={theme} setTheme={setTheme} />}
            {tab === 'files' && <FilesTab ctx={ctx} />}
            {tab === 'apps' && <AppsTab ctx={ctx} />}
          </div>
          <nav className="phone-nav flex shrink-0 border-t border-line bg-surface">
            {(
              [
                ['home', 'Home', Home],
                ['files', 'Files', Folder],
                ['apps', 'Apps', LayoutGrid]
              ] as const
            ).map(([id, label, I]) => (
              <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)} className="flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5">
                <span className={`flex h-8 w-16 items-center justify-center rounded-full transition ${tab === id ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-muted'}`}>
                  <I size={22} />
                </span>
                <span className={`text-[12px] font-medium ${tab === id ? 'text-ink' : 'text-muted'}`}>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
      <OverlayHost />
    </div>
  )
}

interface ShellCtx {
  launch: (l: Launch) => void
  openPath: (path: string) => Promise<void>
  refresh: number
  bump: () => void
}

function renderApp(l: Launch & { key: number }, ctx: ShellCtx): ReactNode {
  switch (l.app) {
    case 'write': return <WritePhone key={l.key} input={l.input} />
    case 'sheets': return <SheetsPhone key={l.key} input={l.input} />
    case 'slides': return <SlidesPhone key={l.key} input={l.input} />
    case 'notes': return <NotesPhone key={l.key} />
    case 'tasks': return <TasksPhone key={l.key} />
    case 'board': return <BoardPhone key={l.key} />
    case 'sites': return <SitesPhone key={l.key} openPath={ctx.openPath} openApp={(app) => ctx.launch({ app })} />
  }
}

// ---------- Creating documents ----------

function chooseTemplate(ctx: ShellCtx, app: 'write' | 'sheets' | 'slides') {
  const list = app === 'write' ? TEMPLATES : app === 'sheets' ? SHEET_TEMPLATES : DECK_TEMPLATES
  sheet(
    (close) => (
      <div className="pb-2">
        {list.map((t) => (
          <Row
            key={t.id}
            leading={<AppTile id={app} size={40} />}
            title={t.name}
            subtitle={t.description}
            onClick={() => close(() => ctx.launch({ app, input: { template: t.id } }))}
          />
        ))}
      </div>
    ),
    `New ${app === 'write' ? 'document' : app === 'sheets' ? 'spreadsheet' : 'presentation'}`
  )
}

function create(ctx: ShellCtx, id: AppId) {
  if (id === 'write' || id === 'sheets' || id === 'slides') chooseTemplate(ctx, id)
  else ctx.launch({ app: id as 'notes' })
}

// ---------- Home ----------

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function useRecent(refresh: number) {
  const [recent, setRecent] = useState<RecentFile[] | null>(null)
  useEffect(() => {
    void window.bear.getRecent().then(setRecent).catch(() => setRecent([]))
  }, [refresh])
  return recent
}

function HomeTab({ ctx, theme, setTheme }: { ctx: ShellCtx; theme: ThemeMode; setTheme: (m: ThemeMode) => void }) {
  const recent = useRecent(ctx.refresh)
  const [q, setQ] = useState('')
  const shown = (recent ?? []).filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : SunMoon

  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="phone-hero shrink-0 bg-[var(--accent)] px-5 pb-5 text-white">
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2.5">
            <img src={bearMark} alt="" className="h-9 w-9 rounded-xl" />
            <span className="text-[22px] font-bold tracking-tight">Bear</span>
          </div>
          <IconButton
            icon={ThemeIcon}
            label="Appearance"
            onClick={() =>
              menu(
                (['system', 'light', 'dark'] as const).map((m) => ({
                  label: m === 'system' ? 'Match phone' : m === 'light' ? 'Light' : 'Dark',
                  icon: m === 'system' ? SunMoon : m === 'light' ? Sun : Moon,
                  checked: theme === m,
                  onClick: () => setTheme(m)
                })),
                'Appearance'
              )
            }
          />
        </div>
        <div className="mt-4 text-[26px] font-semibold leading-tight">{greeting()}</div>
        <div className="mt-3 flex h-12 items-center gap-2 rounded-2xl bg-white/15 px-4">
          <Search size={19} className="text-white/80" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search recent files"
            className="min-w-0 flex-1 bg-transparent text-[15.5px] text-white outline-none placeholder:text-white/70"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {!q && (
          <>
            <div className="px-4 pb-1 pt-5 text-[13px] font-semibold uppercase tracking-wide text-muted">Create</div>
            <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1 pt-1">
              {PHONE_APPS.map((id) => (
                <button key={id} onClick={() => create(ctx, id)} className="flex w-[78px] shrink-0 flex-col items-center gap-2 active:scale-95">
                  <div className="relative">
                    <AppTile id={id} size={58} />
                    <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-ink shadow ring-1 ring-line">
                      <Plus size={15} strokeWidth={2.6} />
                    </span>
                  </div>
                  <span className="text-[12.5px] text-ink">{newLabel(id)}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <Section title={q ? 'Results' : 'Recent'}>
          {recent === null ? (
            <div className="p-6 text-center text-[14px] text-muted">Loading…</div>
          ) : shown.length ? (
            shown.slice(0, 30).map((r, i) => (
              <div key={r.path}>
                {i > 0 && <div className="ml-[72px] h-px bg-line/70" />}
                <Row
                  leading={<AppTile id={r.app} size={40} />}
                  title={stripExtension(r.name)}
                  subtitle={`${getApp(r.app).name} · ${when(r.openedAt)}`}
                  onClick={() => void ctx.openPath(r.path)}
                  onMore={() => fileMenu(ctx, r.path)}
                  moreButton
                />
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-[14px] leading-relaxed text-muted">
              {q ? 'No recent files match.' : 'Documents, spreadsheets and presentations you open will show up here.'}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

function newLabel(id: AppId): string {
  return { write: 'Document', sheets: 'Spreadsheet', slides: 'Slides', notes: 'Note', tasks: 'Task', board: 'Board', sites: 'Site' }[id as 'write'] ?? getApp(id).name
}

function fileMenu(ctx: ShellCtx, path: string) {
  menu(
    [
      { label: 'Open', icon: FolderOpen, onClick: () => void ctx.openPath(path) },
      {
        label: 'Rename',
        icon: Pencil,
        onClick: async () => {
          const name = await ask('Rename', { value: stripExtension(baseName(path)), ok: 'Rename' })
          if (!name?.trim()) return
          try {
            await renameDoc(path, name)
            ctx.bump()
          } catch (e) {
            toast(`Couldn't rename: ${(e as Error).message}`)
          }
        }
      },
      {
        label: 'Delete',
        icon: Trash2,
        danger: true,
        onClick: async () => {
          if (!(await confirm(`Delete ${baseName(path)}?`, 'The file is removed from your phone. This can’t be undone.'))) return
          try {
            await deleteDoc(path)
          } catch {
            await window.bear.removeRecent(path)
          }
          ctx.bump()
        }
      }
    ],
    baseName(path)
  )
}

// ---------- Files ----------

function FilesTab({ ctx }: { ctx: ShellCtx }) {
  const [dir, setDir] = useState(DOCS)
  const [entries, setEntries] = useState<FolderEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEntries(null)
    listDocs(dir)
      .then((e) => {
        setEntries(e)
        setError(null)
      })
      .catch((e) => {
        setEntries([])
        setError((e as Error).message)
      })
  }, [dir, ctx.refresh])

  const importFile = async () => {
    const f = await window.bear.openFile([{ name: 'Documents', extensions: APPS.filter((a) => a.ready).flatMap((a) => a.extensions) }])
    if (!f) return
    ctx.bump()
    void ctx.openPath(f.path)
  }

  const up = dir !== DOCS
  return (
    <Page
      title={up ? baseName(dir) : 'Files'}
      subtitle={`Documents/${dir}`}
      fab={<Fab icon={Upload} label="Open from phone" onClick={() => void importFile()} />}
      actions={up ? <IconButton icon={Folder} label="Up a folder" onClick={() => setDir(dir.slice(0, dir.lastIndexOf('/')))} /> : undefined}
    >
      {error && <div className="mx-4 mt-3 rounded-xl bg-red-100 px-4 py-3 text-[14px] text-red-900">{error}</div>}
      {entries === null ? (
        <div className="p-10 text-center text-[14px] text-muted">Loading…</div>
      ) : entries.length ? (
        <div className="pb-24 pt-1">
          {entries.map((e) => {
            const id = appForFile(e.path)
            return (
              <Row
                key={e.path}
                leading={
                  e.isDir ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-hover text-muted"><Folder size={22} /></div>
                  ) : id ? (
                    <AppTile id={id} size={40} />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-hover text-muted"><FileText size={22} /></div>
                  )
                }
                title={e.isDir ? e.name : stripExtension(e.name)}
                subtitle={e.isDir ? 'Folder' : `${e.name.split('.').pop()?.toUpperCase()} · ${fileSize(e.size)} · ${when(e.modified)}`}
                onClick={() => (e.isDir ? setDir(e.path) : void ctx.openPath(e.path))}
                onMore={e.isDir ? undefined : () => fileMenu(ctx, e.path)}
                moreButton={!e.isDir}
              />
            )
          })}
        </div>
      ) : (
        <Empty
          icon={FolderOpen}
          title="No files yet"
          text="Documents you create in Bear are saved in your phone's Documents/Bear folder. You can also open files from elsewhere on your phone."
        />
      )}
    </Page>
  )
}

// ---------- Apps ----------

function AppsTab({ ctx }: { ctx: ShellCtx }) {
  return (
    <Page title="Apps" subtitle="Everything works offline, on your phone">
      <div className="grid grid-cols-2 gap-3 p-4">
        {PHONE_APPS.map((id) => {
          const a = getApp(id)
          return (
            <button
              key={id}
              onClick={() => (id === 'write' || id === 'sheets' || id === 'slides' ? chooseTemplate(ctx, id) : ctx.launch({ app: id as 'notes' }))}
              className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-4 text-left shadow-sm ring-1 ring-line/60 active:scale-[0.97]"
            >
              <AppTile id={id} size={48} />
              <div>
                <div className="text-[16px] font-semibold text-ink">{a.name}</div>
                <div className="text-[13px] text-muted">{a.tagline}</div>
              </div>
            </button>
          )
        })}
      </div>
      <p className="px-6 pb-8 text-center text-[13px] leading-relaxed text-muted">Mail is available in Bear for Windows.</p>
    </Page>
  )
}
