import { useCallback, useEffect, useRef, useState } from 'react'
import { MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { Excalidraw, MainMenu, WelcomeScreen, exportToBlob, getSceneVersion } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useStoredData, statusLabel } from '@bear/ui/src/useStoredData'
import {
  addBoard, emptyScene, initialIndex, patchBoard, removeBoard, sceneKey, sortedBoards, upgradeIndex, upgradeScene,
  type BoardInfo, type BoardScene, type BoardsIndex
} from '@bear/app-board/src/model'
import { useLayer } from '../nav'
import { Empty, Fab, IconButton, Page, ask, confirm, menu, when } from '../ui'

/** Excalidraw loads its hand-drawn fonts from here; they ship inside the app. */
;(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL('./excalidraw/', window.location.href).href

export default function BoardPhone() {
  const index = useStoredData<BoardsIndex>('boards', initialIndex, upgradeIndex)
  const open = useLayer<string>()
  const d = index.data
  if (!d) return <Page title="Board" back tinted>{null}</Page>
  const board = d.boards.find((b) => b.id === open.value)

  const rename = async (b: BoardInfo) => {
    const name = await ask('Rename board', { value: b.name, ok: 'Rename' })
    if (name?.trim()) index.update((x) => patchBoard(x, b.id, { name: name.trim() }))
  }
  const remove = async (b: BoardInfo, after?: () => void) => {
    if (!(await confirm(`Delete “${b.name}”?`, 'This can’t be undone.'))) return
    after?.()
    index.update((x) => removeBoard(x, b.id))
    void window.bear.deleteData(sceneKey(b.id))
  }

  if (board)
    return (
      <BoardEditor
        key={board.id}
        board={board}
        onSaved={(patch) => index.update((x) => patchBoard(x, board.id, patch))}
        onMenu={() =>
          menu(
            [
              { label: 'Rename', icon: Pencil, onClick: () => void rename(board) },
              { label: 'Delete board', icon: Trash2, danger: true, onClick: () => void remove(board, open.close) }
            ],
            board.name
          )
        }
      />
    )

  const boards = sortedBoards(d)
  return (
    <Page
      title="Board"
      subtitle="Whiteboards"
      tinted
      back
      fab={
        <Fab
          icon={Plus}
          label="New board"
          onClick={() => {
            const r = addBoard(d, 'Untitled board')
            index.update(() => r.data)
            open.open(r.board.id)
          }}
        />
      }
    >
      {!boards.length ? (
        <Empty icon={Pencil} title="Draw anything" text="A board is an endless canvas for sketches, sticky notes, diagrams and brainstorming. Draw with your finger or a stylus." />
      ) : (
        <div className="grid grid-cols-2 gap-3 p-3 pb-28">
          {boards.map((b) => (
            <div key={b.id} className="overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line/60">
              <button onClick={() => open.open(b.id)} aria-label={`Open ${b.name}`} className="block w-full active:opacity-80">
                <div className="flex aspect-[4/3] items-center justify-center bg-white">
                  {b.preview ? <img src={b.preview} alt="" className="max-h-full max-w-full object-contain p-2" /> : <span className="text-[12px] text-[#999]">Empty board</span>}
                </div>
              </button>
              <div className="flex items-center pl-3">
                <button onClick={() => open.open(b.id)} className="min-w-0 flex-1 py-2 text-left">
                  <div className="truncate text-[14.5px] font-medium text-ink">{b.name}</div>
                  <div className="text-[12px] text-muted">{when(b.modified)}</div>
                </button>
                <IconButton
                  icon={MoreVertical}
                  label={`${b.name} options`}
                  size={18}
                  className="text-muted"
                  onClick={() =>
                    menu(
                      [
                        { label: 'Rename', icon: Pencil, onClick: () => void rename(b) },
                        { label: 'Delete', icon: Trash2, danger: true, onClick: () => void remove(b) }
                      ],
                      b.name
                    )
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

function BoardEditor({ board, onSaved, onMenu }: { board: BoardInfo; onSaved: (patch: Partial<BoardInfo>) => void; onMenu: () => void }) {
  const scene = useStoredData<BoardScene>(sceneKey(board.id), emptyScene, upgradeScene)
  const lastVersion = useRef<number | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPreview = useRef<{ elements: readonly unknown[]; background: string; files: Record<string, unknown> } | null>(null)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  const [dark] = useState(() => document.documentElement.classList.contains('dark'))

  async function makePreview() {
    previewTimer.current = null
    const p = pendingPreview.current
    if (!p) return
    pendingPreview.current = null
    const live = (p.elements as { isDeleted?: boolean }[]).filter((e) => !e.isDeleted)
    if (!live.length) return onSavedRef.current({ preview: null })
    try {
      const blob = await exportToBlob({ elements: live as never, appState: { exportBackground: true, viewBackgroundColor: p.background } as never, files: p.files as never, maxWidthOrHeight: 360, mimeType: 'image/png' })
      const url = await new Promise<string>((res) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.readAsDataURL(blob)
      })
      onSavedRef.current({ preview: url })
    } catch {
      /* a missing thumbnail isn't worth interrupting for */
    }
  }

  const onChange = useCallback(
    (elements: readonly unknown[], appState: { viewBackgroundColor: string; gridModeEnabled?: boolean }, files: Record<string, unknown>) => {
      // Excalidraw reports every pointer move; only save when the drawing changed.
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
      onSavedRef.current({ modified: Date.now() })
      pendingPreview.current = { elements, background: appState.viewBackgroundColor, files }
      if (previewTimer.current) clearTimeout(previewTimer.current)
      previewTimer.current = setTimeout(makePreview, 1500)
    },
    [scene.update] // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(
    () => () => {
      if (previewTimer.current) {
        clearTimeout(previewTimer.current)
        void makePreview()
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <Page title={board.name} subtitle={statusLabel(scene.status)} back scroll={false} actions={<IconButton icon={MoreVertical} label="Board options" onClick={onMenu} />}>
      {scene.error && <div className="bg-red-100 px-4 py-2 text-[13px] text-red-900">{scene.error}</div>}
      <div className="phone-board relative min-h-0 flex-1">
        {scene.data && (
          <Excalidraw
            initialData={{ elements: scene.data.elements as never, appState: scene.data.appState as never, files: scene.data.files as never, scrollToContent: true }}
            onChange={onChange as never}
            theme={dark ? 'dark' : 'light'}
            name={board.name}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
            <WelcomeScreen>
              <WelcomeScreen.Center>
                <WelcomeScreen.Center.Heading>Pick a tool below and start drawing.</WelcomeScreen.Center.Heading>
              </WelcomeScreen.Center>
            </WelcomeScreen>
          </Excalidraw>
        )}
      </div>
    </Page>
  )
}
