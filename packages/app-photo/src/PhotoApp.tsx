import { useCallback, useEffect, useRef, useState } from 'react'
import { FilePlus2, FolderOpen, ImagePlus, Redo2, Save, Undo2 } from 'lucide-react'
import { getApp, type OpenedFile } from '@bear/core'
import { StatusBar, TitleBar, abortError, useDocumentFile } from '@bear/ui'
import type { Point } from './render/view'
import { memoryBudget } from './io/limits'
import { OPEN_FILTERS, SAVABLE, SAVE_FILTERS, flattenWarning, loadPhotoFile, needsFlatten, serializePhoto } from './file-io'
import type { PhotoDoc } from './model/doc'
import { usePhotoEditor } from './usePhotoEditor'
import { useRecovery } from './useRecovery'
import { isTyping, useIncomingImages } from './useIncomingImages'
import { NoticeBar, useConfirm, useNotices } from './feedback'
import { CanvasView, type CanvasBackground } from './CanvasView'
import { PhotoRibbon } from './PhotoRibbon'
import { Toolbox } from './Toolbox'
import { OptionsBar } from './OptionsBar'
import { LayersPanel } from './panels/LayersPanel'
import { HistoryPanel } from './panels/HistoryPanel'
import { ColorPanel, resetColors, swapColors } from './panels/ColorPanel'
import { CanvasSizeDialog, NewImageDialog } from './NewImageDialog'
import { PhotoBackstage, type BackstagePage } from './PhotoBackstage'
import { formatZoom, zoomCommand, type ZoomCommand } from './zoom'
import { useTools } from './useTools'
import { ToolOverlay } from './ToolOverlay'
import { TextEditBox, textBoxHandlers } from './TextEditBox'
import { useImageDialogs } from './dialogs/useImageDialogs'
import { useTestHook } from './testHook'
import { shortcutFor, type Command } from './shortcuts'
import { useEditCommands } from './useEditCommands'
import { useSessionFlag } from './useSessionFlag'
import { GridOverlay, Rulers } from './ViewGuides'

const APP = getApp('photo')

export type PhotoInput = { kind: 'new' } | { kind: 'file'; file: OpenedFile }

const percent = (scale: number) => `${Math.floor(scale * 1000) / 10}%`

export function PhotoApp({ input, onHome }: { input: PhotoInput; onHome: () => void }) {
  const state = usePhotoEditor()
  const { editor, hasDoc, version, load } = state
  const tools = useTools(state)
  const [tab, setTab] = useState('home')
  const [backstage, setBackstage] = useState<BackstagePage | null>(null)
  const [newOpen, setNewOpen] = useState(input.kind === 'new')
  const [canvasSizeOpen, setCanvasSizeOpen] = useState(false)
  const [background, setBackground] = useState<CanvasBackground>('light')
  const [cursor, setCursor] = useState<Point | null>(null)
  const [rulers, setRulers] = useSessionFlag('bear-photo-rulers')
  const [grid, setGrid] = useSessionFlag('bear-photo-grid')
  const notices = useNotices()
  const confirm = useConfirm(APP.color)
  const editorRef = useRef(editor)
  editorRef.current = editor
  const dialogs = useImageDialogs({ state, tools, accent: APP.color, notify: notices.notify })
  const dialogsRef = useRef(dialogs)
  dialogsRef.current = dialogs
  const viewRef = useRef(state.view)
  viewRef.current = state.view
  useTestHook(editorRef, viewRef)

  /** Ask before opening something too large; resolves to the scale to use, or throws AbortError. */
  const askScale = useCallback(async (name: string, scale: number, reason: string) => {
    const why = reason === 'dimensions' ? 'it is wider or taller than 30,000 pixels' : 'it needs more memory than this computer has free'
    const ok = await confirm.ask({ title: 'This image is very large', body: `${name} can't be opened at full size because ${why}.`, confirm: `Open at ${percent(scale)}` })
    if (!ok) throw abortError()
    return scale
  }, [confirm.ask]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Read a file (with the "Open at N%" prompt) and make it the document. */
  const openDoc = useCallback(async (f: OpenedFile) => {
    let res = await loadPhotoFile(f, memoryBudget())
    if ('needsScale' in res) res = await loadPhotoFile(f, memoryBudget(), await askScale(f.name, res.needsScale, res.reason))
    if (!('doc' in res)) throw new Error('it is too large to open')
    notices.clear()
    load(res.doc, 'Open')
    setNewOpen(false)
    if (res.warnings.length) notices.notify(`Some parts of ${f.name} didn't carry over: ${res.warnings.join('; ')}.`)
  }, [askScale, load, notices.clear, notices.notify]) // eslint-disable-line react-hooks/exhaustive-deps

  const [changeToken, setChangeToken] = useState(0)
  const file = useDocumentFile({
    app: APP,
    untitled: 'Image1',
    defaultExt: 'bearphoto',
    saveFilters: SAVE_FILTERS,
    openFilters: OPEN_FILTERS,
    savable: SAVABLE,
    serialize: async (path, { auto }) => {
      // A save by the user includes an open text box; AutoSave leaves the box open while typing.
      if (!auto) tools.commitPending()
      // A filter preview may have swapped a layer's pixels; save the real ones.
      const doc = dialogsRef.current.docForSave(editorRef.current.doc)
      if (needsFlatten(doc, path) && !(await confirm.ask({ title: 'Flatten layers?', body: flattenWarning(path), confirm: 'Flatten and save' }))) throw abortError()
      return serializePhoto(doc, path)
    },
    load: openDoc,
    changeToken
  })

  // Mark the file dirty on every recorded edit (and undo/redo), not on view-only refreshes.
  useEffect(
    () =>
      state.subscribe((_dirty, kind) => {
        if (kind !== 'edit') return
        file.setDirty(true)
        setChangeToken((t) => t + 1)
      }),
    [state.subscribe, file.setDirty] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const recovery = useRecovery({
    accent: APP.color,
    getDoc: () => (hasDoc ? dialogsRef.current.docForSave(editorRef.current.doc) : null),
    dirty: file.dirty,
    version,
    onRestore: (doc) => {
      notices.clear()
      load(doc, 'Open')
      setNewOpen(false)
      file.markNew('Recovered image')
      file.setDirty(true)
    },
    onError: file.setError
  })

  const createNew = (doc: PhotoDoc) => {
    notices.clear()
    load(doc, 'New')
    file.markNew()
    setNewOpen(false)
  }

  useEffect(() => {
    if (input.kind === 'file') void file.openFile(input.file)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const addIncoming = useIncomingImages({
    hasDoc, editorRef, openDoc, askScale, guard: file.guard, markNew: file.markNew, setError: file.setError
  })

  const zoom = useCallback((cmd: ZoomCommand) => {
    const d = editorRef.current.doc
    state.setView((v) => zoomCommand(v, cmd, d.width, d.height))
  }, [state.setView]) // eslint-disable-line react-hooks/exhaustive-deps

  const editCommand = useEditCommands(state, tools, addIncoming)

  /** Run a shortcut command. False when it needs a document and there is none (the key is left alone). */
  const runCommand = useCallback((cmd: Command): boolean => {
    switch (cmd) {
      case 'save': void file.save(); return true
      case 'saveAs': void file.saveAs(); return true
      case 'open': file.browseOpen(); return true
      case 'new': file.guard('start a new image', () => setNewOpen(true)); return true
      case 'paste': editCommand('paste'); return true
      case 'swapColors': state.setColors(swapColors(state.colors)); return true
      case 'resetColors': state.setColors(resetColors()); return true
    }
    if (!hasDoc) return false
    switch (cmd) {
      case 'undo': editor.history.undo(); break
      case 'redo': editor.history.redo(); break
      case 'zoomIn': zoom('in'); break
      case 'zoomOut': zoom('out'); break
      case 'fit': zoom('fit'); break
      case 'actual': zoom('actual'); break
      case 'brushSmaller':
      case 'brushBigger':
        break // the active brush tool takes [ and ] itself, in tools.onKeyDown
      default: editCommand(cmd)
    }
    return true
  }, [file, hasDoc, editor, zoom, state, editCommand])

  // Keyboard: tool letters and Space go to the tools first, then shortcuts become commands.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role=dialog]')) return
      // Ctrl+S still saves from the Text tool's box (the save commits the box first).
      const saveFromTextBox = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && e.target instanceof Element && !!e.target.closest('[data-testid=photo-text-box]')
      if (isTyping(e.target) && !saveFromTextBox) return
      if (tools.onKeyDown(e)) return e.preventDefault()
      const cmd = shortcutFor({ key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey })
      if (cmd && runCommand(cmd)) e.preventDefault()
    }
    // Space is released wherever focus is, so Hand never sticks.
    const onKeyUp = (e: KeyboardEvent) => tools.onKeyUp(e)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [runCommand, tools.onKeyDown, tools.onKeyUp])

  const doc = editor.doc
  const h = editor.history
  const iconBtn = 'rounded p-1.5 hover:bg-white/15 disabled:opacity-40'

  return (
    <div className="flex h-full flex-col bg-canvas" style={{ ['--accent' as string]: APP.color }} data-version={version}>
      <TitleBar
        app={APP}
        docName={file.doc.name}
        dirty={file.dirty}
        onHome={() => file.guard('go home', onHome)}
        autosave={file.autosave}
        right={
          <>
            <button title="Undo (Ctrl+Z)" disabled={!hasDoc || !h.canUndo} onClick={() => h.undo()} className={iconBtn}><Undo2 size={16} /></button>
            <button title="Redo (Ctrl+Y)" disabled={!hasDoc || !h.canRedo} onClick={() => h.redo()} className={iconBtn}><Redo2 size={16} /></button>
            <button title="Save (Ctrl+S)" disabled={!hasDoc} onClick={() => void file.save()} className={iconBtn}><Save size={16} /></button>
          </>
        }
      />
      <PhotoRibbon
        state={state}
        tab={tab}
        setTab={setTab}
        onFile={() => setBackstage('info')}
        accent={APP.color}
        background={background}
        setBackground={setBackground}
        zoom={zoom}
        onCanvasSize={() => setCanvasSizeOpen(true)}
        onDialog={dialogs.open}
        onImage={dialogs.command}
        onEdit={editCommand}
        rulers={rulers}
        setRulers={setRulers}
        grid={grid}
        setGrid={setGrid}
      />
      {file.banner}
      <NoticeBar notices={notices} />
      <OptionsBar tool={state.tool} values={tools.options[state.tool]} onChange={(id, v) => tools.setOption(state.tool, id, v)} />

      <div
        className="flex min-h-0 flex-1"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault()
        }}
        onDrop={(e) => {
          const images = Array.from(e.dataTransfer.files)
          if (!images.length) return
          e.preventDefault()
          void addIncoming(images)
        }}
      >
        <Toolbox tool={state.tool} setTool={state.setTool} />
        <CanvasView state={state} background={background} onCursor={setCursor} onNotice={notices.notifySticky} onToolPointer={tools.onPointer} cursor={tools.cursor} preview={dialogs.preview}>
          {hasDoc && <ToolOverlay selection={doc.selection} overlay={tools.overlay} view={state.view} hover={cursor !== null && (state.tool === 'brush' || state.tool === 'eraser')} />}
          {hasDoc && grid && <GridOverlay docW={doc.width} docH={doc.height} view={state.view} />}
          {hasDoc && tools.overlay?.kind === 'text' && <TextEditBox box={tools.overlay} view={state.view} options={tools.options.text} {...textBoxHandlers(tools)} />}
          {hasDoc && rulers && <Rulers view={state.view} cursor={cursor} />}
          {!hasDoc && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted">
              <ImagePlus size={40} strokeWidth={1.2} />
              <p>Create a new image, open one, or drop a picture here.</p>
              <div className="flex gap-2">
                <button onClick={() => setNewOpen(true)} className="flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-ink hover:bg-hover"><FilePlus2 size={15} /> New image</button>
                <button onClick={() => file.browseOpen()} className="flex items-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-ink hover:bg-hover"><FolderOpen size={15} /> Open…</button>
              </div>
            </div>
          )}
        </CanvasView>
        <aside className="flex w-64 shrink-0 flex-col border-l border-line bg-surface">
          <ColorPanel colors={state.colors} setColors={state.setColors} />
          <LayersPanel state={state} />
          <HistoryPanel state={state} />
        </aside>
      </div>

      <StatusBar
        left={
          hasDoc ? (
            <>
              <span data-testid="photo-zoom">{formatZoom(state.view.zoom)}</span>
              <span>{doc.width} × {doc.height} px</span>
              <span>{cursor ? `${cursor.x}, ${cursor.y}` : ''}</span>
              {tools.status && <span data-testid="photo-tool-status">{tools.status}</span>}
            </>
          ) : (
            <span>No image</span>
          )
        }
        right={<span>{file.statusText}</span>}
      />

      <PhotoBackstage
        page={backstage}
        setPage={setBackstage}
        accent={APP.color}
        file={file}
        doc={hasDoc ? doc : null}
        onNew={() => file.guard('start a new image', () => { setBackstage(null); setNewOpen(true) })}
        onClose={() => file.guard('close this image', onHome)}
      />

      {/* Every way of opening this dialog has already asked about unsaved changes. */}
      {newOpen && !recovery.prompt && <NewImageDialog accent={APP.color} onCreate={createNew} onClose={() => setNewOpen(false)} />}
      {canvasSizeOpen && (
        <CanvasSizeDialog
          accent={APP.color}
          width={doc.width}
          height={doc.height}
          onApply={(w, hh, anchor) => {
            setCanvasSizeOpen(false)
            if (w !== doc.width || hh !== doc.height) editor.resizeCanvas(w, hh, anchor)
          }}
          onClose={() => setCanvasSizeOpen(false)}
        />
      )}
      {dialogs.element}
      {confirm.dialog}
      {recovery.prompt}
      {file.savePrompt}
    </div>
  )
}
