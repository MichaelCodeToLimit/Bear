import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanLocalApks, withLocalApk } from './localDownloads'
import type { DownloadFile, ReleaseInfo } from './releases'

const release = (files: DownloadFile[] = []): ReleaseInfo => ({ version: '0.1.1', date: '2026-10-16T10:00:00Z', notesUrl: 'https://x/n', files })
const releaseApk: DownloadFile = {
  name: 'Bear-0.1.1.apk',
  url: 'https://github.com/MichaelCodeToLimit/Bear/releases/download/v0.1.1/Bear-0.1.1.apk',
  size: 1,
  os: 'android',
  label: 'APK (Android 7 or later)',
  recommended: true,
  kind: 'apk',
  arch: null,
  edition: 'all',
  sha256: null
}

describe('scanLocalApks', () => {
  let dir: string
  const body = Buffer.from('not really an apk, just bytes')
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'bear-apks-'))
    writeFileSync(join(dir, 'Bear-0.1.1-debug.apk'), body)
    writeFileSync(join(dir, 'Bear-0.1.2-debug.apk'), 'x')
    writeFileSync(join(dir, 'notes.txt'), 'ignore me')
    writeFileSync(join(dir, 'bad name.apk'), 'spaces are not served')
    writeFileSync(join(dir, 'evil;x.apk'), 'semicolons are not served')
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('lists only safely named .apk files, newest name first, with size and SHA-256', () => {
    const apks = scanLocalApks(dir)
    expect(apks.map((a) => a.name)).toEqual(['Bear-0.1.2-debug.apk', 'Bear-0.1.1-debug.apk'])
    const first = apks[1]
    expect(first.size).toBe(body.length)
    expect(first.sha256).toBe(createHash('sha256').update(body).digest('hex'))
  })
  it('returns an empty list when the folder does not exist', () => {
    expect(scanLocalApks(join(dir, 'missing'))).toEqual([])
  })
})

describe('withLocalApk', () => {
  const apks = [{ name: 'Bear-0.1.1-debug.apk', size: 23_004_236, sha256: 'a'.repeat(64) }]

  it('adds the local apk to a release that has none, served from the site itself', () => {
    const out = withLocalApk(release(), apks, '/Bear/')!
    expect(out.files).toHaveLength(1)
    expect(out.files[0]).toMatchObject({
      name: 'Bear-0.1.1-debug.apk',
      url: '/Bear/downloads/Bear-0.1.1-debug.apk',
      size: 23_004_236,
      os: 'android',
      kind: 'apk',
      edition: 'all',
      sha256: 'a'.repeat(64)
    })
  })
  it('works at the root of another host (Render)', () => {
    expect(withLocalApk(release(), apks, '/')!.files[0].url).toBe('/downloads/Bear-0.1.1-debug.apk')
  })
  it('keeps the release as is when it already has an apk (the release file wins)', () => {
    const rel = release([releaseApk])
    expect(withLocalApk(rel, apks, '/Bear/')).toBe(rel)
  })
  it('keeps the release as is when there is no local apk', () => {
    const rel = release()
    expect(withLocalApk(rel, [], '/Bear/')).toBe(rel)
  })
  it('stays null without a release', () => {
    expect(withLocalApk(null, apks, '/Bear/')).toBeNull()
  })
})
