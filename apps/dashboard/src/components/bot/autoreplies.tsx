import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BracketsCurly,
  CaretDown,
  CheckCircle,
  PencilSimple,
  Plus,
  Trash,
  XCircle,
} from '@phosphor-icons/react'
import {
  AUTOREPLY_LIMITS,
  AUTOREPLY_VARS,
  BLANK_AUTOREPLY,
  CHAT_PLATFORMS,
  MATCH_KIND_LABEL,
  PLATFORM_LABEL,
  autoRepliesApi,
  autoReplyError,
  autoReplyStarters,
  plural,
  type AutoReply,
  type AutoReplyMatchKind,
  type AutoReplyRole,
  type AutoReplyTry,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  PlatformMark,
  Segmented,
  Select,
  Skeleton,
  Switch,
  Textarea,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { Menu } from '../Menu'
import { done, useAction, useClient, useResource } from '../../lib/hooks'

type Draft = AutoReply | Omit<AutoReply, 'id'>

const ROLE_LABEL: Record<AutoReplyRole, string> = {
  everyone: 'Everyone',
  subs: 'Subs and up',
  vips: 'VIPs and up',
  mods: 'Mods only',
}

const KIND_HINT: Record<AutoReplyMatchKind, string> = {
  contains: 'Anywhere in the message.',
  word: 'As a whole word: “game” skips “gameplay”.',
  starts_with: 'The message starts with it.',
  regex: 'A regular expression, for experts.',
}

/** Sample messages for the starters' Try it field. */
const STARTER_SAMPLE: Record<string, string> = {
  'Discord link': 'is there a discord?',
  'What game': 'what game is this',
  Greeting: 'hello chat',
}

const seconds = (s: number) =>
  s === 0 ? 'None' : s < 60 ? plural(s, 'second', 'seconds') : plural(s / 60, 'minute', 'minutes')

function matchSummary(r: Draft): string {
  return `${MATCH_KIND_LABEL[r.match.kind]}: ${r.match.text}`
}

/** "Try it": asks the engine whether a sample message matches the draft, as you type. */
function TryIt({ draft, initial }: { draft: Draft; initial: string }) {
  const client = useClient()
  const [text, setText] = useState(initial)
  const [result, setResult] = useState<AutoReplyTry | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const key = JSON.stringify([text, draft.match, draft.reply])
  useEffect(() => {
    if (!text.trim() || !draft.match.text.trim()) {
      setResult(null)
      setProblem(null)
      return
    }
    let alive = true
    const t = setTimeout(() => {
      autoRepliesApi(client)
        .try(text, draft)
        .then((r) => {
          if (!alive) return
          setResult(r)
          setProblem(null)
        })
        .catch((e: unknown) => {
          if (!alive) return
          setResult(null)
          setProblem(autoReplyError(e).message)
        })
    }, 220)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // `key` covers the draft fields that change the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client])
  return (
    <div className="rounded-panel border border-line bg-surface-2 p-3 sm:p-4">
      <Field label="Try it" hint="Type a message a viewer might send.">
        {(p) => (
          <Input
            {...p}
            value={text}
            maxLength={500}
            placeholder="is there a discord?"
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
      <div aria-live="polite" className="mt-3 min-h-11">
        {problem ? (
          <p className="text-[13.5px] font-semibold text-danger">{problem}</p>
        ) : result?.matched ? (
          <div className="flex items-start gap-2.5">
            <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-ok" />
            <div className="min-w-0">
              <p className="font-display text-[17px] font-bold tracking-tight text-text">Matches</p>
              <p className="mt-0.5 text-[14.5px] break-words text-text-2">
                {result.reply ? (
                  <>
                    Bot says: <span className="font-semibold text-text">{result.reply}</span>
                  </>
                ) : (
                  'Write a reply to see what the bot says.'
                )}
              </p>
            </div>
          </div>
        ) : result ? (
          <div className="flex items-center gap-2.5">
            <XCircle size={22} weight="fill" className="shrink-0 text-text-3" />
            <p className="font-display text-[17px] font-bold tracking-tight text-text-2">
              No match
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AutoReplyDialog({
  value,
  sample,
  onClose,
  onSaved,
}: {
  value: Draft | null
  sample: string
  onClose: () => void
  onSaved: (r: AutoReply) => void
}) {
  const client = useClient()
  const [r, setR] = useState(value)
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const replyRef = useRef<HTMLTextAreaElement>(null)
  if (value !== null && r === null) setR(value)
  if (!r) return null
  const isNew = !('id' in r)
  const api = autoRepliesApi(client)
  const close = () => {
    setR(null)
    setErr(null)
    onClose()
  }
  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      const body = { ...r, name: r.name.trim() || r.match.text.trim().slice(0, 60) }
      const saved = 'id' in body ? await api.save(body) : await api.create(body)
      onSaved(saved)
      setR(null)
    } catch (e) {
      setErr(autoReplyError(e))
    } finally {
      setBusy(false)
    }
  }
  const insert = (v: string) => {
    const el = replyRef.current
    const token = `{${v}}`
    const at = el?.selectionStart ?? r.reply.length
    const end = el?.selectionEnd ?? at
    const next = r.reply.slice(0, at) + token + r.reply.slice(end)
    setR({ ...r, reply: next })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + token.length, at + token.length)
    })
  }
  const togglePlatform = (p: (typeof CHAT_PLATFORMS)[number]) => {
    const all = r.platforms.length === 0 ? [...CHAT_PLATFORMS] : r.platforms
    const next = all.includes(p) ? all.filter((x) => x !== p) : [...all, p]
    // None ticked or all ticked both mean "everywhere".
    setR({ ...r, platforms: next.length === CHAT_PLATFORMS.length ? [] : next })
  }
  const replyLen = Array.from(r.reply).length
  const fieldErr = (f: string) => (err?.field === f ? err.message : null)
  return (
    <Dialog
      open
      onClose={close}
      title={isNew ? 'New auto-reply' : `Edit ${r.name || 'auto-reply'}`}
      footer={
        <>
          {err && !err.field && (
            <p role="alert" className="mr-auto text-[13.5px] font-semibold text-danger">
              {err.message}
            </p>
          )}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="flex flex-col gap-2">
          <span className="text-[13.5px] font-semibold text-text" id="ar-kind">
            When a message
          </span>
          <Segmented<AutoReplyMatchKind>
            label="How to match"
            value={r.match.kind}
            className="flex w-full [&>label]:flex-1 [&>label]:text-center"
            options={(Object.keys(MATCH_KIND_LABEL) as AutoReplyMatchKind[]).map((k) => ({
              value: k,
              label: k === 'contains' ? 'Has' : MATCH_KIND_LABEL[k],
              title: KIND_HINT[k],
            }))}
            onChange={(kind) => setR({ ...r, match: { ...r.match, kind } })}
          />
        </div>
        <Field
          label={r.match.kind === 'regex' ? 'Pattern' : 'Words'}
          hint={KIND_HINT[r.match.kind]}
          error={fieldErr('match.text')}
        >
          {(p) => (
            <Input
              {...p}
              autoFocus
              value={r.match.text}
              maxLength={AUTOREPLY_LIMITS.matchChars}
              spellCheck={r.match.kind !== 'regex'}
              className={cx(
                'h-11 text-[16px] font-semibold',
                r.match.kind === 'regex' && 'font-mono',
              )}
              placeholder={r.match.kind === 'regex' ? '(what|which) game' : 'discord'}
              onChange={(e) => setR({ ...r, match: { ...r.match, text: e.target.value } })}
            />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-end justify-between gap-2">
            <label htmlFor="ar-reply" className="text-[13.5px] font-semibold text-text">
              Bot replies
            </label>
            <Menu
              label="Insert a variable"
              align="end"
              trigger={(p) => (
                <Button
                  {...p}
                  size="sm"
                  variant="ghost"
                  icon={<BracketsCurly size={15} />}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  Insert
                  <CaretDown size={12} className="-mr-0.5 opacity-70" />
                </Button>
              )}
              items={AUTOREPLY_VARS.map((v) => ({
                key: v.name,
                label: <span className="font-mono text-[13px]">{`{${v.name}}`}</span>,
                hint: v.hint,
                onSelect: () => insert(v.name),
              }))}
            />
          </div>
          <Textarea
            id="ar-reply"
            ref={replyRef}
            rows={3}
            value={r.reply}
            maxLength={AUTOREPLY_LIMITS.replyChars + 50}
            aria-invalid={fieldErr('reply') ? true : undefined}
            aria-describedby="ar-reply-meta"
            className="text-[15px]"
            placeholder="Join the Discord: discord.gg/yourcode"
            onChange={(e) => setR({ ...r, reply: e.target.value })}
          />
          <p id="ar-reply-meta" className="flex justify-between gap-3 text-[13px] leading-snug">
            {fieldErr('reply') ? (
              <span role="alert" className="font-semibold text-danger">
                {fieldErr('reply')}
              </span>
            ) : (
              <span className="text-text-3">{'{user}'} is who wrote it.</span>
            )}
            <span
              className={cx(
                'shrink-0 font-mono tabular-nums',
                replyLen > AUTOREPLY_LIMITS.replyChars
                  ? 'font-semibold text-danger'
                  : 'text-text-3',
              )}
            >
              {replyLen}/{AUTOREPLY_LIMITS.replyChars}
            </span>
          </p>
        </div>

        <TryIt draft={r} initial={sample} />

        <details className="group rounded-panel border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-panel px-4 py-3 text-[14px] font-semibold text-text select-none hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            More
            <span className="flex items-center gap-2 text-[13px] font-normal text-text-3">
              {r.only_when_live ? 'Live only' : 'Always'}, {seconds(r.cooldown_s).toLowerCase()}
              <CaretDown size={14} className="transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-line px-4 pt-4 pb-4">
            <Field label="Name" optional hint="Shown in your list.">
              {(p) => (
                <Input
                  {...p}
                  value={r.name}
                  maxLength={AUTOREPLY_LIMITS.nameChars}
                  placeholder={r.match.text || 'Discord link'}
                  onChange={(e) => setR({ ...r, name: e.target.value })}
                />
              )}
            </Field>
            {fieldErr('name') && (
              <p role="alert" className="-mt-2 text-[13px] font-semibold text-danger">
                {fieldErr('name')}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <span className="text-[13.5px] font-semibold text-text">Platforms</span>
              <div className="flex flex-wrap gap-2">
                {CHAT_PLATFORMS.map((p) => {
                  const on = r.platforms.length === 0 || r.platforms.includes(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      onClick={() => togglePlatform(p)}
                      className={cx(
                        'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors',
                        'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none active:scale-[0.97]',
                        on
                          ? 'border-accent-line bg-accent-soft text-accent-text'
                          : 'border-line-strong text-text-3 hover:text-text-2',
                      )}
                    >
                      <PlatformMark platform={p} size={13} />
                      {PLATFORM_LABEL[p]}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Answers">
                {(p) => (
                  <Select
                    {...p}
                    value={r.min_role}
                    onChange={(e) => setR({ ...r, min_role: e.target.value as AutoReplyRole })}
                  >
                    {Object.entries(ROLE_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Cooldown" error={fieldErr('cooldown_s')}>
                {(p) => (
                  <Select
                    {...p}
                    value={r.cooldown_s}
                    onChange={(e) => setR({ ...r, cooldown_s: Number(e.target.value) })}
                  >
                    {[...new Set([5, 15, 30, 60, 120, 300, 600, r.cooldown_s])]
                      .sort((a, b) => a - b)
                      .map((s) => (
                        <option key={s} value={s}>
                          {seconds(s)}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
              <Field label="Per viewer" error={fieldErr('user_cooldown_s')}>
                {(p) => (
                  <Select
                    {...p}
                    value={r.user_cooldown_s}
                    onChange={(e) => setR({ ...r, user_cooldown_s: Number(e.target.value) })}
                  >
                    {[...new Set([0, 60, 120, 300, 600, 1800, r.user_cooldown_s])]
                      .sort((a, b) => a - b)
                      .map((s) => (
                        <option key={s} value={s}>
                          {seconds(s)}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
            </div>
            <Switch
              checked={r.only_when_live}
              label="Only while live"
              description="Stays quiet when you’re offline."
              onChange={(only_when_live) => setR({ ...r, only_when_live })}
            />
            <Switch
              checked={r.match.case_sensitive}
              label="Match capitals exactly"
              description="Off: “Discord” and “discord” both match."
              onChange={(case_sensitive) => setR({ ...r, match: { ...r.match, case_sensitive } })}
            />
          </div>
        </details>
      </form>
    </Dialog>
  )
}

/** The Bot page's Auto-replies section: list, toggles, order, add/edit with Try it. */
export function AutoRepliesPanel() {
  const client = useClient()
  const list = useResource((c) => autoRepliesApi(c).list())
  const { run } = useAction()
  const [edit, setEdit] = useState<{ value: Draft; sample: string } | null>(null)
  const api = autoRepliesApi(client)
  const rules = list.data ?? []
  const full = rules.length >= AUTOREPLY_LIMITS.rules
  // Order decides which rule answers, so only the newest reorder's answer is shown.
  const orderSeq = useRef(0)

  const move = (i: number, by: -1 | 1) => {
    const next = [...rules]
    const [it] = next.splice(i, 1)
    if (!it) return
    next.splice(i + by, 0, it)
    list.set(next)
    const seq = ++orderSeq.current
    void run('order', () => api.reorder(next.map((x) => x.id))).then((saved) => {
      if (seq !== orderSeq.current) return
      if (saved) list.set(saved)
      else list.reload()
    })
  }

  const remove = (r: AutoReply) =>
    void run('del', () => done(api.remove(r.id))).then((ok) => {
      if (!ok) return
      const at = rules.findIndex((x) => x.id === r.id)
      list.set((p) => (p ?? []).filter((x) => x.id !== r.id))
      const { id: _id, ...rest } = r
      toast({
        tone: 'ok',
        message: `${r.name} deleted.`,
        action: {
          label: 'Undo',
          run: () =>
            void api
              .create(rest)
              .then(async (back) => {
                // Back where it was: a rule's place decides whether it answers first.
                const order = (await api.list()).filter((x) => x.id !== back.id).map((x) => x.id)
                order.splice(Math.max(0, at), 0, back.id)
                list.set(await api.reorder(order))
              })
              .catch(() => toast({ tone: 'error', message: `Couldn’t bring ${r.name} back.` })),
        },
      })
    })

  return (
    <Panel
      id="autoreplies"
      title="Auto-replies"
      description="The bot answers when chat mentions something. Commands always win."
      actions={
        rules.length > 0 && (
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={14} weight="bold" />}
            disabled={full}
            title={full ? `Up to ${AUTOREPLY_LIMITS.rules} auto-replies` : undefined}
            onClick={() => setEdit({ value: { ...BLANK_AUTOREPLY }, sample: '' })}
            aria-label="New auto-reply"
          >
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New auto-reply</span>
          </Button>
        )
      }
    >
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Skeleton className="h-32" />
      ) : rules.length === 0 ? (
        <div className="flex flex-col gap-4 py-1">
          <p className="font-display text-[19px] leading-snug font-bold tracking-tight text-text">
            Answer the questions chat asks every stream.
          </p>
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {autoReplyStarters().map((s) => (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => setEdit({ value: s, sample: STARTER_SAMPLE[s.name] ?? '' })}
                  className={cx(
                    'flex h-full w-full flex-col gap-1.5 rounded-panel border border-line bg-surface-2 p-3.5 text-left transition-[border-color,transform] duration-150',
                    'hover:border-accent-line focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none active:scale-[0.98]',
                  )}
                >
                  <span className="text-[13px] font-semibold text-text-3">
                    Chat says “{s.match.text}”
                  </span>
                  <span className="text-[15px] leading-snug font-semibold break-words text-text">
                    {s.reply}
                  </span>
                  <span className="mt-auto pt-1 text-[13.5px] font-bold text-accent-text">
                    Use this
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div>
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => setEdit({ value: { ...BLANK_AUTOREPLY }, sample: '' })}
            >
              Start from scratch
            </Button>
          </div>
        </div>
      ) : (
        <ol className="-mx-2 flex flex-col" aria-label="Auto-replies, checked in this order">
          {rules.map((r, i) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-control px-2 py-3 hover:bg-surface-2 sm:flex-nowrap"
            >
              <div className="order-1 min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <button
                    type="button"
                    className="text-left text-[15.5px] font-bold text-text hover:underline focus-visible:underline focus-visible:outline-none"
                    onClick={() => setEdit({ value: r, sample: '' })}
                  >
                    {r.name}
                  </button>
                  {r.min_role !== 'everyone' && <Badge>{ROLE_LABEL[r.min_role]}</Badge>}
                  {!r.only_when_live && <Badge>Always</Badge>}
                </p>
                <p className="mt-0.5 font-mono text-[12.5px] break-all text-text-3">
                  {matchSummary(r)}
                </p>
                <p className="mt-1 line-clamp-2 text-[14px] break-words text-text-2">{r.reply}</p>
              </div>
              <div className="order-3 -ml-2 flex w-full shrink-0 items-center gap-0.5 sm:order-2 sm:ml-0 sm:w-auto">
                <IconButton
                  size="sm"
                  label={`Move ${r.name} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={15} />
                </IconButton>
                <IconButton
                  size="sm"
                  label={`Move ${r.name} down`}
                  disabled={i === rules.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={15} />
                </IconButton>
                <IconButton
                  size="sm"
                  label={`Edit ${r.name}`}
                  onClick={() => setEdit({ value: r, sample: '' })}
                >
                  <PencilSimple size={15} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="danger-ghost"
                  label={`Delete ${r.name}`}
                  onClick={() => remove(r)}
                >
                  <Trash size={15} />
                </IconButton>
              </div>
              <div className="order-2 pt-1 sm:order-3">
                <Switch
                  checked={r.enabled}
                  hideLabel
                  label={`${r.name} on`}
                  onChange={(enabled) => {
                    list.set((p) => (p ?? []).map((x) => (x.id === r.id ? { ...x, enabled } : x)))
                    void run('tog', () => api.save({ ...r, enabled })).then((s) => {
                      if (!s) list.reload()
                    })
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
      <AutoReplyDialog
        value={edit?.value ?? null}
        sample={edit?.sample ?? ''}
        onClose={() => setEdit(null)}
        onSaved={(saved) => {
          list.set((p) => {
            const l = p ?? []
            return l.some((x) => x.id === saved.id)
              ? l.map((x) => (x.id === saved.id ? saved : x))
              : [...l, saved]
          })
          setEdit(null)
          toast({ tone: 'ok', message: `${saved.name} saved.` })
        }}
      />
    </Panel>
  )
}
