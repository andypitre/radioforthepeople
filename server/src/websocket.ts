import type { IncomingMessage } from 'node:http'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { resolve } from 'node:path'
import { WebSocket, type WebSocketServer } from 'ws'
import { canBroadcast, getUserIdFromHeaders } from './auth.js'

const RECORDINGS_DIR = resolve(process.cwd(), 'recordings')

type Room = {
  slug: string
  broadcaster: WebSocket | null
  listeners: Set<WebSocket>
  recording: WriteStream | null
  recordingPath: string | null
  // First MediaRecorder chunk carries the WebM init segment — new listeners
  // that join mid-broadcast need it to decode anything.
  initChunk: Buffer | null
}

const rooms = new Map<string, Room>()

function getOrCreateRoom(slug: string): Room {
  let room = rooms.get(slug)
  if (!room) {
    room = {
      slug,
      broadcaster: null,
      listeners: new Set(),
      recording: null,
      recordingPath: null,
      initChunk: null,
    }
    rooms.set(slug, room)
  }
  return room
}

function maybeReleaseRoom(slug: string) {
  const room = rooms.get(slug)
  if (!room) return
  if (!room.broadcaster && room.listeners.size === 0) {
    rooms.delete(slug)
  }
}

function broadcastStatus(room: Room) {
  const payload = JSON.stringify({ type: 'status', live: !!room.broadcaster })
  for (const l of room.listeners) {
    if (l.readyState === WebSocket.OPEN) l.send(payload)
  }
}

// Mark type for our WS with a liveness flag the heartbeat updates.
type LiveWebSocket = WebSocket & { isAlive?: boolean }

export function attachWebSocket(wss: WebSocketServer) {
  wss.on('connection', async (raw, req) => {
    const ws = raw as LiveWebSocket
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const role = url.searchParams.get('role')
    const slug = url.searchParams.get('show')
    const cookieHeader = req.headers.cookie ?? ''
    console.log(
      `[ws] upgrade role=${role} show=${slug} cookie_len=${cookieHeader.length} has_session=${cookieHeader.includes('rftp_session=')} origin=${req.headers.origin ?? '-'} xff=${req.headers['x-forwarded-for'] ?? '-'}`,
    )

    ws.isAlive = true
    ws.on('pong', () => {
      ws.isAlive = true
    })

    if (!slug) {
      ws.close(1008, 'Missing show')
      return
    }

    if (role === 'broadcaster') {
      await handleBroadcaster(ws, req, slug)
    } else {
      handleListener(ws, slug)
    }
  })

  // Heartbeat: every 30s, ping every connection. Anything that didn't
  // pong since the last tick gets terminated. Catches dead TCPs that
  // the ingress kept alive with its own keepalives but whose client
  // is long gone — without this, orphan broadcaster connections
  // block legitimate reconnect attempts.
  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      const w = client as LiveWebSocket
      if (w.isAlive === false) {
        console.log('[ws] terminating dead connection')
        w.terminate()
        return
      }
      w.isAlive = false
      try {
        w.ping()
      } catch {
        // ignore — terminate will catch it next tick
      }
    })
  }, 30_000)
  wss.on('close', () => clearInterval(interval))
}

async function handleBroadcaster(
  ws: WebSocket,
  req: IncomingMessage,
  slug: string,
) {
  const userId = getUserIdFromHeaders(req.headers.cookie)
  if (!userId) {
    ws.close(1008, 'Sign in required')
    return
  }
  try {
    const allowed = await canBroadcast(userId, slug)
    if (!allowed) {
      ws.close(1008, 'Not a member of this show')
      return
    }
  } catch (err) {
    console.error('[ws] auth check failed', err)
    ws.close(1011, 'Auth check failed')
    return
  }

  const room = getOrCreateRoom(slug)
  // Nexlayer's ingress currently duplicates each upgrade (one upgrade
  // from the browser turns into two TCPs reaching this pod). If we
  // close the "extra" one, that close propagates back through the
  // ingress to the browser and kills the real WS.
  //
  // Strategy: the first accepted broadcaster wins; any subsequent
  // connections for a room that already has a live broadcaster are
  // silently ignored — no close frame, no handlers, no state change.
  // The idle duplicate sits until the heartbeat terminates it for
  // missing pongs. Works for both the ingress-duplication case and
  // the legitimate "someone else is on air" case.
  if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
    console.log(`[ws] duplicate broadcaster for "${slug}" — leaving idle`)
    return
  }
  room.broadcaster = ws

  const showDir = resolve(RECORDINGS_DIR, slug)
  mkdirSync(showDir, { recursive: true })
  room.recordingPath = resolve(
    showDir,
    `${new Date().toISOString().replace(/[:.]/g, '-')}.webm`,
  )
  room.recording = createWriteStream(room.recordingPath)
  console.log(`[ws] broadcaster for "${slug}" connected → ${room.recordingPath}`)
  broadcastStatus(room)

  ws.on('message', (data, isBinary) => {
    if (!isBinary) return
    const chunk = data as Buffer
    if (!room.initChunk) room.initChunk = chunk
    room.recording?.write(chunk)
    for (const l of room.listeners) {
      if (l.readyState === WebSocket.OPEN) l.send(chunk, { binary: true })
    }
  })

  ws.on('close', () => {
    console.log(`[ws] broadcaster for "${slug}" disconnected`)
    // If we've already been replaced by a newer broadcaster, the room
    // now points at that one — don't clobber its state.
    if (room.broadcaster !== ws) return
    room.broadcaster = null
    room.recording?.end()
    room.recording = null
    room.recordingPath = null
    room.initChunk = null
    broadcastStatus(room)
    for (const l of room.listeners) {
      if (l.readyState === WebSocket.OPEN) l.close(1000, 'Stream ended')
    }
    maybeReleaseRoom(slug)
  })

  ws.on('error', (err) =>
    console.error(`[ws] broadcaster error for "${slug}"`, err),
  )
}

function handleListener(ws: WebSocket, slug: string) {
  const room = getOrCreateRoom(slug)
  room.listeners.add(ws)
  console.log(
    `[ws] listener for "${slug}" connected (${room.listeners.size} total)`,
  )
  // Send initial status so the client doesn't assume live.
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'status', live: !!room.broadcaster }))
  }
  if (room.initChunk && ws.readyState === WebSocket.OPEN) {
    ws.send(room.initChunk, { binary: true })
  }

  ws.on('close', () => {
    room.listeners.delete(ws)
    console.log(
      `[ws] listener for "${slug}" disconnected (${room.listeners.size} remaining)`,
    )
    maybeReleaseRoom(slug)
  })

  ws.on('error', (err) => console.error(`[ws] listener error for "${slug}"`, err))
}
