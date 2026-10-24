/**
 * Whether a finished save leaves the document clean. `editsAtStart` is the edit count when the save took
 * its snapshot and `editsNow` the count when the write finished: an edit made while a slow save was under
 * way is not in the file, so the document stays dirty (and AutoSave runs again).
 */
export function cleanAfterSave(editsAtStart: number, editsNow: number): boolean {
  return editsAtStart === editsNow
}

/** Edits counted synchronously as they happen (React state only catches up on the next render). */
export class EditCounter {
  count = 0

  /** Record an edit when `dirty` is true (a document marked dirty). */
  mark(dirty: boolean): void {
    if (dirty) this.count++
  }
}
