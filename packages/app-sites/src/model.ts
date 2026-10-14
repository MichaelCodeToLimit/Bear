export type PageKind = 'page' | 'news'

export interface SitePage {
  id: string
  kind: PageKind
  title: string
  html: string
  text: string
  created: number
  modified: number
}

export interface QuickLink {
  id: string
  title: string
  /** A web address or a file/folder path. */
  url: string
}

export interface Site {
  id: string
  name: string
  description: string
  color: string
  created: number
  /** The site's home page text. */
  welcome: string
  pages: SitePage[]
  links: QuickLink[]
  /** Folder on disk used as the site's document library. */
  library: string | null
  /** A Tasks list shown on the home page. */
  taskList: string | null
}

export interface SitesData {
  version: 1
  sites: Site[]
}

export const SITE_COLORS = ['#0e7490', '#7c3aed', '#be123c', '#b45309', '#15803d', '#1d4ed8', '#c2410c', '#475569']

let n = 0
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`

export const initialSites = (): SitesData => ({ version: 1, sites: [] })

export function upgradeSites(raw: unknown): SitesData | null {
  const d = raw as Partial<SitesData> | null
  return d && Array.isArray(d.sites) ? { version: 1, sites: d.sites } : null
}

export function createSite(d: SitesData, name: string, description: string, color: string): { data: SitesData; site: Site } {
  const site: Site = {
    id: uid('site'),
    name: name.trim() || 'Untitled site',
    description: description.trim(),
    color,
    created: Date.now(),
    welcome: `<h2>Welcome to ${escapeHtml(name.trim() || 'our site')}</h2><p>Use this space to share news, pages, documents and links with your team.</p>`,
    pages: [],
    links: [],
    library: null,
    taskList: null
  }
  return { data: { ...d, sites: [...d.sites, site] }, site }
}

export function patchSite(d: SitesData, id: string, patch: Partial<Site>): SitesData {
  return { ...d, sites: d.sites.map((s) => (s.id === id ? { ...s, ...patch } : s)) }
}

export function deleteSite(d: SitesData, id: string): SitesData {
  return { ...d, sites: d.sites.filter((s) => s.id !== id) }
}

export function addPage(d: SitesData, siteId: string, kind: PageKind, title: string): { data: SitesData; page: SitePage } {
  const now = Date.now()
  const page: SitePage = { id: uid('pg'), kind, title: title.trim() || (kind === 'news' ? 'Untitled news post' : 'Untitled page'), html: '', text: '', created: now, modified: now }
  return { data: patchSiteWith(d, siteId, (s) => ({ ...s, pages: [...s.pages, page] })), page }
}

export function updatePage(d: SitesData, siteId: string, pageId: string, patch: Partial<Pick<SitePage, 'title' | 'html' | 'text'>>): SitesData {
  return patchSiteWith(d, siteId, (s) => ({ ...s, pages: s.pages.map((p) => (p.id === pageId ? { ...p, ...patch, modified: Date.now() } : p)) }))
}

export function deletePage(d: SitesData, siteId: string, pageId: string): SitesData {
  return patchSiteWith(d, siteId, (s) => ({ ...s, pages: s.pages.filter((p) => p.id !== pageId) }))
}

export function addLink(d: SitesData, siteId: string, title: string, url: string): SitesData {
  const clean = url.trim()
  if (!clean) return d
  const href = /^[a-z]+:\/\//i.test(clean) || /^[a-z]:[\\/]/i.test(clean) || clean.startsWith('\\\\') || clean.startsWith('/') ? clean : `https://${clean}`
  return patchSiteWith(d, siteId, (s) => ({ ...s, links: [...s.links, { id: uid('ln'), title: title.trim() || href, url: href }] }))
}

export function removeLink(d: SitesData, siteId: string, linkId: string): SitesData {
  return patchSiteWith(d, siteId, (s) => ({ ...s, links: s.links.filter((l) => l.id !== linkId) }))
}

/** News posts, newest first. */
export const news = (s: Site) => s.pages.filter((p) => p.kind === 'news').sort((a, b) => b.created - a.created)
export const pages = (s: Site) => s.pages.filter((p) => p.kind === 'page').sort((a, b) => a.title.localeCompare(b.title))

export const isWebLink = (url: string) => /^https?:\/\//i.test(url)

function patchSiteWith(d: SitesData, id: string, fn: (s: Site) => Site): SitesData {
  return { ...d, sites: d.sites.map((s) => (s.id === id ? fn(s) : s)) }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Human-friendly file size. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
