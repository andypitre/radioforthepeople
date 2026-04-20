// Run Drizzle migrations against the configured database.
// Use DATABASE_URL (admin / rftp role) — migrations require CREATE/ALTER
// privileges that the runtime app role doesn't have.
//
// Trigger from local:
//   pnpm --filter app exec node migrate.mjs
//
// Or in a deployed pod:
//   nexlayer_debug_proxy_exec <app-pod> 'node migrate.mjs'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required (admin credentials)')
  process.exit(1)
}

const client = postgres(url, { max: 1 })
const db = drizzle(client)

await migrate(db, { migrationsFolder: './migrations' })
console.log('migrations applied')
await client.end()
