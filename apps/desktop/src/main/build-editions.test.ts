import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { builderConfig } = require('../../build-config/editions.cjs') as {
  builderConfig: (edition: 'all' | 'office' | 'studio') => any
}

const exts = (c: any): string[] => c.fileAssociations.map((f: any) => f.ext)

describe('builderConfig', () => {
  const all = builderConfig('all')
  const office = builderConfig('office')
  const studio = builderConfig('studio')

  it('keeps the full suite identity unchanged', () => {
    expect(all.appId).toBe('org.bearsuite.desktop')
    expect(all.productName).toBe('Bear')
    expect(all.msi.upgradeCode).toBe('7DE83F53-2188-4823-80F3-8C5D58ABE5B8')
    expect(all.nsis.artifactName).toBe('Bear-Setup-${version}.${ext}')
    expect(all.deb.artifactName).toBe('bear_${version}_amd64.${ext}')
    expect(all.linux.executableName).toBe('bear')
    expect(all.linux.category).toBe('Office')
    expect(all.extraMetadata).toBeUndefined()
  })

  it('gives each edition its own identity and upgrade code', () => {
    expect(office).toMatchObject({
      appId: 'org.bearsuite.office',
      productName: 'Bear Office',
      msi: { upgradeCode: '3F6B2C1E-8A4D-4E57-9B21-5C0D7E9A4F13' }
    })
    expect(studio).toMatchObject({
      appId: 'org.bearsuite.studio',
      productName: 'Bear Studio',
      msi: { upgradeCode: 'A2C9E4B7-61F3-4D8A-B5E0-7F14C3D96E28' }
    })
  })

  it('prefixes artifact names, shortcuts and executables per edition', () => {
    expect(studio.nsis.artifactName).toBe('Bear-Studio-Setup-${version}.${ext}')
    expect(studio.msi.artifactName).toBe('Bear-Studio-${version}.${ext}')
    expect(office.deb.artifactName).toBe('bear-office_${version}_${arch}.${ext}')
    expect(studio.linux.executableName).toBe('bear-studio')
    expect(studio.nsis.shortcutName).toBe('Bear Studio')
    expect(studio.msi.shortcutName).toBe('Bear Studio')
    expect(studio.nsis.uninstallDisplayName).toBe('Bear Studio')
    expect(studio.linux.category).toBe('Graphics')
    expect(office.linux.category).toBe('Office')
    for (const key of ['rpm', 'flatpak', 'appImage'] as const) {
      expect(office[key].artifactName).toMatch(/^Bear-Office-/)
      expect(studio[key].artifactName).toMatch(/^Bear-Studio-/)
    }
    expect(studio.dmg.artifactName).toMatch(/^Bear-Studio-/)
    expect(studio.mac.artifactName).toMatch(/^Bear-Studio-/)
    expect(studio.linux.artifactName).toMatch(/^Bear-Studio-/)
  })

  it('associates only the file types of the suite', () => {
    expect(exts(office)).toEqual(['docx', 'xlsx', 'pptx'])
    expect(exts(studio)).toEqual(['bearphoto', 'psd'])
    expect(exts(all)).toEqual(['docx', 'xlsx', 'pptx', 'bearphoto', 'psd'])
  })

  it('only overrides the packaged productName for non-default editions', () => {
    expect(builderConfig('all').extraMetadata).toBeUndefined()
    expect(studio.extraMetadata).toEqual({ productName: 'Bear Studio' })
  })
})
