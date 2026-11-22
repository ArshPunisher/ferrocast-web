// The background work: one line per job with its progress, a way to stop it, and what it made.
// It stays until dismissed, so a failure can be read after it happened.

import { CheckCircle, WarningCircle, X, YoutubeLogo } from '@phosphor-icons/react'
import { jobActive, type ClipJob } from '@ferrocast/api'
import { Badge, Button, IconButton, cx } from '@ferrocast/ui'
import { Panel } from '../../Panel'
import { openExternal } from '../../../lib/external'

const KIND: Record<ClipJob['kind'], string> = {
  trim: 'Trim',
  compile: 'Compile',
  captions: 'Captions',
  burn: 'Burn in',
  upload: 'YouTube',
}

export function stateWord(j: Pick<ClipJob, 'state'>): string {
  switch (j.state) {
    case 'queued':
      return 'Waiting'
    case 'running':
      return 'Working'
    case 'done':
      return 'Done'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Stopped'
  }
}

export function JobRow({
  job,
  onCancel,
  onDismiss,
  onShow,
  compact = false,
}: {
  job: ClipJob
  onCancel?: (id: string) => void
  onDismiss?: (id: string) => void
  /** Opens the clip a job made. */
  onShow?: (id: string) => void
  compact?: boolean
}) {
  const pct = Math.round(job.progress * 100)
  const active = jobActive(job)
  return (
    <li
      data-job={job.id}
      data-state={job.state}
      className={cx(
        'flex flex-col gap-2 rounded-control border border-line bg-surface-2 p-3',
        job.state === 'failed' && 'border-danger/40 bg-danger-soft',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Badge tone={job.state === 'failed' ? 'danger' : job.state === 'done' ? 'ok' : 'neutral'}>
          {KIND[job.kind]}
        </Badge>
        <span
          className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text"
          title={job.label}
        >
          {job.label}
        </span>
        <span className="shrink-0 text-[14px] text-text-3 tabular-nums" aria-live="polite">
          {job.state === 'running' ? `${pct}%` : stateWord(job)}
        </span>
        {active && onCancel && (
          <Button
            size="xs"
            variant="outline"
            onClick={() => onCancel(job.id)}
            aria-label={`Stop ${job.label}`}
          >
            Stop
          </Button>
        )}
        {!active && onDismiss && (
          <IconButton
            label={`Remove ${job.label} from the list`}
            size="sm"
            onClick={() => onDismiss(job.id)}
          >
            <X size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {active && (
        <div
          role="progressbar"
          aria-label={job.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={job.state === 'queued' ? 0 : pct}
          className="h-1.5 overflow-hidden rounded-full bg-inset"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${job.state === 'queued' ? 0 : Math.max(3, pct)}%` }}
          />
        </div>
      )}
      {job.state === 'failed' && job.error && (
        <p role="alert" className="flex items-start gap-2 text-[14.5px] leading-snug text-text">
          <WarningCircle size={18} className="mt-px shrink-0 text-danger" aria-hidden="true" />
          <span>
            <span className="font-semibold">{job.error.message}</span>{' '}
            <span className="text-text-2">{job.error.hint}</span>
          </span>
        </p>
      )}
      {job.state === 'done' && !compact && (job.output || job.link) && (
        <div className="flex flex-wrap items-center gap-2 text-[14.5px]">
          <CheckCircle size={18} className="text-ok" weight="fill" aria-hidden="true" />
          {job.output && (
            <>
              <span className="min-w-0 truncate text-text-2">Made {job.output}</span>
              {onShow && (
                <Button size="xs" variant="outline" onClick={() => onShow(job.output!)}>
                  Show
                </Button>
              )}
            </>
          )}
          {job.link && (
            <Button
              size="xs"
              variant="outline"
              icon={<YoutubeLogo size={15} aria-hidden="true" />}
              onClick={() => openExternal(job.link!)}
            >
              Open on YouTube
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

export function JobsPanel({
  jobs,
  onCancel,
  onDismiss,
  onShow,
}: {
  jobs: ClipJob[]
  onCancel: (id: string) => void
  onDismiss: (id: string) => void
  onShow: (id: string) => void
}) {
  if (jobs.length === 0) return null
  const busy = jobs.filter(jobActive).length
  return (
    <Panel
      id="clip-jobs"
      title="Working on"
      description="Clips are made in the background, one at a time. Closing this tab doesn't stop them; Stop does, and nothing half-made stays."
      actions={busy > 0 ? <Badge tone="accent">{busy} running</Badge> : null}
    >
      <ul className="flex flex-col gap-2" aria-label="Clip jobs">
        {jobs.map((j) => (
          <JobRow key={j.id} job={j} onCancel={onCancel} onDismiss={onDismiss} onShow={onShow} />
        ))}
      </ul>
    </Panel>
  )
}
