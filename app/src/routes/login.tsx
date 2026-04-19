import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: '/' })
  },
  validateSearch: (s: Record<string, unknown>): { error?: string } => ({
    error: typeof s.error === 'string' ? s.error : undefined,
  }),
  component: Login,
})

function Login() {
  const { error } = Route.useSearch()
  return (
    <main style={{ fontFamily: 'system-ui', padding: '3rem', maxWidth: 520 }}>
      <h1>Sign in</h1>
      <p>Radio for the People uses Google to sign you in.</p>
      {error && (
        <p style={{ color: 'crimson' }}>
          Sign-in failed: {error.replace(/_/g, ' ')}. Please try again.
        </p>
      )}
      <a
        href="/auth/google"
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.25rem',
          background: '#111',
          color: 'white',
          textDecoration: 'none',
          borderRadius: 4,
        }}
      >
        Sign in with Google
      </a>
    </main>
  )
}
