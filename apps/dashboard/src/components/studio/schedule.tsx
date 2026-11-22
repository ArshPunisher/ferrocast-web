// Planned streams (Phase 3 #24): a title, a start time and the platforms. YouTube and Facebook
// get a scheduled broadcast; every platform gets one reminder. Nothing here goes live: Go live
// is always your own press. API.md "Stream schedule".

import { useMemo, useState } from 'react'
import { CalendarPlus, Trash } from '@phosphor-icons/react'
import {
  PLATFORM_LABEL,
  SCHEDULE_PLATFORMS,
  describeError,
  scheduleApi,
  scheduleStartLabel,
  type SchedulePlatform,
  type ScheduledStream,
} from '@ferrocast/api'
import { Button, Dialog, Field, IconButton, Input, Select, Skeleton, cx } from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useClient, useNow, useResource } from '../../lib/hooks'

/** A value for `<input type="datetime-local">`, in this computer's time. */
function localInput(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const WHEN = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

export function SchedulePanel() {
  const client = useClient()
  const api = useMemo(() => scheduleApi(client), [client])
  const res = useResource(() => api.list(), [api])
  const { run, busy } = useAction()
  const now = useNow(30_000)
  const [open, setOpen] = useState(false)
  return (
    <Panel
      id="schedule"
      title="Planned streams"
      actions={
        <Button size="sm" icon={<CalendarPlus size={16} />} onClick={() => setOpen(true)}>
          Plan a stream
        </Button>
      }
    >
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {res.error && !res.data ? (
          <LoadError error={res.error} onRetry={res.reload} />
        ) : !res.data ? (
          <Skeleton className="h-16" />
        ) : res.data.length === 0 ? (
          <p className="text-[14.5px] text-text-2">
            Nothing planned. Plan a stream to get a reminder, and a scheduled broadcast on YouTube
            or Facebook. Ferrocast never goes live by itself: you press Go live.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {res.data.map((s) => (
              <Plan
                key={s.id}
                s={s}
                now={now}
                busy={busy === `del:${s.id}`}
                onDelete={() =>
                  void run(`del:${s.id}`, () => api.remove(s.id), {
                    success: 'Removed. A broadcast already made on a platform stays there.',
                  }).then(() => res.reload())
                }
              />
            ))}
          </ul>
        )}
      </div>
      <PlanDialog
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false)
          res.reload()
        }}
      />
    </Panel>
  )
}

function Plan({
  s,
  now,
  busy,
  onDelete,
}: {
  s: ScheduledStream
  now: number
  busy: boolean
  onDelete: () => void
}) {
  return (
    <li className="flex flex-col gap-2 rounded-[12px] border border-line p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-text">{s.info.title}</p>
          <p className="text-[14px] text-text-2">
            {WHEN.format(s.start_ms)}, {scheduleStartLabel(s.start_ms, now)}
          </p>
        </div>
        <IconButton label={`Remove ${s.info.title ?? 'plan'}`} disabled={busy} onClick={onDelete}>
          <Trash size={16} />
        </IconButton>
      </div>
      <ul className="flex flex-col gap-1">
        {s.broadcasts.map((b) => (
          <li key={b.platform} className="text-[14px] text-text-2">
            <span className="font-semibold text-text">{PLATFORM_LABEL[b.platform]}</span>
            {': '}
            {b.id ? (
              <>
                scheduled
                {b.url && (
                  <>
                    {' '}
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-accent-text hover:underline"
                    >
                      Open it
                    </a>
                  </>
                )}
              </>
            ) : (
              (b.note ?? 'reminder only')
            )}
          </li>
        ))}
      </ul>
    </li>
  )
}

function PlanDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const client = useClient()
  const api = useMemo(() => scheduleApi(client), [client])
  const { run, busy } = useAction()
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(() => localInput(Date.now() + 3_600_000))
  const [platforms, setPlatforms] = useState<SchedulePlatform[]>(['youtube'])
  const [remind, setRemind] = useState(10)
  const [err, setErr] = useState<{ field: string; message: string } | null>(null)
  const toggle = (p: SchedulePlatform) =>
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
  const submit = () => {
    setErr(null)
    void run(
      'plan',
      () =>
        api
          .create({
            info: { title },
            platforms,
            start_ms: new Date(start).getTime() || 0,
            remind_minutes: remind,
          })
          .catch((e: unknown) => {
            const m = describeError(e).message
            setErr({
              field: /^(title|start|platforms|remind_minutes):/.exec(m)?.[1] ?? 'form',
              message: m.replace(/^[a-z_]+:\s*/, ''),
            })
            throw e
          }),
      { quiet: true, success: 'Planned. You’ll get a reminder before it starts.' },
    ).then((v) => {
      if (!v) return
      setTitle('')
      onSaved()
    })
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Plan a stream"
      sheetOnMobile
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy === 'plan'}
            disabled={!title.trim() || platforms.length === 0}
            onClick={submit}
          >
            Plan it
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Title" error={err?.field === 'title' ? err.message : null}>
          {(a) => (
            <Input
              {...a}
              name="title"
              value={title}
              maxLength={140}
              onChange={(e) => setTitle(e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Starts" error={err?.field === 'start' ? err.message : null}>
          {(a) => (
            <Input
              {...a}
              name="start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold text-text">Platforms</span>
          <div role="group" aria-label="Platforms" className="flex flex-wrap gap-2">
            {SCHEDULE_PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={platforms.includes(p)}
                onClick={() => toggle(p)}
                className={cx(
                  'fc-press inline-flex h-9 items-center rounded-full border px-3 text-[13.5px] font-semibold',
                  'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                  platforms.includes(p)
                    ? 'border-accent-line bg-accent-soft text-text'
                    : 'border-line-strong bg-surface-3 text-text-2 hover:text-text',
                )}
              >
                {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
          <p className="text-[14px] text-text-2">
            YouTube and Facebook get a scheduled broadcast when connected. Twitch and Kick have
            none, so you get the reminder only.
          </p>
          {err?.field === 'platforms' && (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {err.message}
            </p>
          )}
        </div>
        <Field label="Remind me" error={err?.field === 'remind_minutes' ? err.message : null}>
          {(a) => (
            <Select {...a} value={remind} onChange={(e) => setRemind(Number(e.target.value))}>
              <option value={5}>5 minutes before</option>
              <option value={10}>10 minutes before</option>
              <option value={30}>30 minutes before</option>
              <option value={60}>1 hour before</option>
            </Select>
          )}
        </Field>
        {err?.field === 'form' && (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {err.message}
          </p>
        )}
      </form>
    </Dialog>
  )
}
