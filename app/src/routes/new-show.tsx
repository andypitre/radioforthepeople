import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { submitCreateShow } from '../server-fns'
import type { ScheduleCadence } from '../server/shows'

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export const Route = createFileRoute('/new-show')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/login' })
  },
  component: NewShow,
})

function NewShow() {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // Schedule (optional). cadence === '' means "doesn't recur", and we
  // send `schedule: null` to the server in that case.
  const [cadence, setCadence] = useState<'' | ScheduleCadence>('')
  const [dayOfWeek, setDayOfWeek] = useState<number>(1) // Monday default
  const [dayOfMonth, setDayOfMonth] = useState<number>(1)
  const [time, setTime] = useState('20:00')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const schedule = cadence
        ? {
            cadence,
            dayOfWeek: cadence === 'weekly' ? dayOfWeek : undefined,
            dayOfMonth: cadence === 'monthly' ? dayOfMonth : undefined,
            time,
            // Pull the visitor's IANA tz from the browser; no UI for it.
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        : null
      const res = await submitCreateShow({
        data: {
          slug: slug.trim(),
          name: name.trim(),
          description: description.trim(),
          schedule,
        },
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      window.location.href = `/studio/${res.show.slug}`
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui', padding: '3rem', maxWidth: 520 }}>
      <h1>Create a show</h1>
      <p>Each show has its own URL, broadcast button, and listen page.</p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: '1rem' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>URL slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="e.g. midnight-jazz"
            minLength={3}
            maxLength={40}
            required
            style={{ padding: '0.5rem', fontFamily: 'inherit' }}
          />
          <small style={{ color: '#666' }}>
            Your show will live at radioforthepeople.org/{slug || 'your-slug'}
          </small>
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span>Show name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Midnight Jazz"
            maxLength={100}
            required
            style={{ padding: '0.5rem', fontFamily: 'inherit' }}
          />
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          <span>Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            style={{ padding: '0.5rem', fontFamily: 'inherit' }}
          />
        </label>

        <fieldset style={{ border: '1px solid #ddd', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
          <legend style={{ padding: '0 0.5rem', color: '#666' }}>
            Schedule (optional)
          </legend>

          <label style={{ display: 'grid', gap: 4 }}>
            <span>How often</span>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as '' | ScheduleCadence)}
              style={{ padding: '0.5rem', fontFamily: 'inherit' }}
            >
              <option value="">Doesn't recur</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>

          {cadence === 'weekly' && (
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Day of week</span>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                style={{ padding: '0.5rem', fontFamily: 'inherit' }}
              >
                {DAYS_OF_WEEK.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}

          {cadence === 'monthly' && (
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Day of month</span>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                style={{ padding: '0.5rem', fontFamily: 'inherit' }}
              />
              <small style={{ color: '#666' }}>
                Months without this day (e.g. Feb 30) will be skipped later.
              </small>
            </label>
          )}

          {cadence && (
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Time</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                style={{ padding: '0.5rem', fontFamily: 'inherit' }}
              />
            </label>
          )}
        </fieldset>

        {error && <p style={{ color: 'crimson', margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '0.75rem 1.25rem',
            background: '#111',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            justifySelf: 'start',
          }}
        >
          {submitting ? 'Creating…' : 'Create show'}
        </button>
      </form>
    </main>
  )
}
