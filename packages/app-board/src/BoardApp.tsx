import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Excalidraw, MainMenu, WelcomeScreen, exportToBlob, getSceneVersion } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { getApp } from '@bear/core'
import { TitleBar, statusLabel, useStoredData, useTheme } from '@bear/ui'
import {
  addBoard, emptyScene, initialIndex, patchBoard, removeBoard, sceneKey, sortedBoards, upgradeIndex, upgradeScene,
  type BoardInfo, type BoardScene, type BoardsIndex
} from './model'

const APP = getApp('board')

/** Excalidraw loads its hand-drawn fonts from here; they ship inside the app, not a CDN. */
;(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL('./excalidraw/', window.location.href).href

export function BoardApp({ onHome }: { onHome: () => void }) {
  const index = useStoredData<BoardsIndex>('boards', initialIndex, upgradeIndex)
  const [open, setOpen] = useState<string | null>(null)
  const d = index.data
  const board = d?.boards.find((b) => b.id === open) ?? null

  useEffect(() => {
    window.bear.setTitle(`${board ? board.name : 'Boards'} - Bear ${APP.name}`)
  }, [board?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return <div className="flex h-full items-center justify-center text-sm text-muted">Loading…</div>

  return (
    <div className="flex h-full flex-col bg-canvas" style={{ ['--accent' as string]: APP.color }}>
      <TitleBar app={APP} docName={board?.name ?? 'Boards'} dirty={false} status={statusLabel(index.status)} onHome={onHome} />
      {index.error && <div className="bg-red-100 px-4 py-1.5 text-[13px] text-red-900">{index.error}</div>}
      {board ? (
        <BoardEditor key={board.id} board={board} onBack={() => setOpen(null)} onRename={(name) => index.update((x) => patchBoard(x, board.id, { name: name.trim() || board.name }))} onSaved={(patch) => index.update((x) => patchBoard(x, board.id, patch))} />
      ) : (
        <Gallery
          boards={sortedBoards(d)}
          onNew={() => {
            const { data, board: b } = addBoard(d, 'Untitled board')
            index.update(() => data)
            setOpen(b.id)
          }}
          onOpen={setOpen}
          onDelete={(b) => {
            if (!window.confirm(`Delete "${b.name}"? This can't be undone.`)) return
            index.update((x) => removeBoard(x, b.id))
            void window.bear.deleteData(sceneKey(b.id))
          }}
        />
      )}
    </div>
  )
}

function Gallery({ boards, onNew, onOpen, onDelete }: { boards: BoardInfo[]; onNew: () => void; onOpen: (id: string) => void; onDelete: (b: BoardInfo) => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-10 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Boards</h1>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
        <button onClick={onNew} className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line text-sm text-muted hover:border-[var(--accent)] hover:text-ink">
          <Plus size={28} className="text-[var(--accent)]" /> New board
        </button>
        {boards.map((b) => (
          <div key={b.id} className="group relative">
            <button onClick={() => onOpen(b.id)} aria-label={`Open ${b.name}`} className="block w-full text-left">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-line bg-white shadow-sm transition group-hover:border-[var(--accent)] group-hover:shadow-md">
                {b.preview ? <img src={b.preview} alt="" className="max-h-full max-w-full object-contain p-3" /> : <span className="text-xs text-[#999]">Empty board</span>}
              </div>
              <div className="mt-2 truncate text-sm font-medium text-ink">{b.name}</div>
              <div className="text-xs text-muted">Edited {new Date(b.modified).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </button>
            <button aria-label={`Delete ${b.name}`} onClick={() => onDelete(b)} className="absolute right-2 top-2 rounded bg-white/90 p-1.5 text-[#555] opacity-0 shadow hover:text-red-600 group-hover:opacity-100">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      {!boards.length && <p className="mt-8 text-sm text-muted">A board is an endless canvas for sketching, sticky notes, diagrams and brainstorming.</p>}
    </div>
  )
}

function BoardEditor({ board, onBack, onRename, onSaved }: { board: BoardInfo; onBack: () => void; onRename: (name: string) => void; onSaved: (patch: Partial<BoardInfo>) => void }) {
  const scene = useStoredData<BoardScene>(sceneKey(board.id), emptyScene, upgradeScene)
  const [uiTheme] = useTheme()
  const lastVersion = useRef<number | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dark = uiTheme === 'dark' || (uiTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const pendingPreview = useRef<{ elements: readonly unknown[]; background: string; files: Record<string, unknown> } | null>(null)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  async function makePreview() {
    previewTimer.current = null
    const p = pendingPreview.current
    if (!p) return
    pendingPreview.current = null
    const live = (p.elements as { isDeleted?: boolean }[]).filter((e) => !e.isDeleted)
    if (!live.length) return onSavedRef.current({ preview: null })
    try {
      const blob = await exportToBlob({ elements: live as never, appState: { exportBackground: true, viewBackgroundColor: p.background } as never, files: p.files as never, maxWidthOrHeight: 360, mimeType: 'image/png' })
      const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob) })
      onSavedRef.current({ preview: url })
    } catch {
      /* a missing thumbnail isn't worth bothering the user about */
    }
  }

  const onChange = useCallback(
    (elements: readonly unknown[], appState: { viewBackgroundColor: string; gridModeEnabled?: boolean }, files: Record<string, unknown>) => {
      // Excalidraw reports every pointer move; only save when the drawing itself changed.
      const version = getSceneVersion(elements as never) + Object.keys(files).length + appState.viewBackgroundColor.length
      if (lastVersion.current === null) {
        lastVersion.current = version
        return
      }
      if (version === lastVersion.current) return
      lastVersion.current = version
      scene.update(() => ({
        elements: (elements as { isDeleted?: boolean }[]).filter((e) => !e.isDeleted),
        appState: { viewBackgroundColor: appState.viewBackgroundColor, gridModeEnabled: appState.gridModeEnabled },
        files
      }))
      onSaved({ modified: Date.now() })
      // Refresh the gallery thumbnail a little after drawing stops.
      pendingPreview.current = { elements, background: appState.viewBackgroundColor, files }
      if (previewTimer.current) clearTimeout(previewTimer.current)
      previewTimer.current = setTimeout(makePreview, 1500)
    },
    [scene.update, onSaved] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Leaving the board before the timer fires still produces a thumbnail.
  useEffect(() => () => {
    if (previewTimer.current) {
      clearTimeout(previewTimer.current)
      void makePreview()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 text-[13px]">
        <button onClick={onBack} className="flex items-center gap-1.5 rounded px-2 py-1 text-ink hover:bg-hover"><ArrowLeft size={15} /> All boards</button>
        <input aria-label="Board name" defaultValue={board.name} onBlur={(e) => onRename(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-64 rounded border border-transparent bg-transparent px-2 py-1 font-medium text-ink outline-none hover:border-line focus:border-[var(--accent)]" />
        <span className="ml-auto text-muted">{statusLabel(scene.status)}</span>
      </div>
      {scene.error && <div className="bg-red-100 px-4 py-1.5 text-[13px] text-red-900">{scene.error}</div>}
      <div className="relative min-h-0 flex-1" data-board>
        {scene.data && (
          <Excalidraw
            initialData={{ elements: scene.data.elements as never, appState: scene.data.appState as never, files: scene.data.files as never, scrollToContent: true }}
            onChange={onChange as never}
            theme={dark ? 'dark' : 'light'}
            name={board.name}
            UIOptions={{ canvasActions: { loadScene: true, saveToActiveFile: false, export: { saveFileToDisk: true } } }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.LoadScene />
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
            <WelcomeScreen>
              <WelcomeScreen.Hints.ToolbarHint />
              <WelcomeScreen.Hints.MenuHint />
              <WelcomeScreen.Center>
                <WelcomeScreen.Center.Heading>Draw, sketch, brainstorm.</WelcomeScreen.Center.Heading>
              </WelcomeScreen.Center>
            </WelcomeScreen>
          </Excalidraw>
        )}
      </div>
    </div>
  )
}
