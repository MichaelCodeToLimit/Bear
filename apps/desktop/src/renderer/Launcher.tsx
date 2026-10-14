import { useEffect, useState } from 'react'
import { FolderOpen, Home, Monitor, Moon, Plus, Sun } from 'lucide-react'
import { APPS, getApp, type AppInfo, type OpenedFile, type RecentFile } from '@bear/core'
import { AppMark, RecentList, useTheme } from '@bear/ui'
import { TemplateGrid } from '@bear/app-write'
import { SheetTemplateGrid } from '@bear/app-sheets'
import { DeckTemplateGrid } from '@bear/app-slides'
import type { OpenApp } from './App'
import logoUrl from '../../build/icon-128.png'

const OPEN_ALL = [
  { name: 'Supported files', extensions: APPS.filter((a) => a.ready).flatMap((a) => a.extensions) },
  { name: 'All files', extensions: ['*'] }
]

export function Launcher({ open, openFile: route }: { open: OpenApp; openFile: (file: OpenedFile) => boolean }) {
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useTheme()

  useEffect(() => {
    window.bear.getRecent().then(setRecent)
  }, [])

  // Re-subscribed every render so Ctrl+O / Ctrl+N always see current state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void browse()
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        open({ app: 'write', input: { kind: 'template' }, key: Date.now() })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function openFile(file: OpenedFile) {
    if (!route(file)) setError(`${file.name} can't be opened in Bear yet. Bear opens documents, spreadsheets and presentations.`)
  }

  async function browse() {
    const file = await window.bear.openFile(OPEN_ALL)
    if (file) openFile(file)
  }

  async function openRecent(r: RecentFile) {
    try {
      openFile(await window.bear.readFile(r.path))
    } catch {
      setRecent(await window.bear.removeRecent(r.path))
      setError(`${r.name} could not be found. It was removed from the recent list.`)
    }
  }

  const launch = (app: AppInfo) => {
    const key = Date.now()
    if (app.id === 'write') open({ app: 'write', input: { kind: 'template' }, key })
    if (app.id === 'sheets') open({ app: 'sheets', input: { kind: 'template' }, key })
    if (app.id === 'slides') open({ app: 'slides', input: { kind: 'template' }, key })
    if (app.id === 'notes' || app.id === 'tasks' || app.id === 'board' || app.id === 'sites' || app.id === 'mail') open({ app: app.id, key })
  }

  return (
    <div className="flex h-full bg-canvas text-ink">
      <aside className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-4">
        <Logo />
        <NavButton icon={<Home size={20} />} label="Home" active />
        <NavButton icon={<Plus size={20} />} label="New" onClick={() => open({ app: 'write', input: { kind: 'template' }, key: Date.now() })} />
        <NavButton icon={<FolderOpen size={20} />} label="Open" onClick={() => void browse()} />
        <div className="flex-1" />
        <NavButton
          icon={theme === 'dark' ? <Moon size={18} /> : theme === 'light' ? <Sun size={18} /> : <Monitor size={18} />}
          label="Theme"
          onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
        />
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-10 py-8">
          <header className="mb-8">
            <h1 className="text-2xl font-semibold">Good {greeting()}</h1>
            <p className="text-sm text-muted">Bear: free, open-source and yours to keep.</p>
          </header>

          {error && (
            <div className="mb-6 flex items-center justify-between rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {error}
              <button onClick={() => setError(null)} className="text-xs underline">Dismiss</button>
            </div>
          )}

          <section className="mb-10">
            <h2 className="mb-3 text-sm font-semibold text-muted">Apps</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {APPS.map((app) => (
                <button
                  key={app.id}
                  onClick={() => launch(app)}
                  disabled={!app.ready}
                  className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-3 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-md disabled:cursor-default"
                >
                  <span className={app.ready ? '' : 'opacity-50 grayscale-[40%]'}><AppMark app={app} size={36} /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{app.name}</span>
                    <span className="block truncate text-xs text-muted">{app.ready ? app.tagline : 'Coming soon'}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mb-10" style={{ ['--accent' as string]: getApp('write').color }}>
            <h2 className="mb-3 text-sm font-semibold text-muted">New document</h2>
            <TemplateGrid onPick={(template) => open({ app: 'write', input: { kind: 'template', template }, key: Date.now() })} />
          </section>

          <section className="mb-10" style={{ ['--accent' as string]: getApp('sheets').color }}>
            <h2 className="mb-3 text-sm font-semibold text-muted">New spreadsheet</h2>
            <SheetTemplateGrid onPick={(template) => open({ app: 'sheets', input: { kind: 'template', template }, key: Date.now() })} />
          </section>

          <section className="mb-10" style={{ ['--accent' as string]: getApp('slides').color }}>
            <h2 className="mb-3 text-sm font-semibold text-muted">New presentation</h2>
            <DeckTemplateGrid onPick={(template) => open({ app: 'slides', input: { kind: 'template', template }, key: Date.now() })} />
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted">Recent</h2>
              <button onClick={() => void browse()} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
                <FolderOpen size={15} /> Open other files
              </button>
            </div>
            <RecentList items={recent} onOpen={(r) => void openRecent(r)} empty="No recent files yet." />
          </section>
        </div>
      </main>
    </div>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}

function Logo() {
  return <img src={logoUrl} width={40} height={40} alt="Bear" className="mb-4" draggable={false} />
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex w-14 flex-col items-center gap-0.5 rounded-md py-2 text-[11px] hover:bg-hover ${active ? 'text-[#8a5a3b]' : 'text-muted'}`}
    >
      {icon}
      {label}
    </button>
  )
}
