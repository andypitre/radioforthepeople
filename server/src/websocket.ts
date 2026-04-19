import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { resolve } from 'node:path'
import { WebSocket, type WebSocketServer } from 'ws'

type Role = 'broadcaster' | 'listener'

const RECORDINGS_DIR = resolve(process.cwd(), 'recordings')
mkdirSync(RECORDINGS_DIR, { recursive: true })

// MVP: single global broadcast. Rooms come later.
const listeners = new Set<WebSocket>()
let broadcaster: WebSocket | null = null
let recording: WriteStream | null = null
let recordingPath: string | null = null
// First MediaRecorder chunk carries the WebM init segment (EBML/Segment/codec).
// Late-joining listeners can't decode anything without it, so we cache it.
let initChunk: Buffer | null = null

export function attachWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const role = (url.searchParams.get('role') ?? 'listener') as Role

    if (role === 'broadcaster') {
      handleBroadcaster(ws)
    } else {
      handleListener(ws)
    }
  })
}

function handleBroadcaster(ws: WebSocket) {
  if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
    ws.close(1008, 'A broadcaster is already live')
    return
  }
  broadcaster = ws
  recordingPath = resolve(
    RECORDINGS_DIR,
    `${new Date().toISOString().replace(/[:.]/g, '-')}.webm`,
  )
  recording = createWriteStream(recordingPath)
  console.log(`[ws] broadcaster connected → ${recordingPath}`)

  ws.on('message', (data, isBinary) => {
    if (!isBinary) return
    const chunk = data as Buffer
    if (!initChunk) initChunk = chunk
    recording?.write(chunk)
    for (const l of listeners) {
      if (l.readyState === WebSocket.OPEN) l.send(chunk, { binary: true })
    }
  })

  ws.on('close', () => {
    console.log('[ws] broadcaster disconnected')
    broadcaster = null
    recording?.end()
    recording = null
    recordingPath = null
    initChunk = null
    for (const l of listeners) {
      if (l.readyState === WebSocket.OPEN) l.close(1000, 'Stream ended')
    }
  })

  ws.on('error', (err) => console.error('[ws] broadcaster error', err))
}

function handleListener(ws: WebSocket) {
  listeners.add(ws)
  console.log(`[ws] listener connected (${listeners.size} total)`)
  if (initChunk && ws.readyState === WebSocket.OPEN) {
    ws.send(initChunk, { binary: true })
  }

  ws.on('close', () => {
    listeners.delete(ws)
    console.log(`[ws] listener disconnected (${listeners.size} remaining)`)
  })

  ws.on('error', (err) => console.error('[ws] listener error', err))
}
