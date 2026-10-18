export interface Step {
  label: string
  /** Approximate memory held by the step, in bytes (stored pixels). */
  bytes: number
  undo(): void
  redo(): void
}

export class History {
  steps: readonly Step[] = []
  /** Number of applied steps: steps[0..index) are done, steps[index..] are redoable. */
  index = 0
  private total = 0

  constructor(
    private maxSteps = 50,
    private maxBytes = 1 << 30
  ) {}

  get canUndo(): boolean {
    return this.index > 0
  }

  get canRedo(): boolean {
    return this.index < this.steps.length
  }

  push(s: Step): void {
    const kept = this.steps.slice(0, this.index)
    this.steps = [...kept, s]
    this.index = this.steps.length
    this.total = this.steps.reduce((n, x) => n + x.bytes, 0)
    // Drop the oldest first, always keeping the newest step.
    let drop = 0
    while (this.steps.length - drop > 1 && (this.steps.length - drop > this.maxSteps || this.total > this.maxBytes)) {
      this.total -= this.steps[drop].bytes
      drop++
    }
    if (drop) {
      this.steps = this.steps.slice(drop)
      this.index -= drop
    }
  }

  undo(): boolean {
    if (!this.canUndo) return false
    this.index--
    this.steps[this.index].undo()
    return true
  }

  redo(): boolean {
    if (!this.canRedo) return false
    this.steps[this.index].redo()
    this.index++
    return true
  }

  /** Move to the state after `i` steps (0 = before the first step). */
  goTo(i: number): void {
    const target = Math.max(0, Math.min(this.steps.length, i))
    while (this.index > target) this.undo()
    while (this.index < target) this.redo()
  }
}
