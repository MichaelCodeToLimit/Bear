import { describe, expect, it } from 'vitest'
import { addBoard, initialIndex, patchBoard, removeBoard, sortedBoards } from './model'

describe('boards', () => {
  it('names new boards uniquely and sorts by last edit', () => {
    let d = initialIndex()
    const a = addBoard(d, 'Ideas')
    d = a.data
    const b = addBoard(d, 'Ideas')
    d = b.data
    expect(b.board.name).toBe('Ideas 2')
    d = patchBoard(d, a.board.id, { modified: Date.now() + 1000 })
    expect(sortedBoards(d)[0].id).toBe(a.board.id)
    expect(removeBoard(d, a.board.id).boards).toHaveLength(1)
  })
})
