import { Link, createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { fetchShowBySlug } from '../server-fns'

export const Route = createFileRoute('/$slug/broadcast')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/login' })
  },
  loader: async ({ params }) => {
    const show = await fetchShowBySlug({ data: params.slug })
    if (!show) throw notFound()
    if (show.viewerRole !== 'owner' && show.viewerRole !== 'cohost') {
      throw redirect({ to: '/$slug', params: { slug: params.slug } })
    }
    return { show }
  },
  component: BroadcastConsole,
})

const WS_URL =
  typeof window !== 'undefined'
    ? (import.meta.env.VITE_WS_URL ?? 'ws://localhost:1078')
    : 'ws://localhost:1078'

type Status = 'idle' | 'connecting' | 'live' | 'error'

function BroadcastConsole() {
  const { show } = Route.useLoaderData()
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      stopBroadcast()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function goLive() {
    setError(null)
    setStatus('connecting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      streamRef.current = stream

      const ws = new WebSocket(
        `${WS_URL}/ws?show=${encodeURIComponent(show.slug)}&role=broadcaster`,
      )
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        const recorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 128_000,
        })
        recorderRef.current = recorder
        recorder.ondataavailable = async (ev) => {
          if (ev.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(await ev.data.arrayBuffer())
          }
        }
        recorder.start(250)
        startedAtRef.current = Date.now()
        tickRef.current = setInterval(() => {
          setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
        }, 1000)
        setStatus('live')
      }

      ws.onerror = () => {
        setError('WebSocket error')
        setStatus('error')
      }
      ws.onclose = (ev) => {
        if (ev.code === 1008) setError(ev.reason || 'Not authorized to broadcast')
        setStatus((s) => (s === 'live' ? 'idle' : s))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  function stopBroadcast() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    wsRef.current?.close()
    wsRef.current = null
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = null
    setElapsed(0)
    setStatus('idle')
  }

  return (
    <main style={{ fontFamily: 'system-ui', padding: '3rem', maxWidth: 640 }}>
      <p style={{ color: '#666', marginBottom: 0 }}>
        <Link to="/$slug" params={{ slug: show.slug }}>
          ← {show.name}
        </Link>
      </p>
      <h1 style={{ marginTop: '0.5rem' }}>Broadcast: {show.name}</h1>

      <p>
        Status: <strong>{status}</strong>
        {status === 'live' && ` · ${formatDuration(elapsed)}`}
      </p>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}

      {status === 'live' ? (
        <button onClick={stopBroadcast}>Stop</button>
      ) : (
        <button onClick={goLive} disabled={status === 'connecting'}>
          {status === 'connecting' ? 'Connecting…' : 'Go Live'}
        </button>
      )}

      <p style={{ color: '#666', fontSize: '0.875rem', marginTop: '2rem' }}>
        Listeners can tune in at{' '}
        <Link to="/$slug" params={{ slug: show.slug }}>
          /{show.slug}
        </Link>
        .
      </p>
    </main>
  )
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
