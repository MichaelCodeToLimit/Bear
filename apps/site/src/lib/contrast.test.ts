import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { APPS } from '@bear/core'
import { contrastRatio, LIGHT, DARK } from './themeMixer'

// App colours render as text only on the light card surface; on dark they render in --ink.
describe('app colours as text', () => {
  it('has 12 apps to check', () => {
    expect(APPS).toHaveLength(12)
  })
  it.each(APPS.map((a) => [a.id, a.color]))('%s (%s) meets 4.5:1 as text on the light card surface', (_id, color) => {
    expect(contrastRatio(color, LIGHT.surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('dark mode renders app-coloured headings in the ink, which meets 4.5:1 on the dark surface', () => {
    // base.css (.tile__name) and tour.astro (.picker__info h2) switch to var(--ink) in the dark theme (the default).
    expect(contrastRatio(DARK.ink, DARK.surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('would fail if app colours were used as text on the dark surface (why the dark rule exists)', () => {
    expect(APPS.some((a) => contrastRatio(a.color, DARK.surface) < 4.5)).toBe(true)
  })
})

describe('white text on app demo bars', () => {
  it('meets 4.5:1 on each app colour', () => {
    for (const a of APPS) expect(contrastRatio('#ffffff', a.color)).toBeGreaterThanOrEqual(4.5)
  })
})

describe.each([
  ['light', LIGHT],
  ['dark', DARK]
])('%s theme tokens', (_name, t) => {
  it('ink and muted meet 4.5:1 on both background stops and the surface', () => {
    for (const fg of [t.ink, t.muted]) for (const bg of [t.bg, t.bgTo, t.surface]) expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
  it('the accent meets 4.5:1 on both background stops', () => {
    for (const bg of [t.bg, t.bgTo]) expect(contrastRatio(t.accent, bg)).toBeGreaterThanOrEqual(4.5)
  })
  it('every gradient stop meets 4.5:1 on both background stops', () => {
    for (const g of t.grad) for (const bg of [t.bg, t.bgTo]) expect(contrastRatio(g, bg)).toBeGreaterThanOrEqual(4.5)
  })
  it('the primary button text meets 4.5:1 on its background', () => {
    expect(contrastRatio(t.btnInk, t.btnBg)).toBeGreaterThanOrEqual(4.5)
  })
  it('the coming-soon bar (surface text on --ink-muted) meets 4.5:1', () => {
    expect(contrastRatio(t.surface, t.muted)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('tokens.css matches the palettes tested above', () => {
  const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8').toLowerCase()
  const split = css.indexOf("\nhtml[data-theme='light'] {")
  const dark = css.slice(0, split)
  const light = css.slice(split)
  it.each([
    ['dark', DARK, dark],
    ['light', LIGHT, light]
  ] as const)('%s values appear in its block', (_n, t, block) => {
    for (const hex of [t.bg, t.bgTo, t.ink, t.muted, t.surface, t.accent, t.btnBg, t.btnInk, ...t.grad]) {
      expect(block).toContain(hex.toLowerCase())
    }
  })
})

describe('primary button', () => {
  it.each([
    ['light', LIGHT],
    ['dark', DARK]
  ])('its text is readable on its background in the %s theme', (_n, t) => {
    expect(contrastRatio(t.btnInk, t.btnBg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('Download cards (PlatformCards.astro)', () => {
  const css = readFileSync(new URL('../components/PlatformCards.astro', import.meta.url), 'utf8').toLowerCase()
  it('the "Your device" badge (white on blue) meets 4.5:1', () => {
    expect(css).toContain('background: #1d4ed8')
    expect(contrastRatio('#ffffff', '#1d4ed8')).toBeGreaterThanOrEqual(4.5)
  })
  it('the SHA-256 and install-command boxes stay dark in both themes: main and muted text meet 4.5:1', () => {
    expect(css).toContain('background: #0f0a07')
    expect(css).toContain('color: #f6ead9')
    expect(css).toContain('color: #b8a48e')
    expect(contrastRatio('#f6ead9', '#0f0a07')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#b8a48e', '#0f0a07')).toBeGreaterThanOrEqual(4.5)
  })
  it.each([
    ['light', LIGHT],
    ['dark', DARK]
  ])('footnotes, hints and the pill text (muted/ink on the page and card surfaces) are readable in the %s theme', (_n, t) => {
    for (const fg of [t.ink, t.muted]) for (const bg of [t.bg, t.bgTo, t.surface]) expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
