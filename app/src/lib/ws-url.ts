// Resolve the WebSocket base URL at runtime.
//
// - In the browser (production): always same-origin. Protocol follows
//   window.location.protocol (https → wss), host is whatever the
//   browser is currently on. This is the right answer whether we're
//   at radioforthepeople.org or a preview URL.
// - In the browser (local dev): if the page host is localhost, fall
//   back to VITE_WS_URL (e.g. ws://localhost:1078 for split-port dev).
// - On the server (SSR): any value is fine since this is only used
//   from WebSocket constructors in useEffect blocks.
export function getWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const { hostname, protocol, host } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const envUrl = import.meta.env.VITE_WS_URL
    if (envUrl) return envUrl
  }
  const scheme = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${host}`
}

// HTTP base for the same server pod that serves WS. Used for HLS
// playback (the listener page hits /ws/hls/:slug/:file). In production
// this is same-origin (path "/ws" routes to the server pod); in local
// dev, peel an http(s):// URL out of VITE_WS_URL.
export function getHttpServerUrl(): string {
  if (typeof window === 'undefined') return ''
  const { hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const envUrl = import.meta.env.VITE_WS_URL
    if (envUrl) return envUrl.replace(/^ws/, 'http')
  }
  return ''
}
