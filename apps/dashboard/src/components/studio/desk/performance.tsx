// Performance mode: stop drawing the Studio's pictures to save GPU and CPU while live. The
// stream, a recording and the virtual camera are never touched (the engine draws them itself).
// The state belongs to the app (a shortcut can flip it while the page is behind), so the page
// asks for it now and then, and every control reads the same copy.

import { useEffect, useRef } from 'react'
import { Gauge, Play } from '@phosphor-icons/react'
import { Button, IconButton, cx, usePreviewHole } from '@ferrocast/ui'
import { create } from 'zustand'
import { useAction } from '../../../lib/hooks'
import { useDesk } from './common'

interface PausedState {
  paused: boolean
  set: (paused: boolean) => void
}

const usePausedStore = create<PausedState>((set) => ({
  paused: false,
  set: (paused) => set({ paused }),
}))

/** Counts the answers to a toggle: a poll that began before one must not overwrite it. */
let toggled = 0

/** Whether performance mode has the pictures paused now. */
export function usePreviewPaused(): boolean {
  return usePausedStore((s) => s.paused)
}

/** How often the page asks whether a shortcut changed it (ms). */
export const PAUSE_POLL_MS = 2500

/** Keeps the page's copy of performance mode right while the preview shows: reads it at once,
 * on every poll and when the window is looked at again. Renders nothing. */
export function PreviewPausedSync({ running }: { running: boolean }) {
  const { api } = useDesk()
  const set = usePausedStore((s) => s.set)
  useEffect(() => {
    if (!running) {
      set(false)
      return
    }
    let alive = true
    const read = () => {
      const before = toggled
      void api
        .previewPaused()
        .then((r) => alive && toggled === before && set(r.paused))
        // The app not answering is not "paused": keep what the page shows.
        .catch(() => undefined)
    }
    read()
    const timer = window.setInterval(read, PAUSE_POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && read()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [api, running, set])
  return null
}

/** Pauses or resumes the pictures; the page follows the app's answer, not its own guess. */
export function usePausePreview(): {
  paused: boolean
  busy: boolean
  toggle: (to?: boolean) => void
} {
  const { api } = useDesk()
  const paused = usePreviewPaused()
  const set = usePausedStore((s) => s.set)
  const { run, busy } = useAction()
  const toggle = (to?: boolean) => {
    const next = to ?? !paused
    void run('pause-preview', () => api.setPreviewPaused(next), {
      once: true,
      success: (r) => (r.paused ? 'Preview paused. Your stream and recording carry on.' : null),
    }).then((r) => {
      if (!r) return
      toggled++
      set(r.paused)
    })
  }
  return { paused, busy: busy === 'pause-preview', toggle }
}

/** The toolbar's performance mode button. */
export function PerformanceToggle({ panel = false }: { panel?: boolean } = {}) {
  const { paused, busy, toggle } = usePausePreview()
  const label = paused ? 'Resume the preview' : 'Pause the preview to save power (performance mode)'
  if (panel) {
    return (
      <Button
        size="xs"
        variant="ghost"
        aria-label={label}
        aria-pressed={paused}
        disabled={busy}
        className={cx(
          paused
            ? 'bg-accent-soft! text-accent-text! shadow-[inset_0_0_0_1px_var(--fc-accent-line)]!'
            : 'text-text-2',
        )}
        onClick={() => toggle()}
      >
        <Gauge size={16} weight="bold" aria-hidden />
        <span>{paused ? 'Resume preview' : 'Performance mode'}</span>
      </Button>
    )
  }
  return (
    <IconButton
      size="xs"
      label={label}
      aria-pressed={paused}
      disabled={busy}
      className={cx(
        paused
          ? 'bg-accent-soft! text-accent-text! shadow-[inset_0_0_0_1px_var(--fc-accent-line)]!'
          : 'text-text-2',
      )}
      onClick={() => toggle()}
    >
      <Gauge size={17} weight="bold" />
    </IconButton>
  )
}

/** Over a paused picture: what happened, that the output is fine, and one click to resume. The
 * app leaves its picture out under it (`data-over-preview`). `compact` for the small boxes. */
export function PausedCard({ compact }: { compact?: boolean }) {
  const { paused, busy, toggle } = usePausePreview()
  const cardRef = useRef<HTMLDivElement>(null)
  usePreviewHole(cardRef, paused)
  if (!paused) return null
  return (
    <div
      ref={cardRef}
      role="status"
      data-over-preview
      // The card is not the stage: a press on it never picks or moves the source under it.
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="absolute inset-0 z-[1] grid place-items-center bg-[#0a0b0d] p-3 text-center"
    >
      <div className="flex max-w-[34ch] flex-col items-center gap-2">
        <Gauge size={compact ? 20 : 28} weight="bold" aria-hidden className="text-[#9aa1ac]" />
        <p className="text-[15px] font-bold text-[#e6e9ef]">Preview paused</p>
        {!compact && (
          <p className="text-[13.5px] text-[#9aa1ac]">
            Your stream and recording are not affected.
          </p>
        )}
        <Button size="xs" variant="primary" busy={busy} onClick={() => toggle(false)}>
          <Play size={13} weight="fill" /> Resume preview
        </Button>
      </div>
    </div>
  )
}
