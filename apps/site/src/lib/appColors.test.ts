import { describe, it, expect } from 'vitest'
import { SITE_APPS as APPS } from './officeApps'
import { appColorCss } from './appColors'

describe('appColorCss', () => {
  const css = appColorCss(APPS)

  it('declares each app colour on :root', () => {
    expect(css.startsWith(':root{')).toBe(true)
    expect(css).toContain('--app-sheets:#4d7c0f')
    expect(css).toContain('--app-write:#0f766e')
    expect(css).toContain('--app-photo:#9333ea')
  })

  it('has exactly one declaration per app, in order', () => {
    const ids = [...css.matchAll(/--app-([a-z]+):/g)].map((m) => m[1])
    expect(ids).toHaveLength(13)
    expect(ids).toEqual(APPS.map((a) => a.id))
  })
})
