// Production entry: wraps the TanStack Start build output
// (`dist/server/server.js` exporting { fetch }) in a Node HTTP server.
// Dev uses `vite dev` directly; this file is only for the container.
import { serve } from '@hono/node-server'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import server from './dist/server/server.js'
import { runBootstrap } from './migrate.mjs'

const port = Number(process.env.PORT ?? process.env.APP_PORT ?? 3000)
const hostname = process.env.HOST ?? '0.0.0.0'

const CLIENT_DIR = resolve('./dist/client')

// Bootstrap the DB before accepting traffic: creates the rftp_app
// runtime role and applies pending migrations. Idempotent — runs
// every boot, no-ops on an already-migrated schema. Crashing the
// pod on failure is preferable to serving against a broken schema.
try {
  await runBootstrap()
} catch (err) {
  console.error('[app] bootstrap failed, exiting', err)
  process.exit(1)
}

function contentTypeFor(path) {
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'application/javascript; charset=utf-8'
  if (path.endsWith('.css')) return 'text/css; charset=utf-8'
  if (path.endsWith('.json')) return 'application/json; charset=utf-8'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.woff2')) return 'font/woff2'
  if (path.endsWith('.woff')) return 'font/woff'
  if (path.endsWith('.ico')) return 'image/x-icon'
  if (path.endsWith('.map')) return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

async function serveStatic(pathname) {
  // Strip leading slash and reject any traversal attempts.
  const rel = pathname.replace(/^\/+/, '')
  if (rel.includes('..')) return null
  const filePath = join(CLIENT_DIR, rel)
  try {
    const s = await stat(filePath)
    if (!s.isFile()) return null
    const body = await readFile(filePath)
    return new Response(body, {
      headers: {
        'Content-Type': contentTypeFor(filePath),
        // Vite emits content-hashed filenames under /assets, so they're
        // safe to cache aggressively.
        'Cache-Control': pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
      },
    })
  } catch {
    return null
  }
}

// Paths that live in dist/client/ and should be served as static files
// before falling through to the SSR/API handler.
const STATIC_PREFIXES = ['/assets/', '/favicon.']

async function fetchWithStatic(request) {
  const url = new URL(request.url)
  for (const prefix of STATIC_PREFIXES) {
    if (url.pathname.startsWith(prefix)) {
      const resp = await serveStatic(url.pathname)
      if (resp) return resp
      break
    }
  }
  return server.fetch(request)
}

const httpServer = serve({ fetch: fetchWithStatic, port, hostname }, (info) => {
  console.log(`[app] listening on http://${hostname}:${info.port}`)
})

function shutdown(signal) {
  console.log(`[app] ${signal} received, shutting down`)
  httpServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
