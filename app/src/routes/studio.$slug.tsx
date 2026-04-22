import { Link, createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { fetchShowBySlug } from '../server-fns'
import { getWsUrl } from '../lib/ws-url'

export const Route = createFileRoute('/studio/$slug')({
  loader: async ({ params }) => {
    const show = await fetchShowBySlug({ data: params.slug })
    if (!show) throw notFound()
    if (show.viewerRole !== 'owner' && show.viewerRole !== 'cohost') {
      // Not a member — send them to the public listen page
      throw redirect({ to: '/$slug', params: { slug: params.slug } })
    }
    return { show }
  },
  component: StudioShow,
})

type Status = 'idle' | 'connecting' | 'live' | 'error'

function StudioShow() {
  const { show } = Route.useLoaderData()
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
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
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // Grab as many channels as the interface exposes (Volt 476 has 4,
          // some 8-input boxes have 8). Chrome clamps to what the device
          // advertises, so `ideal: 8` is safe — interfaces with fewer
          // channels just return what they have.
          channelCount: { ideal: 8 },
          sampleRate: { ideal: 48000 },
        },
      })
      streamRef.current = rawStream

      // Downmix multichannel inputs to a stereo track for MediaRecorder,
      // which only encodes 2 channels of Opus. We sum every input channel
      // into both L and R — the broadcaster's own mixer is responsible
      // for stereo/panning before it reaches the USB bus. If we skipped
      // this step, Chrome would keep only channels 1+2 and silently drop
      // everything else.
      const trackChannels =
        rawStream.getAudioTracks()[0]?.getSettings().channelCount ?? 2
      let stream = rawStream
      if (trackChannels > 2) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext
        const ctx = new AudioCtx({ sampleRate: 48000 })
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(rawStream)
        const splitter = ctx.createChannelSplitter(trackChannels)
        const merger = ctx.createChannelMerger(2)
        source.connect(splitter)
        for (let i = 0; i < trackChannels; i++) {
          splitter.connect(merger, i, 0)
          splitter.connect(merger, i, 1)
        }
        const dest = ctx.createMediaStreamDestination()
        merger.connect(dest)
        stream = dest.stream
        console.log(`[broadcast] mixing ${trackChannels} input channels → stereo`)
      }

      const ws = new WebSocket(
        `${getWsUrl()}/ws?show=${encodeURIComponent(show.slug)}&role=broadcaster`,
      )
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        try {
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
          recorder.onerror = (ev) => {
            const e = (ev as unknown as { error?: Error }).error
            setError(`Recorder error: ${e?.message ?? 'unknown'}`)
            stopBroadcast()
          }
          recorder.start(250)
          startedAtRef.current = Date.now()
          tickRef.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
          }, 1000)
          setStatus('live')
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          stopBroadcast()
        }
      }

      ws.onerror = () => {
        // Browsers fire this for transient issues too — don't tear
        // down the working connection here. onclose will follow if
        // it's actually dead.
        setError('WebSocket error')
      }
      ws.onclose = (ev) => {
        if (ev.code === 1008) setError(ev.reason || 'Not authorized to broadcast')
        // Only clean up on actual close. Prevents closing a live WS
        // because of a spurious onerror event.
        stopBroadcast()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      stopBroadcast()
    }
  }

  function stopBroadcast() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
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
        <Link to="/studio">← Studio</Link>
      </p>
      <h1 style={{ marginTop: '0.5rem' }}>{show.name}</h1>

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
        <Link
          to="/$slug"
          params={{ slug: show.slug }}
          target="_blank"
          rel="noopener noreferrer"
        >
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
