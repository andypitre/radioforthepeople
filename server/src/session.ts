// Mirror of app/src/server/session.ts — keep in sync until we extract
// a shared package. Both sign and verify sessions the same way so the
// WS server can authenticate broadcasters via the same cookie the app
// issues on OAuth callback.
import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'rftp_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type SessionPayload = {
  uid: string
  iat: number
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set')
  return s
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', getSecret()).update(body).digest()
  const actual = b64urlDecode(sig)
  if (expected.length !== actual.length) return null
  if (!timingSafeEqual(expected, actual)) return null
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf8')) as SessionPayload
    if (typeof payload.uid !== 'string' || typeof payload.iat !== 'number') return null
    if (Date.now() / 1000 - payload.iat > MAX_AGE_SECONDS) return null
    return payload
  } catch {
    return null
  }
}

export function readSessionCookie(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === COOKIE_NAME) return rest.join('=')
  }
  return undefined
}
