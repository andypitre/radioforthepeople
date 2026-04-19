import { eq } from 'drizzle-orm'
import { users } from 'db'
import {
  buildGoogleAuthUrl,
  clearStateCookie,
  exchangeCode,
  fetchUserInfo,
  readStateCookie,
  validateCallbackState,
} from './oauth-google'
import {
  clearSessionCookie,
  readSessionCookie,
  sessionCookie,
  signSession,
  verifySession,
} from './session'
import { db, withAppUser } from './db'

function redirect(location: string, extraHeaders: HeadersInit = {}): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...Object.fromEntries(new Headers(extraHeaders)) },
  })
}

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...Object.fromEntries(new Headers(init.headers)),
    },
  })
}

function appendCookie(headers: Headers, cookie: string) {
  headers.append('Set-Cookie', cookie)
}

export async function handleAuthGoogle(_req: Request): Promise<Response> {
  const { url, stateCookie } = buildGoogleAuthUrl()
  const headers = new Headers()
  appendCookie(headers, stateCookie)
  headers.set('Location', url)
  return new Response(null, { status: 302, headers })
}

export async function handleAuthGoogleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const error = url.searchParams.get('error')
  if (error) {
    return redirect(`/login?error=${encodeURIComponent(error)}`)
  }
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = readStateCookie(req.headers.get('cookie'))
  if (!validateCallbackState(state, cookieState)) {
    return redirect('/login?error=bad_state')
  }
  if (!code) return redirect('/login?error=missing_code')

  const token = await exchangeCode(code)
  const info = await fetchUserInfo(token.access_token)

  // Step 1 (no user context): look up or create by google_id.
  // users_select and users_insert both allow this without a session GUC.
  const userId = await withAppUser(db(), null, async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.googleId, info.id))
      .limit(1)
    if (existing[0]) return existing[0].id
    const inserted = await tx
      .insert(users)
      .values({
        googleId: info.id,
        email: info.email,
        displayName: info.name ?? null,
        avatarUrl: info.picture ?? null,
      })
      .returning({ id: users.id })
    return inserted[0]!.id
  })

  // Step 2 (user context): refresh profile fields. users_update policy
  // checks id = current_user_id, which now matches.
  await withAppUser(db(), userId, async (tx) => {
    await tx
      .update(users)
      .set({
        email: info.email,
        displayName: info.name ?? null,
        avatarUrl: info.picture ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
  })

  const token2 = signSession(userId)
  const headers = new Headers({ Location: '/' })
  appendCookie(headers, sessionCookie(token2))
  appendCookie(headers, clearStateCookie())
  return new Response(null, { status: 302, headers })
}

export async function handleAuthLogout(_req: Request): Promise<Response> {
  const headers = new Headers({ Location: '/' })
  appendCookie(headers, clearSessionCookie())
  return new Response(null, { status: 302, headers })
}

export async function handleApiMe(req: Request): Promise<Response> {
  const token = readSessionCookie(req.headers.get('cookie'))
  const payload = verifySession(token)
  if (!payload) return json({ user: null })

  const user = await withAppUser(db(), payload.uid, async (tx) => {
    const rows = await tx.select().from(users).where(eq(users.id, payload.uid)).limit(1)
    return rows[0] ?? null
  })
  return json({ user })
}
