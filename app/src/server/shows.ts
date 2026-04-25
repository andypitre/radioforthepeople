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

export type ScheduleCadence = 'daily' | 'weekly' | 'monthly'

export type ScheduleInput = {
  cadence: ScheduleCadence
  // 0 (Sun) – 6 (Sat); required when cadence === 'weekly'
  dayOfWeek?: number
  // 1–31; required when cadence === 'monthly'
  dayOfMonth?: number
  // HH:MM (24h)
  time: string
  // IANA, e.g. America/New_York
  timezone: string
}

export type CreateShowInput = {
  slug: string
  name: string
  description?: string
  schedule?: ScheduleInput | null
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function validateSchedule(s: ScheduleInput): string | null {
  if (!['daily', 'weekly', 'monthly'].includes(s.cadence)) {
    return 'Invalid schedule cadence.'
  }
  if (!TIME_RE.test(s.time)) return 'Schedule time must be HH:MM.'
  if (!s.timezone) return 'Schedule timezone is required.'
  if (s.cadence === 'weekly') {
    if (s.dayOfWeek === undefined || s.dayOfWeek < 0 || s.dayOfWeek > 6) {
      return 'Pick a day of the week.'
    }
  }
  if (s.cadence === 'monthly') {
    if (s.dayOfMonth === undefined || s.dayOfMonth < 1 || s.dayOfMonth > 31) {
      return 'Pick a day of the month (1–31).'
    }
  }
  return null
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
  if (input.schedule) {
    const scheduleError = validateSchedule(input.schedule)
    if (scheduleError) return { ok: false, error: scheduleError }
  }

  try {
    const show = await withAppUser(db(), userId, async (tx) => {
      const inserted = await tx
        .insert(shows)
        .values({
          slug: input.slug,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          createdBy: userId,
          scheduleCadence: input.schedule?.cadence ?? null,
          scheduleDayOfWeek:
            input.schedule?.cadence === 'weekly' ? input.schedule.dayOfWeek ?? null : null,
          scheduleDayOfMonth:
            input.schedule?.cadence === 'monthly' ? input.schedule.dayOfMonth ?? null : null,
          scheduleTime: input.schedule?.time ?? null,
          scheduleTimezone: input.schedule?.timezone ?? null,
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
      .select()
      .from(shows)
      .innerJoin(showMembers, eq(showMembers.showId, shows.id))
      .where(eq(showMembers.userId, userId))
      .then((rows) => rows.map((r) => r.shows))
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
