import { describe, expect, it } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import PlatformCards from './PlatformCards.astro'
import { toRelease, type ReleaseInfo } from '../lib/releases'

const BASE = 'https://github.com/MichaelCodeToLimit/Bear/releases/download/v0.1.1/'
const RELEASES = 'https://github.com/MichaelCodeToLimit/Bear/releases'
const HASH = 'ab'.repeat(32)
const ALL = [
  'Bear-Setup-0.1.1.exe',
  'Bear-0.1.1.msi',
  'Bear-0.1.1-arm64.dmg',
  'Bear-0.1.1-x64.dmg',
  'Bear-0.1.1-arm64-mac.zip',
  'Bear-0.1.1-x64-mac.zip',
  'bear_0.1.1_amd64.deb',
  'Bear-0.1.1-x64.AppImage',
  'Bear-0.1.1-x64.flatpak',
  'Bear-0.1.1-x64.rpm',
  'Bear-0.1.1-x64.tar.gz'
]
function release(names: string[], overrides: Record<string, string> = {}): ReleaseInfo {
  return toRelease({
    tag_name: 'v0.1.1',
    published_at: '2026-10-14T10:00:00Z',
    html_url: 'https://github.com/MichaelCodeToLimit/Bear/releases/tag/v0.1.1',
    assets: names.map((n) => ({
      name: n,
      browser_download_url: overrides[n] ?? BASE + n,
      size: n.endsWith('.exe') ? 113_058_239 : 98_000_000,
      digest: n.endsWith('.exe') ? `sha256:${HASH}` : undefined
    }))
  }) as ReleaseInfo
}

async function render(r: ReleaseInfo | null): Promise<string> {
  const container = await AstroContainer.create()
  return container.renderToString(PlatformCards, { props: { release: r } })
}
/** The opening tags of every element with this attribute fragment, as plain strings. */
const tags = (html: string, re: RegExp) => html.match(re) ?? []

describe('PlatformCards, release present', () => {
  it('links every button to its asset with an accessible name that contains the visible text', async () => {
    const html = await render(release(ALL))
    expect(tags(html, /<a [^>]*data-state="ready"[^>]*>/g)).toHaveLength(11)
    expect(html).toContain(`href="${BASE}Bear-Setup-0.1.1.exe"`)
    expect(html).toContain('aria-label="Download .exe for Windows, Bear 0.1.1, 113 MB"')
    expect(html).toContain(`href="${BASE}Bear-0.1.1-arm64.dmg"`)
    expect(html).toContain('aria-label="Apple silicon for macOS, Bear 0.1.1, 98 MB"')
    expect(html).toContain(`href="${BASE}Bear-0.1.1-x64.dmg"`)
    for (const n of ['bear_0.1.1_amd64.deb', 'Bear-0.1.1-x64.AppImage', 'Bear-0.1.1-x64.flatpak', 'Bear-0.1.1-x64.rpm', 'Bear-0.1.1-x64.tar.gz', 'Bear-0.1.1-arm64-mac.zip'])
      expect(html).toContain(`href="${BASE}${n}"`)
    expect(html).not.toContain('data-state="pending"')
    expect(html).not.toContain('data-state="missing"')
    expect(html).not.toContain(`href="${RELEASES}"`)
  })
  it('shows Available on all three cards, the version and sizes, and real file names in the install hints', async () => {
    const html = await render(release(ALL))
    expect(tags(html, /data-status="available"/g)).toHaveLength(3)
    expect(html).not.toContain('Coming soon')
    expect(html).not.toContain('First release coming soon')
    expect(html).toContain('v0.1.1 · .exe 113 MB · .msi 98 MB')
    expect(html).toContain('v0.1.1 · Apple silicon 98 MB · Intel 98 MB')
    expect(html).toContain('sudo apt install ./bear_0.1.1_amd64.deb')
    expect(html).toContain('chmod +x Bear-0.1.1-x64.AppImage &amp;&amp; ./Bear-0.1.1-x64.AppImage')
    expect(html).toContain('flatpak install --user ./Bear-0.1.1-x64.flatpak')
    expect(html).toContain('sudo dnf install ./Bear-0.1.1-x64.rpm')
  })
  it('shows the SHA-256 only for files that have a digest', async () => {
    const html = await render(release(ALL))
    expect(html).toContain(HASH)
    expect(html.split(HASH)).toHaveLength(2)
    expect(html).toContain('SHA-256 · Bear-Setup-0.1.1.exe')
  })
  it('renders a missing asset as a disabled span, not a link', async () => {
    const html = await render(release(ALL.filter((n) => !n.endsWith('.flatpak'))))
    const missing = tags(html, /<span [^>]*data-state="missing"[^>]*>/g)
    expect(missing).toHaveLength(1)
    expect(missing[0]).toContain('aria-disabled="true"')
    expect(missing[0]).toContain('title="Not in this release"')
    expect(missing[0]).not.toContain('href')
    expect(tags(html, /<a [^>]*data-state="ready"[^>]*>/g)).toHaveLength(10)
  })
  it('a Windows-only release leaves Mac and Linux coming soon with disabled buttons', async () => {
    const html = await render(release(['Bear-Setup-0.1.1.exe']))
    expect(tags(html, /data-status="available"/g)).toHaveLength(1)
    expect(tags(html, /data-status="soon"/g)).toHaveLength(2)
    expect(tags(html, /<a [^>]*data-state="ready"[^>]*>/g)).toHaveLength(1)
    expect(tags(html, /<span [^>]*data-state="missing"[^>]*>/g).length).toBe(1 + 2 + 3 + 2)
    expect(html).not.toContain('First release coming soon')
    expect(html).toContain('sudo apt install ./bear_0.1.1_amd64.deb')
  })
  it('drops an asset with a hostile url before it can be linked', async () => {
    const html = await render(release(ALL, { 'Bear-0.1.1.msi': 'https://evil.test/Bear-0.1.1.msi' }))
    expect(html).not.toContain('evil.test')
    expect(tags(html, /<span [^>]*data-state="missing"[^>]*>/g)).toHaveLength(1)
  })
  it('a mac zip with no arch is offered as the Intel zip', async () => {
    const html = await render(release(['Bear-0.1.1.dmg', 'Bear-0.1.1-mac.zip']))
    expect(html).toContain(`href="${BASE}Bear-0.1.1-mac.zip"`)
    expect(html).toContain('Intel .zip')
  })
})

describe('PlatformCards, no release', () => {
  it('sends every button to the Releases page and marks it pending', async () => {
    const html = await render(null)
    expect(tags(html, /<a [^>]*data-state="pending"[^>]*>/g)).toHaveLength(9)
    expect(tags(html, /href="[^"]*"/g).every((h) => h === `href="${RELEASES}"`)).toBe(true)
    expect(tags(html, /data-status="soon"/g)).toHaveLength(3)
    expect(tags(html, /First release coming soon/g)).toHaveLength(3)
    expect(html).toContain('sudo apt install ./bear_&lt;version&gt;_amd64.deb')
  })
})
