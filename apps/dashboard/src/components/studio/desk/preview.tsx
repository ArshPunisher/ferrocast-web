// The stage: the live picture (a native view the app draws over this box, letterboxed like
// OBS's preview) and, under it, the scene on air and how scenes change.

import { useEffect, useRef, useState } from 'react'
import { Play } from '@phosphor-icons/react'
import { type PreviewRect } from '@ferrocast/api'
import { Button, InfoTip, Input, Select } from '@ferrocast/ui'
import { inDesktopApp } from '../../../lib/external'
import { useAction } from '../../../lib/hooks'
import { useDesk, useEngine } from './common'

/** True while something sits over the box: the native view can't be covered, so it hides. */
function covered(r: DOMRect): boolean {
  if (document.body.dataset.dockDrag) return true
  if (document.querySelector('dialog[open]')) return true
  for (const el of document.querySelectorAll(
    '[role="menu"], [role="listbox"], [data-over-preview]',
  )) {
    const b = el.getBoundingClientRect()
    if (b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom) return true
  }
  return false
}

/** Where the live picture goes: the app draws a native view exactly over this box. */
export function PreviewBox({ running }: { running: boolean }) {
  const api = useEngine()
  const ref = useRef<HTMLDivElement>(null)
  const desktop = inDesktopApp()
  useEffect(() => {
    const el = ref.current
    if (!running || !desktop || !el) return
    let raf = 0
    let last = ''
    const send = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      // Hidden while partly under the top bar, off the window or under a menu or panel.
      const bar = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
      const inView = r.top >= bar && r.bottom <= window.innerHeight && r.width > 1 && r.height > 1
      const rect: PreviewRect | null =
        inView && !covered(r) ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
      // The window's height is part of it: the native side places the view from the bottom.
      const key = JSON.stringify([rect, window.innerHeight])
      if (key === last) return
      last = key
      void api.preview(rect).catch(() => {
        // Not placed: the next change (or the same one) tries again.
        if (last === key) last = ''
      })
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(send)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    const mo = new MutationObserver(schedule)
    // Dialogs open by an attribute; floating panels say where they are in data-pos.
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'data-dock-drag', 'data-pos'],
    })
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      void api.preview(null).catch(() => undefined)
    }
  }, [api, running, desktop])
  return (
    <div
      ref={ref}
      aria-label="Studio preview"
      className="grid min-h-0 flex-1 place-items-center bg-[#0a0b0d] text-[13px] text-[#8a919d]"
    >
      {!desktop && 'The live picture shows in the Ferrocast app.'}
    </div>
  )
}

/** The stage when the Studio isn't running: start it, or say why it can't. */
export function StageOff({
  available,
  detail,
  onStart,
}: {
  available: boolean
  detail: string | null
  onStart: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-[#0a0b0d] p-6 text-center">
      {available ? (
        <div className="flex flex-col items-center gap-3">
          <p className="m-0 max-w-[36ch] text-[14px] text-[#b3b9c4]">
            Your scenes come back where you left them.
          </p>
          <Button
            variant="primary"
            busy={busy}
            onClick={() => {
              setBusy(true)
              // Spins until it started or failed (then it can be pressed again).
              void onStart().finally(() => setBusy(false))
            }}
          >
            <Play size={15} weight="fill" /> Start the Studio
          </Button>
        </div>
      ) : (
        <p className="m-0 max-w-[48ch] text-[14px] text-[#b3b9c4]">{detail}</p>
      )}
    </div>
  )
}

const TRANSITIONS: Record<string, string> = {
  fade_transition: 'Fade',
  cut_transition: 'Cut',
  swipe_transition: 'Swipe',
  slide_transition: 'Slide',
  fade_to_color_transition: 'Fade to colour',
  wipe_transition: 'Wipe',
}

/** Under the picture: the scene on air and the transition between scenes. */
export function StageBar() {
  const { api, scenes, scene, kinds } = useDesk()
  const { run } = useAction()
  const t = scenes.data?.transition
  const [ms, setMs] = useState<number | null>(null)
  const kindsOn = (kinds.data?.transitions ?? []).filter((k) => TRANSITIONS[k.id])
  const set = async (kind: string, dur: number) => {
    const ok = await run('transition', async () => {
      await api.setTransition({ kind, ms: dur })
      return true
    })
    if (ok) scenes.reload()
  }
  return (
    <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface-1 px-3 py-2 text-[13px] text-text-3">
      <span className="font-display text-[15px] font-bold text-text">{scene}</span>
      <span className="flex-1" />
      {t && (
        <div className="flex items-center gap-2">
          <label htmlFor="studio-transition" className="hidden sm:inline">
            Switch with
          </label>
          <Select
            id="studio-transition"
            className="h-8! w-auto! py-0! text-[13px]"
            value={t.kind}
            onChange={(e) => void set(e.target.value, t.ms)}
          >
            {(kindsOn.length ? kindsOn : [{ id: t.kind, name: t.kind }]).map((k) => (
              <option key={k.id} value={k.id}>
                {TRANSITIONS[k.id] ?? k.name}
              </option>
            ))}
          </Select>
          {t.kind !== 'cut_transition' && (
            <>
              <Input
                aria-label="Transition length in milliseconds"
                type="number"
                inputMode="numeric"
                min={0}
                max={20000}
                step={50}
                className="h-8! w-20! py-0! text-right text-[13px] tabular-nums"
                value={ms ?? t.ms}
                onChange={(e) =>
                  setMs(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : null)
                }
                onBlur={() => {
                  if (ms !== null && ms !== t.ms && ms >= 0 && ms <= 20000)
                    void set(t.kind, Math.round(ms))
                  setMs(null)
                }}
              />
              <span aria-hidden>ms</span>
            </>
          )}
          <InfoTip label="About switching scenes">
            How the picture changes when you click another scene.
          </InfoTip>
        </div>
      )}
    </div>
  )
}
