import { useState } from 'react'
import { Lightning, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { SOCIALS_PLACEHOLDER, fieldError, plural, type Command, type Timer } from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Skeleton,
  Switch,
  Textarea,
  toast,
} from '@ferrocast/ui'
import { LoadError, PageHeader, Panel } from '../components/Panel'
import { done, useAction, useClient, useResource } from '../lib/hooks'
import { CountersPanel, ModulesPanel, QuotesPanel } from '../components/studio/chatbot'
import { AutoRepliesPanel } from '../components/bot/autoreplies'
import { CloudBotPanel } from '../components/bot/cloud-bot'

const ROLE_LABEL: Record<Command['roles'], string> = {
  everyone: 'Everyone',
  subs: 'Subs and up',
  vips: 'VIPs and up',
  mods: 'Mods only',
}

const BLANK_COMMAND: Omit<Command, 'id'> = {
  name: '!',
  aliases: [],
  response: '',
  roles: 'everyone',
  cooldown_s: 30,
  user_cooldown_s: 0,
  platforms: [],
  enabled: true,
}
const BLANK_TIMER: Omit<Timer, 'id'> = {
  name: '',
  message: '',
  every_min: 30,
  min_chat_lines: 10,
  platforms: [],
  enabled: true,
}

function CommandDialog({
  value,
  onClose,
  onSaved,
}: {
  value: Command | Omit<Command, 'id'> | null
  onClose: () => void
  onSaved: (c: Command) => void
}) {
  const client = useClient()
  const [c, setC] = useState(value)
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (value !== null && c === null) setC(value)
  if (!c) return null
  const isNew = !('id' in c)
  const placeholder = c.response.trim() === SOCIALS_PLACEHOLDER
  // The starter !socials is off until it has real links: writing them switches it on.
  const switchesOn = !c.enabled && value?.response === SOCIALS_PLACEHOLDER && !placeholder
  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      const enabled = switchesOn || c.enabled
      const saved =
        'id' in c
          ? await client.saveCommand({ ...c, enabled })
          : await client.createCommand({ ...c, enabled })
      onSaved(saved)
      setC(null)
    } catch (e) {
      setErr(fieldError(e))
    } finally {
      setBusy(false)
    }
  }
  const close = () => {
    setC(null)
    setErr(null)
    onClose()
  }
  return (
    <Dialog
      open
      onClose={close}
      title={isNew ? 'New command' : `Edit ${c.name}`}
      footer={
        <>
          {err && !err.field && (
            <p role="alert" className="mr-auto text-[13.5px] text-danger">
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
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Command" error={err?.field === 'name' ? err.message : null}>
            {(p) => (
              <Input
                {...p}
                autoFocus
                className="font-mono"
                spellCheck={false}
                value={c.name}
                maxLength={31}
                onChange={(e) => setC({ ...c, name: e.target.value.replace(/\s/g, '') })}
              />
            )}
          </Field>
          <Field label="Also answers to" optional hint="Comma separated, like !dc">
            {(p) => (
              <Input
                {...p}
                className="font-mono"
                value={c.aliases.join(', ')}
                onChange={(e) =>
                  setC({
                    ...c,
                    aliases: e.target.value
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean)
                      .slice(0, 10),
                  })
                }
              />
            )}
          </Field>
        </div>
        {placeholder && (
          <p
            role="status"
            className="rounded-control border border-warn/50 bg-warn-soft px-3 py-2 text-[13.5px] text-text-2"
          >
            Replace this reply with your links, like “Twitter: x.com/you · Discord: discord.gg/you”.{' '}
            {c.name} stays off until you do, so viewers never see this text.
          </p>
        )}
        {switchesOn && (
          <p role="status" className="text-[13.5px] text-text-3">
            {c.name} switches on when you save.
          </p>
        )}
        <Field
          label="Reply"
          error={err?.field === 'response' ? err.message : null}
          hint="Variables: {user}, {target}, {uptime}, {uptime_text}, {target_game}, {target_game_note}."
        >
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={c.response}
              maxLength={500}
              onChange={(e) => setC({ ...c, response: e.target.value })}
            />
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Who can use it">
            {(p) => (
              <Select
                {...p}
                value={c.roles}
                onChange={(e) => setC({ ...c, roles: e.target.value as Command['roles'] })}
              >
                {Object.entries(ROLE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Cooldown" error={err?.field === 'cooldown_s' ? err.message : null}>
            {(p) => (
              <Select
                {...p}
                value={c.cooldown_s}
                onChange={(e) => setC({ ...c, cooldown_s: Number(e.target.value) })}
              >
                {[0, 5, 15, 30, 60, 300].map((s) => (
                  <option key={s} value={s}>
                    {s === 0
                      ? 'None'
                      : s < 60
                        ? plural(s, 'second', 'seconds')
                        : plural(s / 60, 'minute', 'minutes')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </form>
    </Dialog>
  )
}

function TimerDialog({
  value,
  onClose,
  onSaved,
}: {
  value: Timer | Omit<Timer, 'id'> | null
  onClose: () => void
  onSaved: (t: Timer) => void
}) {
  const client = useClient()
  const [t, setT] = useState(value)
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (value !== null && t === null) setT(value)
  if (!t) return null
  const close = () => {
    setT(null)
    setErr(null)
    onClose()
  }
  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      const saved =
        'id' in t
          ? await client.saveTimer(t)
          : await client.createTimer({ ...t, name: t.name.trim() || t.message.slice(0, 24) })
      onSaved(saved)
      setT(null)
    } catch (e) {
      setErr(fieldError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onClose={close}
      title={'id' in t ? 'Edit timer' : 'New timer'}
      description="Timers post a message on a schedule, only while chat is active, and never twice in shared chat."
      footer={
        <>
          {err && !err.field && (
            <p role="alert" className="mr-auto text-[13.5px] text-danger">
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
      <div className="flex flex-col gap-4">
        <Field label="Name" optional>
          {(p) => (
            <Input
              {...p}
              autoFocus
              value={t.name}
              maxLength={40}
              onChange={(e) => setT({ ...t, name: e.target.value })}
            />
          )}
        </Field>
        <Field label="Message" error={err?.field === 'message' ? err.message : null}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={t.message}
              maxLength={500}
              onChange={(e) => setT({ ...t, message: e.target.value })}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Every" error={err?.field === 'every_min' ? err.message : null}>
            {(p) => (
              <Select
                {...p}
                value={t.every_min}
                onChange={(e) => setT({ ...t, every_min: Number(e.target.value) })}
              >
                {[10, 15, 20, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Only if chat had" hint="messages since the last time">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                max={500}
                value={t.min_chat_lines}
                onChange={(e) =>
                  setT({ ...t, min_chat_lines: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  )
}

export function Bot() {
  const client = useClient()
  const commands = useResource((c) => c.commands())
  const timers = useResource((c) => c.timers())
  const { run } = useAction()
  const [editCmd, setEditCmd] = useState<Command | Omit<Command, 'id'> | null>(null)
  const [editTimer, setEditTimer] = useState<Timer | Omit<Timer, 'id'> | null>(null)
  const { busy: starting, run: runStarter } = useAction()
  const addStarter = () =>
    void runStarter('starter', () => client.addStarterCommands()).then((r) => {
      if (!r) return
      if (r.added.length) commands.set((p) => [...(p ?? []), ...r.added])
      const names = (l: string[]) =>
        l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : (l[0] ?? '')
      toast(
        r.added.length
          ? {
              tone: 'ok',
              message: `Added ${names(r.added.map((c) => c.name))}.`,
              hint: r.skipped.length
                ? `Kept your own ${names(r.skipped)}.`
                : r.added.some((c) => c.name === '!socials')
                  ? '!socials stays off until you add your links.'
                  : null,
            }
          : { tone: 'info', message: 'You already have all the starter commands.' },
      )
      // !socials needs the streamer's links: open it right away.
      const socials = r.added.find((c) => c.name === '!socials')
      if (socials) setEditCmd(socials)
    })
  return (
    <div>
      <PageHeader
        title="Bot"
        description="Commands, auto-replies and timers. The bot speaks as your own account, so it can’t be banned everywhere at once like a shared bot."
      />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel
          title="Commands"
          actions={
            <>
              {/* The empty state has its own big button for this. */}
              {(commands.data?.length ?? 0) > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Lightning size={14} weight="fill" />}
                  busy={starting === 'starter'}
                  onClick={addStarter}
                  aria-label="Add starter commands"
                >
                  <span className="sm:hidden">Add starter</span>
                  <span className="hidden sm:inline">Add starter commands</span>
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                icon={<Plus size={14} weight="bold" />}
                onClick={() => setEditCmd({ ...BLANK_COMMAND })}
                aria-label="New command"
              >
                <span className="sm:hidden">New</span>
                <span className="hidden sm:inline">New command</span>
              </Button>
            </>
          }
        >
          {commands.error ? (
            <LoadError error={commands.error} onRetry={commands.reload} />
          ) : !commands.data ? (
            <Skeleton className="h-40" />
          ) : commands.data.length === 0 ? (
            <EmptyState
              compact
              title="No commands yet"
              action={
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Lightning size={14} weight="fill" />}
                  busy={starting === 'starter'}
                  onClick={addStarter}
                >
                  Add starter commands
                </Button>
              }
            >
              Add <span className="font-mono">!socials</span>,{' '}
              <span className="font-mono">!lurk</span>, <span className="font-mono">!uptime</span>{' '}
              and <span className="font-mono">!so</span> in one click.
            </EmptyState>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {commands.data.map((c) => (
                <li
                  key={c.id}
                  className="group flex items-start gap-3 rounded-control px-2 py-2.5 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-text">{c.name}</span>
                      {c.aliases.map((a) => (
                        <span key={a} className="font-mono text-[12.5px] text-text-3">
                          {a}
                        </span>
                      ))}
                      {c.roles !== 'everyone' && <Badge>{ROLE_LABEL[c.roles]}</Badge>}
                      {c.response.trim() === SOCIALS_PLACEHOLDER && (
                        <Badge tone="warn">Add your links</Badge>
                      )}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[13.5px] break-words text-text-3">
                      {c.response}
                    </p>
                  </div>
                  <IconButton size="sm" label={`Edit ${c.name}`} onClick={() => setEditCmd(c)}>
                    <PencilSimple size={15} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="danger-ghost"
                    label={`Delete ${c.name}`}
                    onClick={() =>
                      void run('del', () => done(client.deleteCommand(c.id))).then((ok) => {
                        if (!ok) return
                        commands.set((p) => (p ?? []).filter((x) => x.id !== c.id))
                        const { id: _id, ...rest } = c
                        toast({
                          tone: 'ok',
                          message: `${c.name} deleted.`,
                          action: {
                            label: 'Undo',
                            run: () =>
                              void client
                                .createCommand(rest)
                                .then((back) => commands.set((p) => [...(p ?? []), back]))
                                .catch(() =>
                                  toast({
                                    tone: 'error',
                                    message: `Couldn’t bring ${c.name} back.`,
                                  }),
                                ),
                          },
                        })
                      })
                    }
                  >
                    <Trash size={15} />
                  </IconButton>
                  <Switch
                    checked={c.enabled}
                    hideLabel
                    label={`${c.name} on`}
                    onChange={(enabled) => {
                      // Never post the placeholder: ask for the links instead.
                      if (enabled && c.response.trim() === SOCIALS_PLACEHOLDER) {
                        setEditCmd(c)
                        toast({
                          key: 'socials',
                          tone: 'info',
                          message: `Add your links to ${c.name} first.`,
                          hint: 'It switches on when you save.',
                        })
                        return
                      }
                      commands.set((p) =>
                        (p ?? []).map((x) => (x.id === c.id ? { ...x, enabled } : x)),
                      )
                      void run('tog', () => client.saveCommand({ ...c, enabled }))
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Timers"
          actions={
            <Button
              size="sm"
              icon={<Plus size={14} weight="bold" />}
              onClick={() => setEditTimer({ ...BLANK_TIMER })}
            >
              New timer
            </Button>
          }
        >
          {timers.error ? (
            <LoadError error={timers.error} onRetry={timers.reload} />
          ) : !timers.data ? (
            <Skeleton className="h-32" />
          ) : timers.data.length === 0 ? (
            <EmptyState compact title="No timers">
              A gentle reminder now and then: socials, hydrate, the schedule.
            </EmptyState>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {timers.data.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-3 rounded-control px-2 py-2.5 hover:bg-surface-2"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setEditTimer(t)}
                  >
                    <span className="block text-sm font-semibold text-text">
                      {t.name || 'Timer'}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-text-3">
                      Every {t.every_min} min · after{' '}
                      {plural(t.min_chat_lines, 'message', 'messages')}
                    </span>
                  </button>
                  <Switch
                    checked={t.enabled}
                    hideLabel
                    label={`${t.name || 'Timer'} on`}
                    onChange={(enabled) => {
                      timers.set((p) =>
                        (p ?? []).map((x) => (x.id === t.id ? { ...x, enabled } : x)),
                      )
                      void run('tog', () => client.saveTimer({ ...t, enabled }))
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <div className="mt-5">
        <AutoRepliesPanel />
      </div>
      <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <CountersPanel />
          <QuotesPanel />
        </div>
        <ModulesPanel />
      </div>
      <CloudBotPanel className="mt-5" />
      <CommandDialog
        value={editCmd}
        onClose={() => setEditCmd(null)}
        onSaved={(c) => {
          commands.set((p) => {
            const list = p ?? []
            return list.some((x) => x.id === c.id)
              ? list.map((x) => (x.id === c.id ? c : x))
              : [...list, c]
          })
          setEditCmd(null)
        }}
      />
      <TimerDialog
        value={editTimer}
        onClose={() => setEditTimer(null)}
        onSaved={(t) => {
          timers.set((p) => {
            const list = p ?? []
            return list.some((x) => x.id === t.id)
              ? list.map((x) => (x.id === t.id ? t : x))
              : [...list, t]
          })
          setEditTimer(null)
        }}
      />
    </div>
  )
}
