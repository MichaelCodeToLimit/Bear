import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { appForFile, type OpenedFile } from '@bear/core'
import type { WriteInput } from '@bear/app-write'
import type { SheetsInput } from '@bear/app-sheets'
import type { SlidesInput } from '@bear/app-slides'
import { Launcher } from './Launcher'

// Each app is loaded the first time it's opened, so starting Bear only loads the launcher. This
// matters most on phones, where parsing every app's code (Excalidraw, the editors, the Office file
// readers) up front took seconds.
const WriteApp = lazy(() => import('@bear/app-write').then((m) => ({ default: m.WriteApp })))
const SheetsApp = lazy(() => import('@bear/app-sheets').then((m) => ({ default: m.SheetsApp })))
const SlidesApp = lazy(() => import('@bear/app-slides').then((m) => ({ default: m.SlidesApp })))
const NotesApp = lazy(() => import('@bear/app-notes').then((m) => ({ default: m.NotesApp })))
const TasksApp = lazy(() => import('@bear/app-tasks').then((m) => ({ default: m.TasksApp })))
const BoardApp = lazy(() => import('@bear/app-board').then((m) => ({ default: m.BoardApp })))
const SitesApp = lazy(() => import('@bear/app-sites').then((m) => ({ default: m.SitesApp })))
const MailApp = lazy(() => import('@bear/app-mail').then((m) => ({ default: m.MailApp })))

/** Shown for the moment an app's code takes to load. */
function Loading(): ReactNode {
  return <div className="flex h-screen items-center justify-center bg-[var(--canvas)] text-sm text-[var(--muted)]">Loading…</div>
}

export type Screen =
  | { app: 'home' }
  | { app: 'write'; input: WriteInput; key: number }
  | { app: 'sheets'; input: SheetsInput; key: number }
  | { app: 'slides'; input: SlidesInput; key: number }
  | { app: 'notes' | 'tasks' | 'board' | 'sites' | 'mail'; key: number }

export type OpenApp = (screen: Exclude<Screen, { app: 'home' }>) => void

export function App() {
  const [screen, setScreen] = useState<Screen>({ app: 'home' })

  const home = useCallback(() => {
    window.bear.setTitle('Bear')
    setScreen({ app: 'home' })
  }, [])

  /** Open a file in the Bear app that handles it. Returns false if no Bear app can. */
  const openFile = useCallback((file: OpenedFile): boolean => {
    const app = appForFile(file.path)
    const key = Date.now()
    if (app === 'write') setScreen({ app, input: { kind: 'file', file }, key })
    else if (app === 'sheets') setScreen({ app, input: { kind: 'file', file }, key })
    else if (app === 'slides') setScreen({ app, input: { kind: 'file', file }, key })
    else return false
    return true
  }, [])

  /** Open a path from inside Bear (e.g. a site's document library). */
  const openPath = useCallback(
    async (path: string) => {
      try {
        if (!openFile(await window.bear.readFile(path))) await window.bear.openExternal(path)
      } catch (e) {
        window.alert(`Couldn't open ${path}: ${(e as Error).message}`)
      }
    },
    [openFile]
  )

  // A window opened for a document (double-clicked in Explorer/Finder) goes straight to it.
  useEffect(() => {
    void window.bear.takeLaunchFile().then((path) => {
      if (path) void openPath(path)
    })
  }, [openPath])

  return <Suspense fallback={<Loading />}>{renderScreen()}</Suspense>

  function renderScreen(): ReactNode {
    switch (screen.app) {
      case 'write':
        return <WriteApp key={screen.key} input={screen.input} onHome={home} />
      case 'sheets':
        return <SheetsApp key={screen.key} input={screen.input} onHome={home} />
      case 'slides':
        return <SlidesApp key={screen.key} input={screen.input} onHome={home} />
      case 'notes':
        return <NotesApp key={screen.key} onHome={home} />
      case 'tasks':
        return <TasksApp key={screen.key} onHome={home} />
      case 'board':
        return <BoardApp key={screen.key} onHome={home} />
      case 'sites':
        return <SitesApp key={screen.key} onHome={home} openFile={(p) => void openPath(p)} openApp={(app) => setScreen({ app, key: Date.now() })} />
      case 'mail':
        return <MailApp key={screen.key} onHome={home} openPath={(p) => void openPath(p)} />
      default:
        return <Launcher open={setScreen} openFile={openFile} />
    }
  }
}
