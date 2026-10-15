export const GROUP_ORDER = ['Get started', 'Apps', 'FAQ', 'Contribute'] as const

export interface DocLink {
  slug: string
  title: string
}

export interface DocGroup {
  group: string
  items: DocLink[]
}

interface DocEntry extends DocLink {
  group: string
  order: number
}

/** Group docs for the sidebar: groups in GROUP_ORDER, pages by `order`. Empty groups are left out. */
export function groupDocs(entries: DocEntry[]): DocGroup[] {
  return GROUP_ORDER.map((group) => ({
    group: group as string,
    items: entries
      .filter((e) => e.group === group)
      .sort((a, b) => a.order - b.order)
      .map(({ slug, title }) => ({ slug, title }))
  })).filter((g) => g.items.length > 0)
}

/** Neighbours of `slug` when the sidebar is read top to bottom. */
export function prevNext(groups: DocGroup[], slug: string): { prev: DocLink | null; next: DocLink | null } {
  const flat = groups.flatMap((g) => g.items)
  const i = flat.findIndex((d) => d.slug === slug)
  if (i === -1) return { prev: null, next: null }
  return { prev: flat[i - 1] ?? null, next: flat[i + 1] ?? null }
}
