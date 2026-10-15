import { describe, it, expect } from 'vitest'
import { APPS } from '@bear/core'
import { contrastRatio } from './themeMixer'

// Surfaces from styles/tokens.css. App colours render as text on the card surface and the page gradient.
const LIGHT = { surface: '#ffffff', bg: '#fbf4ea', bgTo: '#f1e2cc', ink: '#3b2a1a', accent: '#9a4508' }
const DARK = { surface: '#3a2a1d', ink: '#fbf4ea' }

describe('app colours as text', () => {
  it('has 12 apps to check', () => {
    expect(APPS).toHaveLength(12)
  })
  it.each(APPS.map((a) => [a.id, a.color]))('%s (%s) meets 4.5:1 as text on the light card surface', (_id, color) => {
    // App-coloured text only ever sits on cards (tiles, the tour picker), never directly on the page gradient.
    expect(contrastRatio(color, LIGHT.surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('dark mode renders app-coloured headings in the ink, which meets 4.5:1 on the dark surface', () => {
    // base.css (.tile__name) and tour.astro (.picker__info h2) switch to var(--ink) under prefers-color-scheme: dark.
    expect(contrastRatio(DARK.ink, DARK.surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('would fail if app colours were used as text on the dark surface (why the dark rule exists)', () => {
    expect(APPS.some((a) => contrastRatio(a.color, DARK.surface) < 4.5)).toBe(true)
  })
})

describe('links and demo bars', () => {
  it('the light accent meets 4.5:1 on the whole page gradient and on white', () => {
    for (const bg of [LIGHT.bg, LIGHT.bgTo, LIGHT.surface]) expect(contrastRatio(LIGHT.accent, bg)).toBeGreaterThanOrEqual(4.5)
  })
  it('white text on the accent button and on each app demo bar meets 4.5:1', () => {
    expect(contrastRatio('#ffffff', LIGHT.accent)).toBeGreaterThanOrEqual(4.5)
    for (const a of APPS) expect(contrastRatio('#ffffff', a.color)).toBeGreaterThanOrEqual(4.5)
  })
  it('the coming-soon bar (surface text on --ink-muted) meets 4.5:1 in both themes', () => {
    expect(contrastRatio('#ffffff', '#6f5a46')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#3a2a1d', '#cdb89f')).toBeGreaterThanOrEqual(4.5)
  })
})
