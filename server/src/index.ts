import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { attachWebSocket } from './websocket.js'

const PORT = Number(process.env.SERVER_PORT ?? 1078)
// Bind to all interfaces in containers; default to loopback-ish only on dev
const HOST = process.env.SERVER_HOST ?? '0.0.0.0'

const app = new Hono()

app.get('/', (c) => c.text('Radio for the People — WS relay'))
app.get('/health', (c) => c.json({ ok: true }))
app.get('/ws/health', (c) => c.json({ ok: true }))

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`[server] listening on http://${HOST}:${info.port}`)
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url ?? '/', `http://${req.headers.host}`)
  if (pathname !== '/ws') {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

attachWebSocket(wss)

// Graceful shutdown so in-flight broadcasts flush to disk and
// listeners get a clean close rather than a TCP reset.
function shutdown(signal: string) {
  console.log(`[server] ${signal} received, shutting down`)
  wss.clients.forEach((c) => {
    try {
      c.close(1001, 'Server shutting down')
    } catch {}
  })
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
