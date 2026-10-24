import { useEffect, useState } from 'react'
import {
  Check, FileText, FolderOpen, Globe, Link2, ListTodo, MoreVertical, Newspaper, Pencil, Plus, Settings, Trash2, X
} from 'lucide-react'
import { EditorContent } from '@tiptap/react'
import { appForFile, stripExtension, type FolderEntry } from '@bear/core'
import { useStoredData, statusLabel } from '@bear/ui/src/useStoredData'
import {
  SITE_COLORS, addLink, addPage, createSite, deletePage, deleteSite, fileSize, initialSites, isWebLink, news, pages, patchSite,
  removeLink, updatePage, upgradeSites, type PageKind, type Site, type SitesData
} from '@bear/app-sites/src/model'
import { useLayer } from '../nav'
import { DocSurface, FormatBar, usePhoneEditor } from '../editor'
import { AppTile } from '../Shell'
import { Button, Empty, Fab, IconButton, Page, Row, Section, Segmented, ask, confirm, menu, sheet, toast, when } from '../ui'

interface TasksSnapshot {
  lists: { id: string; name: string }[]
  tasks: { id: string; listId: string; title: string; done: boolean; due: string | null }[]
}

type Tab = 'home' | 'news' | 'pages' | 'files'
type Store = { data: SitesData; update: (fn: (d: SitesData) => SitesData) => void }

export default function SitesPhone({ openPath, openApp }: { openPath: (p: string) => void; openApp: (app: 'tasks') => void }) {
  const store = useStoredData<SitesData>('sites', initialSites, upgradeSites)
  const siteLayer = useLayer<string>()
  const pageLayer = useLayer<{ id: string; editing: boolean }>()
  const welcome = useLayer<true>()
  const d = store.data
  if (!d) return <Page title="Sites" back tinted>{null}</Page>
  const s: Store = { data: d, update: store.update }
  const site = d.sites.find((x) => x.id === siteLayer.value)

  if (site && welcome.value) {
    return (
      <EditPage
        key="welcome"
        site={site}
        heading="Home page"
        html={site.welcome}
        onBody={(html) => s.update((x) => patchSite(x, site.id, { welcome: html }))}
      />
    )
  }

  if (site && pageLayer.value) {
    const p = site.pages.find((x) => x.id === pageLayer.value!.id)
    if (p) {
      if (pageLayer.value.editing)
        return (
          <EditPage
            key={p.id}
            site={site}
            heading={p.kind === 'news' ? 'News post' : 'Page'}
            title={p.title}
            html={p.html}
            onTitle={(title) => s.update((x) => updatePage(x, site.id, p.id, { title }))}
            onBody={(html, text) => s.update((x) => updatePage(x, site.id, p.id, { html, text }))}
          />
        )
      return (
        <div className="h-full" style={{ ['--accent' as string]: site.color }}>
          <Page
            title={p.title}
            subtitle={`${site.name} · ${p.kind === 'news' ? new Date(p.created).toLocaleDateString(undefined, { dateStyle: 'medium' }) : `Updated ${when(p.modified)}`}`}
            back
            actions={
              <IconButton
                icon={MoreVertical}
                label="Page options"
                onClick={() =>
                  menu([
                    { label: 'Edit', icon: Pencil, onClick: () => pageLayer.replace({ id: p.id, editing: true }) },
                    {
                      label: 'Delete',
                      icon: Trash2,
                      danger: true,
                      onClick: async () => {
                        if (!(await confirm(`Delete “${p.title}”?`, 'This can’t be undone.'))) return
                        pageLayer.close()
                        s.update((x) => deletePage(x, site.id, p.id))
                      }
                    }
                  ])
                }
              />
            }
            fab={<Fab icon={Pencil} label="Edit" onClick={() => pageLayer.replace({ id: p.id, editing: true })} />}
          >
            <article className="px-5 pb-28 pt-5">
              <h1 className="mb-3 text-[26px] font-bold leading-tight text-ink">{p.title}</h1>
              {p.html.trim() ? <RichView html={p.html} /> : <p className="text-[15px] text-muted">Nothing here yet. Tap Edit to add content.</p>}
            </article>
          </Page>
        </div>
      )
    }
  }

  if (site)
    return (
      <SiteScreen
        key={site.id}
        s={s}
        site={site}
        status={statusLabel(store.status)}
        openPage={(id, editing = false) => pageLayer.open({ id, editing })}
        editWelcome={() => welcome.open(true)}
        openPath={openPath}
        openApp={openApp}
        onDeleted={() => siteLayer.close()}
      />
    )

  return (
    <Page
      title="Sites"
      subtitle="Team sites"
      tinted
      back
      fab={<Fab icon={Plus} label="New site" onClick={() => newSiteSheet(s, (id) => siteLayer.open(id))} />}
    >
      {store.error && <div className="mx-4 mt-3 rounded-xl bg-red-100 px-4 py-3 text-[14px] text-red-900">{store.error}</div>}
      {!d.sites.length ? (
        <Empty icon={Globe} title="Create your first site" text="A site is a home for a team or project: news, pages, documents, links and a shared task list." />
      ) : (
        <div className="space-y-3 p-3 pb-28">
          {d.sites.map((x) => (
            <button key={x.id} onClick={() => siteLayer.open(x.id)} className="block w-full overflow-hidden rounded-2xl bg-surface text-left shadow-sm ring-1 ring-line/60 active:scale-[0.98]">
              <div className="flex h-20 items-end p-4" style={{ background: `linear-gradient(135deg, ${x.color}, ${x.color}bb)` }}>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-[20px] font-bold text-white">{x.name.slice(0, 1).toUpperCase()}</span>
              </div>
              <div className="p-4">
                <div className="text-[17px] font-semibold text-ink">{x.name}</div>
                {x.description && <div className="mt-0.5 line-clamp-2 text-[14px] text-muted">{x.description}</div>}
                <div className="mt-2 text-[12.5px] text-muted">
                  {news(x).length} news · {pages(x).length} pages · {x.links.length} links
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Page>
  )
}

function newSiteSheet(s: Store, onCreated: (id: string) => void) {
  sheet((close) => <NewSite onCreate={(name, desc, color) => close(() => {
    const r = createSite(s.data, name, desc, color)
    s.update(() => r.data)
    onCreated(r.site.id)
  })} />, 'New site')
}

function NewSite({ onCreate }: { onCreate: (name: string, desc: string, color: string) => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [color, setColor] = useState(SITE_COLORS[0])
  const field = 'w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[16px] text-ink outline-none focus:border-[var(--accent)]'
  return (
    <form
      className="space-y-3 px-5 pb-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onCreate(name, desc, color)
      }}
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Site name" className={field} />
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What it's for (optional)" className={field} />
      <div className="flex justify-between px-1 pt-1">
        {SITE_COLORS.map((c) => (
          <button type="button" key={c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: c }}>
            {c === color && <Check size={18} className="text-white" />}
          </button>
        ))}
      </div>
      <div className="flex justify-end pt-2">
        <Button submit disabled={!name.trim()}>Create site</Button>
      </div>
    </form>
  )
}

function SiteScreen(p: {
  s: Store
  site: Site
  status: string
  openPage: (id: string, editing?: boolean) => void
  editWelcome: () => void
  openPath: (path: string) => void
  openApp: (app: 'tasks') => void
  onDeleted: () => void
}) {
  const { s, site } = p
  const [tab, setTab] = useState<Tab>('home')
  const set = (patch: Partial<Site>) => s.update((x) => patchSite(x, site.id, patch))

  const create = async (kind: PageKind) => {
    const title = await ask(kind === 'news' ? 'New news post' : 'New page', { placeholder: 'Title', ok: 'Create' })
    if (title === null) return
    const r = addPage(s.data, site.id, kind, title)
    s.update(() => r.data)
    p.openPage(r.page.id, true)
  }

  const settings = () =>
    menu(
      [
        {
          label: 'Rename site',
          icon: Pencil,
          onClick: async () => {
            const v = await ask('Site name', { value: site.name, ok: 'Save' })
            if (v?.trim()) set({ name: v.trim() })
          }
        },
        {
          label: 'Edit description',
          icon: FileText,
          onClick: async () => {
            const v = await ask('Description', { value: site.description, ok: 'Save', multiline: true })
            if (v !== null) set({ description: v.trim() })
          }
        },
        { label: 'Change colour', icon: Settings, onClick: () => sheet((close) => (
          <div className="flex justify-between px-5 pb-4 pt-2">
            {SITE_COLORS.map((c) => (
              <button key={c} aria-label={`Colour ${c}`} onClick={() => close(() => set({ color: c }))} className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: c }}>
                {c === site.color && <Check size={18} className="text-white" />}
              </button>
            ))}
          </div>
        ), 'Site colour') },
        { label: 'Task list on home page', icon: ListTodo, onClick: () => void chooseTaskList(site, set) },
        {
          label: site.library ? 'Disconnect document library' : 'Connect document library',
          icon: FolderOpen,
          onClick: async () => {
            if (site.library) return set({ library: null })
            const f = await window.bear.chooseFolder('Choose a folder')
            if (f) set({ library: f })
          }
        },
        {
          label: 'Delete site',
          icon: Trash2,
          danger: true,
          onClick: async () => {
            if (!(await confirm(`Delete “${site.name}”?`, 'Its news, pages and links are deleted. Files in its document library are kept.'))) return
            p.onDeleted()
            s.update((x) => deleteSite(x, site.id))
          }
        }
      ],
      site.name
    )

  return (
    <div className="h-full" style={{ ['--accent' as string]: site.color }}>
      <Page
        title={site.name}
        subtitle={site.description || p.status}
        tinted
        back
        actions={<IconButton icon={MoreVertical} label="Site settings" onClick={settings} />}
        fab={
          tab === 'news' ? <Fab icon={Plus} label="News post" onClick={() => void create('news')} /> : tab === 'pages' ? <Fab icon={Plus} label="New page" onClick={() => void create('page')} /> : undefined
        }
      >
        <div className="sticky top-0 z-[5] bg-canvas/95 px-3 py-2 backdrop-blur">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'home', label: 'Home' },
              { value: 'news', label: 'News' },
              { value: 'pages', label: 'Pages' },
              { value: 'files', label: 'Files' }
            ]}
          />
        </div>
        {tab === 'home' && <HomeTab {...p} create={create} />}
        {tab === 'news' && <PageList site={site} kind="news" openPage={p.openPage} />}
        {tab === 'pages' && <PageList site={site} kind="page" openPage={p.openPage} />}
        {tab === 'files' && <FilesTab site={site} openPath={p.openPath} connect={async () => {
          const f = await window.bear.chooseFolder('Choose a folder')
          if (f) set({ library: f })
        }} />}
      </Page>
    </div>
  )
}

async function chooseTaskList(site: Site, set: (p: Partial<Site>) => void) {
  const t = await window.bear.readData<TasksSnapshot>('tasks').catch(() => null)
  const lists = t?.lists ?? []
  if (!lists.length) return toast('Make a list in Tasks first.')
  menu(
    [{ label: 'None', checked: !site.taskList, onClick: () => set({ taskList: null }) }, ...lists.map((l) => ({ label: l.name, checked: site.taskList === l.id, onClick: () => set({ taskList: l.id }) }))],
    'Task list on the home page'
  )
}

function HomeTab({ s, site, openPage, editWelcome, openApp, create }: Parameters<typeof SiteScreen>[0] & { create: (k: PageKind) => void }) {
  const [tasks, setTasks] = useState<TasksSnapshot | null>(null)
  useEffect(() => {
    if (!site.taskList) return setTasks(null)
    window.bear.readData<TasksSnapshot>('tasks').then(setTasks).catch(() => setTasks(null))
  }, [site.taskList])
  const posts = news(site).slice(0, 3)
  const listTasks = tasks?.tasks.filter((t) => t.listId === site.taskList && !t.done) ?? []
  const listName = tasks?.lists.find((l) => l.id === site.taskList)?.name

  return (
    <div className="pb-24">
      <div className="mx-3 mt-1 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line/60">
        <RichView key={site.welcome} html={site.welcome} />
        <button onClick={editWelcome} className="mt-1 flex items-center gap-1.5 text-[14px] font-medium text-[var(--accent)]">
          <Pencil size={15} /> Edit home page
        </button>
      </div>

      <Section title="News" action={<button onClick={() => create('news')} className="text-[14px] font-medium text-[var(--accent)]">+ Add</button>}>
        {posts.length ? (
          posts.map((n, i) => (
            <div key={n.id}>
              {i > 0 && <div className="ml-4 h-px bg-line/70" />}
              <Row title={n.title} subtitle={`${new Date(n.created).toLocaleDateString(undefined, { dateStyle: 'medium' })} · ${n.text.replace(/\s+/g, ' ').slice(0, 80) || 'No content yet'}`} onClick={() => openPage(n.id)} />
            </div>
          ))
        ) : (
          <div className="px-4 py-5 text-[14px] text-muted">No news yet. Share an update with your team.</div>
        )}
      </Section>

      <Section
        title="Quick links"
        action={
          <button
            onClick={async () => {
              const url = await ask('Add a link', { placeholder: 'https://…', ok: 'Next', inputMode: 'url' })
              if (!url?.trim()) return
              const title = await ask('Name the link', { placeholder: url.trim(), ok: 'Add' })
              if (title === null) return
              s.update((x) => addLink(x, site.id, title, url))
            }}
            className="text-[14px] font-medium text-[var(--accent)]"
          >
            + Add
          </button>
        }
      >
        {site.links.length ? (
          site.links.map((l, i) => (
            <div key={l.id}>
              {i > 0 && <div className="ml-14 h-px bg-line/70" />}
              <Row
                leading={isWebLink(l.url) ? <Globe size={21} className="text-[var(--accent)]" /> : <Link2 size={21} className="text-muted" />}
                title={l.title}
                subtitle={l.url}
                onClick={() => (isWebLink(l.url) ? window.open(l.url, '_blank') : toast('That link points to a file on another computer.'))}
                onMore={() => menu([{ label: 'Remove link', icon: X, danger: true, onClick: () => s.update((x) => removeLink(x, site.id, l.id)) }], l.title)}
              />
            </div>
          ))
        ) : (
          <div className="px-4 py-5 text-[14px] text-muted">Links to websites and tools your team uses.</div>
        )}
      </Section>

      {site.taskList && (
        <Section title={listName ?? 'Tasks'} action={<button onClick={() => openApp('tasks')} className="text-[14px] font-medium text-[var(--accent)]">Open Tasks</button>}>
          {listTasks.length ? (
            listTasks.slice(0, 8).map((t, i) => (
              <div key={t.id}>
                {i > 0 && <div className="ml-14 h-px bg-line/70" />}
                <Row leading={<ListTodo size={20} className="text-muted" />} title={t.title} subtitle={t.due ? `Due ${t.due}` : undefined} />
              </div>
            ))
          ) : (
            <div className="px-4 py-5 text-[14px] text-muted">{tasks ? 'Nothing open on this list.' : 'Loading…'}</div>
          )}
        </Section>
      )}
    </div>
  )
}

function PageList({ site, kind, openPage }: { site: Site; kind: PageKind; openPage: (id: string) => void }) {
  const list = kind === 'news' ? news(site) : pages(site)
  if (!list.length)
    return <Empty icon={kind === 'news' ? Newspaper : FileText} title={kind === 'news' ? 'No news yet' : 'No pages yet'} text={kind === 'news' ? 'Post updates for everyone who uses this site.' : 'Pages hold information that stays put: guides, policies, how-tos.'} />
  return (
    <div className="space-y-2 px-3 pb-28 pt-1">
      {list.map((p) => (
        <button key={p.id} onClick={() => openPage(p.id)} className="block w-full rounded-2xl bg-surface p-4 text-left shadow-sm ring-1 ring-line/60 active:scale-[0.98]">
          {kind === 'news' && <div className="mb-2 h-1.5 w-10 rounded-full bg-[var(--accent)]" />}
          <div className="text-[16px] font-semibold text-ink">{p.title}</div>
          <div className="mt-1 line-clamp-2 text-[14px] text-muted">{p.text.replace(/\s+/g, ' ').trim() || 'No content yet'}</div>
          <div className="mt-2 text-[12px] text-muted">{kind === 'news' ? new Date(p.created).toLocaleDateString(undefined, { dateStyle: 'medium' }) : `Updated ${when(p.modified)}`}</div>
        </button>
      ))}
    </div>
  )
}

function FilesTab({ site, openPath, connect }: { site: Site; openPath: (p: string) => void; connect: () => void }) {
  const [files, setFiles] = useState<FolderEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!site.library) return
    setFiles(null)
    window.bear
      .listFolder(site.library)
      .then((f) => setFiles(f.filter((x) => !x.isDir).sort((a, b) => b.modified - a.modified)))
      .catch(() => {
        setFiles([])
        setError(`The library folder (${site.library}) isn't on this phone. It may be a folder on a computer.`)
      })
  }, [site.library])
  if (!site.library)
    return <Empty icon={FolderOpen} title="No document library" text="Connect a folder to share documents on this site. On your phone, libraries use Documents/Bear." action={<Button onClick={connect}>Connect folder</Button>} />
  return (
    <div className="pb-10">
      {error && <div className="mx-4 my-3 rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-900">{error}</div>}
      {files === null && <div className="p-10 text-center text-[14px] text-muted">Loading…</div>}
      {files?.length === 0 && !error && <Empty icon={FolderOpen} title="The library is empty" text={`Documents saved in ${site.library} show up here.`} />}
      {files?.map((f) => {
        const app = appForFile(f.path)
        return (
          <Row
            key={f.path}
            leading={app ? <AppTile id={app} size={40} /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-hover text-muted"><FileText size={21} /></div>}
            title={stripExtension(f.name)}
            subtitle={`${fileSize(f.size)} · ${when(f.modified)}`}
            onClick={() => (app ? openPath(f.path) : toast("Bear can't open this kind of file."))}
          />
        )
      })}
    </div>
  )
}

/** Read-only rich text (uses the editor so it renders exactly what was written). */
function RichView({ html }: { html: string }) {
  const editor = usePhoneEditor({ content: html, editable: false, tasks: true })
  return <EditorContent editor={editor} className="phone-prose [&_.phone-doc]:min-h-0 [&_.write-doc]:text-ink" />
}

function EditPage({ site, heading, title, html, onTitle, onBody }: { site: Site; heading: string; title?: string; html: string; onTitle?: (t: string) => void; onBody: (html: string, text: string) => void }) {
  const editor = usePhoneEditor({ content: html, tasks: true, placeholder: 'Write something…', onUpdate: (e) => onBody(e.getHTML(), e.getText()) })
  const [t, setT] = useState(title ?? '')
  return (
    <div className="h-full" style={{ ['--accent' as string]: site.color }}>
      <Page title={`Editing ${heading.toLowerCase()}`} subtitle={site.name} back bottom={<FormatBar editor={editor} tasks />}>
        <div className="min-h-full bg-paper text-[#1f1f1f] dark:bg-surface dark:text-ink">
          {onTitle && (
            <input
              value={t}
              onChange={(e) => {
                setT(e.target.value)
                onTitle(e.target.value)
              }}
              placeholder="Title"
              aria-label="Title"
              className="w-full bg-transparent px-5 pt-5 text-[24px] font-bold outline-none placeholder:text-[#9a9a9a]"
            />
          )}
          <DocSurface editor={editor} className="!pt-2" />
        </div>
      </Page>
    </div>
  )
}
