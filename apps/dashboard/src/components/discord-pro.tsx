// Settings › Discord › Ferrocast bot (Pro, API.md §9.6). Under the free webhook form: the
// Ferrocast bot joins the streamer's server, posts go-live from Ferrocast's servers (the free
// webhook post is then skipped) and gives roles to subs, members and tippers who linked their
// own Discord from the shared page. Hidden without the feature; one calm line without Pro.

import { useEffect, useState } from 'react'
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Copy,
  DiscordLogo,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  ApiError,
  DISCORD_GO_LIVE_MAX,
  DISCORD_KEEP_DAYS_MAX,
  DISCORD_ROLE_HINT,
  DISCORD_RULE_KINDS,
  describeError,
  discordProApi,
  emptyRuleDraft,
  formatMinor,
  keepLabel,
  parseAmount,
  roleColor,
  ruleWhat,
  validateRuleDraft,
  type DiscordConnect,
  type DiscordPlatform,
  type DiscordProView,
  type DiscordRole,
  type DiscordRule,
  type DiscordRuleInput,
  type DiscordRuleKind,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  Select,
  Skeleton,
  Switch,
  Textarea,
  copyText,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError } from './Panel'
import { ProPanel } from './pro/ProPanel'
import { useAction, useClient, useResource } from '../lib/hooks'
import { externalLink } from '../lib/external'

/** Sent on window when the bot's go-live changes, so the free form can say who posts. */
export const DISCORD_PRO_CHANGED = 'ferrocast:discord-pro'
const changed = () => window.dispatchEvent(new Event(DISCORD_PRO_CHANGED))

const PLATFORMS: { value: DiscordPlatform; label: string }[] = [
  { value: 'twitch', label: 'Twitch' },
  { value: 'kick', label: 'Kick' },
  { value: 'youtube', label: 'YouTube' },
]

/** The Ferrocast bot section (Settings › Discord). */
export function DiscordPro() {
  return (
    <div id="settings-discord-pro" className="scroll-mt-20">
      <ProPanel feature="discord" id="discord-pro" title="Ferrocast bot">
        <DiscordProBody />
      </ProPanel>
    </div>
  )
}

function DiscordProBody() {
  const res = useResource((c) => discordProApi(c).get())
  if (res.error) return <LoadError error={res.error} onRetry={res.reload} />
  const v = res.data
  if (!v) return <Skeleton className="h-44" />
  const set = (next: DiscordProView | undefined) => {
    if (!next) return
    res.set(next)
    changed()
  }
  return v.connected ? (
    <Connected view={v} onChange={set} reload={res.reload} />
  ) : (
    <NotConnected reload={res.reload} pcCode={v.pc_code} />
  )
}

function NotConnected({ reload, pcCode }: { reload: () => void; pcCode: string }) {
  const api = discordProApi(useClient())
  const { run, busy } = useAction()
  const [invite, setInvite] = useState<DiscordConnect | null>(null)
  // The install link stops working after 10 minutes: offer a fresh one then.
  useEffect(() => {
    if (!invite) return
    const t = window.setTimeout(() => setInvite(null), Math.max(0, invite.expires_at - Date.now()))
    return () => window.clearTimeout(t)
  }, [invite])
  // Back from Discord's tab: look again.
  useEffect(() => {
    if (!invite) return
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [invite, reload])
  return (
    <div className="flex flex-col gap-5">
      <div className="flex max-w-[60ch] flex-col gap-1.5">
        <p className="font-display text-[19px] leading-snug font-bold tracking-tight text-text">
          Go-live posts and supporter roles, run by Ferrocast.
        </p>
        <p className="text-[16px] leading-relaxed text-text-2">
          Add the bot to your server. Viewers link their own Discord; Ferrocast never messages them.
        </p>
      </div>
      {!invite ? (
        <Button
          variant="primary"
          size="lg"
          className="self-start"
          icon={<DiscordLogo size={20} weight="fill" />}
          busy={busy === 'connect'}
          onClick={() => void run('connect', () => api.connect()).then((r) => r && setInvite(r))}
        >
          Connect server
        </Button>
      ) : (
        <div className="flex flex-col gap-3" data-testid="discord-invite">
          <div className="flex flex-wrap gap-2">
            <a
              {...externalLink(invite.invite_url)}
              className="fc-press inline-flex h-12 items-center gap-2 rounded-control bg-btn-primary px-5 text-[16px] font-semibold text-on-btn-primary hover:bg-btn-primary-hover"
            >
              <DiscordLogo size={20} weight="fill" aria-hidden /> Open Discord
              <ArrowSquareOut size={16} aria-hidden />
            </a>
            <Button size="lg" icon={<ArrowsClockwise size={18} />} onClick={reload}>
              Check again
            </Button>
          </div>
          <p className="text-[15px] text-text-2">
            Pick your server in Discord, then come back. The link works for 10 minutes.
          </p>
          {pcCode && (
            <p className="text-[14.5px] text-text-3" data-testid="discord-pc-code">
              The page after Discord shows this PC’s code:{' '}
              <span className="font-mono font-semibold text-text" translate="no">
                {pcCode}
              </span>
              . A different code means the link wasn’t yours.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Connected({
  view: v,
  onChange,
  reload,
}: {
  view: DiscordProView
  onChange: (v: DiscordProView | undefined) => void
  reload: () => void
}) {
  const client = useClient()
  const api = discordProApi(client)
  const { run, busy } = useAction()
  const [leaving, setLeaving] = useState(false)
  const [leaveErr, setLeaveErr] = useState<string | null>(null)
  const closeLeave = () => {
    setLeaving(false)
    setLeaveErr(null)
  }
  // On failure the dialog stays open with the reason; the server is still connected.
  const leave = async () => {
    setLeaveErr(null)
    try {
      await api.disconnect()
    } catch (e) {
      const d = describeError(e)
      setLeaveErr(d.hint ? `${d.message} ${d.hint}` : d.message)
      return
    }
    closeLeave()
    toast({ tone: 'ok', message: 'Disconnected.' })
    try {
      onChange(await api.get())
    } catch {
      reload()
    }
  }
  const by = v.connected_by
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-control bg-surface-3 text-accent-text"
          >
            {v.guild?.icon_url ? (
              <img
                src={v.guild.icon_url}
                alt=""
                width={44}
                height={44}
                className="size-11 rounded-control"
              />
            ) : (
              <DiscordLogo size={24} weight="fill" />
            )}
          </span>
          <div className="min-w-0">
            <p
              className="truncate font-display text-[20px] leading-tight font-bold tracking-tight text-text"
              data-testid="discord-guild"
              translate="no"
            >
              {v.guild?.name ?? 'Your server'}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge tone="ok">Connected</Badge>
              {by && (
                <span className="text-[14px] text-text-3" data-testid="discord-connected-by">
                  {by.this_pc ? 'Added from this PC' : 'Added from another PC'}, code{' '}
                  <span className="font-mono font-semibold text-text-2" translate="no">
                    {by.pc_code}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start sm:items-end" data-testid="discord-linked">
          <p className="font-mono text-[28px] leading-none font-bold text-text tabular-nums">
            {v.linked.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-[14.5px] text-text-3">Members linked</p>
        </div>
      </div>

      {v.warning && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control bg-warn-soft px-3 py-2 text-[15px] text-warn"
        >
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {v.warning}{' '}
            <button
              type="button"
              onClick={reload}
              className="font-semibold underline underline-offset-2 hover:text-text"
            >
              Try again
            </button>
          </span>
        </p>
      )}

      <GoLive key={v.go_live.message ?? ''} view={v} onChange={onChange} />
      <Rules view={v} onChange={onChange} reload={reload} />
      {v.link_url && <ViewerLink url={v.link_url} />}

      <div className="border-t border-line pt-4">
        <Button variant="danger-ghost" icon={<Trash size={16} />} onClick={() => setLeaving(true)}>
          Disconnect server
        </Button>
      </div>
      <Dialog
        open={leaving}
        onClose={closeLeave}
        size="sm"
        title={`Disconnect ${v.guild?.name ?? 'this server'}?`}
        description="The bot leaves the server. Your rules and linked members are deleted; roles already given stay."
        footer={
          <>
            <Button variant="ghost" onClick={closeLeave}>
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={busy === 'leave'}
              onClick={() => void run('leave', leave, { quiet: true })}
            >
              Disconnect
            </Button>
          </>
        }
      >
        {leaveErr && (
          <p role="alert" className="text-[14.5px] font-semibold text-danger">
            {leaveErr}
          </p>
        )}
      </Dialog>
    </div>
  )
}

function SubHeading({ children }: { children: string }) {
  return (
    <h3 className="font-display text-[17px] font-extrabold tracking-tight text-text">{children}</h3>
  )
}

function GoLive({
  view: v,
  onChange,
}: {
  view: DiscordProView
  onChange: (v: DiscordProView | undefined) => void
}) {
  const api = discordProApi(useClient())
  const { run, busy } = useAction()
  // Keyed on the saved line (see Connected): after a save the relay sends it back cleaned
  // up, and the box starts again from what it kept.
  const savedMessage = v.go_live.message ?? ''
  const [message, setMessage] = useState(savedMessage)
  const [err, setErr] = useState<string | null>(null)
  const saved = savedMessage === message.trim()
  const channelGone = v.channel_id !== null && !v.channels.some((c) => c.id === v.channel_id)
  const saveGoLive = async (enabled: boolean) => {
    setErr(null)
    try {
      onChange(await api.setGoLive(enabled, message.trim() || null))
      return true
    } catch (e) {
      const d = describeError(e)
      setErr(d.hint ? `${d.message} ${d.hint}` : d.message)
      return false
    }
  }
  return (
    <section className="flex flex-col gap-4" aria-labelledby="discord-golive-h">
      <div id="discord-golive-h">
        <SubHeading>Go-live posts</SubHeading>
      </div>
      <Field
        label="Channel"
        hint={
          channelGone
            ? 'That channel is gone or hidden from the bot. Pick another.'
            : 'Where the bot posts. Edited with the length and peak when you end.'
        }
      >
        {(p) => (
          <Select
            {...p}
            value={v.channel_id ?? ''}
            disabled={busy === 'channel' || v.channels.length === 0}
            onChange={(e) =>
              void run('channel', () => api.setChannel(e.target.value)).then(onChange)
            }
          >
            {v.channel_id === null && <option value="">Pick a channel</option>}
            {channelGone && <option value={v.channel_id ?? ''}>Unknown channel</option>}
            {v.channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Switch
        label="Post when I go live"
        description="Replaces the webhook post above, once per platform per 30 minutes."
        checked={v.go_live.enabled}
        disabled={busy === 'golive' || (!v.go_live.enabled && v.channel_id === null)}
        onChange={(on) => void run('golive', () => saveGoLive(on), { quiet: true })}
      />
      <Field
        label="Message above the post"
        optional
        hint={`Up to ${DISCORD_GO_LIVE_MAX} characters. The post itself shows your title, game and a preview.`}
      >
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            maxLength={DISCORD_GO_LIVE_MAX}
            value={message}
            placeholder="Come hang out…"
            onChange={(e) => setMessage(e.target.value)}
          />
        )}
      </Field>
      {err && (
        <p role="alert" className="text-[14.5px] font-semibold text-danger">
          {err}
        </p>
      )}
      <Button
        className="self-start"
        disabled={saved}
        busy={busy === 'message'}
        onClick={() =>
          void run('message', () => saveGoLive(v.go_live.enabled), { quiet: true }).then(
            (ok) => ok && toast({ tone: 'ok', message: 'Message saved.' }),
          )
        }
      >
        Save message
      </Button>
    </section>
  )
}

function RoleName({ role }: { role: DiscordRole | undefined }) {
  const color = role ? roleColor(role.color) : null
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-text">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full border border-line-strong"
        style={color ? { background: color, borderColor: color } : undefined}
      />
      <span className="truncate">@{role?.name ?? 'deleted role'}</span>
    </span>
  )
}

/** Why Add rule can't be used yet, or null when some role can be given. */
export function rolesHint(roles: readonly Pick<DiscordRole, 'assignable'>[]): string | null {
  if (roles.length === 0)
    return 'Make a role in Discord first (Server Settings › Roles), keep Ferrocast’s role above it, then press Refresh.'
  if (!roles.some((r) => r.assignable))
    return 'Move Ferrocast’s role above the roles it should give (Server Settings › Roles), then press Refresh.'
  return null
}

function Rules({
  view: v,
  onChange,
  reload,
}: {
  view: DiscordProView
  onChange: (v: DiscordProView | undefined) => void
  reload: () => void
}) {
  const api = discordProApi(useClient())
  const { run, busy } = useAction()
  const [editing, setEditing] = useState<DiscordRule | 'new' | null>(null)
  const [removing, setRemoving] = useState<DiscordRule | null>(null)
  const full = v.rules.length >= v.limits.rules
  const issue = v.perk_issue
  const issueRule = issue ? v.rules.find((r) => r.id === issue.rule_id) : undefined
  return (
    <section className="flex flex-col gap-3" aria-labelledby="discord-rules-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div id="discord-rules-h">
          <SubHeading>Roles for supporters</SubHeading>
        </div>
        <Button
          size="sm"
          icon={<Plus size={15} weight="bold" />}
          disabled={full || rolesHint(v.roles) !== null}
          title={full ? `Up to ${v.limits.rules} rules.` : undefined}
          onClick={() => setEditing('new')}
        >
          Add rule
        </Button>
      </div>
      {rolesHint(v.roles) && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-text-2"
          data-testid="discord-roles-hint"
        >
          <p className="min-w-0 flex-1 basis-60">{rolesHint(v.roles)}</p>
          <Button size="sm" variant="ghost" icon={<ArrowsClockwise size={15} />} onClick={reload}>
            Refresh
          </Button>
        </div>
      )}
      {issue && (
        <p
          role="status"
          data-testid="discord-perk-issue"
          className="flex items-start gap-2 rounded-control bg-warn-soft px-3 py-2 text-[15px] text-warn"
        >
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {issue.message}
            {issueRule && ` Rule: ${ruleWhat(issueRule)}.`} {issue.hint}
          </span>
        </p>
      )}
      {v.rules.length === 0 ? (
        <p className="rounded-control border border-dashed border-line-strong px-4 py-5 text-[15.5px] text-text-2">
          No roles yet. Add one for subs, YouTube members or tippers.
        </p>
      ) : (
        <ul
          className="flex flex-col divide-y divide-line rounded-control border border-line"
          data-testid="discord-rules"
        >
          {v.rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-[15.5px] font-medium text-text sm:w-56 sm:shrink-0">
                  {ruleWhat(r)}
                </span>
                <RoleName role={v.roles.find((x) => x.id === r.role_id)} />
                {issue?.rule_id === r.id && (
                  <Badge tone="warn" className="self-start sm:self-auto">
                    Not given
                  </Badge>
                )}
                <span className="text-[14px] text-text-3 sm:ml-auto">{keepLabel(r.keep_days)}</span>
              </div>
              <div className="flex shrink-0">
                <IconButton
                  label={`Edit rule: ${ruleWhat(r)}`}
                  size="sm"
                  onClick={() => setEditing(r)}
                >
                  <PencilSimple size={16} />
                </IconButton>
                <IconButton
                  label={`Delete rule: ${ruleWhat(r)}`}
                  size="sm"
                  variant="danger-ghost"
                  onClick={() => setRemoving(r)}
                >
                  <Trash size={16} />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[14.5px] text-text-3">
        {v.rules.length} of {v.limits.rules} rules. A role comes off after its days unless they
        support again.
      </p>
      {editing && (
        <RuleDialog
          rule={editing === 'new' ? null : editing}
          roles={v.roles}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setEditing(null)
            onChange(next)
          }}
        />
      )}
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Delete this rule?"
        description="No new roles from it. Roles already given come off when their days run out."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={busy === 'remove'}
              onClick={() => {
                const r = removing
                if (!r) return
                void run('remove', () => api.deleteRule(r.id).then(() => true), {
                  success: 'Rule deleted.',
                }).then((ok) => {
                  setRemoving(null)
                  if (ok) reload()
                })
              }}
            >
              Delete rule
            </Button>
          </>
        }
      />
    </section>
  )
}

type Draft = DiscordRuleInput & { amount: string; keep: string }

function toDraft(r: DiscordRuleInput): Draft {
  return {
    ...r,
    amount: r.min_minor !== null && r.currency ? amountText(r.min_minor, r.currency) : '',
    keep: String(r.keep_days),
  }
}

function amountText(minor: number, currency: string): string {
  return formatMinor(minor, currency).replace(/[^\d.]/g, '')
}

/** "invalid_rule" answers name the field ("currency: …"). */
function ruleError(e: unknown): { field: string | null; message: string } {
  const d = describeError(e)
  if (e instanceof ApiError && e.code === 'missing_permission')
    return { field: 'role_id', message: `${d.message} ${d.hint ?? DISCORD_ROLE_HINT}` }
  if (e instanceof ApiError && e.code === 'role_not_found')
    return { field: 'role_id', message: d.hint ? `${d.message} ${d.hint}` : d.message }
  const m = /^(\w+): (.*)$/s.exec(d.message)
  if (e instanceof ApiError && (e.status === 400 || e.status === 422) && m?.[1] && m[2]) {
    const text = m[2].charAt(0).toUpperCase() + m[2].slice(1)
    return { field: m[1], message: text }
  }
  return { field: null, message: d.hint ? `${d.message} ${d.hint}` : d.message }
}

function RuleDialog({
  rule,
  roles,
  onClose,
  onSaved,
}: {
  rule: DiscordRule | null
  roles: DiscordRole[]
  onClose: () => void
  onSaved: (v: DiscordProView) => void
}) {
  const api = discordProApi(useClient())
  const [d, setD] = useState<Draft>(() =>
    toDraft(rule ?? { ...emptyRuleDraft(roles), currency: 'INR' }),
  )
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const fieldErr = (f: string) => (err?.field === f ? err.message : null)
  const blocked = roles.some((r) => !r.assignable)

  const save = async () => {
    setErr(null)
    const currency = (d.currency ?? '').trim().toUpperCase()
    const keep = d.keep.trim() === '' ? NaN : Number(d.keep)
    const input: DiscordRuleInput = {
      kind: d.kind,
      platform: d.platform,
      tier: d.tier,
      currency,
      min_minor: d.kind === 'tip_min' ? (parseAmount(d.amount, currency || 'INR') ?? 0) : null,
      role_id: d.role_id,
      keep_days: keep,
    }
    const v = validateRuleDraft(input, roles)
    if (!v.ok) {
      setErr({ field: v.field === 'min_minor' ? 'amount' : v.field, message: v.message })
      return
    }
    setSaving(true)
    try {
      const next = rule ? await api.updateRule(rule.id, v.rule) : await api.addRule(v.rule)
      toast({ tone: 'ok', message: rule ? 'Rule saved.' : 'Rule added.' })
      onSaved(next)
    } catch (e) {
      const x = ruleError(e)
      setErr(x.field === 'min_minor' ? { ...x, field: 'amount' } : x)
    } finally {
      setSaving(false)
    }
  }

  const kind = d.kind
  return (
    <Dialog
      open
      onClose={onClose}
      title={rule ? 'Edit rule' : 'Add a rule'}
      description="Linked viewers get the role when they support you."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={saving} type="submit" form="discord-rule-form">
            {rule ? 'Save rule' : 'Add rule'}
          </Button>
        </>
      }
    >
      <form
        id="discord-rule-form"
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Who gets it" error={fieldErr('kind')}>
          {(p) => (
            <Select
              {...p}
              value={kind}
              onChange={(e) => {
                const k = e.target.value as DiscordRuleKind
                patch({
                  kind: k,
                  platform:
                    k === 'member'
                      ? 'youtube'
                      : d.platform === 'youtube' && k !== 'tip_min'
                        ? null
                        : d.platform,
                  tier:
                    k === 'sub_tier'
                      ? d.tier && ['1', '2', '3'].includes(d.tier)
                        ? d.tier
                        : '2'
                      : k === 'member'
                        ? ''
                        : null,
                })
              }}
            >
              {DISCORD_RULE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {kind !== 'member' && (
          <Field label="Platform" error={fieldErr('platform')}>
            {(p) => (
              <Select
                {...p}
                value={d.platform ?? ''}
                onChange={(e) =>
                  patch({ platform: (e.target.value || null) as DiscordPlatform | null })
                }
              >
                <option value="">Any platform</option>
                {PLATFORMS.filter((x) => kind === 'tip_min' || x.value !== 'youtube').map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {kind === 'sub_tier' && (
          <Field
            label="Tier"
            hint="That tier or higher. Prime counts as tier 1."
            error={fieldErr('tier')}
          >
            {(p) => (
              <Select
                {...p}
                value={d.tier ?? '2'}
                onChange={(e) => patch({ tier: e.target.value })}
              >
                <option value="1">Tier 1</option>
                <option value="2">Tier 2</option>
                <option value="3">Tier 3</option>
              </Select>
            )}
          </Field>
        )}
        {kind === 'member' && (
          <Field
            label="Membership level"
            optional
            hint="As named on YouTube. Leave empty for any level."
            error={fieldErr('tier')}
          >
            {(p) => (
              <Input
                {...p}
                maxLength={100}
                value={d.tier ?? ''}
                onChange={(e) => patch({ tier: e.target.value })}
              />
            )}
          </Field>
        )}
        {kind === 'tip_min' && (
          <div className="grid grid-cols-[1fr_6.5rem] gap-3">
            <Field
              label="At least"
              hint="Paid chat messages like Super Chats, in this currency."
              error={fieldErr('amount')}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  className="font-mono"
                  value={d.amount}
                  placeholder="500"
                  onChange={(e) => patch({ amount: e.target.value })}
                />
              )}
            </Field>
            <Field label="Currency" error={fieldErr('currency')}>
              {(p) => (
                <Input
                  {...p}
                  maxLength={3}
                  className="font-mono uppercase"
                  spellCheck={false}
                  value={d.currency ?? ''}
                  onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
                />
              )}
            </Field>
          </div>
        )}
        <Field
          label="Role"
          hint={
            blocked ? `Greyed out roles are above Ferrocast’s own. ${DISCORD_ROLE_HINT}` : undefined
          }
          error={fieldErr('role_id')}
        >
          {(p) => (
            <Select {...p} value={d.role_id} onChange={(e) => patch({ role_id: e.target.value })}>
              {!roles.some((r) => r.id === d.role_id) && (
                <option value={d.role_id}>Pick a role</option>
              )}
              {roles.map((r) => (
                <option key={r.id} value={r.id} disabled={!r.assignable}>
                  @{r.name}
                  {r.assignable ? '' : ' (above Ferrocast)'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Keep it for"
          hint={`Days after the last sub, membership or tip. 0 keeps it for good (up to ${DISCORD_KEEP_DAYS_MAX}).`}
          error={fieldErr('keep_days')}
        >
          {(p) => (
            <div className="flex items-center gap-2">
              <Input
                {...p}
                inputMode="numeric"
                className="w-24 font-mono"
                value={d.keep}
                onChange={(e) => patch({ keep: e.target.value.replace(/[^\d]/g, '') })}
              />
              <span className="text-[15px] text-text-2">days</span>
            </div>
          )}
        </Field>
        {err && err.field === null && (
          <p role="alert" className="text-[14.5px] font-semibold text-danger">
            {err.message}
          </p>
        )}
      </form>
    </Dialog>
  )
}

function ViewerLink({ url }: { url: string }) {
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="discord-link-h">
      <div id="discord-link-h">
        <SubHeading>Link for viewers</SubHeading>
      </div>
      <p className="max-w-[62ch] text-[15px] text-text-2">
        Share it in your server. Viewers sign in with Discord and their Twitch or YouTube is
        matched. Nothing is posted for them.
      </p>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <code
          className={cx(
            'min-w-0 flex-1 truncate rounded-control border border-line bg-inset px-3 py-2.5',
            'font-mono text-[14.5px] text-text',
          )}
          data-testid="discord-link-url"
          translate="no"
          title={url}
        >
          {url}
        </code>
        <Button
          icon={<Copy size={16} />}
          className="self-start sm:self-auto"
          onClick={() =>
            void copyText(url).then((ok) =>
              toast(
                ok
                  ? { tone: 'ok', message: 'Link copied.' }
                  : { tone: 'error', message: 'Couldn’t copy. Select the link and copy it.' },
              ),
            )
          }
        >
          Copy link
        </Button>
      </div>
    </section>
  )
}
