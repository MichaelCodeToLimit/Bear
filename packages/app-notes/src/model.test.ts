import { describe, expect, it } from 'vitest'
import {
  addNotebook, addPage, addSection, deleteNotebook, deletePage, deleteSection, find, initialNotes, movePage, search,
  updatePage, upgradeNotes
} from './model'

describe('notes', () => {
  it('starts with a welcome page and finds locations with fallbacks', () => {
    const d = initialNotes()
    const { notebook, section, page } = find(d, {})
    expect(notebook.name).toBe('My Notebook')
    expect(section.name).toBe('Quick Notes')
    expect(page!.title).toBe('Welcome to Notes')
  })

  it('adds and edits pages, sections and notebooks', () => {
    let d = initialNotes()
    const nb = d.notebooks[0].id
    const s = d.notebooks[0].sections[0].id
    const added = addPage(d, nb, s)
    d = updatePage(added.data, added.loc, { title: 'Shopping', html: '<p>eggs</p>', text: 'eggs' })
    expect(find(d, added.loc).page!.title).toBe('Shopping')
    const sec = addSection(d, nb, 'Work')
    d = sec.data
    expect(find(d, sec.loc).section.name).toBe('Work')
    const book = addNotebook(d, 'Recipes')
    d = book.data
    expect(d.notebooks.map((x) => x.name)).toEqual(['My Notebook', 'Recipes'])
  })

  it('searches titles and text with snippets', () => {
    let d = initialNotes()
    const nb = d.notebooks[0].id
    const s = d.notebooks[0].sections[0].id
    const added = addPage(d, nb, s)
    d = updatePage(added.data, added.loc, { title: 'Trip', text: 'Remember to book the train to Edinburgh on Friday' })
    const hits = search(d, 'edinburgh')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ title: 'Trip', section: 'Quick Notes' })
    expect(hits[0].snippet).toContain('Edinburgh')
    expect(search(d, '   ')).toEqual([])
  })

  it('never leaves a section, notebook or the app empty', () => {
    let d = initialNotes()
    const nb = d.notebooks[0]
    const s = nb.sections[0]
    d = deletePage(d, nb.id, s.id, s.pages[0].id)
    expect(d.notebooks[0].sections[0].pages).toHaveLength(1)
    d = deleteSection(d, nb.id, s.id)
    expect(d.notebooks[0].sections).toHaveLength(1)
    expect(deleteNotebook(d, nb.id)).toBe(d)
  })

  it('moves pages between sections', () => {
    let d = initialNotes()
    const nb = d.notebooks[0].id
    const from = find(d, {})
    const target = addSection(d, nb, 'Archive')
    d = movePage(target.data, { notebook: nb, section: from.section.id, page: from.page!.id }, target.loc.section)
    expect(find(d, { notebook: nb, section: target.loc.section }).section.pages.map((p) => p.title)).toContain('Welcome to Notes')
  })

  it('rejects unrecognisable stored data', () => {
    expect(upgradeNotes({})).toBeNull()
    expect(upgradeNotes(initialNotes())).not.toBeNull()
  })
})
