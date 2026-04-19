-- One-time Postgres bootstrap for radioforthepeople.
-- Run once on a fresh Postgres instance as a superuser:
--
--   psql -h localhost postgres -f db/setup.sql
--
-- After that, migrations are applied with `pnpm db:migrate`.

-- Admin role (owns migrations). Password is placeholder for local dev
-- only; use a real secret in production via env vars.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rftp') THEN
    CREATE ROLE rftp LOGIN PASSWORD 'rftp' CREATEDB;
  END IF;
END $$;

-- App role (runtime). Non-superuser so RLS enforces.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rftp_app') THEN
    CREATE ROLE rftp_app LOGIN PASSWORD 'rftp_app';
  END IF;
END $$;

-- Database
SELECT 'CREATE DATABASE radioforthepeople OWNER rftp'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'radioforthepeople')
\gexec

-- Schema-level grants for the app role, scoped to the app DB.
\connect radioforthepeople

GRANT CONNECT ON DATABASE radioforthepeople TO rftp_app;
GRANT USAGE ON SCHEMA public TO rftp_app;

-- Future tables/sequences created by the rftp role auto-grant
-- read/write to rftp_app, so migrations don't need to re-grant.
ALTER DEFAULT PRIVILEGES FOR ROLE rftp IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rftp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rftp IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rftp_app;
