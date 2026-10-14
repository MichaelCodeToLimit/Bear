export interface Page {
  id: string
  title: string
  html: string
  /** Plain text, kept for search. */
  text: string
  created: number
  modified: number
}

export interface Section {
  id: string
  name: string
  color: string
  pages: Page[]
}

export interface Notebook {
  id: string
  name: string
  color: string
  sections: Section[]
}

export interface Location {
  notebook: string
  section: string
  page: string
}

export interface NotesData {
  version: 1
  notebooks: Notebook[]
  /** Where the user was, restored on open. */
  last?: Location
}

export const SECTION_COLORS = ['#7e22ce', '#0f766e', '#be123c', '#b45309', '#1d4ed8', '#4d7c0f', '#db2777', '#0e7490']

let n = 0
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`

export function newPage(title = '', html = ''): Page {
  const now = Date.now()
  return { id: uid('p'), title, html, text: html.replace(/<[^>]+>/g, ' '), created: now, modified: now }
}

export function newSection(name: string, index: number): Section {
  return { id: uid('s'), name, color: SECTION_COLORS[index % SECTION_COLORS.length], pages: [newPage()] }
}

export function initialNotes(): NotesData {
  const welcome = newPage(
    'Welcome to Notes',
    '<p>Notes keeps your thoughts in <strong>notebooks</strong>, split into <strong>sections</strong> and <strong>pages</strong>.</p>' +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Open Notes</p></li><li data-type="taskItem" data-checked="false"><p>Write your first page</p></li></ul>' +
      '<p>Everything saves automatically.</p>'
  )
  return {
    version: 1,
    notebooks: [{ id: uid('n'), name: 'My Notebook', color: SECTION_COLORS[0], sections: [{ id: uid('s'), name: 'Quick Notes', color: SECTION_COLORS[0], pages: [welcome] }] }]
  }
}

export function upgradeNotes(raw: unknown): NotesData | null {
  const d = raw as Partial<NotesData> | null
  if (!d || !Array.isArray(d.notebooks) || !d.notebooks.length) return null
  return { version: 1, notebooks: d.notebooks, last: d.last }
}

const mapNotebook = (d: NotesData, id: string, fn: (nb: Notebook) => Notebook): NotesData => ({
  ...d,
  notebooks: d.notebooks.map((nb) => (nb.id === id ? fn(nb) : nb))
})

const mapSection = (d: NotesData, nbId: string, sId: string, fn: (s: Section) => Section): NotesData =>
  mapNotebook(d, nbId, (nb) => ({ ...nb, sections: nb.sections.map((s) => (s.id === sId ? fn(s) : s)) }))

export function find(d: NotesData, loc: Partial<Location>) {
  const notebook = d.notebooks.find((nb) => nb.id === loc.notebook) ?? d.notebooks[0]
  const section = notebook.sections.find((s) => s.id === loc.section) ?? notebook.sections[0]
  const page = section?.pages.find((p) => p.id === loc.page) ?? section?.pages[0]
  return { notebook, section, page }
}

export function addNotebook(d: NotesData, name: string): { data: NotesData; loc: Location } {
  const section = newSection('New Section', 0)
  const nb: Notebook = { id: uid('n'), name: name.trim() || 'Untitled Notebook', color: SECTION_COLORS[d.notebooks.length % SECTION_COLORS.length], sections: [section] }
  return { data: { ...d, notebooks: [...d.notebooks, nb] }, loc: { notebook: nb.id, section: section.id, page: section.pages[0].id } }
}

export function addSection(d: NotesData, nbId: string, name: string): { data: NotesData; loc: Location } {
  const nb = d.notebooks.find((x) => x.id === nbId)!
  const section = newSection(name.trim() || 'New Section', nb.sections.length)
  return {
    data: mapNotebook(d, nbId, (x) => ({ ...x, sections: [...x.sections, section] })),
    loc: { notebook: nbId, section: section.id, page: section.pages[0].id }
  }
}

export function addPage(d: NotesData, nbId: string, sId: string): { data: NotesData; loc: Location } {
  const page = newPage()
  return { data: mapSection(d, nbId, sId, (s) => ({ ...s, pages: [...s.pages, page] })), loc: { notebook: nbId, section: sId, page: page.id } }
}

export function updatePage(d: NotesData, loc: Location, patch: Partial<Pick<Page, 'title' | 'html' | 'text'>>): NotesData {
  return mapSection(d, loc.notebook, loc.section, (s) => ({
    ...s,
    pages: s.pages.map((p) => (p.id === loc.page ? { ...p, ...patch, modified: Date.now() } : p))
  }))
}

export function renameNotebook(d: NotesData, id: string, name: string): NotesData {
  return mapNotebook(d, id, (nb) => ({ ...nb, name: name.trim() || nb.name }))
}

export function renameSection(d: NotesData, nbId: string, sId: string, name: string): NotesData {
  return mapSection(d, nbId, sId, (s) => ({ ...s, name: name.trim() || s.name }))
}

/** Every container keeps at least one child, so there's always somewhere to write. */
export function deletePage(d: NotesData, nbId: string, sId: string, pageId: string): NotesData {
  return mapSection(d, nbId, sId, (s) => {
    const pages = s.pages.filter((p) => p.id !== pageId)
    return { ...s, pages: pages.length ? pages : [newPage()] }
  })
}

export function deleteSection(d: NotesData, nbId: string, sId: string): NotesData {
  return mapNotebook(d, nbId, (nb) => {
    const sections = nb.sections.filter((s) => s.id !== sId)
    return { ...nb, sections: sections.length ? sections : [newSection('New Section', 0)] }
  })
}

export function deleteNotebook(d: NotesData, id: string): NotesData {
  if (d.notebooks.length <= 1) return d
  return { ...d, notebooks: d.notebooks.filter((nb) => nb.id !== id) }
}

export function movePage(d: NotesData, from: Location, toSection: string): NotesData {
  if (from.section === toSection) return d
  const { page } = find(d, from)
  if (!page) return d
  let out = mapSection(d, from.notebook, from.section, (s) => ({ ...s, pages: s.pages.filter((p) => p.id !== page.id) }))
  out = mapSection(out, from.notebook, from.section, (s) => (s.pages.length ? s : { ...s, pages: [newPage()] }))
  return mapSection(out, from.notebook, toSection, (s) => ({ ...s, pages: [...s.pages, page] }))
}

export interface SearchHit {
  loc: Location
  notebook: string
  section: string
  title: string
  snippet: string
}

export function search(d: NotesData, query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SearchHit[] = []
  for (const nb of d.notebooks) {
    for (const s of nb.sections) {
      for (const p of s.pages) {
        const text = p.text.replace(/\s+/g, ' ')
        const i = text.toLowerCase().indexOf(q)
        if (i < 0 && !p.title.toLowerCase().includes(q)) continue
        const snippet = i < 0 ? text.slice(0, 80) : `${i > 30 ? '…' : ''}${text.slice(Math.max(0, i - 30), i + q.length + 50)}`
        hits.push({ loc: { notebook: nb.id, section: s.id, page: p.id }, notebook: nb.name, section: s.name, title: p.title || 'Untitled page', snippet })
      }
    }
  }
  return hits
}
