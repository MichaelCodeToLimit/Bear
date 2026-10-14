export const SITE = {
  name: 'Bear',
  repoUrl: 'https://github.com/MichaelCodeToLimit/Bear',
  releasesUrl: 'https://github.com/MichaelCodeToLimit/Bear/releases',
  releasesApi: 'https://api.github.com/repos/MichaelCodeToLimit/Bear/releases/latest'
} as const

/** Join the site base path and `path` with exactly one slash between them. */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
  return `${base}/${path.replace(/^\/+/, '')}`
}
