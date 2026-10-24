/** One save: takes its snapshot of the document when it starts, writes it, resolves true when it landed. */
export type SaveRun = () => Promise<boolean>

interface Pending {
  auto: boolean
  /** The file this save writes; only saves to the same file merge. */
  target: string
  run: SaveRun
  waiters: { resolve: (ok: boolean) => void; reject: (e: unknown) => void }[]
}

/**
 * Serialises the saves of one document, so an older snapshot can never land after a newer one.
 *
 * - A request while nothing is saving starts at once.
 * - A request while a save is running waits behind it. There is at most one pending save per file: a newer
 *   request to the same file replaces it (it snapshots when it starts, so it carries the newest content),
 *   and everyone who asked for the replaced one gets the result of the save that runs instead. Saves to
 *   different files (a Save As while an AutoSave is writing) each run, in the order asked.
 * - An AutoSave never replaces a pending save by the user; it just waits for that one's result. A save by
 *   the user replaces a pending AutoSave.
 * - `onBusy(true)` fires when the first save starts and `onBusy(false)` only when the queue has drained.
 * - A save that fails (resolves false or throws) is reported to its callers and the next one still runs.
 */
export class SaveQueue {
  private running = false
  private pending: Pending[] = []

  constructor(private onBusy: (busy: boolean) => void = () => {}) {}

  get busy(): boolean {
    return this.running
  }

  /** `auto` is true when AutoSave (not the user) asks; `target` is the file the save writes. */
  request(auto: boolean, run: SaveRun, target = ''): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const waiter = { resolve, reject }
      if (!this.running) {
        this.running = true
        this.onBusy(true)
        void this.drain({ auto, target, run, waiters: [waiter] })
        return
      }
      const i = this.pending.findIndex((p) => p.target === target)
      const p = this.pending[i]
      if (p && auto && !p.auto) {
        p.waiters.push(waiter) // a newer AutoSave rides on the user's pending save
      } else if (p) {
        this.pending[i] = { auto, target, run, waiters: [...p.waiters, waiter] }
      } else {
        this.pending.push({ auto, target, run, waiters: [waiter] })
      }
    })
  }

  private async drain(first: Pending): Promise<void> {
    let job: Pending | null = first
    while (job) {
      try {
        const ok = await job.run()
        job.waiters.forEach((w) => w.resolve(ok))
      } catch (e) {
        job.waiters.forEach((w) => w.reject(e))
      }
      job = this.pending.shift() ?? null
    }
    this.running = false
    this.onBusy(false)
  }
}
