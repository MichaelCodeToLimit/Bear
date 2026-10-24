import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyAsset, type ReleaseInfo } from './releases'

/** An .apk that lives in the site's own `public/downloads` folder (build time only: this module uses node:fs). */
export interface LocalApk {
  name: string
  size: number
  sha256: string
}

/** Plain file names only, so a name can never break out of a URL or an attribute. */
const SAFE_APK_NAME = /^[A-Za-z0-9._-]+\.apk$/i

/** List the .apk files in a folder, newest name first, with their size and SHA-256. A missing folder is an empty list. */
export function scanLocalApks(dir: string): LocalApk[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => SAFE_APK_NAME.test(name))
    .sort()
    .reverse()
    .map((name) => {
      const bytes = readFileSync(join(dir, name))
      return { name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
    })
}

/**
 * The Android build is not always attached to the GitHub release, so the site can serve one itself from `public/downloads`.
 * A release that already has an .apk wins; otherwise the newest local one is added to it. No release stays no release.
 * `baseUrl` is Astro's BASE_URL ("/Bear/" on GitHub Pages, "/" on Render).
 */
export function withLocalApk(release: ReleaseInfo | null, apks: LocalApk[], baseUrl: string): ReleaseInfo | null {
  if (!release) return release
  if (release.files.some((f) => f.kind === 'apk')) return release
  const apk = apks[0]
  const classified = apk ? classifyAsset(apk.name) : null
  if (!apk || !classified) return release
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return {
    ...release,
    files: [...release.files, { name: apk.name, url: `${base}downloads/${apk.name}`, size: apk.size, sha256: apk.sha256, ...classified }]
  }
}
