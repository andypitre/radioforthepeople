import { Link, createFileRoute } from '@tanstack/react-router'
import { fetchMyShows } from '../server-fns'

export const Route = createFileRoute('/studio/')({
  loader: async () => {
    const shows = await fetchMyShows()
    return { shows }
  },
  component: StudioHome,
})

function StudioHome() {
  const { shows } = Route.useLoaderData()
  const { user } = Route.useRouteContext()

  return (
    <main style={{ fontFamily: 'system-ui', padding: '3rem', maxWidth: 640 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '2rem',
        }}
      >
        <h1 style={{ margin: 0 }}>Studio</h1>
        <span style={{ color: '#666', fontSize: '0.875rem' }}>
          {user?.displayName ?? user?.email} · <a href="/auth/logout">Sign out</a>
        </span>
      </header>

      {shows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <h2 style={{ fontSize: '1rem', color: '#666', fontWeight: 500 }}>
            Your shows
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1rem' }}>
            {shows.map((s) => (
              <li
                key={s.id}
                style={{
                  padding: '1rem',
                  border: '1px solid #e5e5e5',
                  borderRadius: 4,
                }}
              >
                <Link
                  to="/studio/$slug"
                  params={{ slug: s.slug }}
                  style={{ fontWeight: 600, fontSize: '1.125rem', textDecoration: 'none' }}
                >
                  {s.name}
                </Link>
                <div style={{ color: '#666', fontSize: '0.875rem', marginTop: 4 }}>
                  /{s.slug}
                  {s.description && ` · ${s.description}`}
                </div>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: '2rem' }}>
            <Link to="/new-show">Create another show</Link>
          </p>
        </>
      )}
    </main>
  )
}

function EmptyState() {
  return (
    <section style={{ textAlign: 'center', padding: '3rem 0' }}>
      <p style={{ fontSize: '1.125rem', color: '#444' }}>
        You don't have any shows yet. Every broadcast lives in a show — pick a
        name, grab a URL, and go live.
      </p>
      <Link
        to="/new-show"
        style={{
          display: 'inline-block',
          marginTop: '1rem',
          padding: '0.75rem 1.5rem',
          background: '#111',
          color: 'white',
          textDecoration: 'none',
          borderRadius: 4,
        }}
      >
        Create your first show
      </Link>
    </section>
  )
}
