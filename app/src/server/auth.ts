import { eq } from 'drizzle-orm'
import { users, type User } from 'db'
import { db, withAppUser } from './db'
import { readSessionCookie, verifySession } from './session'
import { heartbeat } from './tracking'

/** Returns the user id from a signed session cookie, or null. */
export function getSessionUserId(request: Request): string | null {
  const token = readSessionCookie(request.headers.get('cookie'))
  const payload = verifySession(token)
  return payload?.uid ?? null
}

/** Loads the full user record for the current session (or null). */
export async function getCurrentUser(request: Request): Promise<User | null> {
  const uid = getSessionUserId(request)
  if (!uid) return null
  const user = await withAppUser(db(), uid, async (tx) => {
    const rows = await tx.select().from(users).where(eq(users.id, uid)).limit(1)
    return rows[0] ?? null
  })
  if (user) {
    // Heartbeat is throttled inside tracking.ts so we don't hit Simple
    // Product on every SSR render.
    heartbeat({ id: user.id, email: user.email, displayName: user.displayName })
  }
  return user
}
