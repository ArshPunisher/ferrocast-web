// Trim: keep the part between In and Out as a new clip. The times come from the playhead or
// are typed; the original is never touched.

import { useState } from 'react'
import { Scissors } from '@phosphor-icons/react'
import {
  clipLength,
  clipNameProblem,
  trimProblem,
  type Clip,
  type ClipProbe,
  type ClipsApi,
} from '@ferrocast/api'
import { Button, Field, Input, Switch } from '@ferrocast/ui'
import { useAction } from '../../../lib/hooks'
import { TimeInput } from './time-input'

export function TrimSection({
  api,
  clip,
  probe,
  playhead,
  seek,
  ffmpegReady,
  onStarted,
}: {
  api: ClipsApi
  clip: Clip
  probe: ClipProbe | null
  /** The player's time now (ms), or null when it can't play. */
  playhead: () => number | null
  seek: (ms: number) => void
  ffmpegReady: boolean
  onStarted: () => void
}) {
  const { busy, run } = useAction()
  const total = probe?.duration_ms ?? null
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState<number | null>(null)
  const out = end ?? total ?? 0
  const [precise, setPrecise] = useState(false)
  const [name, setName] = useState('')
  const problem =
    total === null ? "The length of this clip isn't known yet." : trimProblem(start, out, total)
  const nameError = name.trim() ? clipNameProblem(name.trim()) : null
  const keep = Math.max(0, Math.min(out, total ?? out) - start)
  const left = total ? Math.min(100, (start / total) * 100) : 0
  const width = total ? Math.max(0.5, Math.min(100 - left, (keep / total) * 100)) : 0
  const go = async () => {
    const job = await run('trim', () =>
      api.trim(clip.id, {
        start_ms: start,
        end_ms: out,
        precise,
        ...(name.trim() ? { name: name.trim() } : {}),
      }),
    )
    if (job) onStarted()
  }
  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative h-3 overflow-hidden rounded-full bg-inset"
        role="img"
        aria-label={
          total ? `Keeping ${clipLength(keep)} of ${clipLength(total)}` : 'Length not known'
        }
      >
        <div
          className="absolute inset-y-0 rounded-full bg-accent"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <TimeInput
            label="In"
            value={start}
            max={total}
            onCommit={(ms) => {
              setStart(ms)
              seek(ms)
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={playhead() === null}
            title={
              playhead() === null
                ? "This clip can't be played here: type the time instead."
                : undefined
            }
            onClick={() => {
              const t = playhead()
              if (t !== null) setStart(Math.round(t))
            }}
          >
            In here
          </Button>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <TimeInput
            label="Out"
            value={out}
            max={total}
            onCommit={(ms) => {
              setEnd(ms)
              seek(ms)
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={playhead() === null}
            title={
              playhead() === null
                ? "This clip can't be played here: type the time instead."
                : undefined
            }
            onClick={() => {
              const t = playhead()
              if (t !== null) setEnd(Math.round(t))
            }}
          >
            Out here
          </Button>
        </div>
      </div>
      <Field
        label="Name"
        optional
        error={nameError}
        hint={`Without one it's called "${clip.name} trimmed". A name that's taken gets a number.`}
      >
        {(p) => (
          <Input
            {...p}
            value={name}
            maxLength={120}
            placeholder={`${clip.name} trimmed`}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Switch
        checked={precise}
        onChange={setPrecise}
        label="Exact cut"
        description="Off: a quick cut with no loss, starting at the nearest keyframe (up to a few seconds early). On: the picture is made again, so it starts exactly where you say, and takes longer."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          icon={<Scissors size={17} aria-hidden="true" />}
          busy={busy === 'trim'}
          disabled={problem !== null || nameError !== null || !ffmpegReady}
          onClick={() => void go()}
        >
          Trim to a new clip
        </Button>
        <p className="min-w-0 flex-1 text-[14.5px] text-text-2" aria-live="polite">
          {!ffmpegReady ? (
            <span className="font-semibold text-danger">FFmpeg isn't installed.</span>
          ) : problem ? (
            <span role="alert" className="font-semibold text-danger">
              {problem}
            </span>
          ) : (
            <>
              Keeps <span className="font-semibold text-text">{clipLength(keep)}</span>. The
              original stays.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
