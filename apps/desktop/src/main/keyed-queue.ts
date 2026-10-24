/**
 * Runs async jobs one at a time per key (jobs for different keys run independently). A failed job
 * rejects its own promise but doesn't stop the jobs queued behind it.
 */
export class KeyedQueue {
  private tails = new Map<string, Promise<unknown>>()

  run<T>(key: string, job: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve()
    const result = prev.then(job)
    const tail = result.catch(() => {})
    this.tails.set(key, tail)
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })
    return result
  }

  /** Keys with jobs pending. */
  get size(): number {
    return this.tails.size
  }
}
