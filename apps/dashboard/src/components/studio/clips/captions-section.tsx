// Captions: made by the speech model already on this computer (nothing is sent anywhere), read
// back as a list to fix, saved beside the clip as .srt, exported, or burned into a copy.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClosedCaptioning, DownloadSimple, Plus, Trash } from '@phosphor-icons/react'
import {
  cuesProblem,
  renderSrt,
  type Clip,
  type ClipJob,
  type ClipsApi,
  type Cue,
} from '@ferrocast/api'
import { Button, IconButton, Skeleton, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction } from '../../../lib/hooks'
import { saveBlob } from '../common'
import { JobRow } from './jobs-panel'
import { TimeInput } from './time-input'

const same = (a: Cue[], b: Cue[]) => JSON.stringify(a) === JSON.stringify(b)

export function CaptionsSection({
  api,
  clip,
  jobs,
  playhead,
  ffmpegReady,
  onStarted,
  onChanged,
}: {
  api: ClipsApi
  clip: Clip
  jobs: ClipJob[]
  playhead: () => number | null
  ffmpegReady: boolean
  /** A job began (burning): the dialog closes to show it. */
  onStarted: () => void
  /** The captions were saved or made (the library shows its "Captions" mark). */
  onChanged: () => void
}) {
  const { busy, run } = useAction()
  const [saved, setSaved] = useState<Cue[] | null>(null)
  const [draft, setDraft] = useState<Cue[]>([])
  const [error, setError] = useState<unknown>(null)
  const [making, setMaking] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null)
    api
      .captions(clip.id)
      .then((r) => {
        setSaved(r.cues)
        setDraft(r.cues)
      })
      .catch(setError)
  }, [api, clip.id])
  useEffect(load, [load])
  // The speech model's job: the captions appear when it is done, its trouble is said in place.
  const makingJob = making ? jobs.find((j) => j.id === making) : undefined
  const state = makingJob?.state
  useEffect(() => {
    if (state === 'done') {
      setMaking(null)
      load()
      onChanged()
    } else if (state === 'cancelled') setMaking(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  const dirty = saved !== null && !same(saved, draft)
  const problem = useMemo(() => cuesProblem(draft), [draft])
  const set = (i: number, patch: Partial<Cue>) =>
    setDraft((d) => d.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const add = () => {
    const at = Math.round(playhead() ?? draft.at(-1)?.end_ms ?? 0)
    const next = [...draft, { start_ms: at, end_ms: at + 2000, text: '' }].sort(
      (a, b) => a.start_ms - b.start_ms,
    )
    setDraft(next)
  }
  const save = async () => {
    const r = await run('save', () => api.saveCaptions(clip.id, draft), {
      success: 'Captions saved.',
    })
    if (r) {
      setSaved(r.cues)
      setDraft(r.cues)
      onChanged()
    }
  }
  const make = async () => {
    const job = await run('make', () => api.makeCaptions(clip.id))
    if (job) {
      setMaking(job.id)
      onStarted()
    }
  }
  const burn = async () => {
    const job = await run('burn', () => api.burnCaptions(clip.id))
    if (job) {
      toast({
        tone: 'info',
        message: 'Burning the captions into a new copy.',
        hint: 'Watch it under Working on.',
      })
      onStarted()
    }
  }
  if (error != null) return <LoadError error={error} onRetry={load} />
  if (saved === null)
    return (
      <div className="flex flex-col gap-2" aria-label="Loading the captions">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )
  if (saved.length === 0 && draft.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        {makingJob && makingJob.state !== 'done' ? (
          <ul className="w-full" aria-label="Making captions">
            <JobRow
              job={makingJob}
              compact
              {...(makingJob.state === 'failed' ? { onDismiss: () => setMaking(null) } : {})}
            />
          </ul>
        ) : (
          <>
            <ClosedCaptioning size={30} className="text-text-3" aria-hidden="true" />
            <p className="text-[16px] font-bold text-text">No captions yet.</p>
            <p className="max-w-[52ch] text-[14.5px] text-text-3">
              Ferrocast writes down what was said with the speech model on this computer. Nothing is
              uploaded. You can fix the words before you use them.
            </p>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={<ClosedCaptioning size={17} aria-hidden="true" />}
            busy={
              busy === 'make' ||
              (makingJob !== undefined &&
                (makingJob.state === 'queued' || makingJob.state === 'running'))
            }
            disabled={!ffmpegReady}
            onClick={() => void make()}
          >
            Make captions
          </Button>
          <Button variant="outline" icon={<Plus size={16} aria-hidden="true" />} onClick={add}>
            Write them myself
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <ol
        className="flex max-h-[44vh] flex-col gap-2 overflow-y-auto pr-1"
        aria-label="Captions"
        tabIndex={0}
      >
        {draft.map((c, i) => (
          <li
            key={i}
            className="flex flex-col gap-2 rounded-control border border-line bg-surface-2 p-2.5"
          >
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-[8.5rem]">
                <TimeInput
                  label={`Caption ${i + 1} starts`}
                  value={c.start_ms}
                  onCommit={(ms) => set(i, { start_ms: ms })}
                />
              </div>
              <div className="w-[8.5rem]">
                <TimeInput
                  label={`Caption ${i + 1} ends`}
                  value={c.end_ms}
                  onCommit={(ms) => set(i, { end_ms: ms })}
                />
              </div>
              <IconButton
                label={`Delete caption ${i + 1}`}
                size="sm"
                className="mb-1 ml-auto"
                onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
              >
                <Trash size={16} aria-hidden="true" />
              </IconButton>
            </div>
            <textarea
              aria-label={`Caption ${i + 1} words`}
              value={c.text}
              rows={2}
              maxLength={300}
              onChange={(e) => set(i, { text: e.target.value })}
              className="w-full resize-y rounded-control border border-line-strong bg-inset px-3 py-2 text-[15.5px] text-text hover:border-text-3 focus:border-accent-text focus:shadow-[0_0_0_3px_var(--fc-accent-soft)] focus:outline-none"
            />
          </li>
        ))}
      </ol>
      <p
        role={problem ? 'alert' : undefined}
        className="min-h-5 text-[14.5px] font-semibold text-danger"
      >
        {problem}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          busy={busy === 'save'}
          disabled={!dirty || problem !== null}
          onClick={() => void save()}
        >
          Save captions
        </Button>
        <Button variant="outline" icon={<Plus size={16} aria-hidden="true" />} onClick={add}>
          Add
        </Button>
        <Button
          variant="outline"
          icon={<DownloadSimple size={16} aria-hidden="true" />}
          disabled={problem !== null || draft.length === 0}
          onClick={() =>
            saveBlob(
              new Blob([renderSrt(draft)], { type: 'application/x-subrip' }),
              `${clip.name}.srt`,
            )
          }
        >
          Export .srt
        </Button>
        <Button
          variant="outline"
          busy={busy === 'burn'}
          disabled={dirty || saved.length === 0 || !ffmpegReady}
          title={dirty ? 'Save the captions first.' : undefined}
          onClick={() => void burn()}
        >
          Burn into a copy
        </Button>
      </div>
      <p className="text-[13.5px] text-text-3">
        {dirty ? 'Unsaved changes. ' : 'Saved beside the clip as .srt. '}
        Burning makes a new copy with the words in the picture; the clip stays as it is.
      </p>
    </div>
  )
}
