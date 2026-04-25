import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { attachWebSocket } from './websocket.js'
import { HLS_ROOT } from './hls.js'

const PORT = Number(process.env.SERVER_PORT ?? 1078)
// Bind to all interfaces in containers; default to loopback-ish only on dev
const HOST = process.env.SERVER_HOST ?? '0.0.0.0'

const app = new Hono()

app.get('/', (c) => c.text('Radio for the People — WS relay'))
app.get('/health', (c) => c.json({ ok: true }))
app.get('/ws/health', (c) => c.json({ ok: true }))

// HLS playlist + segment serving for the listener <audio> tag.
// Path shape mirrors the WS mount so the same Nexlayer ingress rule
// (path: /ws) routes the requests here. iOS Safari hits these as
// plain HTTP, so we serve them directly off /tmp/hls/{slug}/.
app.on(['GET', 'HEAD'], '/ws/hls/:slug/:file', async (c) => {
  const { slug, file } = c.req.param()
  // Reject path traversal and unexpected extensions up front.
  if (slug.includes('/') || slug.includes('..') || file.includes('/') || file.includes('..')) {
    return c.text('Bad request', 400)
  }
  const ext = file.endsWith('.m3u8')
    ? 'application/vnd.apple.mpegurl'
    : file.endsWith('.ts')
      ? 'video/mp2t'
      : file.endsWith('.m4s') || file.endsWith('.mp4')
        ? 'video/mp4'
        : null
  if (!ext) return c.text('Bad request', 400)

  const path = resolve(HLS_ROOT, slug, file)
  try {
    await stat(path)
    const body = await readFile(path)
    return new Response(body, {
      headers: {
        'content-type': ext,
        // Always re-fetch the playlist so listeners see the live tail;
        // segments are immutable per name but expire fast, no-cache
        // keeps things simple while we're small.
        'cache-control': 'no-cache',
        // hls.js fetches via XHR, so cross-origin (dev split-port; or
        // any embed of the player elsewhere) needs CORS. Recordings
        // are already public, no auth involved here.
        'access-control-allow-origin': '*',
      },
    })
  } catch {
    // No playlist yet → broadcast is offline. The listener page polls
    // this and shows an offline state on 404.
    return new Response('Not live', {
      status: 404,
      headers: { 'access-control-allow-origin': '*' },
    })
  }
})

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
