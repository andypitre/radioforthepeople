import { and, eq, or } from 'drizzle-orm'
import { createDb, showMembers, shows, withAppUser } from 'db'
import { readSessionCookie, verifySession } from './session.js'

let _db: ReturnType<typeof createDb> | null = null
function db() {
  if (!_db) _db = createDb()
  return _db
}

export function getUserIdFromHeaders(cookieHeader: string | null | undefined): string | null {
  const token = readSessionCookie(cookieHeader)
  const payload = verifySession(token)
  return payload?.uid ?? null
}

export async function canBroadcast(userId: string, slug: string): Promise<boolean> {
  return withAppUser(db(), userId, async (tx) => {
    const rows = await tx
      .select({ role: showMembers.role })
      .from(showMembers)
      .innerJoin(shows, eq(shows.id, showMembers.showId))
      .where(
        and(
          eq(shows.slug, slug),
          eq(showMembers.userId, userId),
          or(eq(showMembers.role, 'owner'), eq(showMembers.role, 'cohost')),
        ),
      )
      .limit(1)
    return rows.length > 0
  })
}
