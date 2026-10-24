import { afterEach, describe, expect, test } from 'vitest'
import { enabledApps, parseEdition, setEdition } from './editions'
import { getApp } from './apps'
import { appForFile } from './files'

describe('editions', () => {
  afterEach(() => setEdition('all'))

  test('parseEdition', () => {
    expect(parseEdition('studio')).toBe('studio')
    expect(parseEdition(undefined)).toBe('all')
    expect(parseEdition('nope')).toBe('all')
  })

  test('office edition hides Studio apps', () => {
    setEdition('office')
    expect(enabledApps().some((a) => a.suite === 'studio')).toBe(false)
    expect(appForFile('C:/a/photo.psd')).toBeNull()
    expect(appForFile('C:/a/b.docx')).toBe('write')
  })

  test('studio edition has only Studio apps', () => {
    setEdition('studio')
    expect(enabledApps().every((a) => a.suite === 'studio')).toBe(true)
    expect(appForFile('/x/y.bearphoto')).toBe('photo')
    expect(appForFile('/x/y.docx')).toBeNull()
  })

  test('all edition opens both', () => {
    expect(appForFile('/x/y.PNG')).toBe('photo')
    expect(appForFile('/x/y.xlsx')).toBe('sheets')
  })

  test('photo registry entry', () => {
    expect(getApp('photo')).toMatchObject({
      name: 'Photo', tagline: 'Photo editing', suite: 'studio', ready: true,
      extensions: ['bearphoto', 'psd', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']
    })
  })
})
