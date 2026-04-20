#!/bin/bash
# Runs once on first container startup, after Postgres initializes the
# superuser (POSTGRES_USER=rftp) and the database (POSTGRES_DB=radioforthepeople).
# Creates the non-superuser app role that our services connect as, so RLS
# policies actually enforce.
set -e

: "${RFTP_APP_PASSWORD:?RFTP_APP_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rftp_app') THEN
      CREATE ROLE rftp_app LOGIN PASSWORD '${RFTP_APP_PASSWORD}';
    END IF;
  END \$\$;

  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO rftp_app;
  GRANT USAGE ON SCHEMA public TO rftp_app;

  ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rftp_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO rftp_app;
EOSQL
