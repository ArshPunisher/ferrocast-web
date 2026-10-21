// Pro smart features (API.md §4 "Smart features"): smart moderation on the Moderation page,
// smart replies on the Bot page, and the written recap on the Recap page. Never called "AI".
// Each sits in a calm Pro panel (hidden unless this relay has `features.smart` and Pro is
// active or on sale). A pause from the relay (its free allowance used up) shows its own
// words; the app's own filters, commands and auto-replies never wait on any of this.

import { useEffect, useState } from 'react'
import { ArrowCounterClockwise, Check, Sparkle, X } from '@phosphor-icons/react'
import {
  SMART_LIMITS,
  actionLabel,
  describeError,
  formatCount,
  smartApi,
  tameText,
  type ProQuota,
  type RecapSummary,
  type SmartLog,
  type SmartModMode,
  type SmartSuggestion,
  type SmartView,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Field,
  PlatformMark,
  Segmented,
  Skeleton,
  Switch,
  Textarea,
  Select,
  toast,
} from '@ferrocast/ui'
import { LoadError } from './Panel'
import { ProPanel } from './pro/ProPanel'
import { useAction, useClient, useResource } from '../lib/hooks'

function ago(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24
    ? `${h} h ago`
    : new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function until(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function Quota({ label, q }: { label: string; q: ProQuota | undefined }) {
  if (!q) return null
  return (
    <span className="font-mono text-[12.5px] text-text-3 tabular-nums">
      {label} {formatCount(q.used)} of {formatCount(q.limit)} today
    </span>
  )
}

/** The relay's own words when a feature is paused or refused. */
function Paused({ v, which }: { v: SmartView; which: 'moderation' | 'replies' }) {
  const until_ = which === 'moderation' ? v.moderation_paused_until : v.replies_paused_until
  if (!v.last_error && !until_) return null
  return (
    <div
      role="status"
      className="rounded-control border border-line bg-warn-soft px-3 py-2.5 text-[13.5px]"
    >
      <p className="font-semibold text-warn">{v.last_error?.message ?? 'Paused for now.'}</p>
      <p className="mt-0.5 text-text-2">
        {v.last_error?.hint}
        {until_ ? ` Ferrocast tries again at ${until(until_)}.` : ''}
      </p>
    </div>
  )
}

function useSmart() {
  const client = useClient()
  const res = useResource((c) => smartApi(c).view())
  const { busy, run } = useAction()
  const save = (
    patch: Parameters<ReturnType<typeof smartApi>['save']>[0],
    key = 'save',
    success?: string,
  ) => {
    // Shown at once; the saved answer (or the old one after a refusal) settles it.
    const before = res.data
    if (before) res.set({ ...before, settings: { ...before.settings, ...patch } })
    void run(key, () => smartApi(client).save(patch), success ? { success } : {}).then((v) => {
      if (v) res.set(v)
      else if (before) res.set(before)
    })
  }
  return { res, busy, run, save, client }
}

// ── Smart moderation ─────────────────────────────────────────────────────────────────

const MODES: { value: SmartModMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'suggest', label: 'Suggest' },
  { value: 'act', label: 'Act on clear cases' },
]

function SuggestionRow({
  s,
  onChange,
}: {
  s: SmartSuggestion
  onChange: (s: SmartSuggestion) => void
}) {
  const client = useClient()
  const { busy, run } = useAction()
  const act = (key: string, fn: () => Promise<SmartSuggestion>, success: string) =>
    void run(key, fn, { success }).then((v) => {
      if (v) onChange(v)
    })
  const pct = Math.round(s.confidence * 100)
  const done = s.state === 'done'
  return (
    <li
      className="flex flex-col gap-2 border-b border-line/60 py-3 last:border-0"
      data-testid="smart-suggestion"
      data-state={s.state}
    >
      <div className="flex min-w-0 items-center gap-2">
        <PlatformMark platform={s.platform} size={14} />
        <b className="min-w-0 truncate text-[14px] font-semibold text-text" dir="auto">
          {tameText(s.name)}
        </b>
        <span className="shrink-0 text-[12.5px] text-text-3">{ago(s.at)}</span>
        <span className="ml-auto shrink-0">
          {done ? (
            <Badge tone="ok">
              {s.done === 'timeout' && s.seconds
                ? `Timed out ${s.seconds} s`
                : s.done === 'ban'
                  ? 'Banned'
                  : 'Deleted'}
              {s.by === 'smart' ? ' on its own' : ''}
            </Badge>
          ) : s.state === 'undone' ? (
            <Badge>Undone</Badge>
          ) : s.state === 'dismissed' ? (
            <Badge>Dismissed</Badge>
          ) : (
            <Badge tone="warn">{actionLabel(s.action)}?</Badge>
          )}
        </span>
      </div>
      <p
        className="rounded-control bg-inset px-3 py-2 text-[14px] break-words text-text"
        dir="auto"
      >
        {tameText(s.text)}
      </p>
      <p className="text-[13px] text-text-2">
        {s.reason || s.category}{' '}
        <span className="font-mono text-text-3 tabular-nums">· {pct}% sure</span>
      </p>
      {s.error && <p className="text-[13px] font-semibold text-danger">{s.error}</p>}
      <div className="flex flex-wrap gap-2">
        {s.state === 'suggested' && (
          <>
            <Button
              size="sm"
              variant={s.action === 'ban' ? 'danger' : 'secondary'}
              busy={busy === 'apply'}
              onClick={() =>
                act('apply', () => smartApi(client).apply(s.id), `${actionLabel(s.action)}: done.`)
              }
            >
              {actionLabel(s.action)}
            </Button>
            {s.action !== 'timeout' && s.user_id && (
              <Button
                size="sm"
                variant="secondary"
                busy={busy === 'timeout'}
                onClick={() =>
                  act(
                    'timeout',
                    () => smartApi(client).apply(s.id, 'timeout', 600),
                    'Timed out for 10 minutes.',
                  )
                }
              >
                Time out 10 min
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<X size={14} />}
              busy={busy === 'dismiss'}
              onClick={() => act('dismiss', () => smartApi(client).dismiss(s.id), 'Dismissed.')}
            >
              Dismiss
            </Button>
          </>
        )}
        {done && s.done !== 'delete' && (
          <Button
            size="sm"
            variant="secondary"
            icon={<ArrowCounterClockwise size={14} />}
            busy={busy === 'undo'}
            onClick={() =>
              act(
                'undo',
                () => smartApi(client).undo(s.id),
                s.done === 'ban' ? 'Unbanned.' : 'Timeout lifted.',
              )
            }
          >
            Undo
          </Button>
        )}
      </div>
    </li>
  )
}

function SmartModerationBody() {
  const { res, busy, save } = useSmart()
  const log = useResource((c) => smartApi(c).log())
  const [rules, setRules] = useState<string | null>(null)
  // New suggestions arrive as they're found; look again while the page is open.
  const reloadLog = log.reload
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') reloadLog()
    }, 8_000)
    return () => window.clearInterval(t)
  }, [reloadLog])
  const v = res.data
  if (res.error) return <LoadError error={res.error} onRetry={res.reload} />
  if (!v) return <Skeleton className="h-40" />
  const items = log.data?.items ?? []
  const open = items.filter((s) => s.state === 'suggested')
  const setItem = (s: SmartSuggestion) =>
    log.set((prev: SmartLog | null) => ({
      replies: prev?.replies ?? [],
      items: (prev?.items ?? []).map((x) => (x.id === s.id ? s : x)),
    }))
  const r = rules ?? v.settings.rules
  return (
    <div className="flex flex-col gap-4" data-testid="smart-moderation">
      <p className="max-w-[70ch] text-[13.5px] text-text-2">
        A second look at doubtful chat that passed your filters, in English, Hindi and Hinglish. You
        decide what happens. Nothing is ever banned on its own.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Smart moderation"
          size="sm"
          value={v.settings.moderation}
          options={MODES}
          onChange={(m) => save({ moderation: m }, 'mode')}
        />
        <Quota label="Checks" q={v.quotas.smart_moderation} />
      </div>
      {v.settings.moderation === 'act' && (
        <Field
          label="Automatic timeout"
          hint="Only for very clear cases, and every one can be undone below."
        >
          {(p) => (
            <Select
              {...p}
              className="max-w-[220px]"
              value={String(v.settings.act_timeout_s)}
              onChange={(e) => save({ act_timeout_s: Number(e.target.value) }, 'timeout')}
            >
              {[30, 60, 120, 300, 600].map((s) => (
                <option key={s} value={s}>
                  {s < 60 ? `${s} seconds` : `${s / 60} ${s === 60 ? 'minute' : 'minutes'}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {v.settings.moderation !== 'off' && (
        <Field
          label="Your own rules"
          optional
          hint={`Things your chat should know, like "no spoilers for the new season". ${r.length} of ${SMART_LIMITS.rules}.`}
        >
          {(p) => (
            <div className="flex flex-col gap-2">
              <Textarea
                {...p}
                rows={2}
                maxLength={SMART_LIMITS.rules}
                value={r}
                onChange={(e) => setRules(e.target.value)}
              />
              {rules !== null && rules !== v.settings.rules && (
                <Button
                  size="sm"
                  className="self-start"
                  busy={busy === 'rules'}
                  onClick={() => save({ rules: r }, 'rules', 'Rules saved.')}
                >
                  Save rules
                </Button>
              )}
            </div>
          )}
        </Field>
      )}
      <Paused v={v} which="moderation" />
      <div>
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-text">
          Suggestions {open.length > 0 && <Badge tone="warn">{open.length} to look at</Badge>}
        </h3>
        {log.error ? (
          <LoadError error={log.error} onRetry={log.reload} />
        ) : !log.data ? (
          <Skeleton className="mt-2 h-24" />
        ) : items.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-text-3">
            Nothing flagged yet. Flagged messages show up here as they come in.
          </p>
        ) : (
          <ul className="mt-1">
            {items.slice(0, 30).map((s) => (
              <SuggestionRow key={s.id} s={s} onChange={setItem} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function SmartModerationPanel() {
  return (
    <ProPanel feature="smart" id="smart-moderation" title="Smart moderation">
      <SmartModerationBody />
    </ProPanel>
  )
}

// ── Smart replies ────────────────────────────────────────────────────────────────────

function SmartRepliesBody() {
  const { res, busy, run, save, client } = useSmart()
  const log = useResource((c) => smartApi(c).log())
  const [about, setAbout] = useState<string | null>(null)
  const v = res.data
  if (res.error) return <LoadError error={res.error} onRetry={res.reload} />
  if (!v) return <Skeleton className="h-40" />
  const text = about ?? v.settings.about
  const dirty = about !== null && about.trim() !== v.settings.about.trim()
  const replies = log.data?.replies ?? []
  const approve = () =>
    void run(
      'approve',
      async () => {
        const saved = dirty ? await smartApi(client).save({ about: text }) : v
        return smartApi(client).approve(saved.settings.about)
      },
      { success: 'Approved. Smart replies use exactly this text.' },
    ).then((x) => {
      if (x) {
        res.set(x)
        setAbout(null)
      }
    })
  return (
    <div className="flex flex-col gap-4" data-testid="smart-replies">
      <Switch
        label="Answer questions in chat"
        description="When a viewer asks something your commands and auto-replies don't cover, the bot answers from the facts below. Only while you're live, at most one a minute."
        checked={v.settings.replies}
        disabled={busy === 'replies'}
        onChange={(on) => save({ replies: on }, 'replies')}
      />
      <Field
        label="Facts the bot may use"
        hint={`Your schedule, rig, links, rules. Nothing else is said. ${text.length} of ${SMART_LIMITS.about}.`}
      >
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            maxLength={SMART_LIMITS.about}
            value={text}
            onChange={(e) => setAbout(e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        {v.about_approved && !dirty ? (
          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ok">
            <Check size={15} aria-hidden /> Approved
          </span>
        ) : (
          <Button
            size="sm"
            variant="primary"
            busy={busy === 'approve'}
            disabled={!text.trim()}
            onClick={approve}
          >
            {dirty ? 'Save and approve' : 'Approve these facts'}
          </Button>
        )}
        {v.settings.replies && !v.about_approved && (
          <span className="text-[13px] text-text-3">Replies start once you approve the facts.</span>
        )}
        <Quota label="Replies" q={v.quotas.smart_replies} />
      </div>
      <Paused v={v} which="replies" />
      {replies.length > 0 && (
        <div>
          <h3 className="mb-1 text-[13px] font-semibold text-text-3">Recent replies</h3>
          <ul className="flex flex-col">
            {replies.slice(0, 5).map((r) => (
              <li
                key={`${r.at}:${r.name}`}
                className="flex flex-col gap-0.5 border-b border-line/60 py-2 last:border-0"
              >
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-text-3">
                  <PlatformMark platform={r.platform} size={13} />
                  <span className="truncate" dir="auto">
                    {tameText(r.name)}: {tameText(r.question)}
                  </span>
                  <span className="ml-auto shrink-0">{ago(r.at)}</span>
                </span>
                <span className="text-[14px] text-text" dir="auto">
                  {tameText(r.reply)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function SmartRepliesPanel({ className }: { className?: string }) {
  return (
    <ProPanel
      feature="smart"
      id="smart-replies"
      title="Smart replies"
      {...(className ? { className } : {})}
    >
      <SmartRepliesBody />
    </ProPanel>
  )
}

// ── The written recap ────────────────────────────────────────────────────────────────

function RecapWriterBody({ startedAt }: { startedAt: number }) {
  const client = useClient()
  const saved = useResource((c) => smartApi(c).recapSaved())
  const { busy, run } = useAction()
  const [fresh, setFresh] = useState<RecapSummary | null>(null)
  const r = fresh ?? (saved.data?.started_at === startedAt ? saved.data : null)
  const write = () =>
    void run('write', () => smartApi(client).writeRecap()).then((x) => {
      if (x) setFresh(x)
    })
  return (
    <div className="flex flex-col gap-3" data-testid="recap-writer">
      {r?.summary ? (
        <div className="flex flex-col gap-2">
          {r.summary.split('\n').map((line, i) => (
            <p
              key={i}
              className={
                line.startsWith('- ')
                  ? 'pl-3 text-[14px] text-text-2'
                  : 'text-[14.5px] leading-relaxed text-text'
              }
            >
              {line}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[13.5px] text-text-2">
          A few lines on how the stream went, who to thank and two ideas for next time. Only you see
          it.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant={r?.summary ? 'secondary' : 'primary'}
          icon={<Sparkle size={15} />}
          busy={busy === 'write'}
          onClick={write}
        >
          {r?.summary ? 'Write it again' : 'Write my recap'}
        </Button>
        {r?.summary && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(r.summary ?? '').then(
                () => toast({ tone: 'ok', message: 'Recap copied.' }),
                (e: unknown) => {
                  const d = describeError(e)
                  toast({
                    tone: 'error',
                    message: 'Couldn’t copy the recap.',
                    hint: d.hint ?? 'Select the text and copy it instead.',
                  })
                },
              )
            }}
          >
            Copy
          </Button>
        )}
      </div>
    </div>
  )
}

export function RecapWriter({ startedAt }: { startedAt: number }) {
  return (
    <ProPanel feature="smart" id="recap-writer" title="Written recap">
      <RecapWriterBody startedAt={startedAt} />
    </ProPanel>
  )
}
