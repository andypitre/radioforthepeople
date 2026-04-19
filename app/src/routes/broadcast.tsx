import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/broadcast')({
  component: Broadcast,
})

const WS_URL =
  typeof window !== 'undefined'
    ? (import.meta.env.VITE_WS_URL ?? 'ws://localhost:1078')
    : 'ws://localhost:1078'

type Status = 'idle' | 'connecting' | 'live' | 'error'

function Broadcast() {
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

      const ws = new WebSocket(`${WS_URL}/ws?role=broadcaster`)
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
      ws.onclose = () => {
        if (status === 'live') setStatus('idle')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  function stopBroadcast() {
    recorderRef.current?.state === 'recording' && recorderRef.current.stop()
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
      <h1>Broadcast</h1>
      <p>Status: <strong>{status}</strong>{status === 'live' && ` · ${formatDuration(elapsed)}`}</p>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {status === 'live' ? (
        <button onClick={stopBroadcast}>Stop</button>
      ) : (
        <button onClick={goLive} disabled={status === 'connecting'}>
          {status === 'connecting' ? 'Connecting…' : 'Go Live'}
        </button>
      )}
    </main>
  )
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
