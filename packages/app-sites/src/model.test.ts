import { describe, expect, it } from 'vitest'
import { addLink, addPage, createSite, deletePage, fileSize, initialSites, news, pages, removeLink, updatePage, upgradeSites } from './model'

describe('sites', () => {
  it('creates a site with a welcome message that escapes its name', () => {
    const { data, site } = createSite(initialSites(), 'R&D <Team>', 'Our space', '#0e7490')
    expect(data.sites).toHaveLength(1)
    expect(site.welcome).toContain('R&amp;D &lt;Team&gt;')
  })

  it('keeps pages and news apart, news newest first', async () => {
    let { data, site } = createSite(initialSites(), 'Team', '', '#000')
    data = addPage(data, site.id, 'page', 'Zebra').data
    data = addPage(data, site.id, 'page', 'Apple').data
    const first = addPage(data, site.id, 'news', 'Old news')
    data = first.data
    await new Promise((r) => setTimeout(r, 5))
    data = addPage(data, site.id, 'news', 'Fresh news').data
    const s = data.sites[0]
    expect(pages(s).map((p) => p.title)).toEqual(['Apple', 'Zebra'])
    expect(news(s).map((p) => p.title)).toEqual(['Fresh news', 'Old news'])
    data = updatePage(data, site.id, first.page.id, { title: 'Edited' })
    expect(news(data.sites[0]).map((p) => p.title)).toContain('Edited')
    data = deletePage(data, site.id, first.page.id)
    expect(news(data.sites[0])).toHaveLength(1)
  })

  it('normalises quick links', () => {
    let { data, site } = createSite(initialSites(), 'Team', '', '#000')
    data = addLink(data, site.id, 'Docs', 'example.com/docs')
    data = addLink(data, site.id, 'Share', 'C:\\Shared\\Team')
    data = addLink(data, site.id, '', '   ')
    const links = data.sites[0].links
    expect(links.map((l) => l.url)).toEqual(['https://example.com/docs', 'C:\\Shared\\Team'])
    data = removeLink(data, site.id, links[0].id)
    expect(data.sites[0].links).toHaveLength(1)
  })

  it('formats file sizes and rejects bad data', () => {
    expect(fileSize(512)).toBe('512 B')
    expect(fileSize(2048)).toBe('2 KB')
    expect(fileSize(5 * 1024 ** 2)).toBe('5.0 MB')
    expect(upgradeSites({})).toBeNull()
  })
})
