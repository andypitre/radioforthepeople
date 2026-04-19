import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '3rem', maxWidth: 640 }}>
      <h1>Radio for the People</h1>
      <p>An open, self-service community internet radio platform.</p>
      <ul>
        <li><Link to="/broadcast">Go Live</Link></li>
        <li><Link to="/listen">Listen</Link></li>
      </ul>
    </main>
  )
}
