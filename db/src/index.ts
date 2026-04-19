import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export function createDb(url: string = process.env.DATABASE_URL ?? '') {
  if (!url) throw new Error('DATABASE_URL is required')
  const client = postgres(url)
  return drizzle(client, { schema, casing: 'snake_case' })
}

export type Database = ReturnType<typeof createDb>
export { schema }
