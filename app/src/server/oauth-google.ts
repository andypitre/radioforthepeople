import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

const STATE_COOKIE = 'rftp_oauth_state'
const STATE_MAX_AGE_SECONDS = 60 * 5

export type GoogleUserInfo = {
  id: string
  email: string
  name?: string
  picture?: string
  verified_email?: boolean
}

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

export function redirectUri(): string {
  return env('GOOGLE_REDIRECT_URI')
}

function signState(nonce: string): string {
  const sig = createHmac('sha256', env('SESSION_SECRET')).update(nonce).digest('base64url')
  return `${nonce}.${sig}`
}

function verifyState(value: string | undefined): boolean {
  if (!value) return false
  const [nonce, sig] = value.split('.')
  if (!nonce || !sig) return false
  const expected = createHmac('sha256', env('SESSION_SECRET')).update(nonce).digest()
  try {
    const actual = Buffer.from(sig, 'base64url')
    if (expected.length !== actual.length) return false
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function buildGoogleAuthUrl(): { url: string; stateCookie: string } {
  const nonce = randomBytes(16).toString('base64url')
  const state = signState(nonce)
  const params = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  })
  const flags = [
    `${STATE_COOKIE}=${state}`,
    'Path=/',
    `Max-Age=${STATE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (process.env.NODE_ENV === 'production') flags.push('Secure')
  return {
    url: `${AUTH_URL}?${params.toString()}`,
    stateCookie: flags.join('; '),
  }
}

export function validateCallbackState(
  queryState: string | null,
  cookieState: string | undefined,
): boolean {
  if (!queryState || !cookieState) return false
  if (queryState !== cookieState) return false
  return verifyState(queryState)
}

export function clearStateCookie(): string {
  return `${STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
}

export function readStateCookie(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === STATE_COOKIE) return rest.join('=')
  }
  return undefined
}

export async function exchangeCode(code: string): Promise<{ access_token: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as { access_token: string }
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`User info failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as GoogleUserInfo
}
