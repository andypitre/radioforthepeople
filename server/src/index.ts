import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { attachWebSocket } from './websocket.js'

const PORT = Number(process.env.SERVER_PORT ?? 1078)

const app = new Hono()

app.get('/', (c) => c.text('Radio for the People — WS relay'))
app.get('/health', (c) => c.json({ ok: true }))

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`)
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
