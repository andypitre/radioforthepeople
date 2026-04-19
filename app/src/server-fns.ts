import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getCurrentUser, getSessionUserId } from './server/auth'
import {
  createShow,
  getShowBySlug,
  getShowsForUser,
  type CreateShowInput,
  type CreateShowResult,
} from './server/shows'

export const fetchCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  return getCurrentUser(request)
})

export const fetchMyShows = createServerFn({ method: 'GET' }).handler(async () => {
  const uid = getSessionUserId(getRequest())
  if (!uid) return []
  return getShowsForUser(uid)
})

export const submitCreateShow = createServerFn({ method: 'POST' })
  .inputValidator((input: CreateShowInput) => input)
  .handler(async ({ data }): Promise<CreateShowResult> => {
    const uid = getSessionUserId(getRequest())
    if (!uid) return { ok: false, error: 'You must be signed in.' }
    return createShow(uid, data)
  })

export const fetchShowBySlug = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const uid = getSessionUserId(getRequest())
    return getShowBySlug(slug, uid)
  })
