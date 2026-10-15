import { describe, it, expect, vi } from 'vitest'
import { classifyAsset, formatSize, toRelease, fetchLatestRelease, pickBest, detectOS, windowsDownloads, type DownloadFile } from './releases'

const file = (name: string, os: DownloadFile['os'], recommended: boolean): DownloadFile => ({
  name,
  url: `https://example.test/${name}`,
  size: 1,
  os,
  label: name,
  recommended
})

const fixture = {
  tag_name: 'v0.1.0',
  published_at: '2026-10-14T10:00:00Z',
  html_url: 'https://github.com/MichaelCodeToLimit/Bear/releases/tag/v0.1.0',
  assets: [
    { name: 'Bear-Setup-0.1.0.exe', browser_download_url: 'https://x/a.exe', size: 113058239 },
    { name: 'Bear-0.1.0.msi', browser_download_url: 'https://x/a.msi', size: 114000000 },
    { name: 'Bear-Setup-0.1.0.exe.blockmap', browser_download_url: 'https://x/a.blockmap', size: 1000 },
    { name: 'latest.yml', browser_download_url: 'https://x/latest.yml', size: 300 }
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
    expect(r?.files[0]).toMatchObject({ name: 'Bear-Setup-0.1.0.exe', url: 'https://x/a.exe', size: 113058239 })
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

describe('pickBest', () => {
  it('returns null when no file matches the os', () => {
    expect(pickBest([file('a.exe', 'windows', true)], 'mac')).toBeNull()
    expect(pickBest([file('a.exe', 'windows', true)], null)).toBeNull()
  })
  it('prefers the recommended file', () => {
    expect(pickBest([file('a.msi', 'windows', false), file('a.exe', 'windows', true)], 'windows')?.name).toBe('a.exe')
  })
  it('falls back to the first file for the os', () => {
    expect(pickBest([file('a.zip', 'mac', false)], 'mac')?.name).toBe('a.zip')
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

describe('pickBest on mac', () => {
  it('does not guess when both architectures are offered', () => {
    const files = [file('Bear-0.1.0-arm64.dmg', 'mac', true), file('Bear-0.1.0-x64.dmg', 'mac', true), file('Bear-0.1.0-mac.zip', 'mac', false)]
    expect(pickBest(files, 'mac')).toBeNull()
  })
  it('returns the single recommended mac file', () => {
    const files = [file('Bear-0.1.0.dmg', 'mac', true), file('Bear-0.1.0-mac.zip', 'mac', false)]
    expect(pickBest(files, 'mac')?.name).toBe('Bear-0.1.0.dmg')
  })
})
