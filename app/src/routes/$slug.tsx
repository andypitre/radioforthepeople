import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { fetchShowBySlug } from '../server-fns'
import { getHttpServerUrl } from '../lib/ws-url'
import { formatSchedule } from '../lib/schedule'

export const Route = createFileRoute('/$slug')({
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

type Status = 'offline' | 'live'

function ShowPage() {
  const { show } = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const canBroadcast = show.viewerRole === 'owner' || show.viewerRole === 'cohost'

  const [status, setStatus] = useState<Status>('offline')
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Build the HLS playlist URL once we're in the browser. Same-origin
  // in production (the ingress routes /ws to the server pod), and a
  // separate http://localhost:1078 in dev.
  const [hlsUrl, setHlsUrl] = useState<string | null>(null)
  useEffect(() => {
    setHlsUrl(`${getHttpServerUrl()}/ws/hls/${encodeURIComponent(show.slug)}/live.m3u8`)
  }, [show.slug])

  // Wire the playlist into the <audio> element only when the show is
  // live. Mounting hls.js against a 404 playlist makes it give up after
  // a default retry; tearing down on offline + re-attaching on live
  // keeps it healthy across stop/start cycles. Safari (and iOS) play
  // .m3u8 natively, so just set src directly there.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !hlsUrl || status !== 'live') return

    setReady(false)
    setPlaying(false)
    const onCanPlay = () => setReady(true)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)

    // Order matters: prefer hls.js where supported (Chrome/Firefox/etc),
    // fall back to native-HLS only on browsers without MSE (iOS Safari).
    // Chrome's canPlayType('application/vnd.apple.mpegurl') returns
    // "maybe" — truthy — but its demuxer can't actually parse HLS, so
    // taking the native path there yields DEMUXER_ERROR_COULD_NOT_PARSE.
    let cleanup: () => void = () => {}
    if (Hls.isSupported()) {
      const hls = new Hls()
      hls.loadSource(hlsUrl)
      hls.attachMedia(audio)
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        console.error('[listener] hls error', data)
      })
      cleanup = () => hls.destroy()
    } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      audio.src = hlsUrl
      cleanup = () => {
        audio.removeAttribute('src')
        audio.load()
      }
    }

    return () => {
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      setReady(false)
      setPlaying(false)
      cleanup()
    }
  }, [hlsUrl, status])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      const p = audio.play()
      if (p) p.catch(() => {})
    } else {
      audio.pause()
    }
  }

  // Poll the playlist for liveness. The server returns 404 when the
  // broadcaster is offline (the playlist file gets cleaned up shortly
  // after stop). HEAD is enough — we don't need the body to know.
  useEffect(() => {
    if (!hlsUrl) return
    let cancelled = false
    async function check() {
      try {
        const res = await fetch(hlsUrl!, { method: 'HEAD', cache: 'no-store' })
        if (!cancelled) setStatus(res.ok ? 'live' : 'offline')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }
    check()
    const id = setInterval(check, 5_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [hlsUrl])

  return (
    <main style={{ fontFamily: 'system-ui', padding: '3rem', maxWidth: 640 }}>
      <p style={{ color: '#666', marginBottom: 0 }}>
        <Link to="/">← Radio for the People</Link>
      </p>
      <h1 style={{ marginTop: '0.5rem' }}>{show.name}</h1>
      {show.description && <p>{show.description}</p>}
      {formatSchedule(show) && (
        <p style={{ color: '#444', fontStyle: 'italic' }}>
          {formatSchedule(show)}
        </p>
      )}

      <p>
        Status: <strong>{status === 'live' && !ready ? 'connecting…' : status}</strong>
      </p>

      {/* Hidden — hls.js needs a real <audio> element to attach to,
          but we don't want the native progress bar / scrubber for
          a live stream you can't seek. Custom button below. */}
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

      <button
        type="button"
        onClick={togglePlay}
        disabled={status !== 'live' || !ready}
        style={{
          padding: '0.75rem 2rem',
          fontSize: '1rem',
          fontFamily: 'inherit',
          background: '#111',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: status === 'live' && ready ? 'pointer' : 'not-allowed',
          opacity: status === 'live' && ready ? 1 : 0.4,
        }}
      >
        {playing ? '⏸ Pause' : '▶ Play'}
      </button>

      {canBroadcast && (
        <p style={{ marginTop: '2rem' }}>
          <Link to="/studio/$slug" params={{ slug: show.slug }}>
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
