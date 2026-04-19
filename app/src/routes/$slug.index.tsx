import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { fetchShowBySlug } from '../server-fns'

export const Route = createFileRoute('/$slug/')({
  loader: async ({ params }) => {
    const show = await fetchShowBySlug({ data: params.slug })
    if (!show) throw notFound()
    return { show }
  },
  component: ShowPage,
  notFoundComponent: () => (
    <main style={{ fontFamily: 'system-ui', padding: '3rem', maxWidth: 640 }}>
      <h1>Show not found</h1>
      <p>
        <Link to="/">Back home</Link>
      </p>
    </main>
  ),
})

const WS_URL =
  typeof window !== 'undefined'
    ? (import.meta.env.VITE_WS_URL ?? 'ws://localhost:1078')
    : 'ws://localhost:1078'

type Status = 'offline' | 'connecting' | 'live'

function ShowPage() {
  const { show } = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const canBroadcast = show.viewerRole === 'owner' || show.viewerRole === 'cohost'

  const [status, setStatus] = useState<Status>('offline')
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const mediaSourceRef = useRef<MediaSource | null>(null)
  const sourceBufferRef = useRef<SourceBuffer | null>(null)
  const queueRef = useRef<ArrayBuffer[]>([])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const ms = new MediaSource()
    mediaSourceRef.current = ms
    audio.src = URL.createObjectURL(ms)

    ms.addEventListener('sourceopen', () => {
      const sb = ms.addSourceBuffer('audio/webm;codecs=opus')
      sourceBufferRef.current = sb
      sb.mode = 'sequence'
      sb.addEventListener('updateend', drainQueue)
      openSocket()
    })

    return () => {
      wsRef.current?.close()
      wsRef.current = null
      try {
        if (ms.readyState === 'open') ms.endOfStream()
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.slug])

  function drainQueue() {
    const sb = sourceBufferRef.current
    if (!sb || sb.updating) return
    const next = queueRef.current.shift()
    if (next) sb.appendBuffer(next)
  }

  function openSocket() {
    setStatus('connecting')
    const ws = new WebSocket(
      `${WS_URL}/ws?show=${encodeURIComponent(show.slug)}&role=listener`,
    )
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => setStatus('live')
    ws.onerror = () => setError('WebSocket error')
    ws.onclose = () => setStatus('offline')
    ws.onmessage = (ev) => {
      if (!(ev.data instanceof ArrayBuffer)) return
      const sb = sourceBufferRef.current
      if (!sb) return
      if (sb.updating || queueRef.current.length) {
        queueRef.current.push(ev.data)
      } else {
        sb.appendBuffer(ev.data)
      }
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui', padding: '3rem', maxWidth: 640 }}>
      <p style={{ color: '#666', marginBottom: 0 }}>
        <Link to="/">← Radio for the People</Link>
      </p>
      <h1 style={{ marginTop: '0.5rem' }}>{show.name}</h1>
      {show.description && <p>{show.description}</p>}

      <p>
        Status: <strong>{status}</strong>
      </p>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}

      <audio ref={audioRef} controls autoPlay style={{ width: '100%' }} />

      {canBroadcast && (
        <p style={{ marginTop: '2rem' }}>
          <Link to="/$slug/broadcast" params={{ slug: show.slug }}>
            Broadcast this show →
          </Link>
        </p>
      )}

      {!user && (
        <p style={{ color: '#666', marginTop: '2rem', fontSize: '0.875rem' }}>
          <Link to="/login">Sign in</Link> to create your own show.
        </p>
      )}
    </main>
  )
}
