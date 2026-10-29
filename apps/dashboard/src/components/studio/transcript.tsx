// The transcript (plan item 5, 30 Oct): what was said while live captions listened and "Keep
// a transcript" was on, searched by its words. Kept on this computer only.

import { useEffect, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import type { TranscriptLine } from '@ferrocast/api'
import { Input } from '@ferrocast/ui'
import { Panel } from '../Panel'
import { useStudio } from './common'

/** "14:05" today, else "29 Oct 14:05". */
function when(at: number, now = Date.now()): string {
  const d = new Date(at)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return new Date(now).toDateString() === d.toDateString()
    ? time
    : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`
}

export function TranscriptPanel() {
  const studio = useStudio()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<TranscriptLine[] | null>(null)
  const [gone, setGone] = useState(false)

  // Searched a moment after typing stops.
  useEffect(() => {
    let live = true
    const t = window.setTimeout(() => {
      studio.transcript(q.trim()).then(
        (l) => live && setFound(l),
        () => live && setGone(true),
      )
    }, 300)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [studio, q])

  // An app without the transcript (the browser demo, an older Ferrocast): nothing to show.
  if (gone) return null
  return (
    <Panel
      title="Transcript"
      description="What you said while live captions listened, this stream or the last day."
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <MagnifyingGlass
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3"
          />
          <Input
            type="search"
            aria-label="Search the transcript"
            placeholder="Search what you said…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {found === null ? null : found.length === 0 ? (
          <p className="text-[14.5px] text-text-2">
            {q.trim()
              ? 'Nothing said with those words.'
              : 'Nothing kept yet. Turn on Keep a transcript in Show, Live captions.'}
          </p>
        ) : (
          <ul
            className="flex max-h-[420px] flex-col divide-y divide-line overflow-auto"
            aria-live="polite"
          >
            {found.map((l) => (
              <li key={`${l.at}-${l.text}`} className="flex gap-3 py-2">
                <span className="w-24 shrink-0 font-mono text-[13.5px] text-text-3 tabular-nums">
                  {when(l.at)}
                </span>
                <span className="min-w-0 text-[14.5px] break-words text-text">{l.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
