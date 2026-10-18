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

/** Recovery interval, shortened by end-to-end tests through `window.__bearPhotoRecoveryMs`. */
export function recoveryInterval(): number {
  const hook = (globalThis as { __bearPhotoRecoveryMs?: unknown }).__bearPhotoRecoveryMs
  return typeof hook === 'number' && hook > 0 ? hook : RECOVERY_INTERVAL
}
