import { and, eq } from 'drizzle-orm'
import { shows, showMembers, type Show } from 'db'
import { db, withAppUser } from './db'
import { track } from './tracking'

const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'assets',
  'auth',
  'broadcast',
  'favicon.ico',
  'health',
  'listen',
  'login',
  'logout',
  'new-show',
  'public',
  'shows',
  'static',
  'ws',
])

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function validateSlug(slug: string): string | null {
  if (slug.length < 3) return 'Slug must be at least 3 characters.'
  if (slug.length > 40) return 'Slug must be at most 40 characters.'
  if (!SLUG_RE.test(slug)) {
    return 'Slug can only contain lowercase letters, numbers, and hyphens (no leading/trailing/consecutive hyphens).'
  }
  if (RESERVED_SLUGS.has(slug)) return 'That slug is reserved.'
  return null
}

export type CreateShowInput = {
  slug: string
  name: string
  description?: string
}

export type CreateShowResult =
  | { ok: true; show: Show }
  | { ok: false; error: string }

export async function createShow(
  userId: string,
  input: CreateShowInput,
): Promise<CreateShowResult> {
  const slugError = validateSlug(input.slug)
  if (slugError) return { ok: false, error: slugError }
  if (!input.name.trim()) return { ok: false, error: 'Name is required.' }

  try {
    const show = await withAppUser(db(), userId, async (tx) => {
      const inserted = await tx
        .insert(shows)
        .values({
          slug: input.slug,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          createdBy: userId,
        })
        .returning()
      const created = inserted[0]!
      await tx.insert(showMembers).values({
        showId: created.id,
        userId,
        role: 'owner',
      })
      return created
    })
    track('show_created', { id: userId }, { slug: show.slug, name: show.name })
    return { ok: true, show }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('shows_slug_unique')) {
      return { ok: false, error: 'That slug is already taken.' }
    }
    throw err
  }
}

export async function getShowsForUser(userId: string): Promise<Show[]> {
  return withAppUser(db(), userId, async (tx) => {
    return tx
      .select({
        id: shows.id,
        slug: shows.slug,
        name: shows.name,
        description: shows.description,
        createdBy: shows.createdBy,
        createdAt: shows.createdAt,
        updatedAt: shows.updatedAt,
      })
      .from(shows)
      .innerJoin(showMembers, eq(showMembers.showId, shows.id))
      .where(eq(showMembers.userId, userId))
  })
}

export type ShowWithViewerRole = Show & { viewerRole: 'owner' | 'cohost' | null }

export async function getShowBySlug(
  slug: string,
  viewerId: string | null,
): Promise<ShowWithViewerRole | null> {
  return withAppUser(db(), viewerId, async (tx) => {
    const rows = await tx.select().from(shows).where(eq(shows.slug, slug)).limit(1)
    const show = rows[0]
    if (!show) return null

    let viewerRole: ShowWithViewerRole['viewerRole'] = null
    if (viewerId) {
      const member = await tx
        .select({ role: showMembers.role })
        .from(showMembers)
        .where(and(eq(showMembers.showId, show.id), eq(showMembers.userId, viewerId)))
        .limit(1)
      if (member[0]) viewerRole = member[0].role
    }
    return { ...show, viewerRole }
  })
}
