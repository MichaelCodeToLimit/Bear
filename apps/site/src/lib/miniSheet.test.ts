import { describe, expect, it } from 'vitest'
import { evaluateGrid } from './miniSheet'

const blank = (): string[][] => [
  ['', '', ''],
  ['', '', ''],
  ['', '', '']
]
const grid = (cells: Record<string, string>): string[][] => {
  const g = blank()
  for (const [ref, v] of Object.entries(cells)) g['123'.indexOf(ref[1])]['ABC'.indexOf(ref[0])] = v
  return g
}

describe('evaluateGrid', () => {
  it('sums a range', () => {
    expect(evaluateGrid(grid({ A1: '1', B1: '2', C1: '3', A2: '=SUM(A1:C1)' }))[1][0]).toBe('6')
  })
  it('flags a self reference as a cycle', () => {
    expect(evaluateGrid(grid({ A1: '=A1' }))[0][0]).toBe('#CYCLE!')
  })
  it('flags a two-cell cycle on both cells', () => {
    const out = evaluateGrid(grid({ A1: '=B1', B1: '=A1' }))
    expect(out[0][0]).toBe('#CYCLE!')
    expect(out[0][1]).toBe('#CYCLE!')
  })
  it('reports divide by zero', () => {
    expect(evaluateGrid(grid({ A1: '=1/0' }))[0][0]).toBe('#DIV/0!')
  })
  it('reports unknown functions as #NAME?', () => {
    expect(evaluateGrid(grid({ A1: '=NOPE(1)' }))[0][0]).toBe('#NAME?')
  })
  it('reports references outside A1:C3 as #REF!', () => {
    expect(evaluateGrid(grid({ A1: '=D9' }))[0][0]).toBe('#REF!')
    expect(evaluateGrid(grid({ B2: '=SUM(A1:D9)' }))[1][1]).toBe('#REF!')
  })
  it('shows text as-is', () => {
    expect(evaluateGrid(grid({ A1: 'hello' }))[0][0]).toBe('hello')
  })
  it('rounds to 6 significant digits and follows references', () => {
    const out = evaluateGrid(grid({ A1: '=A2*2', A2: '=1/3' }))
    expect(out[1][0]).toBe('0.333333')
    expect(out[0][0]).toBe('0.666667')
  })
  it('shows plain numbers as numbers', () => {
    expect(evaluateGrid(grid({ A1: '2' }))[0][0]).toBe('2')
  })
  it('never throws on text in SUM, malformed formulas or ragged input', () => {
    const out = evaluateGrid(grid({ A1: 'x', B1: '=SUM("a")', C1: '=((', A2: '=', B2: '=A1+1' }))
    expect(out[0][1]).toMatch(/^#/)
    expect(out[0][2]).toMatch(/^#/)
    expect(out[1][1]).toMatch(/^#/)
    expect(() => evaluateGrid([[]] as unknown as string[][])).not.toThrow()
  })
  it('keeps blank cells blank', () => {
    expect(evaluateGrid(blank())[2][2]).toBe('')
  })
})
