import { describe, expect, it } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import PlatformCards from './PlatformCards.astro'
import { toRelease, type ReleaseInfo } from '../lib/releases'

const BASE = 'https://github.com/MichaelCodeToLimit/Bear/releases/download/v0.1.1/'
const RELEASES = 'https://github.com/MichaelCodeToLimit/Bear/releases'
const HASH = 'ab'.repeat(32)
const APK_HASH = 'cd'.repeat(32)
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
  'Bear-0.1.1-x64.tar.gz',
  'Bear-0.1.1-debug.apk'
]
function release(names: string[], overrides: Record<string, string> = {}): ReleaseInfo {
  return toRelease({
    tag_name: 'v0.1.1',
    published_at: '2026-10-14T10:00:00Z',
    html_url: 'https://github.com/MichaelCodeToLimit/Bear/releases/tag/v0.1.1',
    assets: names.map((n) => ({
      name: n,
      browser_download_url: overrides[n] ?? BASE + n,
      size: n.endsWith('.exe') ? 113_058_239 : n.endsWith('.apk') ? 23_000_000 : 98_000_000,
      digest: n.endsWith('.exe') ? `sha256:${HASH}` : n.endsWith('.apk') ? `sha256:${APK_HASH}` : undefined
    }))
  }) as ReleaseInfo
}

async function render(r: ReleaseInfo | null): Promise<string> {
  const container = await AstroContainer.create()
  return container.renderToString(PlatformCards, { props: { release: r } })
}
/** The opening tags of every element with this attribute fragment, as plain strings. */
const tags = (html: string, re: RegExp) => html.match(re) ?? []
/** The markup of one edition's panel (the panels are siblings, in the order all, office, studio). */
function panel(html: string, edition: 'all' | 'office' | 'studio'): string {
  const start = html.indexOf(`data-edition-panel="${edition}"`)
  expect(start, edition).toBeGreaterThan(-1)
  const next = html.indexOf('data-edition-panel="', start + 1)
  return html.slice(start, next === -1 ? undefined : next)
}
async function renderAll(r: ReleaseInfo | null): Promise<string> {
  return panel(await render(r), 'all')
}

describe('PlatformCards, release present', () => {
  it('links every button to its asset with an accessible name that contains the visible text', async () => {
    const html = await renderAll(release(ALL))
    expect(tags(html, /<a [^>]*data-state="ready"[^>]*>/g)).toHaveLength(12)
    expect(html).toContain(`href="${BASE}Bear-Setup-0.1.1.exe"`)
    expect(html).toContain(`href="${BASE}Bear-0.1.1-debug.apk"`)
    expect(html).toContain('aria-label="Download .apk for Android, Bear 0.1.1, 23 MB"')
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
  it('shows Available on all four cards, the version and sizes, and real file names in the install hints', async () => {
    const html = await renderAll(release(ALL))
    expect(tags(html, /data-status="available"/g)).toHaveLength(4)
    expect(html).not.toContain('Coming soon')
    expect(html).not.toContain('First release coming soon')
    expect(html).toContain('v0.1.1 · .exe 113 MB · .msi 98 MB')
    expect(html).toContain('v0.1.1 · Apple silicon 98 MB · Intel 98 MB')
    expect(html).toContain('v0.1.1 · 23 MB')
    expect(html).toContain('adb install Bear-0.1.1-debug.apk')
    expect(html).toContain('sudo apt install ./bear_0.1.1_amd64.deb')
    expect(html).toContain('chmod +x Bear-0.1.1-x64.AppImage &amp;&amp; ./Bear-0.1.1-x64.AppImage')
    expect(html).toContain('flatpak install --user ./Bear-0.1.1-x64.flatpak')
    expect(html).toContain('sudo dnf install ./Bear-0.1.1-x64.rpm')
  })
  it('shows the SHA-256 only for files that have a digest', async () => {
    const html = await renderAll(release(ALL))
    expect(html).toContain(HASH)
    expect(html.split(HASH)).toHaveLength(2)
    expect(html.split(APK_HASH)).toHaveLength(2)
    expect(html).toContain('SHA-256 · Bear-0.1.1-debug.apk')
    expect(html).toContain('SHA-256 · Bear-Setup-0.1.1.exe')
  })
  it('renders a missing asset as a disabled span, not a link', async () => {
    const html = await renderAll(release(ALL.filter((n) => !n.endsWith('.flatpak'))))
    const missing = tags(html, /<span [^>]*data-state="missing"[^>]*>/g)
    expect(missing).toHaveLength(1)
    expect(missing[0]).toContain('aria-disabled="true"')
    expect(missing[0]).toContain('title="Not in this release"')
    expect(missing[0]).not.toContain('href')
    expect(tags(html, /<a [^>]*data-state="ready"[^>]*>/g)).toHaveLength(11)
  })
  it('a Windows-only release leaves Mac and Linux coming soon with disabled buttons', async () => {
    const html = await renderAll(release(['Bear-Setup-0.1.1.exe']))
    expect(tags(html, /data-status="available"/g)).toHaveLength(1)
    expect(tags(html, /data-status="soon"/g)).toHaveLength(3)
    expect(tags(html, /<a [^>]*data-state="ready"[^>]*>/g)).toHaveLength(1)
    expect(tags(html, /<span [^>]*data-state="missing"[^>]*>/g).length).toBe(1 + 2 + 3 + 2 + 1)
    expect(html).not.toContain('First release coming soon')
    expect(html).toContain('sudo apt install ./bear_0.1.1_amd64.deb')
  })
  it('drops an asset with a hostile url before it can be linked', async () => {
    const html = await renderAll(release(ALL, { 'Bear-0.1.1.msi': 'https://evil.test/Bear-0.1.1.msi' }))
    expect(html).not.toContain('evil.test')
    expect(tags(html, /<span [^>]*data-state="missing"[^>]*>/g)).toHaveLength(1)
  })
  it('a mac zip with no arch is offered as the Intel zip', async () => {
    const html = await renderAll(release(['Bear-0.1.1.dmg', 'Bear-0.1.1-mac.zip']))
    expect(html).toContain(`href="${BASE}Bear-0.1.1-mac.zip"`)
    expect(html).toContain('Intel .zip')
  })
})

describe('PlatformCards, no release', () => {
  it('sends every button to the Releases page and marks it pending', async () => {
    const html = await renderAll(null)
    expect(tags(html, /<a [^>]*data-state="pending"[^>]*>/g)).toHaveLength(10)
    expect(tags(html, /href="[^"]*"/g).every((h) => h === `href="${RELEASES}"`)).toBe(true)
    expect(tags(html, /data-status="soon"/g)).toHaveLength(4)
    expect(tags(html, /First release coming soon/g)).toHaveLength(4)
    expect(html).toContain('adb install Bear-&lt;version&gt;-debug.apk')
    expect(html).toContain('sudo apt install ./bear_&lt;version&gt;_amd64.deb')
  })
})

const DESKTOP = ALL.filter((n) => !n.endsWith('.apk'))
const studio = (n: string) => n.replace(/^Bear-/, 'Bear-Studio-').replace(/^bear_/, 'bear-studio_')
const office = (n: string) => n.replace(/^Bear-/, 'Bear-Office-').replace(/^bear_/, 'bear-office_')

describe('PlatformCards, edition switcher', () => {
  it('has a radiogroup with Everything checked by default, then Office only and Studio only', async () => {
    const html = await render(release(ALL))
    expect(html).toMatch(/<div [^>]*role="radiogroup"[^>]*>/)
    const radios = tags(html, /<button [^>]*role="radio"[^>]*>[^<]*/g)
    expect(radios.map((r) => r.replace(/^.*>/, '').trim())).toEqual(['Everything', 'Office only', 'Studio only'])
    expect(radios[0]).toContain('aria-checked="true"')
    expect(radios[0]).toContain('data-edition-choice="all"')
    expect(radios[1]).toContain('aria-checked="false"')
    expect(radios[2]).toContain('aria-checked="false"')
    expect(radios[2]).toContain('data-edition-choice="studio"')
  })
  it('renders all three panels server-side; only Everything is visible without script', async () => {
    const html = await render(release(ALL))
    const panels = tags(html, /<div [^>]*data-edition-panel="[a-z]+"[^>]*>/g)
    expect(panels).toHaveLength(3)
    expect(panels[0]).toContain('data-edition-panel="all"')
    expect(panels[0]).not.toMatch(/\bhidden\b/)
    expect(panels[1]).toMatch(/\bhidden\b/)
    expect(panels[2]).toMatch(/\bhidden\b/)
  })
  it("switching to Studio only shows a Windows button that links to the Studio .exe", async () => {
    const html = await render(release([...ALL, ...DESKTOP.map(office), ...DESKTOP.map(studio)]))
    expect(panel(html, 'all')).toContain(`href="${BASE}Bear-Setup-0.1.1.exe"`)
    const st = panel(html, 'studio')
    const win = st.slice(st.indexOf('data-os-group="windows"'), st.indexOf('data-os-group="mac"'))
    expect(win).toContain(`href="${BASE}Bear-Studio-Setup-0.1.1.exe"`)
    expect(st).not.toContain(`href="${BASE}Bear-Setup-0.1.1.exe"`)
    expect(st).not.toContain('Bear-Office-')
    expect(tags(st, /<a [^>]*data-state="ready"[^>]*>/g)).toHaveLength(11)
    expect(st).toContain('sudo apt install ./bear-studio_0.1.1_amd64.deb')
    expect(panel(html, 'office')).toContain(`href="${BASE}Bear-Office-Setup-0.1.1.exe"`)
  })
  it('an edition missing from the release shows Coming soon on its cards and says so', async () => {
    const html = await render(release(ALL))
    const st = panel(html, 'studio')
    expect(tags(st, /data-status="soon"/g)).toHaveLength(3)
    expect(tags(st, /<a [^>]*data-state="ready"[^>]*>/g)).toHaveLength(0)
    expect(st).toContain('Bear Studio is not in Bear 0.1.1 yet')
    expect(st).toContain('sudo apt install ./bear-studio_0.1.1_amd64.deb')
    expect(panel(html, 'all')).not.toContain('is not in Bear')
  })
  it('Everything and Office end with an Android card showing the shared .apk; Studio has none', async () => {
    const html = await render(release([...ALL, ...DESKTOP.map(office), ...DESKTOP.map(studio)]))
    for (const e of ['all', 'office'] as const) {
      const p = panel(html, e)
      expect(tags(p, /data-os-group="[a-z]+"/g)).toEqual(['data-os-group="windows"', 'data-os-group="mac"', 'data-os-group="linux"', 'data-os-group="android"'])
      const card = p.slice(p.indexOf('data-os-group="android"'))
      expect(card).toContain(`href="${BASE}Bear-0.1.1-debug.apk"`)
      expect(card).toContain('data-status="available"')
      expect(card).toContain(`id="pc-${e}-android"`)
      expect(card).toContain('adb install Bear-0.1.1-debug.apk')
    }
    const st = panel(html, 'studio')
    expect(tags(st, /data-os-group="[a-z]+"/g)).toEqual(['data-os-group="windows"', 'data-os-group="mac"', 'data-os-group="linux"'])
    expect(st).not.toContain('.apk')
    expect(st).not.toContain('adb install')
  })
  it('the Office Android card shows the .apk even when the release has no Office files', async () => {
    const html = await render(release(ALL))
    const of = panel(html, 'office')
    expect(of).toContain('Bear Office is not in Bear 0.1.1 yet')
    expect(tags(of, /data-status="soon"/g)).toHaveLength(3)
    expect(tags(of, /<a [^>]*data-state="ready"[^>]*>/g)).toHaveLength(1)
    expect(of.slice(of.indexOf('data-os-group="android"'))).toContain(`href="${BASE}Bear-0.1.1-debug.apk"`)
  })
  it('heading ids stay unique across the three panels', async () => {
    const html = await render(release(ALL))
    const ids = tags(html, /\sid="[^"]+"/g)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('with no release every panel points at the Releases page', async () => {
    const html = await render(null)
    // Everything and Office have the Android card's button too; Studio has no Android card.
    expect(tags(panel(html, 'all'), /<a [^>]*data-state="pending"[^>]*>/g)).toHaveLength(10)
    expect(tags(panel(html, 'office'), /<a [^>]*data-state="pending"[^>]*>/g)).toHaveLength(10)
    expect(tags(panel(html, 'studio'), /<a [^>]*data-state="pending"[^>]*>/g)).toHaveLength(9)
  })
})

describe('PlatformCards, Android states', () => {
  const WITHOUT_APK = ALL.filter((n) => !n.endsWith('.apk'))
  const androidCard = (html: string) => html.slice(html.indexOf('data-os-group="android"'))

  it('with the apk present the Android card has one ready link and no Coming soon', async () => {
    const card = androidCard(await renderAll(release(ALL)))
    expect(tags(card, /<a [^>]*data-state="ready"[^>]*data-download[^>]*>/g)).toHaveLength(1)
    expect(card).toContain('data-status="available"')
    expect(card).not.toContain('Coming soon')
    expect(card).toContain('Test build signed with a debug key')
    expect(card).toContain('Open the .apk on your device')
  })
  it('a release without an apk shows the Coming soon pill and a disabled button on the Android card only', async () => {
    const html = await renderAll(release(WITHOUT_APK))
    const card = androidCard(html)
    expect(card).toContain('data-status="soon"')
    expect(card).toContain('Coming soon')
    const missing = tags(card, /<span [^>]*data-state="missing"[^>]*>/g)
    expect(missing).toHaveLength(1)
    expect(missing[0]).toContain('aria-disabled="true"')
    expect(missing[0]).toContain('title="Not in this release"')
    expect(tags(card, /<a [^>]*data-download[^>]*>/g)).toHaveLength(0)
    expect(tags(html, /data-status="soon"/g)).toHaveLength(1)
    expect(tags(html, /data-status="available"/g)).toHaveLength(3)
    expect(html).not.toContain('First release coming soon')
    expect(card).toContain('adb install Bear-0.1.1-debug.apk')
  })
  it('with no release the Android button links to the Releases page and says first release coming soon', async () => {
    const card = androidCard(await renderAll(null))
    const a = tags(card, /<a [^>]*data-download[^>]*>/g)
    expect(a).toHaveLength(1)
    expect(a[0]).toContain(`href="${RELEASES}"`)
    expect(a[0]).toContain('data-state="pending"')
    expect(a[0]).toContain('aria-label="Download .apk for Android: opens the releases page on GitHub"')
    expect(card).toContain('First release coming soon')
    expect(card).toContain('Coming soon')
  })
  it('drops an apk with a hostile url', async () => {
    const html = await renderAll(release(ALL, { 'Bear-0.1.1-debug.apk': 'https://evil.test/Bear-0.1.1-debug.apk' }))
    expect(html).not.toContain('evil.test')
    expect(androidCard(html)).toContain('data-state="missing"')
  })
})
