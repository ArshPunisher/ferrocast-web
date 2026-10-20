// The built-in sound picker (sound board option C): one listbox, grouped Crystal, Felt and
// Classic. Arrow keys or a resting mouse play the sound under them; Enter, Space or a click
// picks it. Only one preview rings at a time.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check } from '@phosphor-icons/react'
import {
  SOUND_GROUPS,
  SOUND_LABEL,
  SOUND_USE,
  resolveSound,
  type BuiltinSound,
  type PlayableSound,
} from '@ferrocast/api'
import { cx } from '@ferrocast/ui'
import { playBuiltin, preloadBuiltins, stopBuiltin, unlockAudio } from '@ferrocast/overlays'

type Option = { id: PlayableSound | 'none'; group: string | null }
const OPTIONS: Option[] = [
  { id: 'none', group: null },
  ...SOUND_GROUPS.flatMap((g) => g.sounds.map((id) => ({ id, group: g.label }))),
]

export function SoundPicker({
  value,
  volume,
  onChange,
  label = 'Built-in sound',
}: {
  /** The saved id; a retired one (Chime…) shows as the sound it plays now. */
  value: BuiltinSound | null
  volume: number
  onChange: (s: BuiltinSound) => void
  label?: string
}) {
  const base = useId()
  const list = useRef<HTMLDivElement>(null)
  const selected = value === null ? -1 : OPTIONS.findIndex((o) => o.id === resolveSound(value))
  const [active, setActive] = useState(Math.max(0, selected))
  const [sounding, setSounding] = useState<string | null>(null)
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ring = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (hover.current) clearTimeout(hover.current)
      if (ring.current) clearTimeout(ring.current)
      stopBuiltin()
    },
    [],
  )

  const preview = (o: Option) => {
    if (o.id === 'none') {
      stopBuiltin()
      setSounding(null)
      return
    }
    const ms = playBuiltin(o.id, volume, true)
    setSounding(o.id)
    if (ring.current) clearTimeout(ring.current)
    ring.current = setTimeout(() => setSounding(null), ms)
  }
  const move = (i: number, sound = true) => {
    const n = Math.max(0, Math.min(OPTIONS.length - 1, i))
    setActive(n)
    document.getElementById(`${base}-${n}`)?.scrollIntoView({ block: 'nearest' })
    const o = OPTIONS[n]
    if (sound && o) preview(o)
  }
  const choose = (i: number) => {
    const o = OPTIONS[i]
    if (!o) return
    setActive(i)
    onChange(o.id)
  }
  const onKey = (e: KeyboardEvent) => {
    unlockAudio()
    if (e.key === 'ArrowDown') move(active + 1)
    else if (e.key === 'ArrowUp') move(active - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(OPTIONS.length - 1)
    else if (e.key === 'Enter' || e.key === ' ') choose(active)
    else return
    e.preventDefault()
  }

  let lastGroup: string | null = null
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${base}-label`} className="text-[13.5px] font-semibold text-text">
        {label}
      </span>
      <p id={`${base}-hint`} className="text-[13px] leading-snug text-text-3">
        Arrow keys or hover to hear one. Enter or click to pick it.
      </p>
      <div
        ref={list}
        role="listbox"
        tabIndex={0}
        aria-labelledby={`${base}-label`}
        aria-describedby={`${base}-hint`}
        aria-activedescendant={`${base}-${active}`}
        onKeyDown={onKey}
        onFocus={() => preloadBuiltins(OPTIONS.map((o) => o.id))}
        onPointerLeave={() => {
          if (hover.current) clearTimeout(hover.current)
        }}
        className="fc-scroll max-h-[360px] overflow-y-auto overscroll-contain rounded-[12px] border border-line bg-surface-2 py-1 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        data-testid="sound-picker"
      >
        {OPTIONS.map((o, i) => {
          const header = o.group !== lastGroup ? o.group : null
          lastGroup = o.group
          const isSel = i === selected
          return (
            <div key={o.id} role="presentation">
              {header && (
                <div
                  role="presentation"
                  className="px-3 pt-3 pb-1.5 font-mono text-[11.5px] font-semibold tracking-[0.04em] text-text-3 uppercase"
                >
                  {header}
                </div>
              )}
              <div
                id={`${base}-${i}`}
                role="option"
                aria-selected={isSel}
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'mouse') return
                  if (hover.current) clearTimeout(hover.current)
                  // A short rest first, so sweeping across the list doesn't play every sound.
                  hover.current = setTimeout(() => move(i), 140)
                }}
                onClick={(e) => {
                  unlockAudio()
                  // Touch has no hover: a tap plays it too.
                  if ((e.nativeEvent as PointerEvent).pointerType !== 'mouse') preview(o)
                  choose(i)
                  list.current?.focus({ preventScroll: true })
                }}
                className={cx(
                  'mx-1 grid cursor-pointer grid-cols-[1fr_auto] items-center gap-2 rounded-[8px] px-2.5 py-2',
                  isSel && 'bg-accent-soft shadow-[inset_0_0_0_1px_var(--fc-accent-line)]',
                  !isSel && i === active && 'bg-surface-3',
                )}
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-text">
                    {SOUND_LABEL[o.id]}
                  </span>
                  {o.id !== 'none' && (
                    <small className="block text-[12.5px] text-text-3">{SOUND_USE[o.id]}</small>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cx(
                      'fc-eq flex h-3.5 items-end gap-[2px]',
                      sounding === o.id ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                  {isSel && <Check size={15} className="text-accent-text" aria-hidden />}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
