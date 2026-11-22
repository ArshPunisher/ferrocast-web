// Put several clips into one: the order, an optional crossfade, one loudness, a name. It starts
// a background job and closes; the progress is under "Working on".

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, X } from '@phosphor-icons/react'
import {
  MAX_COMPILE,
  clipLength,
  clipNameProblem,
  compileProblem,
  type Clip,
  type ClipsApi,
} from '@ferrocast/api'
import { Button, Dialog, Field, IconButton, Input, Select, Switch } from '@ferrocast/ui'
import { useAction } from '../../../lib/hooks'

const FADES = [
  ['0', 'None (a cut)'],
  ['0.5', 'Half a second'],
  ['1', 'One second'],
  ['2', 'Two seconds'],
] as const

export function CompileDialog({
  api,
  clips,
  onClose,
  onStarted,
  onOrder,
}: {
  api: ClipsApi
  /** The picked clips, in order. */
  clips: Clip[]
  onClose: () => void
  onStarted: () => void
  /** The order changed (or a clip was taken out). */
  onOrder: (ids: string[]) => void
}) {
  const { busy, run } = useAction()
  const [fade, setFade] = useState('0')
  const [normalize, setNormalize] = useState(true)
  const [name, setName] = useState('')
  // Each clip's length, asked once: a fade must fit, and the total is shown.
  const [lengths, setLengths] = useState<Record<string, number | null | 'error'>>({})
  useEffect(() => {
    let alive = true
    for (const c of clips) {
      if (c.id in lengths) continue
      api
        .probe(c.id)
        .then((p) => alive && setLengths((l) => ({ ...l, [c.id]: p.duration_ms })))
        .catch(() => alive && setLengths((l) => ({ ...l, [c.id]: 'error' })))
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, clips.map((c) => c.id).join('|')])
  const known = clips.map((c) => lengths[c.id])
  const waiting = known.some((l) => l === undefined)
  const unreadable = clips.filter((c) => lengths[c.id] === 'error')
  const ms = known.map((l) => (typeof l === 'number' ? l : null))
  const fadeS = Number(fade)
  const total = ms.every((l) => l !== null)
    ? ms.reduce<number>((s, l) => s + (l ?? 0), 0) - fadeS * 1000 * Math.max(0, clips.length - 1)
    : null
  const problem =
    compileProblem(
      {
        clips: clips.map((c) => c.id),
        crossfade_s: fadeS,
        ...(name.trim() ? { name: name.trim() } : {}),
      },
      ms,
    ) ?? (unreadable.length ? `${unreadable[0]?.name} can't be read.` : null)
  const nameError = name.trim() ? clipNameProblem(name.trim()) : null
  const move = (i: number, by: number) => {
    const ids = clips.map((c) => c.id)
    const j = i + by
    if (j < 0 || j >= ids.length) return
    const a = ids[i]
    const b = ids[j]
    if (a === undefined || b === undefined) return
    ids[i] = b
    ids[j] = a
    onOrder(ids)
  }
  useEffect(() => {
    // Taking clips out until fewer than two are left leaves nothing to compile.
    if (clips.length < 2) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips.length])
  const start = async () => {
    const job = await run('compile', () =>
      api.compile({
        clips: clips.map((c) => c.id),
        crossfade_s: fadeS,
        normalize,
        ...(name.trim() ? { name: name.trim() } : {}),
      }),
    )
    if (job) onStarted()
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Compile clips"
      description={`Put ${clips.length} clips into one file, in this order. Your clips stay as they are. At most ${MAX_COMPILE}.`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={busy === 'compile'}
            disabled={problem !== null || nameError !== null || waiting}
            onClick={() => void start()}
          >
            Start
          </Button>
        </>
      }
    >
      <ol className="mb-4 flex flex-col gap-1.5" aria-label="Clips in order">
        {clips.map((c, i) => (
          <li
            key={c.id}
            className="flex min-w-0 items-center gap-2 rounded-control border border-line bg-surface-2 py-1.5 pr-1.5 pl-3"
          >
            <span className="w-5 shrink-0 text-[14px] font-bold text-text-3" aria-hidden="true">
              {i + 1}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text"
              title={c.name}
            >
              {c.name}
            </span>
            <span className="shrink-0 text-[13.5px] text-text-3 tabular-nums">
              {lengths[c.id] === undefined
                ? '…'
                : lengths[c.id] === 'error'
                  ? '?'
                  : clipLength(lengths[c.id] as number | null)}
            </span>
            <IconButton
              label={`Move ${c.name} up`}
              size="sm"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp size={16} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`Move ${c.name} down`}
              size="sm"
              disabled={i === clips.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown size={16} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={`Take ${c.name} out`}
              size="sm"
              onClick={() => onOrder(clips.filter((x) => x.id !== c.id).map((x) => x.id))}
            >
              <X size={16} aria-hidden="true" />
            </IconButton>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Crossfade"
          hint="A short blend between clips, in picture and sound. A clip must be longer than twice the fade."
        >
          {(p) => (
            <Select {...p} value={fade} onChange={(e) => setFade(e.target.value)}>
              {FADES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Name"
          optional
          error={nameError}
          hint="Without one it's called Compilation. A name that's taken gets a number."
        >
          {(p) => (
            <Input
              {...p}
              value={name}
              maxLength={120}
              placeholder="Compilation"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="mt-4">
        <Switch
          checked={normalize}
          onChange={setNormalize}
          label="Even out the loudness"
          description="One steady volume for the whole file (EBU R128), so a quiet clip doesn't follow a loud one."
        />
      </div>
      <p className="mt-4 min-h-6 text-[14.5px] text-text-2" aria-live="polite">
        {problem ? (
          <span role="alert" className="font-semibold text-danger">
            {problem}
          </span>
        ) : waiting ? (
          'Reading the clips…'
        ) : total !== null ? (
          <>
            About <span className="font-semibold text-text">{clipLength(total)}</span> long.
          </>
        ) : null}
      </p>
    </Dialog>
  )
}
