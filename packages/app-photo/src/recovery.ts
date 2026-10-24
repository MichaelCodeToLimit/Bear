/** How often a recovery copy is written while there are unsaved changes. */
export const RECOVERY_INTERVAL = 60_000

/** The recovery file for one window's Photo session (see RECOVERY_NAME in @bear/core). */
export function recoveryName(sessionId: string): string {
  return `photo-${sessionId}.bearphoto`
}

/** Write a recovery copy when there are unsaved changes and the last copy is at least `interval` old. */
export function shouldWriteRecovery(dirty: boolean, lastWrite: number, now: number, interval = RECOVERY_INTERVAL): boolean {
  return dirty && now - lastWrite >= interval
}

/** One id per window, so two Photo windows never share a recovery file. */
export const SESSION_ID = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8)

export interface RecoveryIO {
  write(name: string, data: Uint8Array): Promise<void>
  remove(name: string): Promise<void>
}

/**
 * Keeps one recovery copy up to date. Writes and removals run one at a time, in order. `remove()` bumps a
 * generation counter, so a write that was already under way when the document became clean is either
 * skipped or deleted again once it lands, and never leaves a stale copy behind.
 */
export class RecoveryWriter<D> {
  written = false
  private gen = 0
  private chain: Promise<void> = Promise.resolve()
  private busy = false
  private writtenVersion = -1

  constructor(
    private readonly io: RecoveryIO,
    private readonly name: string,
    private readonly serialize: (doc: D) => Promise<Uint8Array>,
    private readonly interval: number,
    /** Time of the last write (or of the last clean state). */
    public lastWrite: number
  ) {}

  private queue(job: () => Promise<void>): Promise<void> {
    const run = this.chain.then(job)
    this.chain = run.catch(() => {})
    return run
  }

  /** Write a copy now. Rejects if the write fails. */
  writeNow(doc: D, version: number): Promise<void> {
    const gen = this.gen
    return this.queue(async () => {
      if (gen !== this.gen) return
      const data = await this.serialize(doc)
      if (gen !== this.gen) return
      await this.io.write(this.name, data)
      if (gen !== this.gen) {
        // Removed while this was being written: take it back out.
        await this.io.remove(this.name)
        return
      }
      this.written = true
      this.writtenVersion = version
    })
  }

  /** Write if there are unsaved changes since the last copy and the interval has passed. True when written. */
  async maybeWrite(doc: D, dirty: boolean, version: number, now: number): Promise<boolean> {
    if (this.busy || !shouldWriteRecovery(dirty && version !== this.writtenVersion, this.lastWrite, now, this.interval)) return false
    this.busy = true
    try {
      await this.writeNow(doc, version)
      this.lastWrite = now
      return true
    } finally {
      this.busy = false
    }
  }

  /** The document is clean (or closing): drop the copy, including one still being written. */
  remove(): Promise<void> {
    this.gen++
    return this.queue(async () => {
      if (!this.written) return
      this.written = false
      this.writtenVersion = -1
      await this.io.remove(this.name)
    })
  }
}

/** Recovery interval, shortened by end-to-end tests through `window.__bearPhotoRecoveryMs`. */
export function recoveryInterval(): number {
  const hook = (globalThis as { __bearPhotoRecoveryMs?: unknown }).__bearPhotoRecoveryMs
  return typeof hook === 'number' && hook > 0 ? hook : RECOVERY_INTERVAL
}
