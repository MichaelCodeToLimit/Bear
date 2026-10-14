import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { EditorState, NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'
import { FileDown, FilePlus2, FolderOpen, Info, Printer, Redo2, Save, SaveAll, Undo2, X } from 'lucide-react'
import { baseName, getApp, stripExtension, type OpenedFile } from '@bear/core'
import {
  Backstage, Button, Modal, RecentList, StatusBar, TitleBar, useDocumentFile, useTheme, type BackstageItem
} from '@bear/ui'
import { writeExtensions } from './extensions'
import { WriteRibbon, stepFontSize } from './WriteRibbon'
import { FindPanel } from './FindPanel'
import { editorToFile, fileToHtml, OPEN_FILTERS, SAVABLE, SAVE_FILTERS } from './doc-io'
import { DEFAULT_LAYOUT, contentWidthPx, pageInches, type PageLayout } from './layout'
import { TEMPLATES, type Template } from './templates'
import { prepareImage } from '@bear/ui'
import { InsertTableDialog } from './TablePicker'
import { insertTable } from './tables'

const APP = getApp('write')

/** What to load when Write opens: an existing file or a template (blank by default). */
export type WriteInput = { kind: 'file'; file: OpenedFile } | { kind: 'template'; template?: Template }

interface WriteAppProps {
  input: WriteInput
  onHome: () => void
}

export function WriteApp({ input, onHome }: WriteAppProps) {
  const [tab, setTab] = useState('home')
  const [backstage, setBackstage] = useState<null | 'info' | 'new' | 'open'>(null)
  const [find, setFind] = useState<null | { replace: boolean }>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [tableDialog, setTableDialog] = useState(false)
  const [layout, setLayout] = useState<PageLayout>(DEFAULT_LAYOUT)
  const [zoom, setZoom] = useState(1)
  const [focusMode, setFocusMode] = useState(false)
  const [changeToken, setChangeToken] = useState(0)
  const [theme, setTheme] = useTheme()
  const imageInput = useRef<HTMLInputElement>(null)
  const loading = useRef(false)
  const markDirty = useRef(() => {})
  const insertImageRef = useRef<(f: File) => void>(() => {})

  const editor = useEditor({
    extensions: writeExtensions(),
    editorProps: {
      attributes: { class: 'write-doc', spellcheck: 'true' },
      // Pasted screenshots/photos arrive as files, not HTML.
      handlePaste: (_view, event) => {
        const images = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (!images.length) return false
        images.forEach((f) => insertImageRef.current(f))
        return true
      },
      handleDOMEvents: {
        // When the editor regains focus, ProseMirror restores its last selection. If that was a
        // picture, it would override the click and the next keystroke would replace the picture.
        // So move the selection to the click point first.
        mousedown: (view, event) => {
          const sel = view.state.selection
          if (view.hasFocus() || !(sel instanceof NodeSelection)) return false
          const nodeDom = view.nodeDOM(sel.from)
          if (nodeDom instanceof Node && nodeDom.contains(event.target as Node)) return false
          const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (hit) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos))))
          return false
        }
      }
    },
    onUpdate: () => {
      if (loading.current) return
      markDirty.current()
      setChangeToken((t) => t + 1)
    }
  })

  /** Replace the editor content without marking the document dirty or polluting undo history. */
  const loadHtml = useCallback(
    (html: string) => {
      if (!editor) return
      loading.current = true
      editor.commands.setContent(html, false)
      // A fresh state clears undo history, so undo can't step back into the previous document.
      editor.view.updateState(EditorState.create({ doc: editor.state.doc, plugins: editor.state.plugins }))
      loading.current = false
      editor.commands.focus('start')
    },
    [editor]
  )

  const file = useDocumentFile({
    app: APP,
    untitled: 'Document1',
    defaultExt: 'docx',
    saveFilters: SAVE_FILTERS,
    openFilters: OPEN_FILTERS,
    savable: SAVABLE,
    serialize: (path) => editorToFile(editor!, path, layout, stripExtension(baseName(path))),
    load: async (f) => {
      const { html, warnings } = await fileToHtml(f.path, f.data)
      loadHtml(html)
      setLayout(DEFAULT_LAYOUT)
      return warnings
    },
    changeToken
  })
  markDirty.current = () => file.setDirty(true)

  const newFromTemplate = useCallback(
    (t?: Template) => {
      loadHtml(t?.html ?? '')
      file.markNew(t && t.id !== 'blank' ? t.name : undefined)
      setLayout(DEFAULT_LAYOUT)
    },
    [loadHtml, file.markNew] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Load the initial input once the editor exists.
  useEffect(() => {
    if (!editor) return
    if (input.kind === 'file') void file.openFile(input.file)
    else newFromTemplate(input.template)
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  const print = useCallback(() => {
    setBackstage(null)
    setTimeout(() => window.print(), 50)
  }, [])

  const insertImageFile = useCallback(
    async (f: File) => {
      if (!editor) return
      try {
        const img = await prepareImage(f)
        // Display no wider than the page's text area.
        const width = Math.min(img.width, contentWidthPx(layout))
        const height = Math.round((img.height * width) / img.width)
        const chain = editor.chain().focus()
        // A just-inserted picture stays selected; insert after it rather than replacing it.
        const sel = editor.state.selection
        if (sel instanceof NodeSelection) chain.setTextSelection(sel.to)
        chain.insertContent({ type: 'image', attrs: { src: img.src, width, height } }).run()
        // Leave a text cursor on the line after the picture (adding an empty line if needed)
        // rather than the picture selected.
        const after = editor.state.selection
        if (after instanceof NodeSelection) {
          const next = Selection.findFrom(editor.state.doc.resolve(after.to), 1, true)
          if (next && next.from === after.to + 1) editor.commands.setTextSelection(next.from)
          else editor.chain().insertContentAt(after.to, { type: 'paragraph' }).setTextSelection(after.to + 1).run()
        }
      } catch (e) {
        file.setError(`Couldn't add ${f.name || 'the picture'}: ${(e as Error).message}`)
      }
    },
    [editor, layout] // eslint-disable-line react-hooks/exhaustive-deps
  )
  insertImageRef.current = (f) => void insertImageFile(f)

  const closeBackstage = () => setBackstage(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !editor) return
      const k = e.key.toLowerCase()
      const run = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      if (k === 's' && e.shiftKey) run(() => void file.saveAs())
      else if (k === 's') run(() => void file.save())
      else if (k === 'o') run(() => file.browseOpen(closeBackstage))
      else if (k === 'n') run(() => file.guard('start a new document', () => newFromTemplate()))
      else if (k === 'p') run(print)
      else if (k === 'f') run(() => setFind({ replace: false }))
      else if (k === 'h') run(() => setFind({ replace: true }))
      else if (k === 'k') run(() => setLinkOpen(true))
      else if (k === ']') run(() => stepFontSize(editor, 1))
      else if (k === '[') run(() => stepFontSize(editor, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, file, newFromTemplate, print])

  const page = pageInches(layout)
  const pageCss = useMemo(
    () => `@page { size: ${page.w}in ${page.h}in; margin: ${page.margin}in; }`,
    [page.w, page.h, page.margin]
  )

  const words = editor?.storage.characterCount.words() ?? 0
  const chars = editor?.storage.characterCount.characters() ?? 0

  if (!editor) return null
  const { doc } = file

  const backstageItems: BackstageItem[] = [
    { id: 'info', label: 'Info', icon: Info, onClick: () => setBackstage('info') },
    { id: 'new', label: 'New', icon: FilePlus2, onClick: () => setBackstage('new') },
    { id: 'open', label: 'Open', icon: FolderOpen, onClick: () => setBackstage('open') },
    { id: 'save', label: 'Save', icon: Save, onClick: () => { closeBackstage(); void file.save() }, dividerBefore: true },
    { id: 'saveas', label: 'Save a copy as…', icon: SaveAll, onClick: () => { closeBackstage(); void file.saveAs() } },
    { id: 'pdf', label: 'Export to PDF', icon: FileDown, onClick: () => { closeBackstage(); void file.exportPdf() } },
    { id: 'print', label: 'Print', icon: Printer, onClick: print },
    { id: 'close', label: 'Close', icon: X, onClick: () => file.guard('close this document', onHome), dividerBefore: true }
  ]

  return (
    <div className="flex h-full flex-col bg-canvas" style={{ ['--accent' as string]: APP.color }}>
      <style>{pageCss}</style>

      <TitleBar
        app={APP}
        docName={doc.name}
        dirty={file.dirty}
        onHome={() => file.guard('go home', onHome)}
        autosave={file.autosave}
        right={
          <>
            <button title="Undo (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} className="rounded p-1.5 hover:bg-white/15 disabled:opacity-40"><Undo2 size={16} /></button>
            <button title="Redo (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} className="rounded p-1.5 hover:bg-white/15 disabled:opacity-40"><Redo2 size={16} /></button>
            <button title="Save (Ctrl+S)" onClick={() => void file.save()} className="rounded p-1.5 hover:bg-white/15"><Save size={16} /></button>
          </>
        }
      />

      {!focusMode && (
        <WriteRibbon
          editor={editor}
          tab={tab}
          setTab={setTab}
          onFile={() => setBackstage('info')}
          accent={APP.color}
          actions={{
            insertImage: () => imageInput.current?.click(),
            openTableDialog: () => setTableDialog(true),
            insertLink: () => setLinkOpen(true),
            openFind: (replace) => setFind({ replace }),
            layout, setLayout: (l) => { setLayout(l); file.setDirty(true) },
            zoom, setZoom, focusMode, setFocusMode, theme, setTheme
          }}
        />
      )}

      {file.banner}

      <div className="relative min-h-0 flex-1">
        {find && <FindPanel editor={editor} showReplace={find.replace} onClose={() => { setFind(null); editor.commands.focus() }} />}
        <div
          className="write-scroll h-full overflow-auto py-8"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const f = e.dataTransfer.files[0]
            if (f && (f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))) {
              e.preventDefault()
              void insertImageFile(f)
            }
          }}
        >
          <div
            className="write-page mx-auto bg-paper text-[#1f1f1f] shadow-[0_1px_4px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)]"
            style={{ width: `${page.w}in`, minHeight: `${page.h}in`, padding: `${page.margin}in`, zoom }}
            onMouseDown={(e) => {
              // Clicking in the page margins should still place the cursor in the document.
              if (e.target === e.currentTarget) {
                e.preventDefault()
                editor.commands.focus('end')
              }
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <StatusBar
        left={
          <>
            <span>{words.toLocaleString()} words</span>
            <span>{chars.toLocaleString()} characters</span>
            <span>{file.statusText}</span>
          </>
        }
        right={
          <>
            {focusMode && <button onClick={() => setFocusMode(false)} className="hover:text-ink">Exit focus</button>}
            <button onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className="px-1 hover:text-ink" title="Zoom out">−</button>
            <input type="range" min={50} max={200} step={10} value={Math.round(zoom * 100)} onChange={(e) => setZoom(Number(e.target.value) / 100)} className="w-28 accent-[var(--accent)]" aria-label="Zoom" />
            <button onClick={() => setZoom(Math.min(2, zoom + 0.1))} className="px-1 hover:text-ink" title="Zoom in">+</button>
            <button onClick={() => setZoom(1)} className="w-10 text-right hover:text-ink" title="Reset zoom">{Math.round(zoom * 100)}%</button>
          </>
        }
      />

      <input
        ref={imageInput}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) insertImageFile(f)
          e.target.value = ''
        }}
      />

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
              <dt className="text-muted">Words</dt><dd>{words.toLocaleString()}</dd>
              <dt className="text-muted">Characters</dt><dd>{chars.toLocaleString()}</dd>
              <dt className="text-muted">Page</dt><dd>{layout.size}, {layout.landscape ? 'landscape' : 'portrait'}, {layout.margins} margins</dd>
              <dt className="text-muted">Status</dt><dd>{file.dirty ? 'Unsaved changes' : 'Saved'}</dd>
            </dl>
          </div>
        )}
        {backstage === 'new' && (
          <div>
            <h1 className="mb-6 text-3xl font-light">New</h1>
            <TemplateGrid onPick={(t) => file.guard('start a new document', () => { closeBackstage(); newFromTemplate(t) })} />
          </div>
        )}
        {backstage === 'open' && (
          <div className="max-w-3xl">
            <h1 className="mb-6 text-3xl font-light">Open</h1>
            <Button primary accent={APP.color} onClick={() => file.browseOpen(closeBackstage)}>Browse…</Button>
            <h2 className="mb-2 mt-8 text-sm font-semibold text-muted">Recent documents</h2>
            <RecentList items={file.recent.filter((r) => r.app === 'write')} onOpen={(r) => file.openRecent(r, closeBackstage)} empty="No recent documents yet." />
          </div>
        )}
      </Backstage>

      {linkOpen && (
        <LinkDialog
          initial={(editor.getAttributes('link').href as string) ?? ''}
          onClose={() => { setLinkOpen(false); editor.commands.focus() }}
          onApply={(href) => {
            const c = editor.chain().focus().extendMarkRange('link')
            if (href) c.setLink({ href: /^[a-z]+:/i.test(href) ? href : `https://${href}` }).run()
            else c.unsetLink().run()
            setLinkOpen(false)
          }}
        />
      )}

      {tableDialog && (
        <InsertTableDialog
          accent={APP.color}
          onClose={() => { setTableDialog(false); editor.commands.focus() }}
          onInsert={(rows, cols, header, style) => {
            setTableDialog(false)
            insertTable(editor, rows, cols, { header, style })
          }}
        />
      )}

      {file.savePrompt}
    </div>
  )
}

export function TemplateGrid({ onPick }: { onPick: (t: Template) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
      {TEMPLATES.map((t) => (
        <button key={t.id} onClick={() => onPick(t)} aria-label={`${t.name} template`} className="group text-left">
          <div className="mb-2 flex aspect-[8.5/11] items-start overflow-hidden rounded border border-line bg-white p-3 shadow-sm transition group-hover:border-[var(--accent)] group-hover:shadow-md">
            <div
              className="template-thumb pointer-events-none origin-top-left scale-[0.32] text-[#222]"
              style={{ width: '312%' }}
              dangerouslySetInnerHTML={{ __html: t.html || '' }}
            />
          </div>
          <div className="text-sm font-medium">{t.name}</div>
          <div className="text-xs text-muted">{t.description}</div>
        </button>
      ))}
    </div>
  )
}

function LinkDialog({ initial, onApply, onClose }: { initial: string; onApply: (href: string) => void; onClose: () => void }) {
  const [href, setHref] = useState(initial)
  return (
    <Modal
      title="Insert link"
      onClose={onClose}
      footer={
        <>
          {initial && <Button onClick={() => onApply('')}>Remove link</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button primary accent={APP.color} onClick={() => onApply(href.trim())}>OK</Button>
        </>
      }
    >
      <label className="block text-xs text-muted">Address</label>
      <input
        autoFocus
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onApply(href.trim())}
        placeholder="https://example.com"
        className="mt-1 h-8 w-full rounded border border-line bg-surface px-2 outline-none focus:border-[var(--accent)]"
      />
      <p className="mt-2 text-xs text-muted">Select text first to turn it into a link.</p>
    </Modal>
  )
}
