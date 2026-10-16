import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// No release exists yet, so the release-state markup is not renderable in e2e; assert on the page source.
const source = readFileSync(new URL('../pages/download.astro', import.meta.url), 'utf8')

describe('download page source', () => {
  it('uses the spec headline for the release state', () => {
    expect(source).toContain('Get Bear. <span class="grad">Keep it.</span>')
  })
  it('gives every installer card an OS glyph', () => {
    expect(source).toMatch(/<li class="card dl-card"[\s\S]*<OsGlyph os=\{os\} \/>/)
  })
})
