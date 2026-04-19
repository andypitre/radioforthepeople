import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export type Database = ReturnType<typeof createDb>

export function createDb(url: string = process.env.DATABASE_URL_APP ?? '') {
  if (!url) throw new Error('DATABASE_URL_APP is required')
  const client = postgres(url)
  return drizzle(client, { schema, casing: 'snake_case' })
}

/**
 * Run `fn` inside a transaction with `app.current_user_id` set to the
 * given user id (or left unset for anonymous access). The GUC is read
 * by every RLS policy, so all queries inside `fn` are scoped to this
 * user's permissions.
 *
 * Pass `null` for unauthenticated requests — RLS policies that check
 * `current_setting('app.current_user_id', true)` return NULL and the
 * query is filtered accordingly (public SELECTs still work, writes
 * that require a matching user fail).
 */
export async function withAppUser<T>(
  db: Database,
  userId: string | null,
  fn: (tx: Parameters<Parameters<Database['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (userId) {
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`)
    }
    return fn(tx)
  })
}

export { schema }
export * from './schema.js'
