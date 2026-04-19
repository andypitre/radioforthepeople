import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import {
  handleApiMe,
  handleAuthGoogle,
  handleAuthGoogleCallback,
  handleAuthLogout,
} from './server/handlers'

const startFetch = createStartHandler(defaultStreamHandler)

async function fetch(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url)

  if (pathname === '/auth/google') return handleAuthGoogle(request)
  if (pathname === '/auth/google/callback') return handleAuthGoogleCallback(request)
  if (pathname === '/auth/logout') return handleAuthLogout(request)
  if (pathname === '/api/me') return handleApiMe(request)

  return startFetch(request)
}

export default { fetch }
