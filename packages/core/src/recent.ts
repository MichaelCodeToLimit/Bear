import type { AppId } from './apps'

export interface RecentFile {
  path: string
  name: string
  app: AppId
  openedAt: number
}

export const MAX_RECENT = 25

function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

/** Move (or insert) an entry to the top of the list, de-duplicated by path and capped at `max`. */
export function addRecent(list: RecentFile[], entry: RecentFile, max = MAX_RECENT): RecentFile[] {
  return [entry, ...list.filter((r) => !samePath(r.path, entry.path))].slice(0, max)
}

export function removeRecent(list: RecentFile[], path: string): RecentFile[] {
  return list.filter((r) => !samePath(r.path, path))
}

/** Parse a stored recent list defensively; corrupt data yields an empty list. */
export function parseRecent(raw: string): RecentFile[] {
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter(
      (r): r is RecentFile =>
        !!r && typeof r.path === 'string' && typeof r.name === 'string' &&
        typeof r.app === 'string' && typeof r.openedAt === 'number'
    )
  } catch {
    return []
  }
}
