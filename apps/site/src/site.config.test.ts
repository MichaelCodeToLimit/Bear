import { describe, it, expect, vi } from 'vitest'
describe('url', () => {
  it('joins base and path with one slash', async () => {
    vi.stubEnv('BASE_URL', '/Bear/')
    const { url } = await import('./site.config')
    expect(url('tour/')).toBe('/Bear/tour/')
    expect(url('/docs/faq/')).toBe('/Bear/docs/faq/')
    expect(url('')).toBe('/Bear/')
  })
})
