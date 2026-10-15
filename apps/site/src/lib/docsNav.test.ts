import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GROUP_ORDER, groupDocs, prevNext } from './docsNav'
import { tourApps } from './tour'

const entries = [
  { slug: 'contribute/dev-setup', title: 'Dev setup', group: 'Contribute', order: 1 },
  { slug: 'apps/sheets', title: 'Sheets', group: 'Apps', order: 2 },
  { slug: 'faq', title: 'FAQ', group: 'FAQ', order: 1 },
  { slug: 'get-started/first-document', title: 'First document', group: 'Get started', order: 2 },
  { slug: 'apps/write', title: 'Write', group: 'Apps', order: 1 },
  { slug: 'get-started/install', title: 'Install', group: 'Get started', order: 1 }
]

describe('groupDocs', () => {
  it('orders groups as GROUP_ORDER whatever the input order', () => {
    expect(groupDocs(entries).map((g) => g.group)).toEqual([...GROUP_ORDER])
  })

  it('sorts items within a group by order', () => {
    const groups = groupDocs(entries)
    expect(groups[0].items.map((i) => i.slug)).toEqual(['get-started/install', 'get-started/first-document'])
    expect(groups[1].items.map((i) => i.slug)).toEqual(['apps/write', 'apps/sheets'])
  })

  it('omits groups with no pages', () => {
    expect(groupDocs([entries[2]]).map((g) => g.group)).toEqual(['FAQ'])
  })
})

describe('prevNext', () => {
  const groups = groupDocs(entries)

  it('has no prev on the first page', () => {
    expect(prevNext(groups, 'get-started/install')).toEqual({
      prev: null,
      next: { slug: 'get-started/first-document', title: 'First document' }
    })
  })

  it('has no next on the last page', () => {
    const last = prevNext(groups, 'contribute/dev-setup')
    expect(last.next).toBeNull()
    expect(last.prev?.slug).toBe('faq')
  })

  it('walks across group boundaries', () => {
    expect(prevNext(groups, 'apps/sheets').next?.slug).toBe('faq')
  })

  it('returns nulls for an unknown slug', () => {
    expect(prevNext(groups, 'nope')).toEqual({ prev: null, next: null })
  })
})

describe('docs coverage', () => {
  it('has a guide for every tour app that links to docs', () => {
    const dir = fileURLToPath(new URL('../content/docs/apps/', import.meta.url))
    const files = readdirSync(dir)
    for (const app of tourApps()) {
      if (!app.docsSlug) continue
      const id = app.docsSlug.replace(/^apps\//, '')
      expect(files, `missing guide for ${app.id}`).toContain(`${id}.md`)
    }
  })
})
