// Bot screen additions: counters (`!deaths +`), quotes and the built-in chat modules.

import { useState } from 'react'
import { Minus, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { MODULES, fieldError, type Counter, type ModuleKey, type Quote } from '@ferrocast/api'
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Skeleton,
  Switch,
  Textarea,
  toast,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useResource } from '../../lib/hooks'
import { useLive } from '../../lib/store'
import { useStudio } from './common'

function CounterDialog({
  value,
  onClose,
  onSaved,
}: {
  value: Counter | 'new' | null
  onClose: () => void
  onSaved: (c: Counter) => void
}) {
  const studio = useStudio()
  const isNew = value === 'new'
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [reply, setReply] = useState('{counter}: {count}')
  const [seed, setSeed] = useState<Counter | 'new' | null>(null)
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (value !== seed) {
    setSeed(value)
    setErr(null)
    if (value && value !== 'new') {
      setName(value.name)
      setCommand(value.command ?? '')
      setReply(value.reply)
    } else {
      setName('')
      setCommand('')
      setReply('{counter}: {count}')
    }
  }
  if (!value) return null
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      const cmd = command.trim() ? command.trim().toLowerCase() : null
      const saved =
        value === 'new'
          ? await studio.createCounter({ name, command: command.trim() ? cmd : `!${slug}`, reply })
          : await studio.updateCounter(value.name, { command: cmd, reply })
      onSaved(saved)
    } catch (e) {
      setErr(fieldError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? 'New counter' : `Edit ${value.name}`}
      footer={
        <>
          {err && !['name', 'command', 'reply'].includes(err.field ?? '') && (
            <p role="alert" className="mr-auto text-[13.5px] text-danger">
              {err.message}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
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
        {isNew && (
          <Field
            label="Name"
            hint={
              slug
                ? `Use {count:${slug}} in any reply or overlay label.`
                : 'Like Deaths or Boss wins.'
            }
            error={err?.field === 'name' ? err.message : null}
          >
            {(p) => (
              <Input
                {...p}
                autoFocus
                data-autofocus
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
        )}
        <Field
          label="Chat command"
          optional
          hint={`Mods type ${command.trim() || `!${slug || 'deaths'}`} + or -. Empty: dashboard only.`}
          error={err?.field === 'command' ? err.message : null}
        >
          {(p) => (
            <Input
              {...p}
              className="font-mono"
              spellCheck={false}
              maxLength={33}
              placeholder={`!${slug || 'deaths'}`}
              value={command}
              onChange={(e) => setCommand(e.target.value.replace(/\s/g, ''))}
            />
          )}
        </Field>
        <Field
          label="Reply"
          hint="Variables: {count}, {counter}, {user}."
          error={err?.field === 'reply' ? err.message : null}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              maxLength={300}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Dialog>
  )
}

export function CountersPanel() {
  const studio = useStudio()
  const list = useResource(() => studio.counters(), [studio])
  const live = useLive((s) => s.studio.counters)
  const [edit, setEdit] = useState<Counter | 'new' | null>(null)
  const { run } = useAction()
  const change = (c: Counter, op: 'add' | 'reset', amount?: number) =>
    void run(`c:${c.name}`, () => studio.changeCounter(c.name, op, amount)).then(
      (v) => v && list.set((p) => (p ?? []).map((x) => (x.name === v.name ? v : x))),
    )
  return (
    <Panel
      title="Counters"
      description="Deaths, wins, anything. Viewers see the count; mods change it."
      actions={
        <Button size="sm" icon={<Plus size={14} weight="bold" />} onClick={() => setEdit('new')}>
          New counter
        </Button>
      }
    >
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Skeleton className="h-24" />
      ) : list.data.length === 0 ? (
        <EmptyState compact title="No counters yet">
          Make a <span className="font-mono">!deaths</span> counter: mods type{' '}
          <span className="font-mono">!deaths +</span> and chat sees the total.
        </EmptyState>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {list.data.map((c) => {
            const value = live[c.name] ?? c.value
            return (
              <li
                key={c.name}
                className="flex flex-wrap items-center gap-2 rounded-control px-2 py-2 hover:bg-surface-2"
              >
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <p className="truncate text-sm font-semibold text-text">
                    {c.name.replace(/_/g, ' ')}{' '}
                    {c.command && (
                      <span className="font-mono text-[12.5px] font-normal text-text-3">
                        {c.command}
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-[12.5px] text-text-3">{`{count:${c.name}}`}</p>
                </div>
                <IconButton
                  size="sm"
                  label={`${c.name} minus one`}
                  onClick={() => change(c, 'add', -1)}
                >
                  <Minus size={15} />
                </IconButton>
                <span
                  className="w-12 text-center font-mono text-lg font-semibold tabular-nums text-text"
                  aria-live="polite"
                >
                  {value}
                </span>
                <IconButton
                  size="sm"
                  label={`${c.name} plus one`}
                  onClick={() => change(c, 'add', 1)}
                >
                  <Plus size={15} />
                </IconButton>
                <Button size="sm" variant="ghost" onClick={() => change(c, 'reset')}>
                  Reset
                </Button>
                <IconButton size="sm" label={`Edit ${c.name}`} onClick={() => setEdit(c)}>
                  <PencilSimple size={15} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="danger-ghost"
                  label={`Delete ${c.name}`}
                  onClick={() =>
                    void run(
                      'del',
                      async () => {
                        await studio.deleteCounter(c.name)
                        list.set((p) => (p ?? []).filter((x) => x.name !== c.name))
                        return true
                      },
                      { success: `Deleted ${c.name}.` },
                    )
                  }
                >
                  <Trash size={15} />
                </IconButton>
              </li>
            )
          })}
        </ul>
      )}
      <CounterDialog
        value={edit}
        onClose={() => setEdit(null)}
        onSaved={(c) => {
          list.set((p) => {
            const l = p ?? []
            return l.some((x) => x.name === c.name)
              ? l.map((x) => (x.name === c.name ? c : x))
              : [...l, c]
          })
          setEdit(null)
          toast({ tone: 'ok', message: `${c.command ?? c.name} saved.` })
        }}
      />
    </Panel>
  )
}

export function QuotesPanel() {
  const studio = useStudio()
  const list = useResource(() => studio.quotes(), [studio])
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)
  const { run, busy } = useAction()
  const quotes = list.data ? [...list.data].reverse() : null
  return (
    <Panel title="Quotes" description="!quote shows one at random; mods add with !quote add.">
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          void run('add', () => studio.addQuote(text), { success: 'Quote added.' }).then((q) => {
            if (!q) return
            setText('')
            list.set((p) => [...(p ?? []), q])
          })
        }}
      >
        <label htmlFor="quote-new" className="sr-only">
          New quote
        </label>
        <Input
          id="quote-new"
          maxLength={400}
          value={text}
          placeholder="Something they said"
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" busy={busy === 'add'} disabled={!text.trim()}>
          Add
        </Button>
      </form>
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !quotes ? (
        <Skeleton className="h-24" />
      ) : quotes.length === 0 ? (
        <p className="text-[13.5px] text-text-3">No quotes yet.</p>
      ) : (
        <ul className="-mx-2 flex max-h-80 flex-col overflow-y-auto">
          {quotes.map((q: Quote) => (
            <li
              key={q.id}
              className="flex items-start gap-2 rounded-control px-2 py-2 hover:bg-surface-2"
            >
              <span className="w-9 shrink-0 font-mono text-[13.5px] text-text-3">#{q.id}</span>
              {editing?.id === q.id ? (
                <form
                  className="flex min-w-0 flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void run('edit', () => studio.editQuote(q.id, editing.text)).then((u) => {
                      if (!u) return
                      setEditing(null)
                      list.set((p) => (p ?? []).map((x) => (x.id === u.id ? u : x)))
                    })
                  }}
                >
                  <label htmlFor={`quote-${q.id}`} className="sr-only">
                    Quote {q.id}
                  </label>
                  <Input
                    id={`quote-${q.id}`}
                    autoFocus
                    data-autofocus
                    maxLength={400}
                    value={editing.text}
                    onChange={(e) => setEditing({ id: q.id, text: e.target.value })}
                  />
                  <Button type="submit" size="sm" busy={busy === 'edit'}>
                    Save
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm break-words text-text">“{q.text}”</p>
                    <p className="text-[12.5px] text-text-3">{q.added_by}</p>
                  </div>
                  <IconButton
                    size="sm"
                    label={`Edit quote ${q.id}`}
                    onClick={() => setEditing({ id: q.id, text: q.text })}
                  >
                    <PencilSimple size={15} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="danger-ghost"
                    label={`Delete quote ${q.id}`}
                    onClick={() =>
                      void run(
                        'del',
                        async () => {
                          await studio.deleteQuote(q.id)
                          list.set((p) => (p ?? []).filter((x) => x.id !== q.id))
                          return true
                        },
                        { success: `Deleted quote #${q.id}.` },
                      )
                    }
                  >
                    <Trash size={15} />
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function ModulesPanel() {
  const studio = useStudio()
  const cfg = useResource(() => studio.modules(), [studio])
  const { run } = useAction()
  const c = cfg.data
  const toggle = (key: ModuleKey, enabled: boolean) => {
    if (!c) return
    const prev = c
    cfg.set({ ...c, [key]: { ...c[key], enabled } })
    void run(`m:${key}`, () => studio.saveModules({ [key]: { enabled } })).then((r) =>
      cfg.set(r ?? prev),
    )
  }
  return (
    <Panel
      title="Chat modules"
      description="Built-in commands. A command of your own with the same name wins."
    >
      {cfg.error ? (
        <LoadError error={cfg.error} onRetry={cfg.reload} />
      ) : !c ? (
        <Skeleton className="h-48" />
      ) : (
        <ul className="flex flex-col gap-3">
          {MODULES.map((m) => (
            <li key={m.key}>
              <Switch
                label={m.name}
                description={`${m.commands}: ${m.about}${m.key === 'roulette' || m.key === 'duel' ? ' Uses loyalty points.' : ''}`}
                checked={c[m.key].enabled}
                onChange={(v) => toggle(m.key, v)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
