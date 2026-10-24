import { describe, expect, it } from 'vitest'
import { launchFiles } from './files'

describe('launchFiles', () => {
  const files = new Set(['C:\\docs\\report.docx', 'C:\\docs\\budget.XLSX', 'C:\\docs\\archive.zip'])
  const isFile = (p: string) => files.has(p)

  it('picks Bear documents from a packaged launch', () => {
    expect(launchFiles(['C:\\Program Files\\Bear\\Bear.exe', 'C:\\docs\\report.docx'], isFile)).toEqual(['C:\\docs\\report.docx'])
  })

  it('skips the executable, the app folder, switches and missing paths', () => {
    const argv = ['electron.exe', '.', '--user-data-dir=C:\\tmp', '--allow-file-access-from-files', 'C:\\docs\\budget.XLSX', 'C:\\docs\\gone.pptx']
    expect(launchFiles(argv, isFile)).toEqual(['C:\\docs\\budget.XLSX'])
  })

  it('ignores files no Bear app opens', () => {
    expect(launchFiles(['Bear.exe', 'C:\\docs\\archive.zip'], isFile)).toEqual([])
  })
})
