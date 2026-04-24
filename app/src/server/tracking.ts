// Simple Product API wrapper for user tracking + custom events.
//
// All methods are fire-and-forget: if the API key is missing or the
// request fails, we log and move on — tracking never blocks or breaks
// the request path. If SIMPLE_PRODUCT_API_KEY isn't set (e.g. a dev
// without one), calls silently no-op.

const SP_BASE = 'https://simpleproduct.dev/api/v1'

type TrackedUser = {
  id: string
  email?: string | null
  displayName?: string | null
}

async function post(path: string, body: unknown): Promise<void> {
  const key = process.env.SIMPLE_PRODUCT_API_KEY
  if (!key) return
  try {
    const res = await fetch(`${SP_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn(
        `[tracking] ${path} failed ${res.status}: ${await res.text().catch(() => '')}`,
      )
    }
  } catch (err) {
    console.warn(`[tracking] ${path} threw`, err)
  }
}

/** Upsert the person record in Simple Product. Safe to call on every login. */
export function identify(user: TrackedUser, extraProperties: Record<string, unknown> = {}) {
  void post('/people', {
    externalId: user.id,
    email: user.email ?? undefined,
    name: user.displayName ?? undefined,
    properties: {
      source: 'rftp',
      ...extraProperties,
    },
  })
}

/** Fire a custom event. Provide the acting user and any event-specific props. */
export function track(
  event: string,
  user: TrackedUser | null,
  properties: Record<string, unknown> = {},
) {
  void post('/events', {
    event,
    externalId: user?.id,
    email: user?.email ?? undefined,
    properties,
  })
}

// In-memory throttle so a user browsing the app doesn't emit a heartbeat
// every request. Resets on pod restart — acceptable since heartbeats
// are a presence signal, not an audit log.
const HEARTBEAT_WINDOW_MS = 60_000
const lastHeartbeatAt = new Map<string, number>()

/** Debounced heartbeat — at most one event per user per HEARTBEAT_WINDOW_MS. */
export function heartbeat(user: TrackedUser) {
  const now = Date.now()
  const last = lastHeartbeatAt.get(user.id) ?? 0
  if (now - last < HEARTBEAT_WINDOW_MS) return
  lastHeartbeatAt.set(user.id, now)
  track('heartbeat', user)
}
