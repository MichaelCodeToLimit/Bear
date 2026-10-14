import { describe, expect, it } from 'vitest'
import { SheetStore, parseTsv } from './store'
import { newWorkbook } from './model'

function storeWith(rows: string[][]): SheetStore {
  const s = new SheetStore(newWorkbook())
  rows.forEach((row, r) => row.forEach((raw, c) => raw && s.setRaw(r, c, raw)))
  return s
}

const raw = (s: SheetStore, r: number, c: number) => s.cell(r, c)?.raw ?? ''

describe('SheetStore', () => {
  it('undoes and redoes edits', () => {
    const s = storeWith([['1']])
    s.setRaw(0, 0, '2')
    expect(s.value(0, 0)).toBe(2)
    s.undo()
    expect(s.value(0, 0)).toBe(1)
    s.redo()
    expect(s.value(0, 0)).toBe(2)
  })

  it('auto-detects percent and currency formats', () => {
    const s = storeWith([['15%', '$4.5']])
    expect(s.display(0, 0)).toBe('15%')
    expect(s.display(0, 1)).toBe('$4.50')
  })

  it('fills a numeric series and shifts formulas', () => {
    const s = storeWith([['1', '=A1*10'], ['3', '=A2*10']])
    s.select({ row: 0, col: 0 }, { row: 1, col: 1 })
    s.fill({ r1: 0, c1: 0, r2: 4, c2: 1 })
    expect([2, 3, 4].map((r) => s.value(r, 0))).toEqual([5, 7, 9])
    expect(raw(s, 4, 1)).toBe('=A5*10')
    expect(s.value(4, 1)).toBe(90)
  })

  it('increments trailing numbers on text when filling', () => {
    const s = storeWith([['Item 1']])
    s.select({ row: 0, col: 0 })
    s.fill({ r1: 0, c1: 0, r2: 2, c2: 0 })
    expect(raw(s, 2, 0)).toBe('Item 3')
  })

  it('copies formulas relative to the paste target and cuts by moving', () => {
    const s = storeWith([['5', '=A1+1']])
    s.select({ row: 0, col: 1 })
    const text = s.copy()
    s.select({ row: 3, col: 1 })
    s.paste(text)
    expect(raw(s, 3, 1)).toBe('=A4+1')

    s.select({ row: 0, col: 1 })
    const cut = s.copy(true)
    s.select({ row: 0, col: 3 })
    s.paste(cut)
    expect(raw(s, 0, 1)).toBe('')
    expect(raw(s, 0, 3)).toBe('=A1+1')
    expect(s.value(0, 3)).toBe(6)
  })

  it('pastes external tab-separated text', () => {
    const s = new SheetStore(newWorkbook())
    s.paste('a\tb\n1\t"x\ty"\n')
    expect(raw(s, 0, 1)).toBe('b')
    expect(s.value(1, 0)).toBe(1)
    expect(raw(s, 1, 1)).toBe('x\ty')
    expect(parseTsv('1\t2\r\n3\t4')).toEqual([['1', '2'], ['3', '4']])
  })

  it('sorts a block by the active column, keeping the header', () => {
    const s = storeWith([['Name', 'Score'], ['Ann', '30'], ['Bob', '10'], ['Cy', '20']])
    s.select({ row: 1, col: 1 })
    s.sort(false)
    expect([1, 2, 3].map((r) => raw(s, r, 0))).toEqual(['Bob', 'Cy', 'Ann'])
    expect(raw(s, 0, 0)).toBe('Name')
    s.sort(true)
    expect(raw(s, 1, 0)).toBe('Ann')
  })

  it('AutoSum picks up the numbers above the cursor', () => {
    const s = storeWith([['4'], ['6'], ['']])
    s.select({ row: 2, col: 0 })
    s.autoSum()
    expect(raw(s, 2, 0)).toBe('=SUM(A1:A2)')
    expect(s.value(2, 0)).toBe(10)
  })

  it('AutoSum asks for a range instead of writing an empty function', () => {
    const s = storeWith([['1', '2']])
    s.select({ row: 5, col: 6 })
    expect(s.autoSum('MAX')).toBe('needs-range')
    expect(raw(s, 5, 6)).toBe('')
    s.select({ row: 0, col: 2 })
    expect(s.autoSum('MAX')).toBe('done')
    expect(raw(s, 0, 2)).toBe('=MAX(A1:B1)')
  })

  it('renames sheets and rewrites references to them', () => {
    const s = new SheetStore(newWorkbook())
    s.addSheet()
    s.setRaw(0, 0, '7')
    s.setActive(0)
    s.setRaw(0, 0, '=Sheet2!A1*2')
    expect(s.renameSheet(1, 'My Data')).toBeNull()
    expect(raw(s, 0, 0)).toBe("='My Data'!A1*2")
    expect(s.value(0, 0)).toBe(14)
    expect(s.renameSheet(1, 'Sheet1')).toMatch(/taken/)
  })

  it('merges cells and keeps the top-left value', () => {
    const s = storeWith([['a', 'b']])
    s.select({ row: 0, col: 0 }, { row: 0, col: 1 })
    s.toggleMerge()
    expect(s.sheet.merges).toHaveLength(1)
    expect(raw(s, 0, 1)).toBe('')
    s.toggleMerge()
    expect(s.sheet.merges).toHaveLength(0)
  })
})
