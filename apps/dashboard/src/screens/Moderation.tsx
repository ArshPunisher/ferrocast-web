import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { MagnifyingGlass, ShieldWarning } from '@phosphor-icons/react'
import {
  PLATFORM_LABEL,
  Roles,
  plural,
  tameText,
  type BanEntry,
  type FilterAction,
  type Filters,
  type PanicConfig,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  InfoTip,
  Kbd,
  PlatformMark,
  Select,
  Skeleton,
  Switch,
  Textarea,
  cx,
} from '@ferrocast/ui'
import { LoadError, PageHeader, Panel } from '../components/Panel'
import { SmartModerationPanel } from '../components/smart'
import { HeldPanel } from '../components/held'
import { usePanic } from '../components/PanicButton'
import { done, useAction, useClient, useResource } from '../lib/hooks'
import { isLimited, useLive } from '../lib/store'
import { NeedsPc } from '../components/remote'
import { href } from '../lib/router'

const ACTIONS: { value: FilterAction; label: string }[] = [
  { value: 'delete', label: 'Delete the message' },
  { value: 'hold', label: 'Hold it for a mod' },
  { value: 'timeout', label: 'Time out the sender' },
  { value: 'ban', label: 'Ban the sender' },
]

function ActionSelect({
  value,
  onChange,
  label,
}: {
  value: FilterAction
  onChange: (v: FilterAction) => void
  label: string
}) {
  return (
    <Field label={label}>
      {(p) => (
        <Select {...p} value={value} onChange={(e) => onChange(e.target.value as FilterAction)}>
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
}

/** Who can post links, said the same way the switches below are set. */
export function linkRule(allowRoles: number): string {
  const who = ['Mods']
  if (allowRoles & Roles.VIP) who.push('VIPs')
  if (allowRoles & Roles.SUBSCRIBER) who.push('subscribers')
  const list = who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who.at(-1)}` : who[0]
  return `${list} can post links. Other links get the action below.`
}

function PanicCard() {
  const client = useClient()
  const [on, toggle] = usePanic()
  const cfg = useResource((c) => c.panicConfig())
  const { run } = useAction()
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  const save = (next: PanicConfig) => {
    cfg.set(next)
    void run('panic-cfg', () => client.savePanicConfig(next), { success: 'Panic plan saved.' })
  }
  const c = cfg.data
  // A mod's phone switches panic on and off; the plan stays the streamer's.
  const mod = useLive((s) => s.remote?.role === 'mod')
  return (
    <section
      aria-labelledby="panic-title"
      className={cx(
        'rounded-panel border p-4 shadow-1 sm:p-5',
        on ? 'border-danger/50 bg-danger-soft' : 'border-line bg-surface-1',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h2 id="panic-title" className="font-display text-lg font-semibold tracking-tight">
              Panic mode {on && <Badge tone="danger">On</Badge>}
            </h2>
            <InfoTip>
              For hate raids and bot floods. One press locks chat on every platform and pauses
              alerts.
            </InfoTip>
          </div>
          <p
            className="mt-2 flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-text-2"
            title="Works in this window and anywhere on the computer running Ferrocast."
          >
            Shortcut <Kbd>Ctrl</Kbd>
            <Kbd>{mac ? 'Option' : 'Alt'}</Kbd>
            <Kbd>Shift</Kbd>
            <Kbd>P</Kbd>
          </p>
        </div>
        <Button
          size="lg"
          variant={on ? 'secondary' : 'danger'}
          icon={<ShieldWarning size={20} weight="fill" />}
          onClick={() => void toggle()}
          className="w-full sm:w-auto"
        >
          {on ? 'Turn panic off' : 'Start panic mode'}
        </Button>
      </div>
      {!mod && (
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-line pt-4 md:grid-cols-2">
          {!c ? (
            <>
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </>
          ) : (
            <>
              <Switch
                checked={c.followers_only}
                onChange={(v) => save({ ...c, followers_only: v })}
                label="Followers-only chat"
                description={`Only people who followed at least ${plural(c.followers_only_minutes, 'minute', 'minutes')} ago can talk.`}
              />
              <Switch
                checked={c.hold_new_accounts}
                onChange={(v) => save({ ...c, hold_new_accounts: v })}
                label="Hold first-time chatters"
                description="Their messages wait for a mod."
              />
              <Switch
                checked={c.slow_mode_seconds > 0}
                onChange={(v) => save({ ...c, slow_mode_seconds: v ? 10 : 0 })}
                label="Slow mode"
                description="One message every 10 seconds per person."
              />
              <Switch
                checked={c.emote_only}
                onChange={(v) => save({ ...c, emote_only: v })}
                label="Emote-only"
                description="Twitch and Kick only."
              />
              <Switch
                checked={c.pause_alerts}
                onChange={(v) => save({ ...c, pause_alerts: v })}
                label="Pause alerts"
                description="Raids and follows wait until panic ends."
              />
              <Switch
                checked={c.pause_tts}
                onChange={(v) => save({ ...c, pause_tts: v })}
                label="Pause text-to-speech"
              />
            </>
          )}
        </div>
      )}
    </section>
  )
}

function BanList() {
  const client = useClient()
  const bans = useResource((c) => c.bans())
  const { run, busy } = useAction()
  const [q, setQ] = useState('')
  const reduce = useReducedMotion()
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (bans.data ?? []).filter(
      (b) =>
        !needle ||
        b.login.toLowerCase().includes(needle) ||
        b.display_name.toLowerCase().includes(needle) ||
        (b.reason ?? '').toLowerCase().includes(needle),
    )
  }, [bans.data, q])
  const unban = (b: BanEntry) =>
    void run(`unban-${b.user_id}`, () => done(client.unban(b.platform, b.user_id)), {
      success: `${tameText(b.display_name)} is unbanned on ${PLATFORM_LABEL[b.platform]}.`,
    }).then(
      (ok) =>
        ok &&
        bans.set((p) =>
          (p ?? []).filter((x) => !(x.user_id === b.user_id && x.platform === b.platform)),
        ),
    )
  return (
    <Panel
      title="Shared ban list"
      description="Everyone banned from your channels, on any platform."
      actions={
        <div className="relative">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3"
          />
          <label htmlFor="ban-search" className="sr-only">
            Search bans
          </label>
          <input
            id="ban-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-8 w-36 rounded-control border border-line bg-inset pr-2 pl-8 text-[13.5px] text-text placeholder:text-text-3 focus:border-accent-text focus:outline-none sm:w-48"
          />
        </div>
      }
    >
      {bans.error ? (
        <LoadError error={bans.error} onRetry={bans.reload} />
      ) : !bans.data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState compact title={q ? 'Nobody matches' : 'Nobody is banned'}>
          {q ? 'Try another name.' : 'Bans show up here with the reason.'}
        </EmptyState>
      ) : (
        <ul className="-mx-2 flex flex-col">
          <AnimatePresence initial={false}>
            {list.map((b) => (
              <motion.li
                key={`${b.platform}-${b.user_id}`}
                layout={!reduce}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                className="flex items-center gap-3 rounded-control px-2 py-2.5 hover:bg-surface-2"
              >
                <PlatformMark platform={b.platform} size={15} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span dir="auto" className="truncate font-semibold text-text">
                      {tameText(b.display_name)}
                    </span>
                    {b.everywhere && <Badge tone="accent">Every platform</Badge>}
                  </p>
                  <p className="mt-0.5 truncate text-[13.5px] text-text-3">
                    {b.reason ?? 'No reason given'} ·{' '}
                    {new Date(b.banned_at).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}
                    {b.by ? ` · by ${b.by}` : ''}
                  </p>
                  {b.offline && (
                    <p className="mt-0.5 text-[13px] font-medium text-text-2">
                      From your phone while the PC was off
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  busy={busy === `unban-${b.user_id}`}
                  onClick={() => unban(b)}
                >
                  Unban
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  )
}

function FiltersPanel() {
  const client = useClient()
  const res = useResource((c) => c.filters())
  const { run, busy } = useAction()
  const [f, setF] = useState<Filters | null>(null)
  useEffect(() => {
    if (res.data) setF(res.data)
  }, [res.data])
  if (res.error) return <LoadError error={res.error} onRetry={res.reload} />
  if (!f) return <Skeleton className="h-96" />
  const dirty = JSON.stringify(f) !== JSON.stringify(res.data)
  const set = <K extends keyof Filters>(k: K, v: Partial<Filters[K]>) =>
    setF({ ...f, [k]: { ...(f[k] as object), ...v } as Filters[K] })
  return (
    <Panel
      title="Chat filters"
      description="Runs before anything reaches overlays. Mods and you are never filtered."
      actions={
        <Button
          size="sm"
          variant="primary"
          disabled={!dirty}
          busy={busy === 'filters'}
          onClick={() =>
            void run('filters', () => client.saveFilters(f), { success: 'Filters saved.' }).then(
              (r) => r && res.set(r),
            )
          }
        >
          Save
        </Button>
      }
    >
      <div className="flex flex-col divide-y divide-line">
        <div className="flex flex-col gap-3 py-4 first:pt-1">
          <Switch
            checked={f.solicitation.enabled}
            onChange={(v) => set('solicitation', { enabled: v })}
            label="Scam and self-promotion"
            description="“I do commissions, DM me”, viewer sellers, fake promoters."
          />
          {f.solicitation.enabled && (
            <ActionSelect
              label="Then"
              value={f.solicitation.action}
              onChange={(v) => set('solicitation', { action: v })}
            />
          )}
        </div>
        <div className="flex flex-col gap-3 py-4">
          <Switch
            checked={f.words.enabled}
            onChange={(v) => set('words', { enabled: v })}
            label="Blocked words"
            description="Lookalike letters (0 for o) are caught too."
          />
          {f.words.enabled && (
            <>
              <Field label="Words and phrases" hint="One per line.">
                {(p) => (
                  <Textarea
                    {...p}
                    rows={4}
                    value={f.words.list.join('\n')}
                    onChange={(e) =>
                      set('words', {
                        list: e.target.value
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .slice(0, 2000),
                      })
                    }
                  />
                )}
              </Field>
              <ActionSelect
                label="Then"
                value={f.words.action}
                onChange={(v) => set('words', { action: v })}
              />
            </>
          )}
        </div>
        <div className="flex flex-col gap-3 py-4">
          <Switch
            checked={f.links.enabled}
            onChange={(v) => set('links', { enabled: v })}
            label="Links"
            description={linkRule(f.links.allow_roles)}
          />
          {f.links.enabled && (
            <>
              <Field label="Always allowed sites" hint="One per line, like clips.twitch.tv">
                {(p) => (
                  <Textarea
                    {...p}
                    rows={2}
                    value={f.links.allow_domains.join('\n')}
                    onChange={(e) =>
                      set('links', {
                        allow_domains: e.target.value
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                )}
              </Field>
              <Switch
                checked={(f.links.allow_roles & Roles.SUBSCRIBER) !== 0}
                onChange={(v) =>
                  set('links', {
                    allow_roles: v
                      ? f.links.allow_roles | Roles.SUBSCRIBER
                      : f.links.allow_roles & ~Roles.SUBSCRIBER,
                  })
                }
                label="Subscribers may post links"
              />
              <Switch
                checked={f.links.hold_first_time !== false}
                onChange={(v) => set('links', { hold_first_time: v })}
                label="Hold a first message with a link"
                description="A first-ever message with a link waits for a mod. Allowed sites pass."
              />
              <ActionSelect
                label="Then"
                value={f.links.action}
                onChange={(v) => set('links', { action: v })}
              />
            </>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Switch
              checked={f.caps.enabled}
              onChange={(v) => set('caps', { enabled: v })}
              label="Too many capitals"
            />
            {f.caps.enabled && (
              <Field label={`Over ${f.caps.max_percent}% capitals`}>
                {(p) => (
                  <input
                    {...p}
                    type="range"
                    min={30}
                    max={100}
                    value={f.caps.max_percent}
                    onChange={(e) => set('caps', { max_percent: Number(e.target.value) })}
                    className="h-8 w-full"
                  />
                )}
              </Field>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Switch
              checked={f.emotes.enabled}
              onChange={(v) => set('emotes', { enabled: v })}
              label="Emote spam"
            />
            {f.emotes.enabled && (
              <Field label={`More than ${f.emotes.max} emotes`}>
                {(p) => (
                  <input
                    {...p}
                    type="range"
                    min={3}
                    max={50}
                    value={f.emotes.max}
                    onChange={(e) => set('emotes', { max: Number(e.target.value) })}
                    className="h-8 w-full"
                  />
                )}
              </Field>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Switch
              checked={f.symbols.enabled}
              onChange={(v) => set('symbols', { enabled: v })}
              label="Symbol spam"
            />
            {f.symbols.enabled && (
              <Field label={`Over ${f.symbols.max_percent}% symbols`}>
                {(p) => (
                  <input
                    {...p}
                    type="range"
                    min={20}
                    max={100}
                    value={f.symbols.max_percent}
                    onChange={(e) => set('symbols', { max_percent: Number(e.target.value) })}
                    className="h-8 w-full"
                  />
                )}
              </Field>
            )}
          </div>
        </div>
        <div className="py-4 last:pb-1">
          <Field label="Timeout length" hint="For every filter that times out.">
            {(p) => (
              <Select
                {...p}
                value={f.timeout_seconds}
                onChange={(e) => setF({ ...f, timeout_seconds: Number(e.target.value) })}
              >
                {[
                  [60, '1 minute'],
                  [300, '5 minutes'],
                  [600, '10 minutes'],
                  [3600, '1 hour'],
                  [86400, '1 day'],
                ].map(([s, l]) => (
                  <option key={s} value={s}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
    </Panel>
  )
}

/**
 * The PC is off and the cloud bot moderates (M10): bans, timeouts and deletes happen on the
 * chat lines; the ban list, held messages, filters and panic live on the PC.
 */
function OfflineModeration() {
  return (
    <Panel id="mod-offline" title="Moderate from chat">
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-[55ch] text-[16px] leading-relaxed font-medium text-text">
          Ban, time out and delete messages right on the chat lines. The cloud bot does it for you
          while your PC is off.
        </p>
        <a
          href={href({ name: 'chat' })}
          className="fc-press inline-flex h-11 items-center rounded-control bg-btn-primary px-5 text-[15px] font-semibold text-on-btn-primary hover:bg-btn-primary-hover"
        >
          Open chat
        </a>
        <NeedsPc>The ban list, held messages, filters and panic need your PC.</NeedsPc>
      </div>
    </Panel>
  )
}

export function Moderation() {
  const mod = useLive((s) => s.remote?.role === 'mod')
  const limited = useLive((s) => isLimited(s.remote))
  if (limited)
    return (
      <div>
        <PageHeader title="Moderation" description="Your PC is off. The cloud bot moderates." />
        <OfflineModeration />
      </div>
    )
  return (
    <div>
      <PageHeader
        title="Moderation"
        description="One ban list and one panic button for Twitch, YouTube and Kick."
      />
      <div className="flex flex-col gap-5">
        <PanicCard />
        <HeldPanel />
        {!mod && <SmartModerationPanel />}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
          <BanList />
          {!mod && <FiltersPanel />}
        </div>
      </div>
    </div>
  )
}
