import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { fetchShowBySlug } from '../server-fns'
import { getHttpServerUrl } from '../lib/ws-url'

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
    const onCanPlay = () => setReady(true)
    audio.addEventListener('canplay', onCanPlay)

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
      setReady(false)
      cleanup()
    }
  }, [hlsUrl, status])

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

      <p>
        Status: <strong>{status === 'live' && !ready ? 'connecting…' : status}</strong>
      </p>

      <audio
        ref={audioRef}
        controls
        autoPlay
        style={{
          width: '100%',
          opacity: ready ? 1 : 0.4,
          pointerEvents: ready ? 'auto' : 'none',
        }}
      />

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
