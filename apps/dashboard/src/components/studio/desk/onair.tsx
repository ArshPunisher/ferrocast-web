// Record and Go live as the owner picked them (C2, 29 Oct): Record a soft red, Go live a warm
// Molten gradient that lifts on hover. Pressed, a button changes at once ("Starting…" with a
// line racing round its edge) while the engine takes its seconds; on air it turns deep red
// with a moving texture, small sound bars and the time. Motion stops with Reduce motion.

import type { ReactNode } from 'react'
import { Broadcast, HourglassMedium, Pause, Record as RecordIcon } from '@phosphor-icons/react'
import { cx } from '@ferrocast/ui'

/** `ending`: the show's ending is playing and the engine stops the stream in `left` seconds. */
export type AirState = 'idle' | 'starting' | 'on' | 'stopping' | 'ending'

export function OnAirButton({
  kind,
  state,
  time,
  onClick,
  disabled,
  title,
  onContextMenu,
  paused,
  working,
  left,
  countdown,
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
  /**
   * A press is being answered (the stream or recording is starting or stopping): another press
   * does nothing. Marked `aria-disabled`, not `disabled`, so the button keeps keyboard focus
   * while it works and a double click never starts twice.
   */
  working?: boolean
  /** While `ending`: whole seconds before the stream stops (null: not known). */
  left?: number | null
  /** While `on` during a Show countdown: fixed-width mono time left ("04:59", "00:10"). */
  countdown?: string | null
}) {
  const tag = kind === 'rec' ? 'REC' : 'LIVE'
  const idle = kind === 'rec' ? 'Record' : 'Go live'
  const showCountdown = state === 'on' && kind === 'live' && !!countdown
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
        {tag}{' '}
        <span
          className={cx(
            'font-mono text-[12.5px] tabular-nums',
            showCountdown && 'hidden sm:inline',
          )}
        >
          {time}
        </span>
        {showCountdown && (
          <>
            <span aria-hidden className="h-3.5 w-px bg-white/30" />
            <span className="inline-flex items-center gap-1">
              <HourglassMedium size={13} weight="fill" aria-hidden />
              <span className="hidden text-[12px] font-semibold opacity-90 sm:inline">Starts</span>
              <span
                data-countdown
                className="inline-block min-w-[5ch] text-right font-mono text-[12.5px] tabular-nums"
              >
                {countdown}
              </span>
            </span>
          </>
        )}
      </>
    )
  else if (state === 'ending')
    face = (
      <>
        <HourglassMedium size={14} weight="fill" aria-hidden />
        {left == null ? (
          'Ending…'
        ) : (
          <>
            Ending in{' '}
            <span className="inline-block min-w-[2ch] text-right font-mono text-[12.5px] tabular-nums">
              {left}
            </span>{' '}
            s
          </>
        )}
      </>
    )
  else if (state === 'starting') face = 'Starting…'
  else if (state === 'stopping') face = kind === 'rec' ? 'Saving…' : 'Ending…'
  else
    face = (
      <>
        {kind === 'rec' ? (
          <RecordIcon size={15} weight="bold" aria-hidden />
        ) : (
          <Broadcast size={15} weight="bold" aria-hidden />
        )}
        {idle}
      </>
    )
  const label =
    state === 'on'
      ? kind === 'rec'
        ? `Stop recording (${paused ? 'paused at' : 'recording'} ${time})`
        : showCountdown
          ? `End stream (live ${time}, show starts in ${countdown})`
          : `End stream (live ${time})`
      : state === 'ending'
        ? `The stream is ending${left == null ? '' : `, it stops in ${left} seconds`} (live ${time})`
        : undefined
  return (
    <button
      type="button"
      data-kind={kind}
      data-state={state}
      data-paused={paused || undefined}
      aria-label={label}
      aria-busy={state === 'starting' || state === 'stopping' || undefined}
      aria-disabled={working || state === 'ending' || undefined}
      disabled={disabled || state === 'stopping'}
      title={title ?? label}
      onClick={working || state === 'ending' ? undefined : onClick}
      onContextMenu={onContextMenu}
      className={cx('fc-air', 'h-8 px-3 text-[13.5px] max-sm:w-full max-sm:justify-center')}
    >
      {face}
      {state === 'starting' && (
        <svg aria-hidden className="fc-air-trace" preserveAspectRatio="none" viewBox="0 0 100 100">
          <rect x="1" y="1" width="98" height="98" rx="6" pathLength="200" />
        </svg>
      )}
    </button>
  )
}
