// The Clips tab's data: the library (searched), and the background jobs, polled while any is
// waiting or running. A job that made something reloads the library.

import { useEffect, useMemo, useRef, useState } from 'react'
import { clipsApi, jobActive, type ClipJob, type ClipsApi } from '@ferrocast/api'
import { useClient, useResource, type Resource } from '../../../lib/hooks'

export interface ClipsData {
  api: ClipsApi
  /** What is typed in the search box. */
  query: string
  setQuery: (q: string) => void
  overview: Resource<Awaited<ReturnType<ClipsApi['list']>>>
  jobs: ClipJob[]
  /** The jobs failed to load (the library may still be fine). */
  jobsError: unknown
  reloadJobs: () => void
}

/** Waits a moment after typing before asking. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export const JOB_POLL_MS = 1000

export function useClips(): ClipsData {
  const client = useClient()
  const api = useMemo(() => clipsApi(client), [client])
  const [query, setQuery] = useState('')
  const asked = useDebounced(query.trim(), 250)
  const overview = useResource(() => api.list(asked || undefined), [api, asked])
  const jobsRes = useResource(() => api.jobs().then((r) => r.jobs), [api])
  const jobs = useMemo(() => jobsRes.data ?? [], [jobsRes.data])
  const active = jobs.some(jobActive)
  const reloadJobs = jobsRes.reload
  useEffect(() => {
    if (!active) return
    const t = setInterval(reloadJobs, JOB_POLL_MS)
    return () => clearInterval(t)
  }, [active, reloadJobs])
  // A job that just finished may have made a clip (or captions): the list shows it.
  const seen = useRef(new Map<string, ClipJob['state']>())
  // Jobs from before this screen opened are not news; one first seen after that, already done
  // (a quick trim finished before the first poll), is.
  const firstLook = useRef(true)
  const reloadOverview = overview.reload
  useEffect(() => {
    if (jobsRes.data === undefined) return
    let changed = false
    for (const j of jobs) {
      const before = seen.current.get(j.id)
      if (before && jobActive({ state: before }) && !jobActive(j)) changed = true
      if (!before && !firstLook.current && j.state === 'done') changed = true
      seen.current.set(j.id, j.state)
    }
    firstLook.current = false
    if (changed) reloadOverview()
  }, [jobs, jobsRes.data, reloadOverview])
  return { api, query, setQuery, overview, jobs, jobsError: jobsRes.error, reloadJobs }
}
