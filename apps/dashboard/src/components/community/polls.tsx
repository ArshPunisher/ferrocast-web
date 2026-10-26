import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowCounterClockwise, ChartBar, Plus, Stop, X } from '@phosphor-icons/react'
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
      className="flex flex-1 flex-col gap-3.5"
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
            placeholder="Ask chat, e.g. Which map next…"
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
              className="w-16 shrink-0 font-mono text-[14.5px] font-bold whitespace-nowrap text-[var(--fc-twitch)]"
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
      {err && err.field !== 'question' && err.field !== 'options' && (
        <p role="alert" className="text-[14.5px] text-danger">
          {err.message}
        </p>
      )}
      {/* How long and Start on one line, at the bottom of the card. */}
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
        <Segmented
          label="How long"
          value={duration as (typeof DURATIONS)[number]['value']}
          onChange={setDuration}
          options={DURATIONS.map((d) => ({ value: d.value, label: d.label }))}
        />
        <span className="flex-1" />
        <Button type="submit" variant="primary" busy={busy}>
          Start poll
        </Button>
      </div>
    </form>
  )
}

function Results({ poll }: { poll: PollView }) {
  const reduce = useReducedMotion()
  const leaders = new Set(poll.leaders)
  return (
    <ol className="flex flex-col gap-2" aria-label="Results">
      {poll.options.map((o, i) => {
        const share = poll.total > 0 ? o.votes / poll.total : 0
        const top = leaders.has(i)
        const lead = poll.closed && top
        return (
          <li
            key={i}
            title={o.text}
            className={cx(
              'relative flex items-center gap-3 overflow-hidden rounded-[11px] bg-surface-2 px-3.5 py-2.5',
              poll.closed && !lead && 'opacity-60',
            )}
          >
            {/* The share fills the answer's own row (no separate grey track). */}
            <motion.span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-full origin-left"
              style={{
                background: `color-mix(in srgb, var(--fc-twitch) ${top ? 28 : 16}%, transparent)`,
              }}
              initial={false}
              animate={{ scaleX: share }}
              transition={reduce ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
            <span className="relative w-5 shrink-0 font-mono text-[14.5px] font-bold text-[var(--fc-twitch)]">
              {i + 1}
            </span>
            <span dir="auto" className="relative min-w-0 flex-1 truncate font-bold text-text">
              {tameText(o.text)}
            </span>
            {lead && (
              <span className="relative">
                <Badge tone="accent">Winner</Badge>
              </span>
            )}
            <span className="relative shrink-0 font-mono text-[14.5px] font-semibold text-text tabular-nums">
              {Math.round(share * 100)}%
            </span>
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
      icon={<ChartBar weight="fill" />}
      tone="var(--fc-twitch)"
      className="h-full"
      bodyClassName="flex flex-col"
      description="Viewers vote in chat with !vote 1, on every platform."
      actions={
        poll ? (
          <span className="flex items-center gap-2">
            {open && (
              <span
                className="font-mono text-[15px] font-bold text-text tabular-nums"
                aria-label="Time left"
              >
                {clock(poll.ends_at - now)}
              </span>
            )}
            <Badge tone={open ? 'danger' : 'neutral'}>{open ? 'Live' : 'Closed'}</Badge>
          </span>
        ) : null
      }
    >
      {initial.error ? (
        <LoadError error={initial.error} onRetry={initial.reload} />
      ) : initial.loading && !shown ? (
        <Skeleton className="h-56" />
      ) : poll ? (
        <div className="flex flex-1 flex-col gap-3.5">
          <p
            dir="auto"
            title={poll.question}
            className="font-display text-[17px] font-bold tracking-tight break-words text-text"
          >
            {tameText(poll.question)}
          </p>
          <Results poll={poll} />
          <p className="text-[14.5px] font-semibold text-text-2" aria-live="polite">
            {formatCount(poll.total)} {poll.total === 1 ? 'vote' : 'votes'}
            {open ? '' : '. The result was posted to chat.'}
          </p>
          <div className="mt-auto flex flex-wrap justify-end gap-2">
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
