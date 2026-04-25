// Render a show's optional schedule as a human string for display.
// Renders nothing (null) when the show has no schedule set, so callers
// can do `{format(show) && <p>{...}</p>}`. Time formatting follows the
// viewer's locale + the show's stored IANA timezone, so a Tuesday-9-PM
// show in NYC reads the same to a viewer in LA: "Tuesdays at 9:00 PM ET".

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

type ShowSchedule = {
  scheduleCadence: 'daily' | 'weekly' | 'monthly' | null
  scheduleDayOfWeek: number | null
  scheduleDayOfMonth: number | null
  scheduleTime: string | null
  scheduleTimezone: string | null
}

export function formatSchedule(show: ShowSchedule): string | null {
  const { scheduleCadence: c, scheduleTime: t, scheduleTimezone: tz } = show
  if (!c || !t) return null

  const timeLabel = formatTime(t, tz)

  if (c === 'daily') return `Daily at ${timeLabel}`
  if (c === 'weekly') {
    const dow = show.scheduleDayOfWeek
    if (dow === null || dow < 0 || dow > 6) return null
    return `${DAYS[dow]}s at ${timeLabel}`
  }
  if (c === 'monthly') {
    const dom = show.scheduleDayOfMonth
    if (!dom) return null
    return `Monthly on day ${dom} at ${timeLabel}`
  }
  return null
}

// "20:00:00" or "20:00" in the show's tz → "8:00 PM ET"
function formatTime(hhmmss: string, tz: string | null): string {
  const [hStr, mStr] = hhmmss.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmmss
  // Anchor on a known date; only the time-of-day + tz matter for display.
  const ref = new Date()
  ref.setHours(h, m, 0, 0)
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz ?? undefined,
      timeZoneName: 'short',
    }).format(ref)
  } catch {
    return `${hhmmss}${tz ? ` ${tz}` : ''}`
  }
}
