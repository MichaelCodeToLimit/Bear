import { describe, it, expect, vi } from 'vitest'
import { classifyAsset, formatSize, toRelease, fetchLatestRelease, detectOS, windowsDownloads, platformCards, type DownloadFile, type ReleaseInfo } from './releases'

const file = (name: string, os: DownloadFile['os'], recommended: boolean): DownloadFile => ({
  name,
  url: `https://example.test/${name}`,
  size: 1,
  os,
  label: name,
  recommended,
  kind: 'exe',
  arch: null,
  sha256: null
})

const fixture = {
  tag_name: 'v0.1.0',
  published_at: '2026-10-14T10:00:00Z',
  html_url: 'https://github.com/MichaelCodeToLimit/Bear/releases/tag/v0.1.0',
  assets: [
    { name: 'Bear-Setup-0.1.0.exe', browser_download_url: 'https://github.com/MichaelCodeToLimit/Bear/releases/download/v0.1.0/a.exe', size: 113058239 },
    { name: 'Bear-0.1.0.msi', browser_download_url: 'https://github.com/MichaelCodeToLimit/Bear/releases/download/v0.1.0/a.msi', size: 114000000 },
    { name: 'Bear-Setup-0.1.0.exe.blockmap', browser_download_url: 'https://github.com/MichaelCodeToLimit/Bear/releases/download/v0.1.0/a.blockmap', size: 1000 },
    { name: 'latest.yml', browser_download_url: 'https://github.com/MichaelCodeToLimit/Bear/releases/download/v0.1.0/latest.yml', size: 300 }
  ]
}

describe('classifyAsset', () => {
  it('classifies the Windows installer as recommended', () => {
    expect(classifyAsset('Bear-Setup-0.1.0.exe')).toMatchObject({ os: 'windows', recommended: true })
  })
  it('labels the msi', () => {
    expect(classifyAsset('Bear-0.1.0.msi')?.label).toContain('MSI')
    expect(classifyAsset('Bear-0.1.0.msi')?.recommended).toBe(false)
  })
  it('classifies Linux files', () => {
    expect(classifyAsset('Bear-0.1.0-x64.AppImage')).toMatchObject({ os: 'linux', recommended: true })
    expect(classifyAsset('bear_0.1.0_amd64.deb')).toMatchObject({ os: 'linux', recommended: false })
  })
  it('classifies macOS files', () => {
    expect(classifyAsset('Bear-0.1.0.dmg')).toMatchObject({ os: 'mac', recommended: true })
    expect(classifyAsset('Bear-0.1.0-mac.zip')).toMatchObject({ os: 'mac', recommended: false })
  })
  it('puts the architecture in mac labels', () => {
    expect(classifyAsset('Bear-0.1.0-arm64.dmg')?.label).toBe('Disk image (Apple silicon)')
    expect(classifyAsset('Bear-0.1.0-x64.dmg')?.label).toBe('Disk image (Intel)')
    expect(classifyAsset('Bear-0.1.0.dmg')?.label).toBe('Disk image')
    expect(classifyAsset('Bear-0.1.0-arm64-mac.zip')?.label).toBe('Zip (Apple silicon)')
    expect(classifyAsset('Bear-0.1.0-x64-mac.zip')?.label).toBe('Zip (Intel)')
    expect(classifyAsset('Bear-0.1.0-mac.zip')?.label).toBe('Zip')
  })
  it('keeps Windows and Linux labels when names carry an arch', () => {
    expect(classifyAsset('Bear-Setup-0.1.0-x64.exe')?.label).toBe('Installer (just for you, no admin needed)')
    expect(classifyAsset('Bear-0.1.0-x86_64.AppImage')?.label).toBe('AppImage (any distro)')
  })
  it('is case-insensitive', () => {
    expect(classifyAsset('BEAR.EXE')?.os).toBe('windows')
  })
  it('hides everything else', () => {
    expect(classifyAsset('Bear-Setup-0.1.0.exe.blockmap')).toBeNull()
    expect(classifyAsset('latest.yml')).toBeNull()
    expect(classifyAsset('latest-mac.yml')).toBeNull()
    expect(classifyAsset('notes.txt')).toBeNull()
  })
})

describe('formatSize', () => {
  it('rounds to megabytes', () => {
    expect(formatSize(113058239)).toBe('113 MB')
    expect(formatSize(500)).toBe('<1 MB')
  })
})

describe('toRelease', () => {
  it('keeps only installable files and strips the v', () => {
    const r = toRelease(fixture)
    expect(r?.version).toBe('0.1.0')
    expect(r?.files).toHaveLength(2)
    expect(r?.notesUrl).toBe(fixture.html_url)
    expect(r?.files[0]).toMatchObject({ name: 'Bear-Setup-0.1.0.exe', url: 'https://github.com/MichaelCodeToLimit/Bear/releases/download/v0.1.0/a.exe', size: 113058239 })
  })
  it('drops assets not served from this repository release downloads', () => {
    const bad = [
      'javascript:alert(1)',
      'http://github.com/MichaelCodeToLimit/Bear/releases/download/v0.1.0/a.exe',
      'https://github.com/someone-else/Bear/releases/download/v0.1.0/a.exe'
    ]
    for (const u of bad) {
      const evil = { ...fixture, assets: [fixture.assets[0], { name: 'Evil.msi', browser_download_url: u, size: 1 }] }
      expect(toRelease(evil)?.files.map((f) => f.name)).toEqual(['Bear-Setup-0.1.0.exe'])
    }
    const allBad = { ...fixture, assets: [{ name: 'Evil.exe', browser_download_url: bad[0], size: 1 }] }
    expect(toRelease(allBad)).toBeNull()
  })
  it('returns null for a bad shape or no installable asset', () => {
    expect(toRelease(null)).toBeNull()
    expect(toRelease({ tag_name: 'v1' })).toBeNull()
    expect(toRelease({ ...fixture, assets: [fixture.assets[3]] })).toBeNull()
  })
})

describe('fetchLatestRelease', () => {
  const res = (status: number, body: unknown = fixture) =>
    (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
  it('resolves the release on 200', async () => {
    expect((await fetchLatestRelease(res(200), ''))?.version).toBe('0.1.0')
  })
  it('resolves null on 404, 403 and network errors', async () => {
    expect(await fetchLatestRelease(res(404), '')).toBeNull()
    expect(await fetchLatestRelease(res(403), '')).toBeNull()
    const down = (async () => {
      throw new Error('down')
    }) as typeof fetch
    expect(await fetchLatestRelease(down, '')).toBeNull()
  })
  it('passes a timeout signal and resolves null when the request aborts', async () => {
    let signal: AbortSignal | null | undefined
    const aborting = (async (_u: unknown, init?: RequestInit) => {
      signal = init?.signal
      throw new DOMException('The operation timed out', 'TimeoutError')
    }) as typeof fetch
    expect(await fetchLatestRelease(aborting, '')).toBeNull()
    expect(signal).toBeInstanceOf(AbortSignal)
  })
  it('ignores an empty GITHUB_TOKEN from the environment', async () => {
    vi.stubEnv('GITHUB_TOKEN', '')
    try {
      const seen: Array<HeadersInit | undefined> = []
      const f = (async (_u: unknown, init?: RequestInit) => {
        seen.push(init?.headers)
        return new Response(JSON.stringify(fixture))
      }) as typeof fetch
      await fetchLatestRelease(f)
      expect(JSON.stringify(seen[0])).not.toContain('Authorization')
    } finally {
      vi.unstubAllEnvs()
    }
  })
  it('sends Authorization only when a token is set', async () => {
    const seen: Array<HeadersInit | undefined> = []
    const f = (async (_u: unknown, init?: RequestInit) => {
      seen.push(init?.headers)
      return new Response(JSON.stringify(fixture))
    }) as typeof fetch
    await fetchLatestRelease(f, '')
    await fetchLatestRelease(f, 'tok')
    expect(JSON.stringify(seen[0])).not.toContain('Authorization')
    expect(JSON.stringify(seen[1])).toContain('Bearer tok')
  })
})

describe('detectOS', () => {
  it('detects desktop systems', () => {
    expect(detectOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')).toBe('windows')
    expect(detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15')).toBe('mac')
    expect(detectOS('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')).toBe('linux')
  })
  it('returns null for Android and iOS', () => {
    expect(detectOS('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBeNull()
    expect(detectOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')).toBeNull()
  })
})

describe('windowsDownloads', () => {
  const rel = (files: DownloadFile[]) => ({ version: '0.1.1', date: '2026-10-14T10:00:00Z', notesUrl: 'https://x/n', files })
  it('returns nulls without a release', () => {
    expect(windowsDownloads(null)).toEqual({ exe: null, msi: null, version: null })
  })
  it('picks the exe and msi out of a mixed release', () => {
    const exe = file('Bear-Setup.exe', 'windows', true)
    const msi = file('Bear.msi', 'windows', false)
    expect(windowsDownloads(rel([file('Bear.dmg', 'mac', true), exe, msi]))).toEqual({ exe, msi, version: '0.1.1' })
  })
  it('picks Windows-only files', () => {
    const exe = file('a.exe', 'windows', true)
    const msi = file('a.msi', 'windows', false)
    expect(windowsDownloads(rel([exe, msi]))).toMatchObject({ exe, msi })
  })
  it('gives exe null when only an msi exists', () => {
    const msi = file('a.msi', 'windows', false)
    expect(windowsDownloads(rel([msi]))).toEqual({ exe: null, msi, version: '0.1.1' })
  })
  it('gives nulls when there are no Windows files', () => {
    expect(windowsDownloads(rel([file('a.dmg', 'mac', true)]))).toMatchObject({ exe: null, msi: null })
  })
})

describe('classifyAsset kinds, arch and new Linux formats', () => {
  it('gives every file a kind', () => {
    expect(classifyAsset('Bear-Setup-0.1.1.exe')).toMatchObject({ kind: 'exe', arch: null })
    expect(classifyAsset('Bear-0.1.1.msi')).toMatchObject({ kind: 'msi' })
    expect(classifyAsset('Bear-0.1.1-arm64.dmg')).toMatchObject({ kind: 'dmg', arch: 'arm64' })
    expect(classifyAsset('Bear-0.1.1-x64-mac.zip')).toMatchObject({ kind: 'zip', arch: 'x64' })
    expect(classifyAsset('bear_0.1.1_amd64.deb')).toMatchObject({ kind: 'deb' })
    expect(classifyAsset('Bear-0.1.1-x64.AppImage')).toMatchObject({ kind: 'appimage' })
  })
  it('treats a mac file with no arch in its name as Intel', () => {
    expect(classifyAsset('Bear-0.1.1.dmg')).toMatchObject({ arch: 'x64' })
    expect(classifyAsset('Bear-0.1.1-mac.zip')).toMatchObject({ arch: 'x64' })
  })
  it('recognises flatpak, rpm and tar.gz with their labels', () => {
    expect(classifyAsset('Bear-0.1.1-x64.flatpak')).toMatchObject({ os: 'linux', kind: 'flatpak', label: 'Flatpak' })
    expect(classifyAsset('Bear-0.1.1-x64.rpm')).toMatchObject({ os: 'linux', kind: 'rpm', label: '.rpm (Fedora, openSUSE)' })
    expect(classifyAsset('Bear-0.1.1-x64.tar.gz')).toMatchObject({ os: 'linux', kind: 'targz', label: '.tar.gz (any distro)' })
    expect(classifyAsset('bear_0.1.1_amd64.deb')?.label).toBe('.deb (Debian, Ubuntu)')
  })
  it('keeps metadata hidden', () => {
    for (const n of ['Bear-0.1.1-x64.rpm.blockmap', 'latest-linux.yml', 'builder-debug.yml', 'Bear-0.1.1-arm64.dmg.blockmap']) expect(classifyAsset(n)).toBeNull()
  })
})

const BASE = 'https://github.com/MichaelCodeToLimit/Bear/releases/download/v0.1.1/'
const HASH = 'a'.repeat(64)
const names = [
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
const payload = (list: string[], extra: Record<string, unknown> = {}) => ({
  tag_name: 'v0.1.1',
  published_at: '2026-10-14T10:00:00Z',
  html_url: 'https://github.com/MichaelCodeToLimit/Bear/releases/tag/v0.1.1',
  assets: list.map((n) => ({ name: n, browser_download_url: BASE + n, size: 2_000_000, ...extra }))
})
const rel = (list: string[], extra: Record<string, unknown> = {}): ReleaseInfo => toRelease(payload(list, extra)) as ReleaseInfo

describe('toRelease digest', () => {
  it('parses a valid sha256 digest', () => {
    expect(rel(['Bear-Setup-0.1.1.exe'], { digest: `sha256:${HASH}` }).files[0].sha256).toBe(HASH)
  })
  it.each([[`sha256:${'A'.repeat(64)}`], ['sha256:abc'], [`sha1:${HASH}`], [HASH], [42], [null]])('rejects %s', (d) => {
    expect(rel(['Bear-Setup-0.1.1.exe'], { digest: d }).files[0].sha256).toBeNull()
  })
  it('is null when absent', () => {
    expect(rel(['Bear-Setup-0.1.1.exe']).files[0].sha256).toBeNull()
  })
})

describe('platformCards', () => {
  it('returns three unavailable cards for a null release', () => {
    const cards = platformCards(null)
    expect(cards.map((c) => c.os)).toEqual(['windows', 'mac', 'linux'])
    expect(cards.every((c) => !c.available && c.version === null && c.meta === null)).toBe(true)
    expect(cards[0].slots.map((s) => [s.id, s.label, s.file])).toEqual([['exe', 'Download .exe', null], ['msi', '.msi for IT', null]])
    expect(cards[1].slots.map((s) => [s.id, s.label])).toEqual([['arm64', 'Apple silicon'], ['x64', 'Intel']])
    expect(cards[2].slots.map((s) => [s.id, s.label])).toEqual([['deb', '.deb'], ['appimage', 'AppImage'], ['flatpak', 'Flatpak']])
    expect(cards[2].other).toEqual([])
  })
  it('fills every slot for a full release', () => {
    const [win, mac, linux] = platformCards(rel(names, { digest: `sha256:${HASH}` }))
    expect([win, mac, linux].every((c) => c.available && c.version === '0.1.1')).toBe(true)
    expect(win.slots.map((s) => s.file?.name)).toEqual(['Bear-Setup-0.1.1.exe', 'Bear-0.1.1.msi'])
    expect(mac.slots.map((s) => s.file?.name)).toEqual(['Bear-0.1.1-arm64.dmg', 'Bear-0.1.1-x64.dmg'])
    expect(mac.extras.map((f) => f.name)).toEqual(['Bear-0.1.1-arm64-mac.zip', 'Bear-0.1.1-x64-mac.zip'])
    expect(linux.slots.map((s) => s.file?.name)).toEqual(['bear_0.1.1_amd64.deb', 'Bear-0.1.1-x64.AppImage', 'Bear-0.1.1-x64.flatpak'])
    expect(linux.other.map((f) => f.name)).toEqual(['Bear-0.1.1-x64.rpm', 'Bear-0.1.1-x64.tar.gz'])
    expect(win.slots[0].file?.sha256).toBe(HASH)
    expect(win.meta).toBe('v0.1.1 · .exe 2 MB · .msi 2 MB')
    expect(mac.meta).toBe('v0.1.1 · Apple silicon 2 MB · Intel 2 MB')
  })
  it('handles a partial release: no flatpak, windows only', () => {
    const cards = platformCards(rel(names.filter((n) => !n.endsWith('.flatpak'))))
    expect(cards[2].slots.map((s) => s.file?.name ?? null)).toEqual(['bear_0.1.1_amd64.deb', 'Bear-0.1.1-x64.AppImage', null])
    const winOnly = platformCards(rel(['Bear-Setup-0.1.1.exe']))
    expect(winOnly.map((c) => c.available)).toEqual([true, false, false])
    expect(winOnly[0].slots[1].file).toBeNull()
    expect(winOnly[0].meta).toBe('v0.1.1 · 2 MB')
    expect(winOnly[1].meta).toBeNull()
  })
  it('puts an arch-less mac dmg in the Intel slot and a zip without arch in extras', () => {
    const mac = platformCards(rel(['Bear-0.1.1.dmg', 'Bear-0.1.1-mac.zip']))[1]
    expect(mac.slots[0].file).toBeNull()
    expect(mac.slots[1].file?.name).toBe('Bear-0.1.1.dmg')
    expect(mac.extras.map((f) => f.name)).toEqual(['Bear-0.1.1-mac.zip'])
  })
  it('never offers a hostile url', () => {
    const p = payload(['Bear-Setup-0.1.1.exe', 'Bear-0.1.1.msi'])
    p.assets[1].browser_download_url = 'https://evil.test/Bear-0.1.1.msi'
    const win = platformCards(toRelease(p))[0]
    expect(win.slots[1].file).toBeNull()
    expect(win.slots[0].file?.url.startsWith(BASE)).toBe(true)
  })
})
