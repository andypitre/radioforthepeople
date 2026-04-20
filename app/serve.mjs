// Production entry: wraps the TanStack Start build output
// (`dist/server/server.js` exporting { fetch }) in a Node HTTP server.
// Dev uses `vite dev` directly; this file is only for the container.
import { serve } from '@hono/node-server'
import server from './dist/server/server.js'

const port = Number(process.env.PORT ?? process.env.APP_PORT ?? 3000)
const hostname = process.env.HOST ?? '0.0.0.0'

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
