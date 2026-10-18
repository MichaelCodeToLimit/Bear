import { describe, expect, it } from 'vitest'
import { shortcutFor, type Command } from './shortcuts'

const k = (key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): Command | null =>
  shortcutFor({ key, ctrl: !!mods.ctrl, shift: !!mods.shift, alt: !!mods.alt })

describe('shortcutFor', () => {
  it('undo and redo', () => {
    expect(k('z', { ctrl: true })).toBe('undo')
    expect(k('Z', { ctrl: true, shift: true })).toBe('redo')
    expect(k('y', { ctrl: true })).toBe('redo')
  })
  it('selection', () => {
    expect(k('a', { ctrl: true })).toBe('selectAll')
    expect(k('d', { ctrl: true })).toBe('deselect')
    expect(k('I', { ctrl: true, shift: true })).toBe('invertSelection')
    expect(k('i', { ctrl: true })).toBeNull()
  })
  it('clipboard and delete', () => {
    expect(k('c', { ctrl: true })).toBe('copy')
    expect(k('x', { ctrl: true })).toBe('cut')
    expect(k('v', { ctrl: true })).toBe('paste')
    expect(k('Delete')).toBe('delete')
    expect(k('Backspace')).toBe('delete')
  })
  it('zoom', () => {
    expect(k('0', { ctrl: true })).toBe('fit')
    expect(k('1', { ctrl: true })).toBe('actual')
    expect(k('=', { ctrl: true })).toBe('zoomIn')
    expect(k('+', { ctrl: true, shift: true })).toBe('zoomIn')
    expect(k('-', { ctrl: true })).toBe('zoomOut')
  })
  it('colours and brush size', () => {
    expect(k('x')).toBe('swapColors')
    expect(k('d')).toBe('resetColors')
    expect(k('[')).toBe('brushSmaller')
    expect(k(']')).toBe('brushBigger')
  })
  it('file commands', () => {
    expect(k('s', { ctrl: true })).toBe('save')
    expect(k('S', { ctrl: true, shift: true })).toBe('saveAs')
    expect(k('o', { ctrl: true })).toBe('open')
    expect(k('n', { ctrl: true })).toBe('new')
  })
  it('ignores Alt chords and unknown keys', () => {
    expect(k('z', { ctrl: true, alt: true })).toBeNull()
    expect(k('x', { alt: true })).toBeNull()
    expect(k('q')).toBeNull()
    expect(k('Delete', { ctrl: true })).toBeNull()
  })
})
