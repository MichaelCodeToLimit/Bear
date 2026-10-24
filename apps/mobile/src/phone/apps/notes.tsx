import { useMemo, useState } from 'react'
import { BookPlus, FilePlus2, FolderInput, FolderPlus, MoreVertical, NotebookPen, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useStoredData, statusLabel } from '@bear/ui/src/useStoredData'
import {
  addNotebook, addPage, addSection, deleteNotebook, deletePage, deleteSection, find, initialNotes, movePage, renameNotebook,
  renameSection, search, updatePage, upgradeNotes, type Location, type NotesData
} from '@bear/app-notes/src/model'
import { useLayer } from '../nav'
import { DocSurface, FormatBar, usePhoneEditor } from '../editor'
import { Empty, Fab, IconButton, Page, Row, Section, ask, confirm, menu, when } from '../ui'

type SectionRef = { notebook: string; section: string }

export default function NotesPhone() {
  const store = useStoredData<NotesData>('notes', initialNotes, upgradeNotes)
  const section = useLayer<SectionRef>()
  const page = useLayer<Location>()
  const searching = useLayer<true>()
  const d = store.data
  if (!d) return <Page title="Notes" back tinted>{null}</Page>
  const update = store.update

  const openPage = (loc: Location) => page.open(loc)
  const newPageIn = (nb: string, s: string) => {
    const r = addPage(d, nb, s)
    update(() => r.data)
    openPage(r.loc)
  }

  if (page.value) {
    const { notebook, section: s, page: p } = find(d, page.value)
    if (!p || p.id !== page.value.page) return <Page title="Page" back>{null}</Page>
    return (
      <PageScreen
        key={p.id}
        notebookName={notebook.name}
        sectionName={s.name}
        html={p.html}
        title={p.title}
        status={statusLabel(store.status)}
        onTitle={(title) => update((x) => updatePage(x, page.value!, { title }))}
        onBody={(html, text) => update((x) => updatePage(x, page.value!, { html, text }))}
        onMenu={() =>
          menu([
            {
              label: 'Move to section',
              icon: FolderInput,
              onClick: () =>
                menu(
                  notebook.sections.map((t) => ({
                    label: t.name,
                    checked: t.id === s.id,
                    onClick: () => {
                      update((x) => movePage(x, page.value!, t.id))
                      page.replace({ ...page.value!, section: t.id })
                    }
                  })),
                  'Move to'
                )
            },
            {
              label: 'Delete page',
              icon: Trash2,
              danger: true,
              onClick: async () => {
                if (!(await confirm('Delete this page?', 'This can’t be undone.'))) return
                const loc = page.value!
                page.close()
                update((x) => deletePage(x, loc.notebook, loc.section, loc.page))
              }
            }
          ])
        }
      />
    )
  }

  if (searching.value) return <SearchScreen d={d} onOpen={openPage} />

  if (section.value) {
    const { notebook, section: s } = find(d, section.value)
    if (s.id !== section.value.section) return <Page title="Section" back>{null}</Page>
    const pages = [...s.pages].sort((a, b) => b.modified - a.modified)
    return (
      <Page
        title={s.name}
        subtitle={notebook.name}
        back
        actions={
          <IconButton
            icon={MoreVertical}
            label="Section options"
            onClick={() => sectionMenu(d, update, notebook.id, s.id, s.name, () => section.close())}
          />
        }
        fab={<Fab icon={Plus} label="New page" onClick={() => newPageIn(notebook.id, s.id)} />}
      >
        <div className="pb-28 pt-2">
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => openPage({ notebook: notebook.id, section: s.id, page: p.id })}
              className="mx-3 mb-2 block w-[calc(100%-24px)] rounded-2xl bg-surface p-4 text-left shadow-sm ring-1 ring-line/60 active:scale-[0.98]"
            >
              <div className="flex items-baseline gap-2">
                <div className="min-w-0 flex-1 truncate text-[16px] font-semibold text-ink">{p.title || 'Untitled page'}</div>
                <div className="shrink-0 text-[12px] text-muted">{when(p.modified)}</div>
              </div>
              <div className="mt-1 line-clamp-2 text-[14px] leading-snug text-muted">{p.text.replace(/\s+/g, ' ').trim() || 'No text yet'}</div>
            </button>
          ))}
        </div>
      </Page>
    )
  }

  return (
    <Page
      title="Notes"
      tinted
      back
      subtitle={statusLabel(store.status)}
      actions={
        <>
          <IconButton icon={Search} label="Search notes" onClick={() => searching.open(true)} />
          <IconButton
            icon={BookPlus}
            label="New notebook"
            onClick={async () => {
              const name = await ask('New notebook', { placeholder: 'Notebook name', ok: 'Create' })
              if (name === null) return
              update((x) => addNotebook(x, name).data)
            }}
          />
        </>
      }
      fab={
        <Fab
          icon={Plus}
          label="Quick note"
          onClick={() => {
            const nb = d.notebooks[0]
            newPageIn(nb.id, nb.sections[0].id)
          }}
        />
      }
    >
      {store.error && <div className="mx-4 mt-3 rounded-xl bg-red-100 px-4 py-3 text-[14px] text-red-900">{store.error}</div>}
      <div className="pb-28">
        {d.notebooks.map((nb) => (
          <Section
            key={nb.id}
            title={nb.name}
            action={
              <IconButton
                icon={MoreVertical}
                label={`${nb.name} options`}
                size={18}
                className="h-8 w-8 text-muted"
                onClick={() =>
                  menu(
                    [
                      {
                        label: 'New section',
                        icon: FolderPlus,
                        onClick: async () => {
                          const name = await ask('New section', { placeholder: 'Section name', ok: 'Create' })
                          if (name !== null) update((x) => addSection(x, nb.id, name).data)
                        }
                      },
                      {
                        label: 'Rename notebook',
                        icon: Pencil,
                        onClick: async () => {
                          const name = await ask('Rename notebook', { value: nb.name, ok: 'Rename' })
                          if (name !== null) update((x) => renameNotebook(x, nb.id, name))
                        }
                      },
                      {
                        label: 'Delete notebook',
                        icon: Trash2,
                        danger: true,
                        disabled: d.notebooks.length <= 1,
                        onClick: async () => {
                          if (await confirm(`Delete “${nb.name}”?`, 'All of its sections and pages are deleted. This can’t be undone.')) update((x) => deleteNotebook(x, nb.id))
                        }
                      }
                    ],
                    nb.name
                  )
                }
              />
            }
          >
            {nb.sections.map((s, i) => (
              <div key={s.id}>
                {i > 0 && <div className="ml-[60px] h-px bg-line/70" />}
                <Row
                  leading={<span className="h-8 w-1.5 rounded-full" style={{ background: s.color }} />}
                  title={s.name}
                  subtitle={`${s.pages.length} page${s.pages.length === 1 ? '' : 's'} · ${when(Math.max(...s.pages.map((p) => p.modified)))}`}
                  onClick={() => section.open({ notebook: nb.id, section: s.id })}
                  onMore={() => sectionMenu(d, update, nb.id, s.id, s.name)}
                />
              </div>
            ))}
          </Section>
        ))}
      </div>
    </Page>
  )
}

function sectionMenu(d: NotesData, update: (fn: (d: NotesData) => NotesData) => void, nb: string, s: string, name: string, onDeleted?: () => void) {
  menu(
    [
      { label: 'New page', icon: FilePlus2, onClick: () => update((x) => addPage(x, nb, s).data) },
      {
        label: 'Rename section',
        icon: Pencil,
        onClick: async () => {
          const v = await ask('Rename section', { value: name, ok: 'Rename' })
          if (v !== null) update((x) => renameSection(x, nb, s, v))
        }
      },
      {
        label: 'Delete section',
        icon: Trash2,
        danger: true,
        onClick: async () => {
          const count = d.notebooks.find((n) => n.id === nb)?.sections.find((x) => x.id === s)?.pages.length ?? 0
          if (!(await confirm(`Delete “${name}”?`, `Its ${count} page${count === 1 ? '' : 's'} are deleted too. This can’t be undone.`))) return
          onDeleted?.()
          update((x) => deleteSection(x, nb, s))
        }
      }
    ],
    name
  )
}

function PageScreen(p: {
  notebookName: string
  sectionName: string
  title: string
  html: string
  status: string
  onTitle: (t: string) => void
  onBody: (html: string, text: string) => void
  onMenu: () => void
}) {
  const editor = usePhoneEditor({ content: p.html, tasks: true, placeholder: 'Write something…', onUpdate: (e) => p.onBody(e.getHTML(), e.getText()) })
  const [title, setTitle] = useState(p.title)
  return (
    <Page
      title={p.sectionName}
      subtitle={`${p.notebookName} · ${p.status}`}
      back
      scroll
      actions={<IconButton icon={MoreVertical} label="Page options" onClick={p.onMenu} />}
      bottom={<FormatBar editor={editor} tasks />}
    >
      <div className="bg-paper text-[#1f1f1f] dark:bg-surface dark:text-ink min-h-full">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            p.onTitle(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              editor?.chain().focus('start').run()
            }
          }}
          placeholder="Title"
          aria-label="Page title"
          className="w-full bg-transparent px-5 pt-5 text-[24px] font-bold outline-none placeholder:text-[#9a9a9a]"
        />
        <DocSurface editor={editor} className="!pt-2" />
      </div>
    </Page>
  )
}

function SearchScreen({ d, onOpen }: { d: NotesData; onOpen: (l: Location) => void }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => search(d, q), [d, q])
  return (
    <Page
      title=""
      back
      titleEditor={
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search all notes"
          className="h-11 w-full rounded-full bg-hover px-4 text-[16px] text-ink outline-none"
        />
      }
      actions={q ? <IconButton icon={X} label="Clear" onClick={() => setQ('')} /> : undefined}
    >
      {q.trim() && !hits.length && <Empty icon={NotebookPen} title="No matches" text={`Nothing in your notebooks matches “${q.trim()}”.`} />}
      <div className="py-1">
        {hits.map((h) => (
          <Row key={h.loc.page} title={h.title} subtitle={`${h.notebook} › ${h.section} — ${h.snippet}`} onClick={() => onOpen(h.loc)} />
        ))}
      </div>
    </Page>
  )
}
