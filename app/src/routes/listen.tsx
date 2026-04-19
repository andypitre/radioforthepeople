import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/listen')({
  component: Listen,
})

const WS_URL =
  typeof window !== 'undefined'
    ? (import.meta.env.VITE_WS_URL ?? 'ws://localhost:1078')
    : 'ws://localhost:1078'

type Status = 'offline' | 'connecting' | 'live'

function Listen() {
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
  }, [])

  function drainQueue() {
    const sb = sourceBufferRef.current
    if (!sb || sb.updating) return
    const next = queueRef.current.shift()
    if (next) sb.appendBuffer(next)
  }

  function openSocket() {
    setStatus('connecting')
    const ws = new WebSocket(`${WS_URL}/ws?role=listener`)
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
      <h1>Listen</h1>
      <p>Status: <strong>{status}</strong></p>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      <audio ref={audioRef} controls autoPlay />
    </main>
  )
}
