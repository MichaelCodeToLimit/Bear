import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The release-state markup of the cards is covered by PlatformCards.render.test.ts; this checks the page wiring.
const source = readFileSync(new URL('../pages/download.astro', import.meta.url), 'utf8')

describe('download page source', () => {
  it('uses the spec headline for the release state', () => {
    expect(source).toContain('Get Bear. <span class="grad">Keep it.</span>')
  })
  it('puts the platform cards before the build-from-source block', () => {
    expect(source.indexOf('<PlatformCards')).toBeGreaterThan(-1)
    expect(source.indexOf('<PlatformCards')).toBeLessThan(source.indexOf('Build from source</h2>'))
  })
  it('starts the edition switcher and the Your device badge', () => {
    expect(source).toContain('initEditionSwitch()')
    expect(source).toContain('initYourDevice()')
  })
  it('no longer has the per-file groups or the Best-for-you slot', () => {
    expect(source).not.toMatch(/data-best|initBestForYou|id="downloads"/)
  })
})
