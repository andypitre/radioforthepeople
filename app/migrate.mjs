// Idempotent DB bootstrap + migrations. Runs on every app pod startup
// via serve.mjs — a fresh Postgres pod self-bootstraps without any
// manual steps. Safe to run repeatedly; each step is a no-op if
// already applied.
//
// Required env vars (both admin creds, so migrations can CREATE/ALTER):
//   DATABASE_URL        — rftp admin role
//   RFTP_APP_PASSWORD   — password for the non-superuser runtime role
//
// Can also be invoked standalone: `node migrate.mjs`.
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export async function runBootstrap() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL (admin) is required for bootstrap')
  const appPassword = process.env.RFTP_APP_PASSWORD
  if (!appPassword) throw new Error('RFTP_APP_PASSWORD is required for bootstrap')
  // We have to interpolate the password into CREATE/ALTER ROLE (no
  // parameterized form exists). Reject anything that could break out of
  // the string literal.
  if (/['\\]/.test(appPassword)) {
    throw new Error('RFTP_APP_PASSWORD must not contain quotes or backslashes')
  }

  const parsed = new URL(url)
  const dbName = parsed.pathname.replace(/^\//, '') || 'postgres'
  const adminUser = parsed.username

  const client = postgres(url, { max: 1, connect_timeout: 10 })

  // Wait for Postgres to be reachable — on a fresh deploy the app pod
  // can come up before the db pod has finished initializing.
  const maxAttempts = 30
  for (let attempt = 1; ; attempt++) {
    try {
      await client`SELECT 1`
      break
    } catch (err) {
      if (attempt >= maxAttempts) throw err
      console.log(`[bootstrap] waiting for postgres (attempt ${attempt}/${maxAttempts})`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  try {
    console.log('[bootstrap] ensuring rftp_app role')
    await client.unsafe(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rftp_app') THEN
          ALTER ROLE rftp_app LOGIN PASSWORD '${appPassword}';
        ELSE
          CREATE ROLE rftp_app LOGIN PASSWORD '${appPassword}';
        END IF;
      END $$;
    `)

    console.log('[bootstrap] running migrations')
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: './migrations' })

    console.log('[bootstrap] granting privileges to rftp_app')
    await client.unsafe(`
      GRANT CONNECT ON DATABASE "${dbName}" TO rftp_app;
      GRANT USAGE ON SCHEMA public TO rftp_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rftp_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rftp_app;
      ALTER DEFAULT PRIVILEGES FOR ROLE "${adminUser}" IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rftp_app;
      ALTER DEFAULT PRIVILEGES FOR ROLE "${adminUser}" IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO rftp_app;
    `)

    console.log('[bootstrap] done')
  } finally {
    await client.end()
  }
}

// Allow running as a standalone script.
if (import.meta.url === `file://${process.argv[1]}`) {
  await runBootstrap()
}
