// The ready check after Start (owner, 30 Oct): a small card that looks over the mic, cameras,
// captures, scenes and disk a few seconds after the Studio starts, and shows only what needs
// fixing. Also says what came back when Ferrocast closed unexpectedly last time.

import { useEffect, useRef, useState } from 'react'
import { X } from '@phosphor-icons/react'
import type { EngineRecovered, Preflight } from '@ferrocast/api'
import { IconButton } from '@ferrocast/ui'
import { useStudio } from '../common'
import { PreflightList } from '../show'
import { useEngine } from './common'
import { captureChecks, recoveredWords, silentMics, studioProblems } from './ready'

/** How long to listen to the mics: 6 looks, half a second apart. */
const LOOKS = 6

export function ReadyCheck({
  recovered,
  onClose,
}: {
  recovered: EngineRecovered | null
  onClose: () => void
}) {
  const api = useEngine()
  const studio = useStudio()
  const [found, setFound] = useState<Preflight | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      const cfg = await studio.showConfig().catch(() => null)
      const mics = cfg?.mic_sources ?? []
      const samples: Record<string, number[]> = Object.fromEntries(mics.map((m) => [m, []]))
      for (let i = 0; i < LOOKS && live && mics.length; i++) {
        await new Promise((r) => setTimeout(r, 500))
        const levels = await api.levels(mics).catch(() => ({}) as Record<string, never>)
        for (const m of mics) {
          const l = levels[m]
          if (l) samples[m]?.push(Math.max(l.peak[0], l.peak[1]))
        }
      }
      if (!mics.length) await new Promise((r) => setTimeout(r, 3000))
      const [pf, stats] = await Promise.all([
        studio.preflight().catch(() => ({ checks: [], ready: true }) as Preflight),
        api.stats().catch(() => null),
      ])
      if (!live) return
      const problems = studioProblems(pf.checks)
      const checks = [
        ...problems,
        ...silentMics(samples, problems),
        ...captureChecks(stats?.captures),
      ]
      setFound({ checks, ready: checks.length === 0 })
    })()
    return () => {
      live = false
    }
  }, [api, studio])

  // All good and nothing to say about a crash: it goes by itself (the parent redrawing doesn't
  // restart the wait: its onClose is read when the time comes).
  const close = useRef(onClose)
  close.current = onClose
  const clean = found?.ready && !recovered
  useEffect(() => {
    if (!clean) return
    const t = window.setTimeout(() => close.current(), 5000)
    return () => window.clearTimeout(t)
  }, [clean])

  const n = found?.checks.length ?? 0
  return (
    <section
      data-over-preview
      aria-label="Ready check"
      className="fixed right-4 bottom-[calc(var(--fc-statusbar,0px)+16px)] z-40 flex max-h-[60vh] w-[min(420px,calc(100vw-32px))] flex-col gap-2 overflow-auto rounded-panel border border-line-strong bg-surface-1 p-4 shadow-pop"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold">Ready check</h2>
        <IconButton label="Close the ready check" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      {recovered && (
        <div className="flex flex-col gap-1 rounded-control bg-surface-2 p-3 text-[14.5px] text-text">
          {recoveredWords(recovered).map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
      <div role="status" aria-live="polite">
        {!found ? (
          <p className="text-[14.5px] text-text-2">Checking your mic, cameras and scenes…</p>
        ) : n === 0 ? (
          <p className="text-[14.5px] font-semibold text-ok">All good. You’re ready.</p>
        ) : (
          <p className="text-[14.5px] font-semibold text-warn">
            {n} {n === 1 ? 'thing' : 'things'} to fix
          </p>
        )}
      </div>
      {found && n > 0 && (
        <PreflightList
          pf={found}
          onFixed={(p) =>
            // A fix answers with a new pre-flight: its problems replace the old ones; the
            // silent-mic and capture lines stay until checked again.
            setFound((f) => {
              if (!f) return f
              const ours = f.checks.filter((c) => /^(silent|capture):/.test(c.id))
              const checks = [...studioProblems(p.checks), ...ours]
              return { checks, ready: checks.length === 0 }
            })
          }
        />
      )}
    </section>
  )
}
