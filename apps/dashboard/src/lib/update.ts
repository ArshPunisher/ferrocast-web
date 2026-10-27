// App updates (API.md §4 `UpdateView`): what the sidebar item, the update dialog and
// Settings › Updates show. The engine is the truth; the live `update` frame keeps it current
// (download progress included), and `useUpdateWatch` loads it and refreshes it now and then
// (whether you're live can change without an update frame).

import { useEffect } from 'react'
import type { FerroClient, UpdateInfo, UpdatePhase, UpdateProblem } from '@ferrocast/api'
import { useClient } from './hooks'
import { useLive } from './store'

/** Where to get a version by hand (the headless app, or when the app can't update itself). */
export const DOWNLOAD_PAGE = 'https://ferrocast.clearcraftlabs.com/download'

export interface UpdateSummary {
  /** A newer version is offered, or an install is under way or waiting for its restart. */
  show: boolean
  version: string | null
  phase: UpdatePhase
  /** 0 to 100 while downloading; null when the size isn't known. */
  percent: number | null
  /** This app can install it (the desktop app). Older engines don't say: assume yes. */
  canInstall: boolean
  blocked: boolean
  installError: UpdateProblem | null
}

export function summarize(u: UpdateInfo | null | undefined): UpdateSummary {
  const install = u?.install
  const phase: UpdatePhase = install?.phase ?? 'idle'
  const version = install?.version ?? u?.latest ?? null
  const newer = !!u?.latest && u.latest !== u.current
  const total = install?.total ?? null
  const percent =
    phase !== 'downloading' || !total || total <= 0
      ? null
      : Math.max(0, Math.min(100, Math.floor(((install?.downloaded ?? 0) / total) * 100)))
  return {
    show: !!u && (newer || phase !== 'idle'),
    version,
    phase,
    percent,
    canInstall: u?.can_install !== false,
    blocked: !!u?.blocked_while_live,
    installError: install?.error ?? null,
  }
}

/** "7.4 MB" (decimal megabytes, like the download page; a no-break space before the unit). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0\u00a0MB'
  if (n < 100_000) return `${Math.max(1, Math.round(n / 1000))}\u00a0KB`
  return `${(n / 1_000_000).toFixed(1)}\u00a0MB`
}

/** "Last checked just now" / "… 12 minutes ago" / "Not checked yet". */
export function checkedLine(at: number | null | undefined, now = Date.now()): string {
  if (at === null || at === undefined) return 'Not checked yet'
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'Last checked just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `Last checked ${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `Last checked ${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `Last checked ${d} day${d === 1 ? '' : 's'} ago`
}

/** "Published 3 hours ago", or null when the feed didn't say (or said nonsense). */
export function publishedLine(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return checkedLine(t, now).replace('Last checked', 'Published')
}

export type NotesBlock = { kind: 'list'; items: string[] } | { kind: 'text'; text: string }

/**
 * The release notes (plain text from the feed, untrusted): "- " or "* " lines are list
 * items, indented lines continue the item above, and lines that follow each other make one
 * paragraph (the changelog wraps its lines; a blank line starts a new paragraph). Rendered
 * as text only, never HTML.
 */
export function parseNotes(raw: unknown): NotesBlock[] {
  if (typeof raw !== 'string' || !raw) return []
  const out: NotesBlock[] = []
  let gap = true
  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = /^\s{0,3}[-*]\s+(.*)$/.exec(line)
    const last = out[out.length - 1]
    if (bullet) {
      gap = false
      const item = (bullet[1] ?? '').trim()
      if (!item) continue
      if (last?.kind === 'list') last.items.push(item)
      else out.push({ kind: 'list', items: [item] })
    } else if (!line.trim()) {
      gap = true
    } else if (/^\s+/.test(line) && last?.kind === 'list' && !gap) {
      last.items[last.items.length - 1] += ` ${line.trim()}`
    } else {
      // A heading marker is noise in plain text.
      const heading = /^#+\s/.test(line)
      const text = line.replace(/^#+\s*/, '').trim()
      if (!text) continue
      if (!heading && !gap && last?.kind === 'text') last.text += ` ${text}`
      else out.push({ kind: 'text', text })
      // A heading stands alone.
      gap = heading
    }
  }
  return out
}

/** Splits `**bold**` out of a line of notes, for rendering as text (never HTML). */
export function emphasis(text: string): { text: string; strong: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      /^\*\*[^*]+\*\*$/.test(part)
        ? { text: part.slice(2, -2), strong: true }
        : { text: part, strong: false },
    )
}

/** How often the update state is re-read when no frame came (live changes, older engines). */
const REFRESH_MS = 60_000

/** Reloads the update state now (a GET older than a newer `update` frame is dropped). */
export function refreshUpdate(client: FerroClient): Promise<void> {
  const { updateFrames, setUpdate, setUpdateLoadError } = useLive.getState()
  return client
    .updates()
    .then((u) => setUpdate(u, updateFrames))
    .catch((e: unknown) => setUpdateLoadError(e))
}

/** Loads the update state into the live store, then keeps it fresh. Mount once (the shell). */
export function useUpdateWatch(): void {
  const client = useClient()
  const resyncs = useLive((s) => s.resyncs)
  useEffect(() => {
    void refreshUpdate(client)
  }, [client, resyncs])
  useEffect(() => {
    const load = () => void refreshUpdate(client)
    const timer = window.setInterval(load, REFRESH_MS)
    window.addEventListener('focus', load)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [client])
}
