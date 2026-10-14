import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FileDown, FilePlus2, FolderOpen, Info, Play, Printer, Redo2, Save, SaveAll, Undo2, X } from 'lucide-react'
import { getApp, type OpenedFile } from '@bear/core'
import {
  Backstage, Button, RecentList, StatusBar, TitleBar, prepareImage, useDocumentFile, useTheme, type BackstageItem
} from '@bear/ui'
import { SlidesStore, newPresentation } from './store'
import { Stage } from './Stage'
import { Thumbnails } from './Thumbnails'
import { SlidesRibbon } from './SlidesRibbon'
import { Presenter } from './Presenter'
import { Sorter } from './Sorter'
import { PrintView } from './PrintView'
import { SlideView } from './SlideView'
import { ContextMenu, type MenuItem } from '@bear/ui'
import { OPEN_FILTERS, SAVABLE, SAVE_FILTERS, exportPptx, readPresentation } from './file-io'
import { hasText } from './model'
import { getTheme } from './themes'
import { DECK_TEMPLATES, type DeckTemplate } from './templates'

const APP = getApp('slides')

export type SlidesInput = { kind: 'file'; file: OpenedFile } | { kind: 'template'; template?: DeckTemplate }

export function SlidesApp({ input, onHome }: { input: SlidesInput; onHome: () => void }) {
  const [store] = useState(() => new SlidesStore(newPresentation()))
  const version = useSyncExternalStore(store.subscribe, store.getVersion)
  const [tab, setTab] = useState('home')
  const [view, setView] = useState<'normal' | 'sorter'>('normal')
  const [showNotes, setShowNotes] = useState(true)
  const [presenting, setPresenting] = useState<number | null>(null)
  const [backstage, setBackstage] = useState<null | 'info' | 'new' | 'open'>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [changeToken, setChangeToken] = useState(0)
  const [uiTheme, setUiTheme] = useTheme()
  const pictureInput = useRef<HTMLInputElement>(null)
  const theme = getTheme(store.pres.theme)

  const file = useDocumentFile({
    app: APP,
    untitled: 'Presentation1',
    defaultExt: 'pptx',
    saveFilters: SAVE_FILTERS,
    openFilters: OPEN_FILTERS,
    savable: SAVABLE,
    serialize: () => exportPptx(store.pres),
    load: async (f) => {
      store.load(await readPresentation(f.data))
    },
    changeToken
  })

  useEffect(() => {
    store.onChange = () => {
      file.setDirty(true)
      setChangeToken((t) => t + 1)
    }
  }, [store, file.setDirty]) // eslint-disable-line react-hooks/exhaustive-deps

  const focusStage = useCallback(() => {
    ;(document.querySelector('[data-slide-stage]') as HTMLElement | null)?.focus({ preventScroll: true })
  }, [])

  const newFromTemplate = useCallback((t?: DeckTemplate) => {
    store.load((t ?? DECK_TEMPLATES[0]).build())
    file.markNew(t && t.id !== 'blank' ? t.name : undefined)
    setView('normal')
    setTimeout(focusStage)
  }, [store, file.markNew, focusStage]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (input.kind === 'file') void file.openFile(input.file).then(focusStage)
    else newFromTemplate(input.template)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const present = useCallback((fromCurrent: boolean) => {
    store.startEditing(null)
    setPresenting(fromCurrent ? store.current : 0)
  }, [store])

  const addPictureFile = useCallback(async (f: File) => {
    try {
      const img = await prepareImage(f)
      store.addImage(img.src, { w: img.width, h: img.height })
    } catch (e) {
      file.setError(`Couldn't add ${f.name || 'the picture'}: ${(e as Error).message}`)
    }
  }, [store]) // eslint-disable-line react-hooks/exhaustive-deps

  const onStageKey = (e: React.KeyboardEvent) => {
    const k = e.key
    const ctrl = e.ctrlKey || e.metaKey
    const run = (fn: () => void) => {
      e.preventDefault()
      fn()
    }
    if (store.editing) return
    if (ctrl) {
      const lk = k.toLowerCase()
      if (lk === 'z') return run(() => store.undo())
      if (lk === 'y') return run(() => store.redo())
      if (lk === 'a') return run(() => store.selectAll())
      if (lk === 'c') return run(() => void store.copy())
      if (lk === 'x') return run(() => store.cut())
      if (lk === 'v' && store.canPaste) return run(() => store.paste())
      if (lk === 'd') return run(() => store.duplicateSelected())
      if (lk === 'm') return run(() => store.addSlide('titleContent'))
      const style = store.selection.find(hasText)?.style
      if (lk === 'b' && style) return run(() => store.setTextStyle({ bold: !style.bold }))
      if (lk === 'i' && style) return run(() => store.setTextStyle({ italic: !style.italic }))
      if (lk === 'u' && style) return run(() => store.setTextStyle({ underline: !style.underline }))
    }
    if (k === 'F5') return run(() => present(e.shiftKey))
    const sel = store.selection
    if (sel.length) {
      const step = e.shiftKey ? 10 : 1
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      if (arrows[k]) return run(() => store.nudge(...arrows[k]))
      if (k === 'Delete' || k === 'Backspace') return run(() => store.deleteSelected())
      if (k === 'Escape') return run(() => store.select([]))
      if (k === 'Tab') {
        // Cycle through objects on the slide.
        return run(() => {
          const els = store.slide.elements
          const i = els.findIndex((el) => el.id === sel[sel.length - 1].id)
          const next = els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length]
          store.select([next.id])
        })
      }
      const textEl = sel.length === 1 && hasText(sel[0]) ? sel[0] : null
      if (textEl && (k === 'Enter' || k === 'F2')) return run(() => store.startEditing(textEl.id))
      // Typing with a text box selected replaces its text, as in other presentation apps.
      if (textEl && k.length === 1 && !ctrl && !e.altKey) {
        return run(() => {
          store.startEditing(textEl.id)
          store.setText(textEl.id, k)
        })
      }
    } else {
      if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown') return run(() => store.goto(store.current + 1))
      if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') return run(() => store.goto(store.current - 1))
      if (k === 'Home') return run(() => store.goto(0))
      if (k === 'End') return run(() => store.goto(store.pres.slides.length - 1))
      if (k === 'Tab' && store.slide.elements.length) return run(() => store.select([store.slide.elements[0].id]))
    }
  }

  // App-level shortcuts that work wherever focus is (except while presenting).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (presenting !== null) return
      const k = e.key.toLowerCase()
      const run = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      if (e.key === 'F5') return run(() => present(e.shiftKey))
      if (!(e.ctrlKey || e.metaKey)) return
      if (k === 's' && e.shiftKey) run(() => void file.saveAs())
      else if (k === 's') run(() => void file.save())
      else if (k === 'o') run(() => file.browseOpen(() => setBackstage(null)))
      else if (k === 'n') run(() => file.guard('start a new presentation', () => newFromTemplate()))
      else if (k === 'p') run(() => setTimeout(() => window.print(), 50))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [file, newFromTemplate, present, presenting])

  const elementMenu = (x: number, y: number) =>
    setMenu({
      x, y,
      items: store.selected.length
        ? [
            { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => store.cut() },
            { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => void store.copy() },
            { label: 'Paste', shortcut: 'Ctrl+V', disabled: !store.canPaste, onClick: () => store.paste() },
            { label: 'Duplicate', shortcut: 'Ctrl+D', onClick: () => store.duplicateSelected() },
            { label: 'Delete', shortcut: 'Del', onClick: () => store.deleteSelected() },
            { label: 'Bring to front', divider: true, onClick: () => store.reorder('front') },
            { label: 'Send to back', onClick: () => store.reorder('back') }
          ]
        : [
            { label: 'Paste', shortcut: 'Ctrl+V', disabled: !store.canPaste, onClick: () => store.paste() },
            { label: 'New slide', shortcut: 'Ctrl+M', divider: true, onClick: () => store.addSlide('titleContent') },
            { label: 'Add text box', onClick: () => store.addTextBox() }
          ]
    })

  const slideMenu = (i: number, x: number, y: number) =>
    setMenu({
      x, y,
      items: [
        { label: 'New slide', shortcut: 'Ctrl+M', onClick: () => store.addSlide('titleContent', i) },
        { label: 'Duplicate slide', onClick: () => store.duplicateSlide(i) },
        { label: 'Delete slide', disabled: store.pres.slides.length <= 1, onClick: () => store.deleteSlide(i) },
        { label: 'Move up', divider: true, disabled: i === 0, onClick: () => store.moveSlide(i, i - 1) },
        { label: 'Move down', disabled: i === store.pres.slides.length - 1, onClick: () => store.moveSlide(i, i + 1) },
        { label: 'Present from here', divider: true, onClick: () => setPresenting(i) }
      ]
    })

  const { doc } = file
  const closeBackstage = () => setBackstage(null)
  const backstageItems: BackstageItem[] = [
    { id: 'info', label: 'Info', icon: Info, onClick: () => setBackstage('info') },
    { id: 'new', label: 'New', icon: FilePlus2, onClick: () => setBackstage('new') },
    { id: 'open', label: 'Open', icon: FolderOpen, onClick: () => setBackstage('open') },
    { id: 'save', label: 'Save', icon: Save, onClick: () => { closeBackstage(); void file.save() }, dividerBefore: true },
    { id: 'saveas', label: 'Save a copy as…', icon: SaveAll, onClick: () => { closeBackstage(); void file.saveAs() } },
    { id: 'pdf', label: 'Export to PDF', icon: FileDown, onClick: () => { closeBackstage(); void file.exportPdf() } },
    { id: 'print', label: 'Print', icon: Printer, onClick: () => { closeBackstage(); setTimeout(() => window.print(), 50) } },
    { id: 'close', label: 'Close', icon: X, onClick: () => file.guard('close this presentation', onHome), dividerBefore: true }
  ]

  return (
    <div className="flex h-full flex-col bg-canvas" style={{ ['--accent' as string]: APP.color }} data-version={version}>
      <div className="contents print:hidden">
        <TitleBar
          app={APP}
          docName={doc.name}
          dirty={file.dirty}
          onHome={() => file.guard('go home', onHome)}
          autosave={file.autosave}
          right={
            <>
              <button title="Undo (Ctrl+Z)" disabled={!store.canUndo} onClick={() => store.undo()} className="rounded p-1.5 hover:bg-white/15 disabled:opacity-40"><Undo2 size={16} /></button>
              <button title="Redo (Ctrl+Y)" disabled={!store.canRedo} onClick={() => store.redo()} className="rounded p-1.5 hover:bg-white/15 disabled:opacity-40"><Redo2 size={16} /></button>
              <button title="Save (Ctrl+S)" onClick={() => void file.save()} className="rounded p-1.5 hover:bg-white/15"><Save size={16} /></button>
              <button title="Present (F5)" onClick={() => present(false)} className="ml-1 flex items-center gap-1 rounded bg-white/15 px-2 py-1 text-xs hover:bg-white/25"><Play size={13} /> Present</button>
            </>
          }
        />
        <SlidesRibbon
          store={store}
          tab={tab}
          setTab={setTab}
          onFile={() => setBackstage('info')}
          accent={APP.color}
          view={view}
          setView={setView}
          showNotes={showNotes}
          setShowNotes={setShowNotes}
          present={present}
          insertPicture={() => pictureInput.current?.click()}
          theme={uiTheme}
          setTheme={setUiTheme}
        />
        {file.banner}
      </div>

      <div className="flex min-h-0 flex-1 print:hidden">
        {view === 'normal' ? (
          <>
            <Thumbnails store={store} version={version} theme={theme} accent={APP.color} onMenu={slideMenu} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Stage
                store={store}
                version={version}
                theme={theme}
                accent={APP.color}
                onKeyDown={onStageKey}
                onPaste={(e) => {
                  const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
                  if (!images.length) return
                  e.preventDefault()
                  images.forEach((f) => void addPictureFile(f))
                }}
                onContextMenu={elementMenu}
              />
              {showNotes && (
                <textarea
                  aria-label="Speaker notes"
                  placeholder="Click to add notes"
                  value={store.slide.notes}
                  onChange={(e) => store.setNotes(e.target.value)}
                  className="h-24 shrink-0 resize-none border-t border-line bg-surface px-4 py-2 text-[13px] text-ink outline-none placeholder:text-muted"
                />
              )}
            </div>
          </>
        ) : (
          <Sorter store={store} theme={theme} accent={APP.color} onOpen={(i) => { store.goto(i); setView('normal') }} />
        )}
      </div>

      <div className="contents print:hidden">
        <StatusBar
          left={<span>Slide {store.current + 1} of {store.pres.slides.length} · {theme.name} · {file.statusText}</span>}
          right={
            <button onClick={() => setShowNotes(!showNotes)} className="hover:text-ink">{showNotes ? 'Hide notes' : 'Notes'}</button>
          }
        />
      </div>

      <input
        ref={pictureInput}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void addPictureFile(f)
          e.target.value = ''
        }}
      />

      <PrintView pres={store.pres} />

      {presenting !== null && (
        <Presenter
          pres={store.pres}
          start={presenting}
          onExit={(last) => {
            setPresenting(null)
            store.goto(last)
            setTimeout(focusStage)
          }}
        />
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      <Backstage open={!!backstage} onClose={closeBackstage} accent={APP.color} items={backstageItems}>
        {backstage === 'info' && (
          <div className="max-w-xl">
            <h1 className="mb-6 text-3xl font-light">Info</h1>
            <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
              <dt className="text-muted">Name</dt><dd>{doc.name}</dd>
              <dt className="text-muted">Location</dt>
              <dd className="break-all">
                {doc.path ?? 'Not saved yet'}
                {doc.path && <button onClick={() => window.bear.showInFolder(doc.path!)} className="ml-3 text-[var(--accent)] hover:underline">Show in folder</button>}
              </dd>
              <dt className="text-muted">Slides</dt><dd>{store.pres.slides.length}</dd>
              <dt className="text-muted">Theme</dt><dd>{theme.name}</dd>
              <dt className="text-muted">Status</dt><dd>{file.dirty ? 'Unsaved changes' : 'Saved'}</dd>
            </dl>
          </div>
        )}
        {backstage === 'new' && (
          <div>
            <h1 className="mb-6 text-3xl font-light">New</h1>
            <DeckTemplateGrid onPick={(t) => file.guard('start a new presentation', () => { closeBackstage(); newFromTemplate(t) })} />
          </div>
        )}
        {backstage === 'open' && (
          <div className="max-w-3xl">
            <h1 className="mb-6 text-3xl font-light">Open</h1>
            <Button primary accent={APP.color} onClick={() => file.browseOpen(closeBackstage)}>Browse…</Button>
            <h2 className="mb-2 mt-8 text-sm font-semibold text-muted">Recent presentations</h2>
            <RecentList items={file.recent.filter((r) => r.app === 'slides')} onOpen={(r) => file.openRecent(r, closeBackstage)} empty="No recent presentations yet." />
          </div>
        )}
      </Backstage>

      {file.savePrompt}
    </div>
  )
}

export function DeckTemplateGrid({ onPick }: { onPick: (t: DeckTemplate) => void }) {
  const [decks] = useState(() => DECK_TEMPLATES.map((t) => ({ t, pres: t.build() })))
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
      {decks.map(({ t, pres }) => (
        <button key={t.id} onClick={() => onPick(t)} aria-label={`${t.name} template`} className="group text-left">
          <div className="pointer-events-none mb-2 overflow-hidden rounded border border-line shadow-sm transition group-hover:border-[var(--accent)] group-hover:shadow-md">
            <SlideView slide={pres.slides[0]} theme={getTheme(pres.theme)} width={180} prompts />
          </div>
          <div className="text-sm font-medium">{t.name}</div>
          <div className="text-xs text-muted">{t.description}</div>
        </button>
      ))}
    </div>
  )
}
