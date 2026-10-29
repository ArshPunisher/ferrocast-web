// Record and Go live as the owner picked them (C2, 29 Oct): Record a soft red, Go live a warm
// Molten gradient that lifts on hover. Pressed, a button changes at once ("Starting…" with a
// line racing round its edge) while the engine takes its seconds; on air it turns deep red
// with a moving texture, small sound bars and the time. Motion stops with Reduce motion.

import type { ReactNode } from 'react'
import { Broadcast, Pause, Record as RecordIcon } from '@phosphor-icons/react'
import { cx } from '@ferrocast/ui'

export type AirState = 'idle' | 'starting' | 'on' | 'stopping'

export function OnAirButton({
  kind,
  state,
  time,
  onClick,
  disabled,
  title,
  onContextMenu,
  paused,
}: {
  kind: 'rec' | 'live'
  state: AirState
  /** The time on air, shown while on. */
  time: string
  onClick: () => void
  disabled?: boolean
  title?: string | undefined
  onContextMenu?: (e: React.MouseEvent) => void
  /** A recording on pause: still, with a pause mark instead of the moving bars. */
  paused?: boolean
}) {
  const tag = kind === 'rec' ? 'REC' : 'LIVE'
  const idle = kind === 'rec' ? 'Record' : 'Go live'
  let face: ReactNode
  if (state === 'on')
    face = (
      <>
        {paused ? (
          <Pause size={14} weight="fill" aria-hidden />
        ) : (
          <span aria-hidden className="fc-air-eq">
            <b />
            <b />
            <b />
          </span>
        )}
        {tag} <span className="font-mono text-[13.5px] tabular-nums">{time}</span>
      </>
    )
  else if (state === 'starting') face = 'Starting…'
  else if (state === 'stopping') face = kind === 'rec' ? 'Saving…' : 'Ending…'
  else
    face = (
      <>
        {kind === 'rec' ? (
          <RecordIcon size={17} weight="bold" aria-hidden />
        ) : (
          <Broadcast size={17} weight="bold" aria-hidden />
        )}
        {idle}
      </>
    )
  const label =
    state === 'on'
      ? kind === 'rec'
        ? `Stop recording (${paused ? 'paused at' : 'recording'} ${time})`
        : `End stream (live ${time})`
      : undefined
  return (
    <button
      type="button"
      data-kind={kind}
      data-state={state}
      data-paused={paused || undefined}
      aria-label={label}
      aria-busy={state === 'starting' || state === 'stopping' || undefined}
      disabled={disabled || state === 'stopping'}
      title={title ?? label}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cx('fc-air', 'h-10 px-3.5 text-[15px]')}
    >
      {face}
      {state === 'starting' && (
        <svg aria-hidden className="fc-air-trace" preserveAspectRatio="none" viewBox="0 0 100 100">
          <rect x="1" y="1" width="98" height="98" rx="10" pathLength="200" />
        </svg>
      )}
    </button>
  )
}
