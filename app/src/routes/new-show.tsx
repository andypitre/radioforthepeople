import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { submitCreateShow } from '../server-fns'

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
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await submitCreateShow({
        data: { slug: slug.trim(), name: name.trim(), description: description.trim() },
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      window.location.href = `/${res.show.slug}`
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
