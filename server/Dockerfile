# syntax=docker/dockerfile:1.7
# Build the Hono WebSocket relay as a portable runtime image.
# Uses tsx at runtime so TS sources from the shared `db` workspace
# package can be imported directly (no separate build step needed).
# Build from the monorepo root:
#   docker build --platform linux/amd64 -t <registry>/<name>:<tag> -f server/Dockerfile .

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

# ---------- deploy (prod-only, self-contained) ----------
FROM deps AS pkg
COPY tsconfig.base.json ./
COPY db ./db
COPY server ./server
RUN pnpm --filter server deploy --prod /out

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV SERVER_PORT=1078
ENV SERVER_HOST=0.0.0.0
# ffmpeg transcodes WebM/Opus → HLS (AAC fMP4) for mobile listeners
# (iOS Safari, etc.) that don't have MediaSource for WebM.
RUN apk add --no-cache ffmpeg
COPY --from=pkg /out/package.json ./package.json
COPY --from=pkg /out/node_modules ./node_modules
COPY --from=pkg /out/src ./src
COPY --from=pkg /out/tsconfig.json ./tsconfig.json
RUN mkdir -p /app/recordings
EXPOSE 1078
# tsx is a runtime dep; resolves TS imports (including the shared db
# workspace package) without a separate build step.
CMD ["node_modules/.bin/tsx", "src/index.ts"]
