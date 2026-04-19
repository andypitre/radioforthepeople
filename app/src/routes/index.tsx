import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const { user } = Route.useRouteContext()
  return (
    <main style={{ fontFamily: 'system-ui', padding: '3rem', maxWidth: 640 }}>
      <h1>Radio for the People</h1>
      <p>An open, self-service community internet radio platform.</p>

      {user ? (
        <>
          <p>
            Signed in as <strong>{user.displayName ?? user.email}</strong>.{' '}
            <a href="/auth/logout">Sign out</a>
          </p>
          <p>
            <Link to="/studio">Go to the studio →</Link>
          </p>
        </>
      ) : (
        <p>
          <Link to="/login">Sign in</Link> to create a show and broadcast.
        </p>
      )}
    </main>
  )
}
