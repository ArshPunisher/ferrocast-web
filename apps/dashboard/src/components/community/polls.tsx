import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowCounterClockwise, Plus, Stop, X } from '@phosphor-icons/react'
import {
  POLL_LIMITS,
  fieldError,
  formatCount,
  tameText,
  type PollSpec,
  type PollView,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Segmented,
  Skeleton,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useClient, useNow, useResource } from '../../lib/hooks'
import { useLive } from '../../lib/store'
import { isCloud } from '../../lib/boot'

const DURATIONS = [
  { value: '30', label: '30 s' },
  { value: '60', label: '1 min' },
  { value: '120', label: '2 min' },
  { value: '300', label: '5 min' },
] as const

const PRESETS: { label: string; options: string[] }[] = [
  { label: 'Yes or no', options: ['Yes', 'No'] },
  { label: 'A, B or C', options: ['A', 'B', 'C'] },
]

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function NewPoll({ onStarted, last }: { onStarted: (p: PollView) => void; last: PollSpec | null }) {
  const client = useClient()
  const cloud = isCloud(useLive((s) => s.conn))
  const [question, setQuestion] = useState(last?.question ?? '')
  const [options, setOptions] = useState<string[]>(last?.options ?? ['', ''])
  const [duration, setDuration] = useState<string>(String(last?.duration_s ?? 60))
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const start = async () => {
    setBusy(true)
    setErr(null)
    try {
      const p = await client.startPoll({
        question,
        options: options.map((o) => o.trim()).filter(Boolean),
        duration_s: Number(duration),
      })
      onStarted(p)
      toast({
        tone: 'ok',
        message: cloud
          ? 'Poll started. The cloud bot posts it in chat while it’s on.'
          : 'Poll started and posted to chat.',
      })
    } catch (e) {
      setErr(fieldError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void start()
      }}
    >
      <Field label="Question" error={err?.field === 'question' ? err.message : null}>
        {(p) => (
          <Input
            {...p}
            value={question}
            maxLength={POLL_LIMITS.question}
            placeholder="Which map next…"
            onChange={(e) => setQuestion(e.target.value)}
          />
        )}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-[14.5px] font-medium text-text-2">
          Answers
          <span className="flex gap-1">
            {PRESETS.map((pr) => (
              <button
                key={pr.label}
                type="button"
                onClick={() => setOptions([...pr.options])}
                className="fc-press rounded-full border border-line px-2.5 py-0.5 text-[13.5px] font-medium text-text-3 hover:border-line-strong hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                {pr.label}
              </button>
            ))}
          </span>
        </legend>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="w-14 shrink-0 font-mono text-[14.5px] whitespace-nowrap text-text-3"
            >
              !vote {i + 1}
            </span>
            <label className="sr-only" htmlFor={`poll-opt-${i}`}>
              Answer {i + 1}
            </label>
            <Input
              id={`poll-opt-${i}`}
              value={o}
              maxLength={POLL_LIMITS.option}
              aria-invalid={err?.field === 'options' ? true : undefined}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <IconButton
              size="sm"
              label={`Remove answer ${i + 1}`}
              disabled={options.length <= POLL_LIMITS.minOptions}
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
            >
              <X size={14} />
            </IconButton>
          </div>
        ))}
        {err?.field === 'options' && (
          <p role="alert" className="text-[14.5px] font-medium text-danger">
            {err.message}
          </p>
        )}
        {options.length < POLL_LIMITS.maxOptions && (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            icon={<Plus size={14} weight="bold" />}
            onClick={() => setOptions([...options, ''])}
          >
            Add answer
          </Button>
        )}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <span id="poll-len" className="text-[14.5px] font-medium text-text-2">
          How long
        </span>
        <Segmented
          label="How long"
          value={duration as (typeof DURATIONS)[number]['value']}
          onChange={setDuration}
          options={DURATIONS.map((d) => ({ value: d.value, label: d.label }))}
        />
      </div>
      {err && err.field !== 'question' && err.field !== 'options' && (
        <p role="alert" className="text-[14.5px] text-danger">
          {err.message}
        </p>
      )}
      <Button type="submit" variant="primary" busy={busy} className="self-start">
        Start poll
      </Button>
    </form>
  )
}

function Results({ poll }: { poll: PollView }) {
  const reduce = useReducedMotion()
  const leaders = new Set(poll.leaders)
  return (
    <ol className="flex flex-col gap-3" aria-label="Results">
      {poll.options.map((o, i) => {
        const share = poll.total > 0 ? o.votes / poll.total : 0
        const lead = poll.closed && leaders.has(i)
        return (
          <li key={i} className={cx('flex flex-col gap-1.5', poll.closed && !lead && 'opacity-60')}>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="w-5 shrink-0 font-mono text-[14.5px] text-text-3">{i + 1}</span>
              <span dir="auto" className="min-w-0 flex-1 truncate font-semibold text-text">
                {tameText(o.text)}
              </span>
              {lead && <Badge tone="accent">Winner</Badge>}
              <span className="shrink-0 font-mono text-[14.5px] text-text-2 tabular-nums">
                {formatCount(o.votes)} · {Math.round(share * 100)}%
              </span>
            </div>
            <div className="ml-7 h-2 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full origin-left rounded-full bg-accent"
                initial={false}
                animate={{ scaleX: share }}
                transition={reduce ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Polls: start one in a few clicks, watch votes live, end it early. */
export function PollPanel() {
  const client = useClient()
  const initial = useResource((c) => c.poll())
  const live = useLive((s) => s.poll)
  const now = useNow(1000)
  const { run, busy } = useAction()
  const [shown, setShown] = useState<PollView | null>(null)
  const [last, setLast] = useState<PollSpec | null>(null)
  const [composing, setComposing] = useState(false)
  // The newest of: what we loaded, what we started, what the live socket says.
  useEffect(() => {
    if (initial.data !== null && initial.data !== undefined) setShown(initial.data)
  }, [initial.data])
  useEffect(() => {
    if (live !== undefined) setShown(live)
  }, [live])
  const poll = composing ? null : shown
  const open = !!poll && !poll.closed && poll.ends_at > now
  return (
    <Panel
      title="Poll"
      description="Viewers vote in chat with !vote 1, on every platform."
      actions={
        poll && open ? (
          <span
            className="font-mono text-sm font-semibold text-accent-text tabular-nums"
            aria-label="Time left"
          >
            {clock(poll.ends_at - now)}
          </span>
        ) : null
      }
    >
      {initial.error ? (
        <LoadError error={initial.error} onRetry={initial.reload} />
      ) : initial.loading && !shown ? (
        <Skeleton className="h-56" />
      ) : poll ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <p dir="auto" className="font-display text-lg font-semibold tracking-tight text-text">
              {tameText(poll.question)}
            </p>
            <Badge tone={open ? 'ok' : 'neutral'}>{open ? 'Live' : 'Closed'}</Badge>
          </div>
          <Results poll={poll} />
          <p className="text-[14.5px] text-text-3" aria-live="polite">
            {formatCount(poll.total)} {poll.total === 1 ? 'vote' : 'votes'}
            {open ? '' : '. The result was posted to chat.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {open ? (
              <Button
                variant="primary"
                icon={<Stop size={15} weight="fill" />}
                busy={busy === 'end'}
                onClick={() =>
                  void run('end', () => client.endPoll()).then((p) => p && setShown(p))
                }
              >
                End now
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  icon={<Plus size={15} weight="bold" />}
                  onClick={() => {
                    setLast(null)
                    setComposing(true)
                  }}
                >
                  New poll
                </Button>
                <Button
                  icon={<ArrowCounterClockwise size={15} />}
                  onClick={() => {
                    setLast({
                      question: poll.question,
                      options: poll.options.map((o) => o.text),
                      duration_s: Math.round((poll.ends_at - poll.started_at) / 1000),
                    })
                    setComposing(true)
                  }}
                >
                  Ask again
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <NewPoll
          key={last ? `again-${last.question}` : 'new'}
          last={last}
          onStarted={(p) => {
            setShown(p)
            setComposing(false)
          }}
        />
      )}
    </Panel>
  )
}
