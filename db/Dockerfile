# syntax=docker/dockerfile:1.7
# Custom Postgres image that bootstraps the rftp_app non-superuser role
# for RLS enforcement. The main admin role (rftp) is created by the
# base postgres image from POSTGRES_USER at startup. This image adds
# an init script that runs once to create rftp_app and grants.
#
# Build from the monorepo root:
#   docker build --platform linux/amd64 -t <registry>/<name>:<tag> -f db/Dockerfile db

FROM postgres:16
COPY init-prod/10-app-role.sh /docker-entrypoint-initdb.d/10-app-role.sh
RUN chmod +x /docker-entrypoint-initdb.d/10-app-role.sh
