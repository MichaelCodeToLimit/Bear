import { useEffect, useMemo, useState } from 'react'
import { BookPlus, FilePlus2, FolderPlus, Search, X } from 'lucide-react'
import { getApp } from '@bear/core'
import { ContextMenu, TitleBar, statusLabel, useStoredData, type MenuItem } from '@bear/ui'
import { PageEditor } from '@bear/app-write'
import {
  addNotebook, addPage, addSection, deleteNotebook, deletePage, deleteSection, find, initialNotes, movePage,
  renameNotebook, renameSection, search, updatePage, upgradeNotes, type Location, type NotesData
} from './model'

const APP = getApp('notes')

export function NotesApp({ onHome }: { onHome: () => void }) {
  const store = useStoredData<NotesData>('notes', initialNotes, upgradeNotes)
  const d = store.data
  const update = store.update
  const [loc, setLoc] = useState<Partial<Location>>({})
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [renaming, setRenaming] = useState<{ kind: 'notebook' | 'section'; id: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Restore where the user was last time.
  useEffect(() => {
    if (d && !loc.notebook) setLoc(d.last ?? {})
  }, [d]) // eslint-disable-line react-hooks/exhaustive-deps

  const cur = d ? find(d, loc) : null
  const here: Location | null = cur?.page ? { notebook: cur.notebook.id, section: cur.section.id, page: cur.page.id } : null
  const hits = useMemo(() => (d ? search(d, query) : []), [d, query])

  useEffect(() => {
    if (cur) window.bear.setTitle(`${cur.page?.title || 'Untitled page'} - ${cur.notebook.name} - Bear ${APP.name}`)
  }, [cur?.page?.title, cur?.notebook.name]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!d || !cur || !here) return <div className="flex h-full items-center justify-center text-sm text-muted">Loading…</div>

  const go = (l: Location) => {
    setLoc(l)
    update((x) => ({ ...x, last: l }))
  }

  const sectionMenu = (id: string, x: number, y: number) =>
    setMenu({
      x, y,
      items: [
        { label: 'Rename section', onClick: () => setRenaming({ kind: 'section', id }) },
        { label: 'New section', onClick: () => { const r = addSection(d, cur.notebook.id, 'New Section'); update(() => r.data); go(r.loc); setRenaming({ kind: 'section', id: r.loc.section }) } },
        {
          label: 'Delete section', divider: true,
          onClick: () => {
            if (!window.confirm(`Delete the section "${cur.notebook.sections.find((s) => s.id === id)?.name}" and all its pages?`)) return
            update((x) => deleteSection(x, cur.notebook.id, id))
            setLoc({ notebook: cur.notebook.id })
          }
        }
      ]
    })

  const pageMenu = (pageId: string, x: number, y: number) =>
    setMenu({
      x, y,
      items: [
        ...cur.notebook.sections
          .filter((s) => s.id !== cur.section.id)
          .map((s) => ({ label: `Move to ${s.name}`, onClick: () => update((x) => movePage(x, { notebook: cur.notebook.id, section: cur.section.id, page: pageId }, s.id)) })),
        {
          label: 'Delete page', divider: cur.notebook.sections.length > 1,
          onClick: () => {
            update((x) => deletePage(x, cur.notebook.id, cur.section.id, pageId))
            setLoc({ notebook: cur.notebook.id, section: cur.section.id })
          }
        }
      ]
    })

  return (
    <div className="flex h-full flex-col bg-canvas" style={{ ['--accent' as string]: APP.color }}>
      <TitleBar app={APP} docName={cur.notebook.name} dirty={false} status={statusLabel(store.status)} onHome={onHome} />
      {(store.error || error) && (
        <div className="flex items-center justify-between bg-red-100 px-4 py-1.5 text-[13px] text-red-900">
          {store.error ?? error}
          <button aria-label="Dismiss" onClick={() => { store.dismissError(); setError(null) }}>×</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Notebooks and sections */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface text-[13px]">
          <div className="border-b border-line p-3">
            {renaming?.kind === 'notebook' ? (
              <input
                autoFocus aria-label="Notebook name" defaultValue={cur.notebook.name}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => { update((x) => renameNotebook(x, cur.notebook.id, e.target.value)); setRenaming(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }}
                className="h-8 w-full rounded border border-[var(--accent)] bg-canvas px-2 font-semibold text-ink outline-none"
              />
            ) : (
              <select
                aria-label="Notebook"
                value={cur.notebook.id}
                onChange={(e) => setLoc({ notebook: e.target.value })}
                onDoubleClick={() => setRenaming({ kind: 'notebook', id: cur.notebook.id })}
                className="h-8 w-full rounded border border-line bg-canvas px-1 font-semibold text-ink outline-none"
              >
                {d.notebooks.map((nb) => <option key={nb.id} value={nb.id}>{nb.name}</option>)}
              </select>
            )}
            <div className="mt-2 flex gap-1 text-[12px]">
              <button onClick={() => { const r = addNotebook(d, 'New Notebook'); update(() => r.data); go(r.loc); setRenaming({ kind: 'notebook', id: r.loc.notebook }) }} className="flex items-center gap-1 rounded px-1.5 py-1 text-[var(--accent)] hover:bg-hover"><BookPlus size={14} /> Notebook</button>
              <button onClick={() => setRenaming({ kind: 'notebook', id: cur.notebook.id })} className="rounded px-1.5 py-1 text-muted hover:bg-hover hover:text-ink">Rename</button>
              {d.notebooks.length > 1 && (
                <button
                  onClick={() => {
                    if (!window.confirm(`Delete the notebook "${cur.notebook.name}" and everything in it?`)) return
                    update((x) => deleteNotebook(x, cur.notebook.id))
                    setLoc({})
                  }}
                  className="rounded px-1.5 py-1 text-muted hover:bg-hover hover:text-red-600"
                >Delete</button>
              )}
            </div>
          </div>

          <div className="mx-3 mt-3 flex items-center gap-2 rounded border border-line bg-canvas px-2">
            <Search size={14} className="text-muted" />
            <input aria-label="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all notebooks" className="h-7 min-w-0 flex-1 bg-transparent text-ink outline-none" />
            {query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={13} /></button>}
          </div>

          <nav aria-label="Sections" className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {cur.notebook.sections.map((s) =>
              renaming?.kind === 'section' && renaming.id === s.id ? (
                <input
                  key={s.id} autoFocus aria-label="Section name" defaultValue={s.name}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => { update((x) => renameSection(x, cur.notebook.id, s.id, e.target.value)); setRenaming(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }}
                  className="mx-2 my-0.5 h-8 w-[calc(100%-16px)] rounded border border-[var(--accent)] bg-canvas px-2 text-ink outline-none"
                />
              ) : (
                <button
                  key={s.id}
                  aria-current={s.id === cur.section.id ? 'true' : undefined}
                  onClick={() => go({ notebook: cur.notebook.id, section: s.id, page: s.pages[0].id })}
                  onDoubleClick={() => setRenaming({ kind: 'section', id: s.id })}
                  onContextMenu={(e) => { e.preventDefault(); sectionMenu(s.id, e.clientX, e.clientY) }}
                  className={`flex w-full items-center gap-2 border-l-4 px-3 py-2 text-left ${s.id === cur.section.id ? 'bg-active font-medium' : 'hover:bg-hover'}`}
                  style={{ borderColor: s.color }}
                >
                  <span className="min-w-0 flex-1 truncate text-ink">{s.name}</span>
                  <span className="text-[11px] text-muted">{s.pages.length}</span>
                </button>
              )
            )}
          </nav>
          <button onClick={() => { const r = addSection(d, cur.notebook.id, 'New Section'); update(() => r.data); go(r.loc); setRenaming({ kind: 'section', id: r.loc.section }) }} className="m-2 flex items-center gap-2 rounded px-2 py-2 text-[var(--accent)] hover:bg-hover">
            <FolderPlus size={15} /> Add section
          </button>
        </aside>

        {/* Pages or search results */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface text-[13px]" style={{ borderTop: query ? undefined : `3px solid ${cur.section.color}` }}>
          {query ? (
            <div className="min-h-0 flex-1 overflow-y-auto" aria-label="Search results">
              <div className="px-3 py-2 text-[12px] text-muted">{hits.length} result{hits.length === 1 ? '' : 's'}</div>
              {hits.map((h) => (
                <button key={h.loc.page} onClick={() => { go(h.loc); setQuery('') }} className="block w-full border-b border-line px-3 py-2 text-left hover:bg-hover">
                  <div className="truncate font-medium text-ink">{h.title}</div>
                  <div className="truncate text-[11px] text-muted">{h.notebook} › {h.section}</div>
                  <div className="line-clamp-2 text-[12px] text-muted">{h.snippet}</div>
                </button>
              ))}
            </div>
          ) : (
            <>
              <button onClick={() => { const r = addPage(d, cur.notebook.id, cur.section.id); update(() => r.data); go(r.loc) }} className="m-2 flex items-center gap-2 rounded px-2 py-2 text-[var(--accent)] hover:bg-hover">
                <FilePlus2 size={15} /> Add page
              </button>
              <nav aria-label="Pages" className="min-h-0 flex-1 overflow-y-auto">
                {cur.section.pages.map((p) => (
                  <button
                    key={p.id}
                    aria-current={p.id === cur.page!.id ? 'page' : undefined}
                    onClick={() => go({ notebook: cur.notebook.id, section: cur.section.id, page: p.id })}
                    onContextMenu={(e) => { e.preventDefault(); pageMenu(p.id, e.clientX, e.clientY) }}
                    className={`block w-full px-4 py-2 text-left ${p.id === cur.page!.id ? 'bg-active' : 'hover:bg-hover'}`}
                  >
                    <div className={`truncate ${p.title ? 'text-ink' : 'italic text-muted'}`}>{p.title || 'Untitled page'}</div>
                    <div className="truncate text-[11px] text-muted">{p.text.trim().slice(0, 60) || new Date(p.modified).toLocaleDateString()}</div>
                  </button>
                ))}
              </nav>
            </>
          )}
        </aside>

        {/* The page */}
        <main className="flex min-w-0 flex-1 flex-col bg-paper text-[#1f1f1f]">
          <div className="px-12 pt-8">
            <input
              key={`t-${cur.page!.id}`}
              aria-label="Page title"
              defaultValue={cur.page!.title}
              placeholder="Page title"
              onChange={(e) => update((x) => updatePage(x, here, { title: e.target.value }))}
              className="w-full border-b border-[#e5e5e5] bg-transparent pb-1 text-3xl font-light outline-none placeholder:text-[#bbb]"
            />
            <div className="mt-1 text-[12px] text-[#888]">
              {new Date(cur.page!.created).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}{' '}
              {new Date(cur.page!.created).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>
          <PageEditor
            key={cur.page!.id}
            html={cur.page!.html}
            placeholder="Start writing…"
            onError={setError}
            onChange={(html, text) => update((x) => updatePage(x, here, { html, text }))}
            className="min-h-0 flex-1 [&_.page-doc]:px-12 [&_.page-doc]:py-4"
          />
        </main>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}
