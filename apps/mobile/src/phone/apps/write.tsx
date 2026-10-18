import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { BookOpen, ChevronDown, ChevronUp, Copy, FileDown, Hash, MoreVertical, PenLine, Pencil, Ruler, Search, X } from 'lucide-react'
import { baseName, extensionOf, stripExtension, withExtension } from '@bear/core'
import { readFile, editorToFile, SAVABLE } from '@bear/app-write/src/doc-io'
import { DEFAULT_LAYOUT, type PageLayout } from '@bear/app-write/src/layout'
import { TEMPLATES } from '@bear/app-write/src/templates'
import { getSearch } from '@bear/app-write/src/extensions'
import type { DocInput } from '../Shell'
import { DocSurface, FormatBar, usePhoneEditor } from '../editor'
import { renameDoc, saveNew } from '../files'
import { IconButton, Page, ask, menu, toast } from '../ui'

type Status = 'saved' | 'saving' | 'unsaved' | 'error'
const AUTOSAVE_MS = 1200

export default function WritePhone({ input }: { input: DocInput }) {
  const [loaded, setLoaded] = useState<{ content: JSONContent | string; layout: PageLayout; path: string | null; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if ('file' in input) {
      readFile(input.file.path, input.file.data)
        .then((r) => {
          setLoaded({ content: r.content, layout: r.layout ?? DEFAULT_LAYOUT, path: input.file.path, name: stripExtension(input.file.name) })
          if (r.warnings.length) toast(r.warnings[0])
          void window.bear.addRecent(input.file.path, 'write')
        })
        .catch((e) => setError(`Couldn't open ${input.file.name}: ${(e as Error).message}`))
    } else {
      const t = TEMPLATES.find((x) => x.id === input.template) ?? TEMPLATES[0]
      setLoaded({ content: t.html, layout: DEFAULT_LAYOUT, path: null, name: t.id === 'blank' ? 'Untitled document' : t.name })
    }
  }, [input])

  if (error) return <Page title="Write" back><div className="m-4 rounded-xl bg-red-100 p-4 text-[14px] text-red-900">{error}</div></Page>
  if (!loaded) return <Page title="Opening…" back>{null}</Page>
  return <DocEditor {...loaded} startDirty={!('file' in input)} />
}

function DocEditor({ content, layout: initialLayout, path: initialPath, name: initialName, startDirty }: { content: JSONContent | string; layout: PageLayout; path: string | null; name: string; startDirty: boolean }) {
  const [path, setPath] = useState(initialPath)
  const [name, setName] = useState(initialName)
  const [layout, setLayout] = useState(initialLayout)
  const [status, setStatus] = useState<Status>(startDirty ? 'unsaved' : 'saved')
  const [reading, setReading] = useState(!startDirty)
  const [finding, setFinding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const state = useRef({ path, name, layout })
  state.current = { path, name, layout }
  const saving = useRef<Promise<void>>(Promise.resolve())

  // .docx, .html, .txt and .md save in place. Anything else is saved as a new .docx alongside it.
  const save = useCallback(async (editor: Editor) => {
    dirty.current = false
    setStatus('saving')
    const run = async () => {
      let { path: p } = state.current
      const { name: n, layout: l } = state.current
      try {
        if (!p || !SAVABLE.has(extensionOf(p))) {
          const data = await editorToFile(editor, `${n}.docx`, l, n)
          p = await saveNew(n, 'docx', data, 'write')
          setPath(p)
          setName(stripExtension(baseName(p)))
        } else {
          await window.bear.saveFile(p, await editorToFile(editor, p, l, n))
        }
        setStatus(dirty.current ? 'unsaved' : 'saved')
      } catch (e) {
        dirty.current = true
        setStatus('error')
        toast(`Couldn't save: ${(e as Error).message}`)
      }
    }
    saving.current = saving.current.then(run)
    return saving.current
  }, [])

  const editorRef = useRef<Editor | null>(null)
  const scheduleSave = useCallback(() => {
    dirty.current = true
    setStatus('unsaved')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => editorRef.current && void save(editorRef.current), AUTOSAVE_MS)
  }, [save])

  const editor = usePhoneEditor({ content, placeholder: 'Start writing…', editable: !reading, onUpdate: scheduleSave })
  editorRef.current = editor

  // A new document is saved once it has something in it; leaving saves anything outstanding.
  useEffect(() => {
    if (editor && startDirty && !editor.isEmpty) scheduleSave()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (dirty.current && editorRef.current && !editorRef.current.isEmpty) void save(editorRef.current)
    }
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!reading && startDirty) setTimeout(() => editor?.commands.focus('end'), 300)
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  const rename = async () => {
    const v = await ask('Rename document', { value: name, ok: 'Rename' })
    if (!v?.trim() || v.trim() === name) return
    if (!path) return setName(v.trim())
    try {
      await saving.current
      const p = await renameDoc(path, v.trim())
      setPath(p)
      setName(stripExtension(baseName(p)))
    } catch (e) {
      toast(`Couldn't rename: ${(e as Error).message}`)
    }
  }

  const saveCopy = (ext: 'docx' | 'html' | 'txt') => async () => {
    if (!editor) return
    try {
      const p = await saveNew(`${name} copy`, ext, await editorToFile(editor, withExtension(`${name}.docx`, ext), layout, name), 'write')
      toast(`Saved ${baseName(p)} in Documents/Bear`)
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`)
    }
  }

  const words = () => {
    const text = editor?.getText() ?? ''
    const w = text.trim() ? text.trim().split(/\s+/).length : 0
    toast(`${w.toLocaleString()} words · ${text.replace(/\s/g, '').length.toLocaleString()} characters`)
  }

  const statusText = { saved: path ? 'Saved' : 'Not saved yet', saving: 'Saving…', unsaved: path ? 'Editing' : 'Not saved yet', error: 'Not saved' }[status]
  const ext = path ? extensionOf(path).toUpperCase() : 'DOCX'

  return (
    <Page
      title={<button onClick={() => void rename()} className="max-w-full truncate text-left">{name}</button>}
      subtitle={`${statusText} · ${ext}`}
      back
      actions={
        <>
          <IconButton icon={Search} label="Find" onClick={() => setFinding(!finding)} active={finding} />
          <IconButton icon={reading ? PenLine : BookOpen} label={reading ? 'Edit' : 'Reading view'} onClick={() => setReading(!reading)} />
          <IconButton
            icon={MoreVertical}
            label="More"
            onClick={() =>
              menu([
                { label: 'Rename', icon: Pencil, onClick: () => void rename() },
                { label: 'Word count', icon: Hash, onClick: words },
                {
                  label: `Page size: ${layout.size}`,
                  icon: Ruler,
                  onClick: () =>
                    menu(
                      (['Letter', 'A4'] as const).map((size) => ({
                        label: size,
                        checked: layout.size === size,
                        onClick: () => {
                          setLayout({ ...layout, size })
                          scheduleSave()
                        }
                      })),
                      'Page size (for printing and Word)'
                    )
                },
                { label: 'Save a copy as Word', icon: Copy, onClick: saveCopy('docx') },
                { label: 'Save a copy as web page', icon: FileDown, onClick: saveCopy('html') },
                { label: 'Save a copy as plain text', icon: FileDown, onClick: saveCopy('txt') }
              ])
            }
          />
        </>
      }
      bottom={reading ? undefined : <FormatBar editor={editor} />}
    >
      {finding && editor && <FindBar editor={editor} onClose={() => setFinding(false)} canReplace={!reading} />}
      <div className="min-h-full bg-paper text-[#1f1f1f] dark:bg-surface dark:text-ink" onDoubleClick={() => reading && setReading(false)}>
        <DocSurface editor={editor} />
      </div>
      {reading && (
        <button
          onClick={() => setReading(false)}
          className="phone-fab-zone fixed bottom-0 right-0 m-4 flex h-14 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-white shadow-lg shadow-black/25 active:scale-95"
        >
          <PenLine size={22} />
          <span className="text-[15px] font-semibold">Edit</span>
        </button>
      )}
    </Page>
  )
}

function FindBar({ editor, onClose, canReplace }: { editor: Editor; onClose: () => void; canReplace: boolean }) {
  const [q, setQ] = useState('')
  const [r, setR] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [, force] = useState(0)
  const s = getSearch(editor)
  useEffect(() => {
    editor.commands.setSearch(q)
    force((x) => x + 1)
  }, [q, editor])
  useEffect(() => () => void editor.commands.setSearch(''), [editor])

  const go = (dir: 1 | -1) => {
    const st = getSearch(editor)
    if (!st.results.length) return
    const i = (st.index + dir + st.results.length) % st.results.length
    editor.commands.setSearchIndex(i)
    const hit = st.results[i]
    editor.commands.setTextSelection(hit)
    editor.commands.scrollIntoView()
    force((x) => x + 1)
  }

  return (
    <div className="sticky top-0 z-[5] border-b border-line bg-surface px-2 py-2 shadow-sm">
      <div className="flex items-center gap-1">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in document" className="h-10 min-w-0 flex-1 rounded-full bg-hover px-4 text-[15px] text-ink outline-none" />
        <span className="w-14 text-center text-[13px] text-muted">{q ? `${s.results.length ? s.index + 1 : 0}/${s.results.length}` : ''}</span>
        <IconButton icon={ChevronUp} label="Previous" onClick={() => go(-1)} />
        <IconButton icon={ChevronDown} label="Next" onClick={() => go(1)} />
        <IconButton icon={X} label="Close find" onClick={onClose} />
      </div>
      {canReplace && (
        replacing ? (
          <div className="mt-2 flex items-center gap-2 pl-0.5">
            <input value={r} onChange={(e) => setR(e.target.value)} placeholder="Replace with" className="h-10 min-w-0 flex-1 rounded-full bg-hover px-4 text-[15px] text-ink outline-none" />
            <button onClick={() => { editor.commands.replaceCurrent(r); force((x) => x + 1) }} className="h-10 rounded-full px-3 text-[14px] font-medium text-[var(--accent)]">Replace</button>
            <button onClick={() => { editor.commands.replaceAll(r); force((x) => x + 1) }} className="h-10 rounded-full px-3 text-[14px] font-medium text-[var(--accent)]">All</button>
          </div>
        ) : (
          <button onClick={() => setReplacing(true)} className="ml-2 mt-1 text-[13.5px] font-medium text-[var(--accent)]">Replace…</button>
        )
      )}
    </div>
  )
}
