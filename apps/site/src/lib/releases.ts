import { SITE } from '../site.config'

export type OS = 'windows' | 'mac' | 'linux'

export interface DownloadFile {
  name: string
  url: string
  size: number
  os: OS
  label: string
  recommended: boolean
}

export interface ReleaseInfo {
  version: string
  date: string
  notesUrl: string
  files: DownloadFile[]
}

/** Map an asset file name to a system and label. Returns null for files that should not be shown. */
export function classifyAsset(name: string): { os: OS; label: string; recommended: boolean } | null {
  const n = name.toLowerCase()
  if (n.endsWith('.exe')) return { os: 'windows', label: 'Installer (just for you, no admin needed)', recommended: true }
  if (n.endsWith('.msi')) return { os: 'windows', label: 'MSI package (whole computer, for IT)', recommended: false }
  if (n.endsWith('.dmg')) return { os: 'mac', label: 'Disk image', recommended: true }
  if (n.endsWith('.zip') && (n.endsWith('-mac.zip') || n.includes('-darwin'))) {
    return { os: 'mac', label: 'Zip', recommended: false }
  }
  if (n.endsWith('.appimage')) return { os: 'linux', label: 'AppImage (any distro)', recommended: true }
  if (n.endsWith('.deb')) return { os: 'linux', label: '.deb (Debian, Ubuntu)', recommended: false }
  return null
}

export function formatSize(bytes: number): string {
  if (bytes < 1e6) return '<1 MB'
  return `${Math.round(bytes / 1e6)} MB`
}

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
    const kind = classifyAsset(asset.name)
    if (!kind) continue
    files.push({
      name: asset.name,
      url: asset.browser_download_url,
      size: typeof asset.size === 'number' ? asset.size : 0,
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
    const res = await fetchFn(SITE.releasesApi, { headers })
    if (res.status !== 200) return null
    return toRelease(await res.json())
  } catch {
    return null
  }
}

export function detectOS(userAgent: string): OS | null {
  if (/android|iphone|ipad|ipod/i.test(userAgent)) return null
  if (/windows/i.test(userAgent)) return 'windows'
  if (/macintosh|mac os x/i.test(userAgent)) return 'mac'
  if (/linux|x11/i.test(userAgent)) return 'linux'
  return null
}

export function pickBest(files: DownloadFile[], os: OS | null): DownloadFile | null {
  if (!os) return null
  const mine = files.filter((f) => f.os === os)
  return mine.find((f) => f.recommended) ?? mine[0] ?? null
}
