import { Link, createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  fetchShowBySlug,
  trackBroadcastEnded,
  trackBroadcastStarted,
} from '../server-fns'
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
  // Live-mute state — both sources flow into gain nodes; toggling
  // `muted` flips the gain between 0 and 1 without re-acquiring any
  // stream. Lets the broadcaster duck the mic while music plays or
  // mute the tab to talk clean.
  const [micMuted, setMicMuted] = useState(false)
  const [tabArmed, setTabArmed] = useState(false) // true once a tab has been picked
  const [tabMuted, setTabMuted] = useState(false)
  // Blinking indicator — toggled by an interval while status === 'live'
  const [blinkOn, setBlinkOn] = useState(true)
  // Audio-input picker state. deviceLabel is what we show in the UI
  // (Volt 476, MacBook Pro Microphone, etc.). If selectedDeviceId is
  // '' we use the OS default. Labels are only populated once the user
  // has granted mic permission at least once — browsers hide them
  // otherwise to prevent device fingerprinting.
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [activeDeviceLabel, setActiveDeviceLabel] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const tabStreamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const micGainRef = useRef<GainNode | null>(null)
  const tabGainRef = useRef<GainNode | null>(null)
  const startedAtRef = useRef<number>(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      stopBroadcast()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drive the "live" indicator's blink while we're actively broadcasting.
  useEffect(() => {
    if (status !== 'live') {
      setBlinkOn(true)
      return
    }
    const id = setInterval(() => setBlinkOn((on) => !on), 600)
    return () => clearInterval(id)
  }, [status])

  // Enumerate audio-input devices (the picker list) + listen for hot-plug
  // events so unplugging or connecting a USB interface refreshes the list
  // without a page reload.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return
    let cancelled = false
    async function refresh() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        setInputDevices(devices.filter((d) => d.kind === 'audioinput'))
      } catch {
        // Not fatal — we'll still work with the default device.
      }
    }
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', refresh)
    }
  }, [])

  // Lazy-init the AudioContext + merge destination. Reused for both
  // mic and tab sources so we always feed MediaRecorder a single mixed
  // stream.
  function ensureAudioGraph(): {
    ctx: AudioContext
    dest: MediaStreamAudioDestinationNode
  } {
    if (audioCtxRef.current && destRef.current) {
      return { ctx: audioCtxRef.current, dest: destRef.current }
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const ctx = new AudioCtx({ sampleRate: 48000 })
    const dest = ctx.createMediaStreamDestination()
    audioCtxRef.current = ctx
    destRef.current = dest
    return { ctx, dest }
  }

  function connectMicToGraph(stream: MediaStream) {
    const { ctx, dest } = ensureAudioGraph()
    const channelCount = stream.getAudioTracks()[0]?.getSettings().channelCount ?? 2
    const source = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    gain.gain.value = micMuted ? 0 : 1
    // Multi-input interfaces (Volt 476 etc): sum every channel into
    // stereo. The broadcaster's hardware mixer is responsible for
    // stereo panning before USB; we just want everything audible.
    if (channelCount > 2) {
      const splitter = ctx.createChannelSplitter(channelCount)
      const merger = ctx.createChannelMerger(2)
      source.connect(splitter)
      for (let i = 0; i < channelCount; i++) {
        splitter.connect(merger, i, 0)
        splitter.connect(merger, i, 1)
      }
      merger.connect(gain)
    } else {
      source.connect(gain)
    }
    gain.connect(dest)
    micGainRef.current = gain
  }

  function connectTabToGraph(stream: MediaStream) {
    const { ctx, dest } = ensureAudioGraph()
    const source = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    gain.gain.value = tabMuted ? 0 : 1
    source.connect(gain)
    gain.connect(dest)
    tabGainRef.current = gain
  }

  // Tear down the current computer-audio source: stop tracks, disconnect
  // the gain from the Web Audio graph, clear refs. Doesn't touch the mic
  // or the WS — used both when the user clicks "Change source" and when
  // the shared tab ends itself.
  function clearComputerAudio() {
    tabStreamRef.current?.getTracks().forEach((t) => t.stop())
    tabStreamRef.current = null
    tabGainRef.current?.disconnect()
    tabGainRef.current = null
    setTabArmed(false)
  }

  async function changeComputerAudio() {
    clearComputerAudio()
    await addComputerAudio()
  }

  async function addComputerAudio() {
    setError(null)
    try {
      // getDisplayMedia requires video:true even if we only want audio.
      // We drop the video track immediately and keep audio only.
      const ds = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      })
      ds.getVideoTracks().forEach((t) => t.stop())
      const audioTracks = ds.getAudioTracks()
      if (audioTracks.length === 0) {
        setError(
          "No audio captured — on Mac you need to pick a Chrome tab and check 'Share tab audio'.",
        )
        ds.getTracks().forEach((t) => t.stop())
        return
      }
      // Keep only the audio tracks in a fresh MediaStream.
      const audioOnly = new MediaStream(audioTracks)
      tabStreamRef.current = audioOnly
      setTabArmed(true)
      setTabMuted(false)
      // If we're already broadcasting, wire the new source into the mix immediately.
      if (status === 'live' && audioCtxRef.current) {
        connectTabToGraph(audioOnly)
      }
      // If user closes the shared tab (or hits "Stop sharing" in Chrome's
      // sharing bar), treat it as removed.
      audioTracks[0]!.addEventListener('ended', clearComputerAudio)
    } catch (e) {
      // User cancelled the picker or denied — not really an error.
      if ((e as Error)?.name !== 'NotAllowedError') {
        setError(e instanceof Error ? e.message : String(e))
      }
    }
  }

  function toggleMicMute() {
    setMicMuted((prev) => {
      const next = !prev
      if (micGainRef.current) micGainRef.current.gain.value = next ? 0 : 1
      return next
    })
  }

  function toggleTabMute() {
    setTabMuted((prev) => {
      const next = !prev
      if (tabGainRef.current) tabGainRef.current.gain.value = next ? 0 : 1
      return next
    })
  }

  async function goLive() {
    setError(null)
    setStatus('connecting')
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 8 },
          sampleRate: { ideal: 48000 },
        },
      })
      micStreamRef.current = mic

      // After permission is granted the browser gives us real device
      // labels. Re-enumerate so the picker shows "Volt 476" rather
      // than "Audio input 1".
      try {
        const devs = await navigator.mediaDevices.enumerateDevices()
        setInputDevices(devs.filter((d) => d.kind === 'audioinput'))
      } catch {}

      // Record the label of the actual device Chrome chose (mainly
      // useful when the user didn't pick one and is using the OS
      // default).
      const settings = mic.getAudioTracks()[0]?.getSettings()
      const actualId = settings?.deviceId ?? ''
      const label =
        (await navigator.mediaDevices.enumerateDevices())
          .find((d) => d.deviceId === actualId)?.label ?? null
      setActiveDeviceLabel(label)

      const { dest } = ensureAudioGraph()
      connectMicToGraph(mic)
      if (tabStreamRef.current) connectTabToGraph(tabStreamRef.current)

      const ws = new WebSocket(
        `${getWsUrl()}/ws?show=${encodeURIComponent(show.slug)}&role=broadcaster`,
      )
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        try {
          const recorder = new MediaRecorder(dest.stream, {
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
          void trackBroadcastStarted({ data: show.slug }).catch(() => {})
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          stopBroadcast()
        }
      }

      ws.onerror = () => {
        setError('WebSocket error')
      }
      ws.onclose = (ev) => {
        if (ev.code === 1008) setError(ev.reason || 'Not authorized to broadcast')
        stopBroadcast()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      stopBroadcast()
    }
  }

  function stopBroadcast() {
    const wasLive = recorderRef.current?.state === 'recording'
    const durationSec = wasLive
      ? Math.floor((Date.now() - startedAtRef.current) / 1000)
      : 0
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    recorderRef.current = null
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    tabStreamRef.current?.getTracks().forEach((t) => t.stop())
    tabStreamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    destRef.current = null
    micGainRef.current = null
    tabGainRef.current = null
    wsRef.current?.close()
    wsRef.current = null
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = null
    setElapsed(0)
    setStatus('idle')
    setTabArmed(false)
    setTabMuted(false)
    setMicMuted(false)
    setActiveDeviceLabel(null)
    if (wasLive) {
      void trackBroadcastEnded({ data: { slug: show.slug, durationSec } }).catch(() => {})
    }
  }

  const isLive = status === 'live'
  const isConnecting = status === 'connecting'

  return (
    <main style={{ fontFamily: 'system-ui', padding: '3rem', maxWidth: 640 }}>
      <p style={{ color: '#666', marginBottom: 0 }}>
        <Link to="/studio">← Studio</Link>
      </p>
      <h1 style={{ marginTop: '0.5rem' }}>{show.name}</h1>

      <p
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        {isLive && (
          <span
            aria-label="On air"
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#e53935',
              opacity: blinkOn ? 1 : 0.2,
              transition: 'opacity 150ms ease-in-out',
            }}
          />
        )}
        <span>
          Status: <strong>{status}</strong>
          {isLive && ` · ${formatDuration(elapsed)}`}
        </span>
      </p>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}

      <section style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
        <MicRow
          muted={micMuted}
          onToggle={toggleMicMute}
          subtitle={micMuted ? 'Muted' : 'Live'}
          devices={inputDevices}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={setSelectedDeviceId}
          activeLabel={activeDeviceLabel}
          lockPicker={isLive || isConnecting}
        />
        {tabArmed ? (
          <SourceRow
            label="🎵 Browser audio"
            muted={tabMuted}
            onToggle={toggleTabMute}
            active={true}
            subtitle={tabMuted ? 'Muted' : 'Live'}
            secondaryAction={{ label: 'Change source', onClick: changeComputerAudio }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              border: '1px solid #e5e5e5',
              borderRadius: 4,
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>🎵 Browser audio</div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: 2 }}>
                Chrome will ask you to pick a tab and tick "Share tab audio"
              </div>
            </div>
            <button onClick={addComputerAudio} disabled={isConnecting}>
              Add
            </button>
          </div>
        )}
      </section>

      <div style={{ marginTop: '1.5rem' }}>
        {isLive ? (
          <button onClick={stopBroadcast}>Stop broadcasting</button>
        ) : (
          <button onClick={goLive} disabled={isConnecting}>
            {isConnecting ? 'Connecting…' : 'Broadcast'}
          </button>
        )}
      </div>

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

function SourceRow({
  label,
  muted,
  onToggle,
  active,
  subtitle,
  secondaryAction,
}: {
  label: string
  muted: boolean
  onToggle: () => void
  active: boolean
  subtitle: string
  secondaryAction?: { label: string; onClick: () => void }
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        border: '1px solid #e5e5e5',
        borderRadius: 4,
        opacity: active ? 1 : 0.6,
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div
          style={{
            fontSize: '0.75rem',
            color: muted ? '#999' : '#1a7a3a',
            marginTop: 2,
          }}
        >
          {subtitle}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {secondaryAction && (
          <button onClick={secondaryAction.onClick}>{secondaryAction.label}</button>
        )}
        <button onClick={onToggle}>{muted ? 'Unmute' : 'Mute'}</button>
      </div>
    </div>
  )
}

function MicRow({
  muted,
  onToggle,
  subtitle,
  devices,
  selectedDeviceId,
  onSelectDevice,
  activeLabel,
  lockPicker,
}: {
  muted: boolean
  onToggle: () => void
  subtitle: string
  devices: MediaDeviceInfo[]
  selectedDeviceId: string
  onSelectDevice: (id: string) => void
  activeLabel: string | null
  lockPicker: boolean
}) {
  // The label shown on the row itself. Priority: the device actively
  // in use (once we've granted permission and know the real name);
  // otherwise the currently-selected device from the picker; otherwise
  // "Default input".
  const selected = devices.find((d) => d.deviceId === selectedDeviceId)
  const deviceName = activeLabel || selected?.label || 'Default input'

  const hasLabels = devices.some((d) => d.label)

  return (
    <div
      style={{
        display: 'grid',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        border: '1px solid #e5e5e5',
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>🎤 Mic / Input · {deviceName}</div>
          <div
            style={{
              fontSize: '0.75rem',
              color: muted ? '#999' : '#1a7a3a',
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        </div>
        <button onClick={onToggle}>{muted ? 'Unmute' : 'Mute'}</button>
      </div>
      {hasLabels && devices.length > 1 && (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.75rem',
            color: '#666',
          }}
        >
          Input device
          <select
            value={selectedDeviceId}
            onChange={(e) => onSelectDevice(e.target.value)}
            disabled={lockPicker}
            style={{ padding: '0.25rem 0.5rem' }}
          >
            <option value="">Default</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Input ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
          {lockPicker && (
            <span style={{ color: '#999' }}>
              (stop broadcasting to change)
            </span>
          )}
        </label>
      )}
    </div>
  )
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
