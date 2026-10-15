import { test, expect } from '@playwright/test'

const PAGES = ['./', 'tour/', 'docs/get-started/install/', 'playground/', 'download/']

for (const path of PAGES) {
  test.describe(`site-wide checks: ${path}`, () => {
    test('no console errors', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      expect(errors).toEqual([])
    })

    test('no horizontal scroll at 375px', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })

    test('every internal link resolves', async ({ page, request }) => {
      await page.goto(path)
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') ?? ''))
      const here = page.url()
      const targets = new Set<string>()
      const stray: string[] = []
      for (const href of hrefs) {
        if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue
        if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) continue // external
        if (href.startsWith('/') && !href.startsWith('/Bear/')) stray.push(href)
        const u = new URL(href, here)
        u.hash = ''
        targets.add(u.toString())
      }
      expect(stray, 'absolute links outside /Bear/').toEqual([])
      expect(targets.size).toBeGreaterThan(0)
      const bad: string[] = []
      for (const url of targets) {
        const res = await request.get(url)
        if (res.status() >= 400) bad.push(`${res.status()} ${url}`)
      }
      expect(bad).toEqual([])
    })

    test('accessibility smoke: alt text, button names, one h1', async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const report = await page.evaluate(() => {
        const noAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).map((i) => i.outerHTML.slice(0, 80))
        const noName = [...document.querySelectorAll('button')]
          .filter((b) => {
            const label = b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || b.getAttribute('title')
            return !(b.textContent ?? '').trim() && !label
          })
          .map((b) => b.outerHTML.slice(0, 80))
        return { noAlt, noName, h1: document.querySelectorAll('h1').length }
      })
      expect(report.noAlt).toEqual([])
      expect(report.noName).toEqual([])
      expect(report.h1).toBe(1)
    })
  })
}
