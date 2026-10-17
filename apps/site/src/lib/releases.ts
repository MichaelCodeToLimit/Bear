import { SITE } from '../site.config'

export type OS = 'windows' | 'mac' | 'linux' | 'android'

export type FileKind = 'exe' | 'msi' | 'dmg' | 'zip' | 'deb' | 'appimage' | 'flatpak' | 'rpm' | 'targz' | 'apk'
export type Arch = 'arm64' | 'x64'

export interface DownloadFile {
  name: string
  url: string
  size: number
  os: OS
  label: string
  recommended: boolean
  kind: FileKind
  /** Mac only: the chip the file is built for. A mac file with no arch in its name is Intel. */
  arch: Arch | null
  /** Lowercase hex SHA-256 from the GitHub asset digest, or null when it is missing or malformed. */
  sha256: string | null
}

export interface ReleaseInfo {
  version: string
  date: string
  notesUrl: string
  files: DownloadFile[]
}

/** Map an asset file name to a system and label. Returns null for files that should not be shown. */
export function classifyAsset(name: string): Pick<DownloadFile, 'os' | 'label' | 'recommended' | 'kind' | 'arch'> | null {
  const n = name.toLowerCase()
  // electron-builder puts the architecture in the file name; only mac needs it.
  const arch: Arch = /arm64/.test(n) ? 'arm64' : 'x64'
  const macArch = /arm64/.test(n) ? ' (Apple silicon)' : /x64|x86_64|amd64/.test(n) ? ' (Intel)' : ''
  if (n.endsWith('.exe')) return { os: 'windows', kind: 'exe', arch: null, label: 'Installer (just for you, no admin needed)', recommended: true }
  if (n.endsWith('.msi')) return { os: 'windows', kind: 'msi', arch: null, label: 'MSI package (whole computer, for IT)', recommended: false }
  if (n.endsWith('.dmg')) return { os: 'mac', kind: 'dmg', arch, label: `Disk image${macArch}`, recommended: true }
  if (n.endsWith('.zip') && (n.endsWith('-mac.zip') || n.includes('-darwin'))) {
    return { os: 'mac', kind: 'zip', arch, label: `Zip${macArch}`, recommended: false }
  }
  if (n.endsWith('.appimage')) return { os: 'linux', kind: 'appimage', arch: null, label: 'AppImage (any distro)', recommended: true }
  if (n.endsWith('.deb')) return { os: 'linux', kind: 'deb', arch: null, label: '.deb (Debian, Ubuntu)', recommended: false }
  if (n.endsWith('.flatpak')) return { os: 'linux', kind: 'flatpak', arch: null, label: 'Flatpak', recommended: false }
  if (n.endsWith('.rpm')) return { os: 'linux', kind: 'rpm', arch: null, label: '.rpm (Fedora, openSUSE)', recommended: false }
  if (n.endsWith('.apk')) return { os: 'android', kind: 'apk', arch: null, label: 'APK (Android 7 or later)', recommended: true }
  if (n.endsWith('.tar.gz')) return { os: 'linux', kind: 'targz', arch: null, label: '.tar.gz (any distro)', recommended: false }
  return null
}

const SHA256 = /^sha256:([0-9a-f]{64})$/
function parseDigest(d: unknown): string | null {
  if (typeof d !== 'string') return null
  return SHA256.exec(d)?.[1] ?? null
}

export function formatSize(bytes: number): string {
  if (bytes < 1e6) return '<1 MB'
  return `${Math.round(bytes / 1e6)} MB`
}

/** Only assets served from this repository's release downloads are ever linked. */
const DOWNLOAD_PREFIX = `${SITE.repoUrl}/releases/download/`

/** Turn a GitHub "latest release" payload into download entries, or null when it is unusable. */
export function toRelease(json: unknown): ReleaseInfo | null {
  if (typeof json !== 'object' || json === null) return null
  const r = json as Record<string, unknown>
  if (typeof r.tag_name !== 'string' || typeof r.published_at !== 'string' || typeof r.html_url !== 'string') return null
  if (!Array.isArray(r.assets)) return null
  const files: DownloadFile[] = []
  for (const a of r.assets as unknown[]) {
    if (typeof a !== 'object' || a === null) continue
    const asset = a as Record<string, unknown>
    if (typeof asset.name !== 'string' || typeof asset.browser_download_url !== 'string') continue
    if (!asset.browser_download_url.startsWith(DOWNLOAD_PREFIX)) continue
    const kind = classifyAsset(asset.name)
    if (!kind) continue
    files.push({
      name: asset.name,
      url: asset.browser_download_url,
      size: typeof asset.size === 'number' ? asset.size : 0,
      sha256: parseDigest(asset.digest),
      ...kind
    })
  }
  if (files.length === 0) return null
  return { version: r.tag_name.replace(/^v/, ''), date: r.published_at, notesUrl: r.html_url, files }
}

/** Fetch the latest release. Never throws: any failure resolves to null so the page can show its fallback. */
export async function fetchLatestRelease(
  fetchFn: typeof fetch = fetch,
  token: string | undefined = process.env.GITHUB_TOKEN
): Promise<ReleaseInfo | null> {
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetchFn(SITE.releasesApi, { headers, signal: AbortSignal.timeout(10000) })
    if (res.status !== 200) return null
    return toRelease(await res.json())
  } catch {
    return null
  }
}

/**
 * Guess the visitor's system from the user agent, for the "Your device" badge only (every download stays one click away).
 * Limits: Android Chrome in "desktop site" mode and Chrome OS send a Linux user agent, so they match Linux; iPadOS 13+
 * in desktop mode reports a Macintosh user agent and matches Mac. iPhone/iPad/iPod (old-style agents) get no badge.
 * The Android check comes before Linux because Android user agents also contain "Linux".
 */
export function detectOS(userAgent: string): OS | null {
  if (/iphone|ipad|ipod/i.test(userAgent)) return null
  if (/android/i.test(userAgent)) return 'android'
  if (/windows/i.test(userAgent)) return 'windows'
  if (/macintosh|mac os x/i.test(userAgent)) return 'mac'
  if (/linux|x11/i.test(userAgent)) return 'linux'
  return null
}

export interface CardSlot {
  id: 'exe' | 'msi' | 'arm64' | 'x64' | 'deb' | 'appimage' | 'flatpak' | 'apk'
  /** Visible button text. */
  label: string
  /** Short name used in the size line. */
  short: string
  file: DownloadFile | null
}

export interface PlatformCard {
  os: OS
  title: string
  description: string
  /** True when the release has at least one file for this system. */
  available: boolean
  version: string | null
  slots: CardSlot[]
  /** Mac .zip variants. */
  extras: DownloadFile[]
  /** Linux .rpm and .tar.gz files. */
  other: DownloadFile[]
  /** "v0.1.1 · .exe 113 MB · .msi 114 MB", or null when nothing is available. */
  meta: string | null
}

/** The four download cards in order: windows, mac, linux, android. Pure; a null release gives empty, unavailable cards. */
export function platformCards(release: ReleaseInfo | null): PlatformCard[] {
  const files = release?.files ?? []
  const pick = (os: OS, kind: FileKind, arch?: Arch): DownloadFile | null =>
    files.find((f) => f.os === os && f.kind === kind && (arch === undefined || f.arch === arch)) ?? null
  const all = (os: OS, kind: FileKind): DownloadFile[] => files.filter((f) => f.os === os && f.kind === kind)
  const build = (
    os: OS,
    title: string,
    description: string,
    slots: CardSlot[],
    extras: DownloadFile[] = [],
    other: DownloadFile[] = []
  ): PlatformCard => {
    const available = files.some((f) => f.os === os)
    let meta: string | null = null
    if (available && release) {
      const filled = slots.filter((s) => s.file)
      const parts = filled.length === 1 ? [formatSize(filled[0].file!.size)] : filled.map((s) => `${s.short} ${formatSize(s.file!.size)}`)
      meta = [`v${release.version}`, ...parts].join(' · ')
    }
    return { os, title, description, available, version: available && release ? release.version : null, slots, extras, other, meta }
  }
  return [
    build('windows', 'Windows', 'Windows 10 and 11, 64-bit. The installer sets Bear up for your account in seconds, without admin rights.', [
      { id: 'exe', label: 'Download .exe', short: '.exe', file: pick('windows', 'exe') },
      { id: 'msi', label: '.msi for IT', short: '.msi', file: pick('windows', 'msi') }
    ]),
    build(
      'mac',
      'macOS',
      'macOS 12 or later. Choose the download for your Mac’s chip.',
      [
        { id: 'arm64', label: 'Apple silicon', short: 'Apple silicon', file: pick('mac', 'dmg', 'arm64') },
        { id: 'x64', label: 'Intel', short: 'Intel', file: pick('mac', 'dmg', 'x64') }
      ],
      all('mac', 'zip')
    ),
    build(
      'linux',
      'Linux',
      'Ubuntu, Debian, Fedora and most 64-bit distributions.',
      [
        { id: 'deb', label: '.deb', short: '.deb', file: pick('linux', 'deb') },
        { id: 'appimage', label: 'AppImage', short: 'AppImage', file: pick('linux', 'appimage') },
        { id: 'flatpak', label: 'Flatpak', short: 'Flatpak', file: pick('linux', 'flatpak') }
      ],
      [],
      [...all('linux', 'rpm'), ...all('linux', 'targz')]
    ),
    build('android', 'Android', 'Android 7.0 or later. Install the APK file straight onto your phone or tablet.', [{ id: 'apk', label: 'Download .apk', short: '.apk', file: pick('android', 'apk') }])
  ]
}
