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

export function attachWebSocket(wss: WebSocketServer) {
  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const role = url.searchParams.get('role')
    const slug = url.searchParams.get('show')

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
  if (room.broadcaster && room.broadcaster.readyState === WebSocket.OPEN) {
    ws.close(1008, 'A broadcaster is already live')
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
    room.broadcaster = null
    room.recording?.end()
    room.recording = null
    room.recordingPath = null
    room.initChunk = null
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
