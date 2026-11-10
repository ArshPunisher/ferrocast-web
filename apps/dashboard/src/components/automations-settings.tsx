// Settings › Automations (layout A): "When X, do Y" rules (OBS's Advanced Scene Switcher,
// built in, no code). A row per rule with its switch, Test, Edit and Remove; a rule is made and
// changed in one dialog: when, then its steps in order. Words are kept short; what needs saying
// sits behind (i).

import { useId, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, PencilSimple, Play, Plus, Trash, X } from '@phosphor-icons/react'
import {
  MAX_RULES,
  MAX_STEPS,
  automationsApi,
  describeError,
  studioEngineApi,
  type Rule,
  type Step,
  type When,
} from '@ferrocast/api'
import {
  Button,
  Dialog,
  Field,
  IconButton,
  InfoTip,
  Input,
  Select,
  Skeleton,
  Switch,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError } from './Panel'
import { Group, Row } from './settings-kit'
import { useClient, useResource } from '../lib/hooks'

// ------------------------------------------------------------------ words

export const WHEN_LABEL: Record<When['type'], string> = {
  follow: 'Someone follows',
  raid: 'A raid',
  sub: 'A sub or gifted subs',
  support: 'A tip, Super Chat or bits',
  reward: 'A channel reward',
  chat: 'A chat command',
  live_start: 'The stream starts',
  live_end: 'The stream ends',
  scene: 'A scene goes on air',
  every: 'Every few minutes, while live',
}

export const STEP_LABEL: Record<Step['type'], string> = {
  scene: 'Switch scene',
  show: 'Show a source',
  hide: 'Hide a source',
  filter: 'Filter on or off',
  save_replay: 'Save the replay',
  record: 'Recording on or off',
  chat: 'Say in chat',
  wait: 'Wait',
}

const WHEN_DEFAULT: { [K in When['type']]: Extract<When, { type: K }> } = {
  follow: { type: 'follow' },
  raid: { type: 'raid', min: 0 },
  sub: { type: 'sub' },
  support: { type: 'support' },
  reward: { type: 'reward', name: '' },
  chat: { type: 'chat', text: '!', anyone: false },
  live_start: { type: 'live_start' },
  live_end: { type: 'live_end' },
  scene: { type: 'scene', name: '' },
  every: { type: 'every', minutes: 15 },
}

const STEP_DEFAULT: { [K in Step['type']]: Extract<Step, { type: K }> } = {
  scene: { type: 'scene', name: '' },
  show: { type: 'show', scene: '', source: '' },
  hide: { type: 'hide', scene: '', source: '' },
  filter: { type: 'filter', source: '', filter: '', on: true },
  save_replay: { type: 'save_replay' },
  record: { type: 'record', on: true },
  chat: { type: 'chat', text: '' },
  wait: { type: 'wait', seconds: 5 },
}

/** Steps with something to fill in under their name. */
const STEP_HAS_FIELDS: Record<Step['type'], boolean> = {
  scene: true,
  show: true,
  hide: true,
  filter: true,
  save_replay: false,
  record: true,
  chat: true,
  wait: true,
}

/** "!clip in chat", "A raid of 10+", "Every 15 min". */
export function whenWords(w: When): string {
  switch (w.type) {
    case 'raid':
      return w.min > 0 ? `A raid of ${w.min}+` : 'A raid'
    case 'reward':
      return w.name.trim() ? `Reward “${w.name.trim()}”` : 'Any channel reward'
    case 'chat':
      return `${w.text.trim()} in chat`
    case 'scene':
      return `“${w.name}” on air`
    case 'every':
      return `Every ${w.minutes} min`
    default:
      return WHEN_LABEL[w.type]
  }
}

/** One step, short: "Scene “BRB”", "Wait 5 s". */
export function stepWords(s: Step): string {
  switch (s.type) {
    case 'scene':
      return `Scene “${s.name}”`
    case 'show':
      return `Show ${s.source}`
    case 'hide':
      return `Hide ${s.source}`
    case 'filter':
      return `${s.filter} ${s.on ? 'on' : 'off'}`
    case 'record':
      return s.on ? 'Record' : 'Stop recording'
    case 'chat':
      return 'Chat'
    case 'wait':
      return `Wait ${s.seconds} s`
    default:
      return STEP_LABEL[s.type]
  }
}

/** What's missing before a rule can be saved (the PC checks the same), or null. */
export function ruleProblem(r: Rule): string | null {
  if (!r.name.trim()) return 'Give it a name.'
  const w = r.when
  if (w.type === 'chat' && w.text.trim().length < 2) return 'Type the chat command.'
  if (w.type === 'scene' && !w.name.trim()) return 'Pick the scene.'
  if (w.type === 'every' && w.minutes < 1) return 'Every 1 minute at least.'
  if (r.cooldown_s < 3) return 'Wait 3 seconds at least before it runs again.'
  if (r.then.length === 0) return 'Add a step.'
  for (const s of r.then) {
    if (s.type === 'scene' && !s.name.trim()) return 'Pick a scene for each step.'
    if ((s.type === 'show' || s.type === 'hide') && (!s.scene.trim() || !s.source.trim()))
      return 'Pick the scene and source.'
    if (s.type === 'filter' && (!s.source.trim() || !s.filter.trim()))
      return 'Pick the source and filter.'
    if (s.type === 'chat' && !s.text.trim()) return 'Type what to say.'
    if (s.type === 'wait' && s.seconds < 1) return 'Wait 1 second at least.'
  }
  return null
}

function newId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// ------------------------------------------------------------------ the editor

/** Scenes and sources from the Studio, for the pickers (empty when it's off). */
function useStudioNames() {
  const client = useClient()
  const api = studioEngineApi(client)
  const scenes = useResource(() => api.scenes(), [client])
  const sources = useResource(() => api.sources(), [client])
  return {
    scenes: scenes.data?.scenes.map((s) => s.name) ?? [],
    sources: sources.data?.map((s) => s.name) ?? [],
  }
}

/** A text box with the Studio's names to pick from (any name can still be typed). */
function NameInput({
  label,
  value,
  names,
  onChange,
}: {
  label: string
  value: string
  names: string[]
  onChange: (v: string) => void
}) {
  const list = useId()
  return (
    <>
      <Input
        aria-label={label}
        placeholder={label}
        value={value}
        list={names.length ? list : undefined}
        maxLength={300}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-[14.5px]"
      />
      {names.length > 0 && (
        <datalist id={list}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
    </>
  )
}

function OnOff({
  label,
  on,
  onChange,
  words = ['On', 'Off'],
}: {
  label: string
  on: boolean
  onChange: (on: boolean) => void
  words?: [string, string]
}) {
  return (
    <Select
      aria-label={label}
      value={on ? 'on' : 'off'}
      onChange={(e) => onChange(e.target.value === 'on')}
      className="h-9 w-auto! text-[14.5px]"
    >
      <option value="on">{words[0]}</option>
      <option value="off">{words[1]}</option>
    </Select>
  )
}

function WhenFields({
  when,
  scenes,
  onChange,
}: {
  when: When
  scenes: string[]
  onChange: (w: When) => void
}) {
  switch (when.type) {
    case 'raid':
      return (
        <label className="flex items-center gap-2 text-[14.5px] text-text-2">
          At least
          <Input
            type="number"
            min={0}
            max={100000}
            aria-label="Smallest raid"
            value={when.min}
            onChange={(e) => onChange({ ...when, min: Math.max(0, Number(e.target.value) || 0) })}
            className="h-9 w-24! text-[14.5px]"
          />
          viewers
        </label>
      )
    case 'reward':
      return (
        <Input
          aria-label="Reward name"
          placeholder="Any reward"
          value={when.name}
          maxLength={300}
          onChange={(e) => onChange({ ...when, name: e.target.value })}
          className="h-9 text-[14.5px]"
        />
      )
    case 'chat':
      return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            aria-label="Chat command"
            value={when.text}
            maxLength={300}
            onChange={(e) => onChange({ ...when, text: e.target.value })}
            className="h-9 font-mono text-[14.5px]"
          />
          <OnOff
            label="Who can use it"
            on={when.anyone}
            words={['Anyone', 'Mods only']}
            onChange={(anyone) => onChange({ ...when, anyone })}
          />
        </div>
      )
    case 'scene':
      return (
        <NameInput
          label="Scene"
          value={when.name}
          names={scenes}
          onChange={(name) => onChange({ ...when, name })}
        />
      )
    case 'every':
      return (
        <label className="flex items-center gap-2 text-[14.5px] text-text-2">
          Every
          <Input
            type="number"
            min={1}
            max={720}
            aria-label="Minutes"
            onBlur={() => onChange({ ...when, minutes: Math.max(1, when.minutes) })}
            value={when.minutes || ''}
            onChange={(e) =>
              onChange({
                ...when,
                minutes: Math.min(720, Number(e.target.value) || 0),
              })
            }
            className="h-9 w-20! text-[14.5px]"
          />
          min
        </label>
      )
    default:
      return null
  }
}

function StepFields({
  step,
  scenes,
  sources,
  onChange,
}: {
  step: Step
  scenes: string[]
  sources: string[]
  onChange: (s: Step) => void
}) {
  switch (step.type) {
    case 'scene':
      return (
        <NameInput
          label="Scene"
          value={step.name}
          names={scenes}
          onChange={(name) => onChange({ ...step, name })}
        />
      )
    case 'show':
    case 'hide':
      return (
        <div className="grid grid-cols-2 gap-2">
          <NameInput
            label="Scene"
            value={step.scene}
            names={scenes}
            onChange={(scene) => onChange({ ...step, scene })}
          />
          <NameInput
            label="Source"
            value={step.source}
            names={sources}
            onChange={(source) => onChange({ ...step, source })}
          />
        </div>
      )
    case 'filter':
      return (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <NameInput
            label="Source"
            value={step.source}
            names={sources}
            onChange={(source) => onChange({ ...step, source })}
          />
          <NameInput
            label="Filter"
            value={step.filter}
            names={[]}
            onChange={(filter) => onChange({ ...step, filter })}
          />
          <OnOff label="Filter" on={step.on} onChange={(on) => onChange({ ...step, on })} />
        </div>
      )
    case 'record':
      return (
        <OnOff
          label="Recording"
          on={step.on}
          words={['Start', 'Stop']}
          onChange={(on) => onChange({ ...step, on })}
        />
      )
    case 'chat':
      return (
        <Input
          aria-label="Message"
          placeholder="Thanks {name}!"
          value={step.text}
          maxLength={300}
          onChange={(e) => onChange({ ...step, text: e.target.value })}
          className="h-9 text-[14.5px]"
        />
      )
    case 'wait':
      return (
        <label className="flex items-center gap-2 text-[14.5px] text-text-2">
          <Input
            type="number"
            min={1}
            max={600}
            aria-label="Seconds"
            onBlur={() => onChange({ ...step, seconds: Math.max(1, step.seconds) })}
            value={step.seconds || ''}
            onChange={(e) =>
              onChange({
                ...step,
                seconds: Math.min(600, Number(e.target.value) || 0),
              })
            }
            className="h-9 w-20! text-[14.5px]"
          />
          seconds
        </label>
      )
    default:
      return null
  }
}

export function RuleEditor({
  start,
  saving,
  onSave,
  onClose,
}: {
  start: Rule
  saving: boolean
  onSave: (r: Rule) => void
  onClose: () => void
}) {
  const [r, setR] = useState<Rule>(start)
  const [tried, setTried] = useState(false)
  const { scenes, sources } = useStudioNames()
  const problem = ruleProblem(r)
  const setStep = (i: number, s: Step) =>
    setR((r) => ({ ...r, then: r.then.map((x, j) => (j === i ? s : x)) }))
  const move = (i: number, by: -1 | 1) =>
    setR((r) => {
      const then = [...r.then]
      const j = i + by
      const a = then[i]
      const b = then[j]
      if (!a || !b) return r
      then[i] = b
      then[j] = a
      return { ...r, then }
    })
  const save = () => {
    setTried(true)
    if (!problem) onSave({ ...r, name: r.name.trim() })
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={start.name ? `Edit “${start.name}”` : 'New rule'}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {tried && problem && (
            <p role="alert" className="mr-auto text-[14px] font-semibold text-danger">
              {problem}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={saving} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name">
          {(p) => (
            <Input
              {...p}
              data-autofocus
              value={r.name}
              maxLength={60}
              placeholder="Clip it"
              onChange={(e) => setR({ ...r, name: e.target.value })}
            />
          )}
        </Field>

        <section aria-labelledby="rule-when">
          <h4 id="rule-when" className="mb-2 text-[13.5px] font-bold text-text-3">
            When
          </h4>
          <div className="flex flex-col gap-2 rounded-control border border-line bg-surface-2 p-3">
            <Select
              aria-label="What sets it off"
              value={r.when.type}
              onChange={(e) =>
                setR({ ...r, when: { ...WHEN_DEFAULT[e.target.value as When['type']] } })
              }
              className="h-9 text-[14.5px]"
            >
              {(Object.keys(WHEN_LABEL) as When['type'][]).map((k) => (
                <option key={k} value={k}>
                  {WHEN_LABEL[k]}
                </option>
              ))}
            </Select>
            <WhenFields when={r.when} scenes={scenes} onChange={(when) => setR({ ...r, when })} />
          </div>
        </section>

        <section aria-labelledby="rule-then">
          <h4
            id="rule-then"
            className="mb-2 flex items-center gap-1 text-[13.5px] font-bold text-text-3"
          >
            Do, in order
            <InfoTip>
              Steps run one after another. If one fails, the rest don’t, and you’re told why. In
              chat, {'{name}'} is who set it off.
            </InfoTip>
          </h4>
          <ol className="flex flex-col gap-2">
            {r.then.map((s, i) => (
              <li
                key={i}
                className="flex flex-col gap-2 rounded-control border border-line bg-surface-2 p-2.5"
              >
                <div className="flex items-center gap-1">
                  <span className="w-6 shrink-0 text-center font-mono text-[13px] font-bold text-text-3">
                    {i + 1}
                  </span>
                  <Select
                    aria-label={`Step ${i + 1}`}
                    value={s.type}
                    onChange={(e) =>
                      setStep(i, { ...STEP_DEFAULT[e.target.value as Step['type']] })
                    }
                    className="mr-1 h-9 flex-1 text-[14.5px]"
                  >
                    {(Object.keys(STEP_LABEL) as Step['type'][]).map((k) => (
                      <option key={k} value={k}>
                        {STEP_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                  <IconButton
                    size="sm"
                    label={`Move step ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={`Move step ${i + 1} down`}
                    disabled={i === r.then.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    label={`Remove step ${i + 1}`}
                    onClick={() => setR({ ...r, then: r.then.filter((_, j) => j !== i) })}
                  >
                    <X size={14} />
                  </IconButton>
                </div>
                {STEP_HAS_FIELDS[s.type] && (
                  <div className="pl-7">
                    <StepFields
                      step={s}
                      scenes={scenes}
                      sources={sources}
                      onChange={(x) => setStep(i, x)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            icon={<Plus size={15} />}
            disabled={r.then.length >= MAX_STEPS}
            onClick={() => setR({ ...r, then: [...r.then, { ...STEP_DEFAULT.scene }] })}
          >
            Add step
          </Button>
        </section>

        <label className="flex flex-wrap items-center gap-2 text-[14.5px] text-text-2">
          <span className="flex items-center gap-1 font-semibold text-text">
            Not again for
            <InfoTip>So chat or many events at once can’t set it off over and over.</InfoTip>
          </span>
          <Input
            type="number"
            min={3}
            max={3600}
            aria-label="Seconds before it can run again"
            onBlur={() => setR((x) => ({ ...x, cooldown_s: Math.max(3, x.cooldown_s) }))}
            value={r.cooldown_s || ''}
            onChange={(e) =>
              setR({
                ...r,
                cooldown_s: Math.min(3600, Number(e.target.value) || 0),
              })
            }
            className="h-9 w-24! text-[14.5px]"
          />
          seconds
        </label>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ the list

function RuleRow({
  r,
  busy,
  onOn,
  onTest,
  onEdit,
  onRemove,
}: {
  r: Rule
  busy: boolean
  onOn: (on: boolean) => void
  onTest: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const [sure, setSure] = useState(false)
  return (
    <Row
      label={<span className="truncate">{r.name}</span>}
      description={
        <span className={cx(!r.on && 'opacity-70')}>
          <span className="font-medium text-text-2">{whenWords(r.when)}</span>
          {' → '}
          {r.then.map(stepWords).join(' · ')}
        </span>
      }
      control={
        <>
          <IconButton size="sm" label={`Test ${r.name}`} disabled={busy} onClick={onTest}>
            <Play size={15} />
          </IconButton>
          <IconButton size="sm" label={`Edit ${r.name}`} disabled={busy} onClick={onEdit}>
            <PencilSimple size={15} />
          </IconButton>
          <button
            type="button"
            aria-label={sure ? `Sure? Remove ${r.name}` : `Remove ${r.name}`}
            title={sure ? undefined : `Remove ${r.name}`}
            disabled={busy}
            onBlur={() => setSure(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && sure) {
                e.stopPropagation()
                setSure(false)
              }
            }}
            onClick={() => (sure ? onRemove() : setSure(true))}
            className={cx(
              'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-bold outline-none transition-colors duration-150 focus-visible:shadow-[var(--fc-focus)] disabled:opacity-60',
              sure
                ? 'bg-danger-fill px-2.5 text-white'
                : 'w-8 text-text-3 hover:bg-danger-soft hover:text-danger',
            )}
          >
            <Trash size={15} weight={sure ? 'bold' : 'regular'} aria-hidden />
            {sure && 'Remove'}
          </button>
          <Switch label={`${r.name} on`} hideLabel checked={r.on} disabled={busy} onChange={onOn} />
        </>
      }
    />
  )
}

export function AutomationsSettings() {
  const client = useClient()
  const api = useMemo(() => automationsApi(client), [client])
  const list = useResource(() => api.list(), [client])
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Rule | null>(null)

  const save = async (rules: Rule[], ok?: string) => {
    setBusy(true)
    try {
      await api.save(rules)
      if (ok) toast({ tone: 'ok', message: ok })
      list.reload()
      return true
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
      return false
    } finally {
      setBusy(false)
    }
  }

  const rules = list.data ?? []
  const put = async (r: Rule) => {
    const known = rules.some((x) => x.id === r.id)
    const next = known ? rules.map((x) => (x.id === r.id ? r : x)) : [...rules, r]
    if (await save(next, known ? `${r.name} saved.` : `${r.name} added.`)) setEditing(null)
  }

  return (
    <>
      <Group
        title={
          <span className="flex items-center gap-1">
            Rules
            <InfoTip>
              When something happens, a rule does its steps: switch scene, show a source, save the
              replay, say thanks in chat. Test runs it now.
            </InfoTip>
          </span>
        }
      >
        {list.error && !list.data ? (
          <Row>
            <LoadError error={list.error} onRetry={list.reload} />
          </Row>
        ) : !list.data ? (
          <Row>
            <Skeleton className="h-12" />
          </Row>
        ) : rules.length === 0 ? (
          <Row description="No rules yet." />
        ) : (
          rules.map((r) => (
            <RuleRow
              key={r.id}
              r={r}
              busy={busy}
              onOn={(on) => void save(rules.map((x) => (x.id === r.id ? { ...x, on } : x)))}
              onTest={() =>
                void api.run(r.id).then(
                  () => toast({ tone: 'ok', message: `${r.name} ran.` }),
                  (e: unknown) => {
                    const d = describeError(e)
                    toast({ tone: 'error', message: d.message, hint: d.hint })
                  },
                )
              }
              onEdit={() => setEditing(r)}
              onRemove={() =>
                void save(
                  rules.filter((x) => x.id !== r.id),
                  `${r.name} removed.`,
                )
              }
            />
          ))
        )}
        <Row
          control={
            <Button
              variant="outline"
              icon={<Plus size={16} />}
              disabled={!list.data || rules.length >= MAX_RULES}
              onClick={() =>
                setEditing({
                  id: newId(),
                  name: '',
                  on: true,
                  cooldown_s: 10,
                  when: { type: 'follow' },
                  then: [{ type: 'chat', text: 'Thanks for the follow, {name}!' }],
                })
              }
            >
              New rule
            </Button>
          }
        />
      </Group>
      {editing && (
        <RuleEditor
          start={editing}
          saving={busy}
          onSave={(r) => void put(r)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
