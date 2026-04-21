// Production entry: wraps the TanStack Start build output
// (`dist/server/server.js` exporting { fetch }) in a Node HTTP server.
// Dev uses `vite dev` directly; this file is only for the container.
import { serve } from '@hono/node-server'
import server from './dist/server/server.js'
import { runBootstrap } from './migrate.mjs'

const port = Number(process.env.PORT ?? process.env.APP_PORT ?? 3000)
const hostname = process.env.HOST ?? '0.0.0.0'

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

const httpServer = serve({ fetch: server.fetch, port, hostname }, (info) => {
  console.log(`[app] listening on http://${hostname}:${info.port}`)
})

function shutdown(signal) {
  console.log(`[app] ${signal} received, shutting down`)
  httpServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
