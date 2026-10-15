import { describe, it, expect } from 'vitest'
import { APPS } from '@bear/core'
import { tourApps } from './tour'

describe('tourApps', () => {
  it('lists every app in registry order', () => {
    expect(tourApps().map((a) => a.id)).toEqual(APPS.map((a) => a.id))
    expect(tourApps()).toHaveLength(12)
  })

  it('gives each ready app 4 to 6 features and a docs slug', () => {
    for (const a of tourApps().filter((t) => t.ready)) {
      expect(a.features.length, a.id).toBeGreaterThanOrEqual(4)
      expect(a.features.length, a.id).toBeLessThanOrEqual(6)
      expect(a.docsSlug).toBe('apps/' + a.id)
    }
  })

  it('gives each not-ready app no docs slug', () => {
    for (const a of tourApps().filter((t) => !t.ready)) expect(a.docsSlug).toBeNull()
  })

  it('keeps product names out of the feature copy', () => {
    const banned = /\b(Microsoft|Office|Outlook|Word|Excel|PowerPoint|Teams|OneNote)\b/
    for (const a of tourApps()) {
      // A tagline fallback comes from @bear/core, not from the site copy.
      for (const f of a.features.filter((x) => x !== a.tagline)) expect(f, a.id).not.toMatch(banned)
    }
  })

  it('follows the ready flag of the apps passed in', () => {
    const chat = tourApps(APPS.map((a) => (a.id === 'chat' ? { ...a, ready: true } : a))).find((a) => a.id === 'chat')!
    expect(chat.docsSlug).toBe('apps/chat')
    expect(chat.features).toEqual(['Teams & calls'])
  })
})
