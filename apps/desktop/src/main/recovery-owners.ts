import { execFile } from 'node:child_process'

/**
 * Who owns a crash-recovery copy. Bear's data folder (and so recovery/) is shared by every edition, and
 * the editions can run at the same time, so "is this copy left over from a crash?" can't be answered from
 * one process's memory. Each process keeps its copies in recovery/<pid>-<startedAt>/; another process
 * offers them only once that process is gone.
 */

/** A process, told apart from a later one that reuses its pid by when it started (ms since the epoch). */
export interface ProcessId {
  pid: number
  startedAt: number
}

/** What a look at another process found: gone, or alive with its start time (null when it couldn't be read). */
export type ProbeResult = { alive: false } | { alive: true; startedAt: number | null }

/** `self`: this process's own folder. `live`: another running process's (never listed, read or removed). `orphan`: left by a crash. */
export type Ownership = 'self' | 'live' | 'orphan'

/** How far the start time the OS reports may be from the one the owner recorded (both measure process start). */
export const START_TOLERANCE_MS = 5000

const FOLDER = /^([1-9]\d{0,9})-(\d{1,15})$/

export const ownerFolderName = (p: ProcessId): string => `${p.pid}-${p.startedAt}`

export function parseOwnerFolder(name: string): ProcessId | null {
  const m = FOLDER.exec(name)
  return m ? { pid: Number(m[1]), startedAt: Number(m[2]) } : null
}

/**
 * Whose copy a recovery entry is. `folder` is the subfolder of recovery/ it is in, or null for a flat copy
 * directly in recovery/ (written by an earlier 0.2.0 build), which is treated as left over. `probe` is what
 * was found about the folder's pid; it isn't needed for this process's own pid. Unknown folders and owners
 * that might be alive count as `live`, so a copy that may still be in use is never touched.
 */
export function copyOwnership(folder: string | null, self: ProcessId, probe: ProbeResult | undefined): Ownership {
  if (folder === null) return 'orphan'
  const owner = parseOwnerFolder(folder)
  if (!owner) return 'live'
  if (owner.pid === self.pid) return owner.startedAt === self.startedAt ? 'self' : 'orphan'
  if (!probe) return 'live'
  if (!probe.alive) return 'orphan'
  if (probe.startedAt === null) return 'live'
  return Math.abs(probe.startedAt - owner.startedAt) <= START_TOLERANCE_MS ? 'live' : 'orphan'
}

/** This process, with its start time measured the way processStartTime reads another's. */
export function thisProcess(): ProcessId {
  return { pid: process.pid, startedAt: Math.round(Date.now() - process.uptime() * 1000) }
}

/** Whether `pid` is running, and since when. */
export async function probeProcess(pid: number): Promise<ProbeResult> {
  try {
    process.kill(pid, 0)
  } catch (e) {
    // EPERM: it exists but belongs to someone else (still alive).
    if ((e as NodeJS.ErrnoException).code !== 'EPERM') return { alive: false }
  }
  return { alive: true, startedAt: await processStartTime(pid) }
}

/** When `pid` started (ms since the epoch), from the OS; null if it can't be read. Only run for pids that are alive. */
function processStartTime(pid: number): Promise<number | null> {
  const run = (cmd: string, args: string[]) =>
    new Promise<string | null>((resolve) =>
      execFile(cmd, args, { timeout: 10_000, windowsHide: true }, (err, out) => resolve(err ? null : String(out).trim()))
    )
  if (process.platform === 'win32') {
    return run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `[DateTimeOffset]::new((Get-Process -Id ${pid}).StartTime).ToUnixTimeMilliseconds()`
    ]).then((out) => (out && /^\d+$/.test(out) ? Number(out) : null))
  }
  // Elapsed time as [[dd-]hh:]mm:ss, the same on macOS and Linux.
  return run('ps', ['-o', 'etime=', '-p', String(pid)]).then((out) => {
    const m = out && /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(out)
    if (!m) return null
    const secs = ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3])) * 60 + Number(m[4])
    return Date.now() - secs * 1000
  })
}
