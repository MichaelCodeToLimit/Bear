import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { EDITIONS, appForFile, getEdition, type OpenedFile } from '@bear/core'
import { WriteApp, type WriteInput } from '@bear/app-write'
import { SheetsApp, type SheetsInput } from '@bear/app-sheets'
import { SlidesApp, type SlidesInput } from '@bear/app-slides'
import { NotesApp } from '@bear/app-notes'
import { TasksApp } from '@bear/app-tasks'
import { BoardApp } from '@bear/app-board'
import { SitesApp } from '@bear/app-sites'
import { MailApp } from '@bear/app-mail'
import type { PhotoInput } from '@bear/app-photo'
import { Launcher } from './Launcher'

// Photo brings its PSD and image libraries along, so it loads only when first opened.
const PhotoApp = lazy(() => import('@bear/app-photo').then((m) => ({ default: m.PhotoApp })))

export type Screen =
  | { app: 'home' }
  | { app: 'write'; input: WriteInput; key: number }
  | { app: 'sheets'; input: SheetsInput; key: number }
  | { app: 'slides'; input: SlidesInput; key: number }
  | { app: 'photo'; input: PhotoInput; key: number }
  | { app: 'notes' | 'tasks' | 'board' | 'sites' | 'mail'; key: number }

export type OpenApp = (screen: Exclude<Screen, { app: 'home' }>) => void

export function App() {
  const [screen, setScreen] = useState<Screen>({ app: 'home' })

  const home = useCallback(() => {
    window.bear.setTitle(EDITIONS[getEdition()].productName)
    setScreen({ app: 'home' })
  }, [])

  /** Open a file in the Bear app that handles it. Returns false if no Bear app can. */
  const openFile = useCallback((file: OpenedFile): boolean => {
    const app = appForFile(file.path)
    const key = Date.now()
    if (app === 'write') setScreen({ app, input: { kind: 'file', file }, key })
    else if (app === 'sheets') setScreen({ app, input: { kind: 'file', file }, key })
    else if (app === 'slides') setScreen({ app, input: { kind: 'file', file }, key })
    else if (app === 'photo') setScreen({ app, input: { kind: 'file', file }, key })
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

  switch (screen.app) {
    case 'write':
      return <WriteApp key={screen.key} input={screen.input} onHome={home} />
    case 'sheets':
      return <SheetsApp key={screen.key} input={screen.input} onHome={home} />
    case 'slides':
      return <SlidesApp key={screen.key} input={screen.input} onHome={home} />
    case 'photo':
      return (
        <Suspense fallback={<div className="h-full bg-canvas" />}>
          <PhotoApp key={screen.key} input={screen.input} onHome={home} />
        </Suspense>
      )
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
