import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  time,
  integer,
  timestamp,
  uuid,
  primaryKey,
  pgEnum,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  googleId: text('google_id').notNull().unique(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const scheduleCadence = pgEnum('schedule_cadence', [
  'daily',
  'weekly',
  'monthly',
])

export const shows = pgTable('shows', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  // Optional schedule. App-layer validates internal consistency
  // (weekly → dayOfWeek set, monthly → dayOfMonth set, etc).
  // Nullable everywhere because most shows won't set this — and we
  // want to learn how often it's filled in.
  scheduleCadence: scheduleCadence('schedule_cadence'),
  scheduleDayOfWeek: integer('schedule_day_of_week'),
  scheduleDayOfMonth: integer('schedule_day_of_month'),
  scheduleTime: time('schedule_time'),
  scheduleTimezone: text('schedule_timezone'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const showMemberRole = pgEnum('show_member_role', ['owner', 'cohost'])

export const showMembers = pgTable(
  'show_members',
  {
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: showMemberRole('role').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.showId, t.userId] }),
  }),
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Show = typeof shows.$inferSelect
export type NewShow = typeof shows.$inferInsert
export type ShowMember = typeof showMembers.$inferSelect
