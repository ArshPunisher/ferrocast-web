// Shared bits for Studio screens: the API, status icons, the streamer-only sound and
// file downloads.

import { useMemo } from 'react'
import { CheckCircle, Circle, MinusCircle, WarningCircle, XCircle } from '@phosphor-icons/react'
import { studioApi, type CheckStatus, type ShowStep, type StudioApi } from '@ferrocast/api'
import { cx } from '@ferrocast/ui'
import { useClient } from '../../lib/hooks'

export function useStudio(): StudioApi {
  const client = useClient()
  return useMemo(() => studioApi(client), [client])
}

type Status = CheckStatus | ShowStep['status']

const ICON: Record<Status, { Icon: typeof CheckCircle; cls: string; label: string }> = {
  ok: { Icon: CheckCircle, cls: 'text-ok', label: 'OK' },
  done: { Icon: CheckCircle, cls: 'text-ok', label: 'Done' },
  warn: { Icon: WarningCircle, cls: 'text-warn', label: 'Warning' },
  fail: { Icon: XCircle, cls: 'text-danger', label: 'Problem' },
  failed: { Icon: XCircle, cls: 'text-danger', label: 'Failed' },
  skip: { Icon: MinusCircle, cls: 'text-text-3', label: 'Skipped' },
  skipped: { Icon: MinusCircle, cls: 'text-text-3', label: 'Skipped' },
  waiting: { Icon: Circle, cls: 'text-accent-text', label: 'Waiting' },
}

export function StatusIcon({ status, className }: { status: Status; className?: string }) {
  const s = ICON[status]
  return (
    <s.Icon
      size={18}
      weight="fill"
      className={cx('shrink-0', s.cls, className)}
      aria-label={s.label}
      role="img"
    />
  )
}

/** "4:05" from seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

let audio: AudioContext | null = null

/**
 * The "Don't miss" sound. It plays in the dashboard only (the streamer's headphones),
 * never on stream. Made with Web Audio, so no file and nothing to load.
 */
export function playMomentSound(sound: string, volume: number): void {
  if (sound === 'none' || volume <= 0) return
  try {
    audio ??= new AudioContext()
    const ctx = audio
    // Made before any click, the context starts suspended and would stay silent.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    const notes = sound === 'coin' ? [988, 1319] : sound === 'bell' ? [523, 784, 1047] : [784, 1175]
    const gain = ctx.createGain()
    gain.gain.value = Math.min(1, volume / 100) * 0.25
    gain.connect(ctx.destination)
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = sound === 'bell' ? 'triangle' : 'sine'
      o.frequency.value = f
      const t = ctx.currentTime + i * 0.12
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(1, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      o.connect(g).connect(gain)
      o.start(t)
      o.stop(t + 0.55)
    })
  } catch {
    // No audio (autoplay blocked, no device): the lane still shows the moment.
  }
}

/** Saves a Blob as a file. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const PLATFORM_LABEL: Record<string, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  tips: 'Tips',
  ferrocast: 'Ferrocast',
}
