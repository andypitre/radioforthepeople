# syntax=docker/dockerfile:1.7
# Build the TanStack Start app as a portable runtime image.
# Build from the monorepo root:
#   docker build --platform linux/amd64 -t <registry>/<name>:<tag> -f app/Dockerfile .

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /work

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json ./app/
COPY server/package.json ./server/
COPY db/package.json ./db/
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY db ./db
COPY app ./app
RUN pnpm --filter app build

# ---------- deploy (prod-only, self-contained) ----------
# `pnpm deploy` copies the package + resolves all workspace deps into a
# plain node_modules so the runtime stage doesn't need the monorepo layout.
FROM build AS pkg
RUN pnpm --filter app deploy --prod /out

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=pkg /out/package.json ./package.json
COPY --from=pkg /out/node_modules ./node_modules
COPY --from=build /work/app/dist ./dist
COPY --from=build /work/app/serve.mjs ./serve.mjs
COPY --from=build /work/app/migrate.mjs ./migrate.mjs
# Ship migration SQL files so `node migrate.mjs` in this pod can apply
# schema updates without a separate CI job.
COPY --from=build /work/db/migrations ./migrations
EXPOSE 3000
CMD ["node", "serve.mjs"]
