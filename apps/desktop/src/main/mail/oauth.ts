import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * OAuth 2.0 for desktop apps: authorization code + PKCE with a loopback redirect (RFC 8252).
 * The user signs in in their own browser; we never see their password.
 */

export type OAuthProvider = 'microsoft' | 'google'

export interface ProviderEndpoints {
  authorize: string
  token: string
  scope: string
  /** Host in the loopback redirect URI: Microsoft only accepts localhost; Google is fine with 127.0.0.1. */
  redirectHost: 'localhost' | '127.0.0.1'
  /** Extra query parameters for the authorize URL. */
  extra?: Record<string, string>
}

export const ENDPOINTS: Record<OAuthProvider, ProviderEndpoints> = {
  microsoft: {
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'offline_access openid email profile https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send',
    redirectHost: 'localhost',
    extra: { prompt: 'select_account' }
  },
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile https://mail.google.com/',
    redirectHost: '127.0.0.1',
    // Needed to receive a refresh token.
    extra: { access_type: 'offline', prompt: 'consent' }
  }
}

export interface Tokens {
  accessToken: string
  refreshToken: string
  /** Epoch ms. */
  expiresAt: number
}

export interface ClientCredentials {
  clientId: string
  clientSecret?: string
}

const base64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48))
  return { verifier, challenge: base64url(createHash('sha256').update(verifier).digest()) }
}

export function authorizeUrl(ep: ProviderEndpoints, client: ClientCredentials, redirectUri: string, challenge: string, state: string): string {
  const u = new URL(ep.authorize)
  const params: Record<string, string> = {
    client_id: client.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: ep.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...ep.extra
  }
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return u.toString()
}

/** The (unverified) claims of an ID token: fine for reading the signed-in address, not for security decisions. */
export function idTokenClaims(idToken: string | undefined): { email?: string; name?: string; preferred_username?: string } {
  if (!idToken) return {}
  try {
    return JSON.parse(Buffer.from(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return {}
  }
}

async function tokenRequest(endpoint: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body).toString()
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || typeof json.access_token !== 'string') {
    throw new Error(String(json.error_description ?? json.error ?? `Sign-in failed (HTTP ${res.status})`))
  }
  return json
}

function toTokens(json: Record<string, unknown>, previousRefresh?: string): Tokens {
  return {
    accessToken: json.access_token as string,
    // Providers may or may not rotate refresh tokens; keep the old one if none came back.
    refreshToken: (json.refresh_token as string | undefined) ?? previousRefresh ?? '',
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000
  }
}

export async function exchangeCode(ep: ProviderEndpoints, client: ClientCredentials, code: string, verifier: string, redirectUri: string) {
  const json = await tokenRequest(ep.token, {
    grant_type: 'authorization_code',
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri
  })
  const claims = idTokenClaims(json.id_token as string | undefined)
  return { tokens: toTokens(json), email: claims.email ?? claims.preferred_username ?? '', name: claims.name ?? '' }
}

export async function refreshTokens(ep: ProviderEndpoints, client: ClientCredentials, refreshToken: string): Promise<Tokens> {
  const json = await tokenRequest(ep.token, {
    grant_type: 'refresh_token',
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    refresh_token: refreshToken,
    scope: ep.scope
  })
  return toTokens(json, refreshToken)
}

const PAGE = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;padding:40px;color:#222"><h2>${title}</h2><p>${body}</p></body>`

/**
 * Run the browser sign-in: listen on a random loopback port, open the authorize URL, wait for the
 * redirect with ?code=, then exchange it.
 */
export async function interactiveSignIn(
  ep: ProviderEndpoints,
  client: ClientCredentials,
  openBrowser: (url: string) => void,
  timeoutMs = 5 * 60_000
) {
  const { verifier, challenge } = pkcePair()
  const state = base64url(randomBytes(16))
  const servers: Server[] = []
  try {
    const result = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Sign-in timed out. Please try again.')), timeoutMs)
      const handler = (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/callback') {
          res.writeHead(404).end()
          return
        }
        const err = url.searchParams.get('error_description') ?? url.searchParams.get('error')
        const code = url.searchParams.get('code')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        if (err || !code || url.searchParams.get('state') !== state) {
          res.end(PAGE('Sign-in failed', 'You can close this tab and try again in Bear.'))
          clearTimeout(timer)
          reject(new Error(err ?? 'Sign-in was cancelled.'))
          return
        }
        res.end(PAGE('Signed in to Bear Mail', 'You can close this tab and go back to Bear.'))
        clearTimeout(timer)
        resolve({ code, redirectUri })
      }
      let redirectUri = ''
      // Loopback only, never the network. "localhost" may resolve to IPv4 or IPv6, so listen on both.
      const v4 = createServer(handler)
      servers.push(v4)
      v4.on('error', reject)
      v4.listen(0, '127.0.0.1', () => {
        const port = (v4.address() as AddressInfo).port
        const v6 = createServer(handler)
        servers.push(v6)
        v6.on('error', () => {}) // no IPv6 loopback on this machine: IPv4 alone is fine
        v6.listen(port, '::1')
        redirectUri = `http://${ep.redirectHost}:${port}/callback`
        openBrowser(authorizeUrl(ep, client, redirectUri, challenge, state))
      })
    })
    return await exchangeCode(ep, client, result.code, verifier, result.redirectUri)
  } finally {
    for (const s of servers) s.close()
  }
}
