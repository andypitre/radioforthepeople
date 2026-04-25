// Per-broadcast ffmpeg process: takes WebM/Opus chunks on stdin, emits a
// rolling HLS playlist + AAC fMP4 segments to /tmp/hls/{slug}/. Listeners
// hit the playlist via plain `<audio src="…m3u8">`, which works on iOS
// Safari + Android Chrome + every desktop browser without any client-side
// MSE plumbing.
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Writable, Readable } from 'node:stream'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

export const HLS_ROOT = resolve('/tmp/hls')

export type HlsProcess = ChildProcessByStdio<Writable, null, Readable>

export function startHls(slug: string): HlsProcess {
  const dir = resolve(HLS_ROOT, slug)
  // Blow away any leftovers from a previous broadcast — this avoids a
  // race where stop-then-start within ~60s would have the old cleanup
  // timer wipe the new broadcast's segments mid-stream.
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {}
  mkdirSync(dir, { recursive: true })

  const args = [
    '-loglevel', 'warning',
    '-i', 'pipe:0',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',
    '-ac', '2',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '5',
    // delete_segments: rotate old fragments off disk
    // omit_endlist:    keep playlist marked "live", never finalized
    // independent_segments: each fragment is decodable on its own
    '-hls_flags', 'delete_segments+omit_endlist+independent_segments',
    // MPEG-TS segments (the HLS default) carry codec config in every
    // segment, so there's no separate init.mp4 to fetch. fMP4 +
    // EXT-X-MAP is finicky in hls.js for audio-only streams; mpegts
    // sidesteps that. iOS Safari plays mpegts HLS natively too.
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', resolve(dir, 'segment-%05d.ts'),
    '-y',
    resolve(dir, 'live.m3u8'),
  ]

  const proc = spawn('ffmpeg', args, {
    stdio: ['pipe', 'ignore', 'pipe'],
  }) as HlsProcess

  proc.stderr.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) console.log(`[ffmpeg ${slug}] ${line}`)
  })
  proc.on('exit', (code, signal) => {
    console.log(`[ffmpeg ${slug}] exit code=${code} signal=${signal}`)
    // Drop the playlist on actual ffmpeg exit so the listener's HEAD
    // poll flips to 404 and the UI shows "offline". Doing this from
    // stopHls (before exit) races with ffmpeg's flush, which would
    // re-emit the playlist after we removed it.
    try {
      rmSync(resolve(HLS_ROOT, slug, 'live.m3u8'), { force: true })
    } catch {}
  })
  proc.on('error', (err) => {
    console.error(`[ffmpeg ${slug}] error`, err)
  })

  return proc
}

export function stopHls(slug: string, proc: HlsProcess) {
  try {
    proc.stdin.end()
  } catch {
    // ignore — process may already be gone
  }
  // Give ffmpeg a few seconds to flush and exit cleanly. If it hasn't,
  // SIGKILL so we don't leak processes when something goes wrong.
  setTimeout(() => {
    if (proc.exitCode === null && !proc.killed) {
      try {
        proc.kill('SIGKILL')
      } catch {}
    }
  }, 5_000)
  // We *don't* sweep the directory here — leaving stale segments lets
  // any in-flight listener fetch finish, and `startHls` clears the
  // dir before the next broadcast. Letting two cleanup timers race
  // a new broadcast was the source of mid-stream "No such file"
  // failures.
}
