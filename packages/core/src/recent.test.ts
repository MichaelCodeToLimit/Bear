import { describe, expect, it } from 'vitest'
import { addRecent, parseRecent, removeRecent, type RecentFile } from './recent'
import { appForFile, baseName, extensionOf, withExtension } from './files'

const entry = (path: string, openedAt = 1): RecentFile => ({ path, name: baseName(path), app: 'write', openedAt })

describe('recent files', () => {
  it('puts the newest entry first and de-duplicates by path (case and slash insensitive)', () => {
    let list = addRecent([], entry('C:\\docs\\a.docx', 1))
    list = addRecent(list, entry('C:\\docs\\b.docx', 2))
    list = addRecent(list, entry('c:/DOCS/a.docx', 3))
    expect(list.map((r) => r.openedAt)).toEqual([3, 2])
  })

  it('caps the list length', () => {
    let list: RecentFile[] = []
    for (let i = 0; i < 40; i++) list = addRecent(list, entry(`/f${i}.docx`, i), 10)
    expect(list).toHaveLength(10)
    expect(list[0].path).toBe('/f39.docx')
  })

  it('removes entries', () => {
    const list = [entry('/a.docx'), entry('/b.docx')]
    expect(removeRecent(list, '/A.docx').map((r) => r.path)).toEqual(['/b.docx'])
  })

  it('parses stored data defensively', () => {
    expect(parseRecent('not json')).toEqual([])
    expect(parseRecent('{"a":1}')).toEqual([])
    expect(parseRecent(JSON.stringify([entry('/a.docx'), { bogus: true }, null]))).toHaveLength(1)
  })
})

describe('file helpers', () => {
  it('detects extensions and the owning app', () => {
    expect(extensionOf('C:\\x\\Report.DOCX')).toBe('docx')
    expect(extensionOf('/x/noext')).toBe('')
    expect(appForFile('/x/a.docx')).toBe('write')
    expect(appForFile('/x/a.xlsx')).toBe('sheets')
    expect(appForFile('/x/a.pptx')).toBe('slides')
    expect(appForFile('/x/a.eml')).toBeNull() // no app opens .eml files yet
  })

  it('swaps extensions', () => {
    expect(withExtension('C:\\a\\b.txt', 'docx')).toBe('C:\\a\\b.docx')
    expect(withExtension('Untitled', 'pdf')).toBe('Untitled.pdf')
  })
})
