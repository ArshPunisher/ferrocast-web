// A theme into OBS (24 Oct board; owner's picks 1A, 2B, 3, 4, 5A, 6A, 7, 8). Use on a theme
// can set it up in OBS too, with each screen to tick (Simple) or a table for every scene
// (Advanced); then a checklist of what happened. "Make it yours" restyles a theme's colour,
// font, name and logo on every screen; "Your theme in OBS" sits on Studio's OBS tab.

import { useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  ImageSquare,
  MonitorPlay,
  PaintBrush,
  Play,
  Swap,
  UploadSimple,
} from '@phosphor-icons/react'
import {
  ROLE_LABEL,
  checkThemePlan,
  obsThemeApi,
  planCounts,
  restyleTheme,
  themeAccent,
  type ObsTheme,
  type Restyle,
  type ScreenPlan,
  type ShowStep,
  type ThemeDesign,
  type ThemeFont,
  type ThemeObsPlan,
  type ThemePlace,
  type ThemePlan,
  type ThemeRole,
} from '@ferrocast/api'
import {
  Button,
  Dialog,
  Field,
  InfoTip,
  Input,
  Segmented,
  Select,
  Skeleton,
  Switch,
  cx,
} from '@ferrocast/ui'
import { ScenePreview } from './previews'
import { LoadError, Panel } from '../Panel'
import { ModeSwitch } from '../ModeSwitch'
import { StatusIcon } from '../studio/common'
import { useAction, useClient, useResource } from '../../lib/hooks'
import { useMode } from '../../lib/mode'
import { useLive } from '../../lib/store'
import { isCloud } from '../../lib/boot'
import { go, href } from '../../lib/router'

export function useThemeObs() {
  const client = useClient()
  return useMemo(() => obsThemeApi(client), [client])
}

/** Whether OBS can be reached for a theme, and why not. */
function useObsReach(): { ok: boolean; why: string | null } {
  const cloud = isCloud(useLive((s) => s.conn))
  const obs = useLive((s) => s.connectors?.obs)
  if (cloud) return { ok: false, why: 'Open Ferrocast on your PC to put a theme in OBS.' }
  if (obs && obs.state !== 'connected') return { ok: false, why: 'Open OBS first.' }
  return { ok: true, why: null }
}

// ---------------------------------------------------------------- Use, with OBS (1A + 2B)

/** Use for a theme: new overlays, and with "Set it up in OBS too", the scenes in OBS. */
export function ThemeUseDialog({
  design,
  onClose,
  onClassic,
}: {
  design: ThemeDesign
  onClose: () => void
  /** Use without OBS (today's dialog: new overlays, or one screen on an overlay). */
  onClassic: () => void
}) {
  const api = useThemeObs()
  const reach = useObsReach()
  const [intoObs, setIntoObs] = useState(reach.ok)
  const [result, setResult] = useState<{ steps: ShowStep[]; applied: ObsTheme | null } | null>(null)
  const [styling, setStyling] = useState(false)
  if (styling) return <MakeItYoursDialog design={design} onClose={onClose} />
  if (result)
    return (
      <ResultDialog
        design={design}
        steps={result.steps}
        applied={result.applied}
        onClose={onClose}
        onStyle={() => setStyling(true)}
        onUndone={onClose}
      />
    )
  return intoObs && reach.ok ? (
    <IntoObsDialog
      design={design}
      onClose={onClose}
      onOff={() => setIntoObs(false)}
      onDone={setResult}
      api={api}
    />
  ) : (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Use ${design.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onClassic}>
            Next
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Screens design={design} />
        <ObsSwitch reach={reach} checked={false} onChange={setIntoObs} />
      </div>
    </Dialog>
  )
}

function ObsSwitch({
  reach,
  checked,
  onChange,
}: {
  reach: { ok: boolean; why: string | null }
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Switch
      label="Set it up in OBS too"
      description={
        reach.why ??
        'A scene per screen, your game and camera under it, and Start show’s scenes set. Undo takes out only what it added.'
      }
      checked={checked && reach.ok}
      disabled={!reach.ok}
      onChange={onChange}
    />
  )
}

/** The theme's screens, small; tickable when `picked` is given. */
function Screens({
  design,
  picked,
  onToggle,
}: {
  design: ThemeDesign
  picked?: string[]
  onToggle?: (key: string) => void
}) {
  return (
    <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-5" aria-label="Screens">
      {design.content.scenes.map((s) => {
        const on = !picked || picked.includes(s.key)
        const body = (
          <>
            <span
              className={cx(
                'relative block overflow-hidden rounded-[8px] border',
                on ? 'border-line' : 'border-line opacity-45',
                picked && on && 'border-arc shadow-[0_0_0_1px_var(--fc-arc)]',
              )}
            >
              <ScenePreview design={design} sceneKey={s.key} lazy />
            </span>
            <span
              className={cx(
                'truncate text-[12px] font-semibold',
                on ? 'text-text-2' : 'text-text-3',
              )}
            >
              {s.name}
            </span>
          </>
        )
        return (
          <li key={s.key} className="min-w-0">
            {onToggle ? (
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(s.key)}
                className="fc-press flex w-full min-w-0 flex-col gap-1 rounded-[10px] text-left focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                {body}
              </button>
            ) : (
              <div className="flex min-w-0 flex-col gap-1">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function IntoObsDialog({
  design,
  onClose,
  onOff,
  onDone,
  api,
}: {
  design: ThemeDesign
  onClose: () => void
  onOff: () => void
  onDone: (r: { steps: ShowStep[]; applied: ObsTheme | null }) => void
  api: ReturnType<typeof obsThemeApi>
}) {
  const guess = useResource(() => api.plan(design.id), [design.id])
  return (
    <Dialog open onClose={onClose} size="lg" title={`Use ${design.name}`} footer={null}>
      {guess.error && !guess.data ? (
        <LoadError error={guess.error} onRetry={guess.reload} />
      ) : !guess.data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <PlanForm
          key={design.id}
          design={design}
          data={guess.data}
          onClose={onClose}
          onOff={onOff}
          onDone={onDone}
          api={api}
        />
      )}
    </Dialog>
  )
}

function PlanForm({
  design,
  data,
  onClose,
  onOff,
  onDone,
  api,
}: {
  design: ThemeDesign
  data: ThemeObsPlan
  onClose: () => void
  onOff: () => void
  onDone: (r: { steps: ShowStep[]; applied: ObsTheme | null }) => void
  api: ReturnType<typeof obsThemeApi>
}) {
  const [mode] = useMode('theme-obs')
  const [plan, setPlan] = useState<ThemePlan>(data.plan)
  const { run, busy } = useAction()
  const sources = data.obs_cameras
  const problem = checkThemePlan(plan, data.screens, data.obs_scenes, [
    ...sources,
    ...data.obs_scenes,
  ])
  const counts = planCounts(plan, data.obs_scenes, data.screens)
  const picked = plan.screens.filter((s) => s.place.kind !== 'skip').map((s) => s.key)
  const setScreen = (key: string, patch: Partial<ScreenPlan>) =>
    setPlan({
      ...plan,
      screens: plan.screens.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    })
  const toggle = (key: string) => {
    const s = plan.screens.find((x) => x.key === key)
    const guessed = data.plan.screens.find((x) => x.key === key)
    if (!s || !guessed) return
    setScreen(
      key,
      s.place.kind === 'skip'
        ? { place: guessed.place, under: guessed.under ?? null, role: guessed.role ?? null }
        : { place: { kind: 'skip' }, under: null, role: null },
    )
  }
  const switching = data.applied && data.applied.design_id !== design.id
  const label =
    counts.added + counts.changed === 0
      ? 'Nothing to add'
      : switching
        ? `Switch to ${design.name}`
        : counts.changed
          ? `Add ${counts.added} scene${counts.added === 1 ? '' : 's'}, change ${counts.changed}`
          : `Add ${counts.added} scene${counts.added === 1 ? '' : 's'} to OBS`
  const submit = () =>
    void run('apply', () => api.apply(design.id, plan)).then((r) => r && onDone(r))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ObsSwitch reach={{ ok: true, why: null }} checked onChange={(v) => !v && onOff()} />
        <ModeSwitch screen="theme-obs" />
      </div>
      {switching && (
        <p className="m-0 flex items-center gap-1.5 text-[13px] text-text-2">
          <Swap size={15} aria-hidden className="text-accent-text" />
          Takes {data.applied?.design_name}’s place in OBS.
        </p>
      )}
      {mode === 'advanced' ? (
        <Table design={design} data={data} plan={plan} setPlan={setPlan} setScreen={setScreen} />
      ) : (
        <>
          <Screens design={design} picked={picked} onToggle={toggle} />
          <Under plan={plan} />
        </>
      )}
      {data.old_widgets.length > 0 && (
        <OldWidgets data={data} plan={plan} setPlan={setPlan} detailed={mode === 'advanced'} />
      )}
      {design.content.alert_design && (
        <Switch
          label="Use its alert style"
          checked={plan.alert_style !== false}
          onChange={(v) => setPlan({ ...plan, alert_style: v })}
        />
      )}
      {problem && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
          {problem.replace(/^[\w.]+:\s*/, '')}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={<MonitorPlay size={16} />}
          busy={busy === 'apply'}
          disabled={!!problem || counts.added + counts.changed === 0}
          onClick={submit}
        >
          {label}
        </Button>
      </div>
    </div>
  )
}

/** One line: what goes under In game and Just chatting (Simple). */
function Under({ plan }: { plan: ThemePlan }) {
  const under = plan.screens.filter((s) => s.under && s.place.kind !== 'skip')
  if (!under.length) return null
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-1 text-[13px] text-text-2">
      Under them:
      {under.map((s, i) => (
        <span key={s.key}>
          <b className="font-semibold text-text">{s.under}</b>
          {i < under.length - 1 ? ',' : ''}
        </span>
      ))}
      <InfoTip>
        Your own scenes (game, camera, mic) go under the theme, so you don’t set them up again.
        Switch to Advanced to pick others.
      </InfoTip>
    </p>
  )
}

const PLACE_NEW = '__new'
const PLACE_SKIP = '__skip'

/** Advanced (board item 4): every screen's scene, what's under it and its job. */
function Table({
  design,
  data,
  plan,
  setPlan,
  setScreen,
}: {
  design: ThemeDesign
  data: ThemeObsPlan
  plan: ThemePlan
  setPlan: (p: ThemePlan) => void
  setScreen: (key: string, patch: Partial<ScreenPlan>) => void
}) {
  const placeValue = (p: ThemePlace) =>
    p.kind === 'new' ? PLACE_NEW : p.kind === 'skip' ? PLACE_SKIP : `${p.kind}:${p.scene}`
  const fromValue = (v: string): ThemePlace =>
    v === PLACE_NEW
      ? { kind: 'new' }
      : v === PLACE_SKIP
        ? { kind: 'skip' }
        : v.startsWith('on_top:')
          ? { kind: 'on_top', scene: v.slice(7) }
          : { kind: 'replace', scene: v.slice(8) }
  const ownScenes = data.obs_scenes.filter((n) => !n.startsWith(plan.prefix) || !plan.prefix)
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-[96px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-2 font-mono text-[11px] text-text-3 sm:grid">
        <span>Screen</span>
        <span>In OBS</span>
        <span>Under it</span>
        <span>Start show</span>
      </div>
      {plan.screens.map((p) => {
        const s = design.content.scenes.find((x) => x.key === p.key)
        if (!s) return null
        const off = p.place.kind === 'skip'
        return (
          <div
            key={p.key}
            className="grid grid-cols-2 items-center gap-2 border-t border-line pt-3 sm:grid-cols-[96px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)]"
          >
            <div
              className={cx(
                'col-span-2 flex items-center gap-2 sm:col-span-1 sm:flex-col sm:items-start sm:gap-1',
                off && 'opacity-50',
              )}
            >
              <span className="block w-20 overflow-hidden rounded-[6px] border border-line sm:w-full">
                <ScenePreview design={design} sceneKey={s.key} lazy />
              </span>
              <span className="text-[12px] font-semibold text-text-2">{s.name}</span>
            </div>
            <Select
              aria-label={`${s.name}: in OBS`}
              className="h-9 text-[13px]"
              value={placeValue(p.place)}
              onChange={(e) => {
                const place = fromValue(e.target.value)
                setScreen(
                  p.key,
                  place.kind === 'skip' ? { place, under: null, role: null } : { place },
                )
              }}
            >
              <option value={PLACE_NEW}>New: {s.name}</option>
              {ownScenes.map((n) => (
                <option key={`t${n}`} value={`on_top:${n}`}>
                  On top of {n}
                </option>
              ))}
              {ownScenes.map((n) => (
                <option key={`r${n}`} value={`replace:${n}`}>
                  Replace {n}’s look
                </option>
              ))}
              <option value={PLACE_SKIP}>Leave out</option>
            </Select>
            <Select
              aria-label={`${s.name}: under it`}
              className="h-9 text-[13px]"
              disabled={off}
              value={p.under ?? ''}
              onChange={(e) => setScreen(p.key, { under: e.target.value || null })}
            >
              <option value="">Nothing</option>
              {ownScenes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              {data.obs_cameras.map((n) => (
                <option key={`c${n}`} value={n}>
                  {n} (camera)
                </option>
              ))}
            </Select>
            <Select
              aria-label={`${s.name}: Start show uses it for`}
              className="h-9 text-[13px]"
              disabled={off}
              value={p.role ?? ''}
              onChange={(e) =>
                setScreen(p.key, { role: (e.target.value || null) as ThemeRole | null })
              }
            >
              <option value="">Nothing</option>
              {(Object.keys(ROLE_LABEL) as ThemeRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
        )
      })}
      <div className="grid grid-cols-1 items-end gap-3 border-t border-line pt-3 sm:grid-cols-2">
        <Field label="Scene names start with" hint="Empty: just the screen’s name.">
          {(f) => (
            <Input
              {...f}
              value={plan.prefix}
              name="prefix"
              spellCheck={false}
              maxLength={40}
              onChange={(e) => setPlan({ ...plan, prefix: e.target.value })}
            />
          )}
        </Field>
        <Switch
          label="Switch OBS to Starting when done"
          checked={plan.switch_to_starting !== false}
          onChange={(v) => setPlan({ ...plan, switch_to_starting: v })}
        />
      </div>
    </div>
  )
}

/** Old StreamElements / Streamlabs widgets (board item 7): hidden, not deleted. */
function OldWidgets({
  data,
  plan,
  setPlan,
  detailed,
}: {
  data: ThemeObsPlan
  plan: ThemePlan
  setPlan: (p: ThemePlan) => void
  detailed: boolean
}) {
  const hide = plan.hide_old ?? []
  const all = data.old_widgets.map((w) => w.source)
  if (!detailed)
    return (
      <Switch
        label={`Hide old widgets (${data.old_widgets.length})`}
        description={`${data.old_widgets.map((w) => `${w.source} (${w.vendor})`).join(', ')}. Hidden, not deleted, so two alert boxes never play at once.`}
        checked={hide.length > 0}
        onChange={(v) => setPlan({ ...plan, hide_old: v ? all : [] })}
      />
    )
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="sr-only">Hide old widgets</legend>
      <div className="mb-1 flex items-center gap-1 text-[13.5px] font-semibold text-text">
        <span aria-hidden>Hide old widgets</span>
        <InfoTip>Hidden, not deleted. Undo shows them again.</InfoTip>
      </div>
      {data.old_widgets.map((w) => (
        <label key={w.source} className="flex items-center gap-2.5 text-[13.5px] text-text">
          <input
            type="checkbox"
            className="size-4 accent-[var(--fc-arc)]"
            checked={hide.includes(w.source)}
            onChange={(e) =>
              setPlan({
                ...plan,
                hide_old: e.target.checked
                  ? [...hide, w.source]
                  : hide.filter((x) => x !== w.source),
              })
            }
          />
          {w.source}
          <span className="ml-auto text-[12px] text-text-3">
            {w.vendor} · {w.scenes.join(', ')}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

// ---------------------------------------------------------------- after (2A's "when it's done")

function ResultDialog({
  design,
  steps,
  applied,
  onClose,
  onStyle,
  onUndone,
}: {
  design: ThemeDesign
  steps: ShowStep[]
  applied: ObsTheme | null
  onClose: () => void
  onStyle: () => void
  onUndone: () => void
}) {
  const api = useThemeObs()
  const { run, busy } = useAction()
  const failed = steps.filter((s) => s.status === 'failed').length
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={failed ? `${design.name} is partly in OBS` : `${design.name} is in OBS`}
      footer={
        <>
          <Button
            variant="ghost"
            icon={<ArrowCounterClockwise size={15} />}
            busy={busy === 'undo'}
            onClick={() =>
              void run('undo', () => api.takeOut(), { success: 'Taken out of OBS.' }).then(
                (r) => r && onUndone(),
              )
            }
          >
            Undo
          </Button>
          <Button icon={<PaintBrush size={15} />} onClick={onStyle}>
            Make it yours
          </Button>
          <Button
            variant="primary"
            icon={<Play size={15} weight="fill" />}
            onClick={() => {
              onClose()
              go({ name: 'studio', section: 'show' })
            }}
          >
            Start show
          </Button>
        </>
      }
    >
      <StepList steps={steps} />
      {applied && (
        <p className="m-0 mt-3 text-[12.5px] text-text-3">
          {applied.screens.length} scenes · nothing of yours removed
        </p>
      )}
    </Dialog>
  )
}

function StepList({ steps }: { steps: ShowStep[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="What happened">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-2.5 text-[13.5px]">
          <StatusIcon status={s.status} className="mt-0.5" />
          <span className="min-w-0 flex-1 font-medium text-text">{s.label}</span>
          {s.detail && <InfoTip>{s.detail}</InfoTip>}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- Make it yours (5A)

const SWATCHES = ['#ffa424', '#2bb673', '#33a8ff', '#ff4fa3', '#f2c94c', '#9b6bff']
const FONT_LABEL: Record<ThemeFont, string> = {
  theme: 'Theme',
  bold: 'Bold',
  clean: 'Clean',
  mono: 'Mono',
}

export function MakeItYoursDialog({
  design,
  onClose,
}: {
  design: ThemeDesign
  onClose: () => void
}) {
  const client = useClient()
  const api = useThemeObs()
  const { run, busy } = useAction()
  const start = themeAccent(design)
  const [r, setR] = useState<Restyle>({ accent: start, font: 'theme', handle: '', logo: null })
  const [logoName, setLogoName] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => restyleTheme(design, r), [design, r])
  const swatches = start && !SWATCHES.includes(start) ? [start, ...SWATCHES.slice(0, 5)] : SWATCHES
  const upload = (f: File) =>
    void run('logo', () => client.upload(f, f.name)).then((m) => {
      if (!m) return
      setR({ ...r, logo: m.id })
      setLogoName(f.name)
    })
  const save = () =>
    void run(
      'save',
      async () => {
        let base: ThemeDesign = design
        if (design.built_in) {
          const copy = await client.duplicateDesign(design.id, `${design.name} (mine)`)
          if (copy.kind !== 'theme') throw new Error('not a theme')
          base = {
            ...design,
            ...copy,
            content: { ...design.content, alert_design: copy.content.alert_design },
          } as ThemeDesign
        }
        const saved = await client.saveDesign(restyleTheme(base, r))
        // The theme in OBS was the built-in: the copy takes its place (same scenes, same URLs).
        const inObs = await api.current()
        if (inObs && inObs.design_id === design.id && saved.id !== design.id)
          await api.apply(saved.id)
        return {
          saved,
          inObs: !!inObs && (inObs.design_id === design.id || inObs.design_id === saved.id),
        }
      },
      { success: (x) => (x.inObs ? 'Saved. OBS shows it now.' : 'Saved as your own theme.') },
    ).then((x) => x && onClose())
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Make ${design.name} yours`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <a
            href={href({ name: 'designer', id: design.id })}
            className="mr-auto self-center text-[13.5px] font-semibold text-accent-text hover:underline sm:order-first"
            onClick={onClose}
          >
            Full designer
          </a>
          <Button variant="primary" busy={busy === 'save'} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col gap-4">
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-[13.5px] font-semibold text-text">Colour</legend>
            <div className="flex flex-wrap items-center gap-2">
              {swatches.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={r.accent === c}
                  onClick={() => setR({ ...r, accent: c })}
                  className={cx(
                    'size-8 rounded-full border-2 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                    r.accent === c ? 'border-text' : 'border-transparent',
                  )}
                  style={{ background: c }}
                />
              ))}
              <label className="relative size-8 cursor-pointer overflow-hidden rounded-full border-2 border-transparent bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] has-[:focus-visible]:shadow-[var(--fc-focus)]">
                <span className="sr-only">Any colour</span>
                <input
                  type="color"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={r.accent ?? '#ffa424'}
                  onChange={(e) => setR({ ...r, accent: e.target.value })}
                />
              </label>
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <span className="text-[13.5px] font-semibold text-text">Font</span>
            <Segmented<ThemeFont>
              label="Font"
              value={r.font ?? 'theme'}
              options={(Object.keys(FONT_LABEL) as ThemeFont[]).map((f) => ({
                value: f,
                label: FONT_LABEL[f],
              }))}
              onChange={(f) => setR({ ...r, font: f })}
            />
          </div>
          <Field
            label="Your name"
            hint="Fills twitch.tv/…, youtube.com/@… and kick.com/… on every screen."
          >
            {(f) => (
              <Input
                {...f}
                placeholder="yourname…"
                name="handle"
                spellCheck={false}
                value={r.handle ?? ''}
                maxLength={40}
                onChange={(e) => setR({ ...r, handle: e.target.value })}
              />
            )}
          </Field>
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1 text-[13.5px] font-semibold text-text">
              Logo
              <InfoTip>Where the theme has its mark. PNG, JPG or WebP.</InfoTip>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                icon={r.logo ? <ImageSquare size={15} /> : <UploadSimple size={15} />}
                busy={busy === 'logo'}
                onClick={() => file.current?.click()}
              >
                {r.logo ? 'Change' : 'Upload'}
              </Button>
              {r.logo && (
                <>
                  <span className="max-w-40 truncate text-[12.5px] text-text-3">{logoName}</span>
                  <Button size="sm" variant="ghost" onClick={() => setR({ ...r, logo: null })}>
                    Remove
                  </Button>
                </>
              )}
              <input
                ref={file}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) upload(f)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2" aria-label="Preview" role="group">
          <span className="block overflow-hidden rounded-[10px] border border-line">
            <ScenePreview design={preview} sceneKey="starting_soon" />
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {preview.content.scenes
              .filter((s) => s.key !== 'starting_soon')
              .slice(0, 4)
              .map((s) => (
                <span
                  key={s.key}
                  className="block overflow-hidden rounded-[6px] border border-line"
                >
                  <ScenePreview design={preview} sceneKey={s.key} />
                </span>
              ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Your theme in OBS (6)

export function ThemeInObsCard() {
  const api = useThemeObs()
  const current = useResource(() => api.current(), [api])
  const design = useResource(
    (c) => (current.data ? c.design(current.data.design_id) : Promise.resolve(null)),
    [current.data?.design_id],
  )
  const { run, busy } = useAction()
  const [asking, setAsking] = useState(false)
  const [styling, setStyling] = useState(false)
  const t = current.data
  const theme = design.data?.kind === 'theme' ? (design.data as ThemeDesign) : null
  const found = t?.screens.filter((s) => s.found).length ?? 0
  const takeOut = () =>
    void run('out', () => api.takeOut(), {
      success: (r) =>
        r.applied ? 'Partly taken out. Try again with OBS open.' : 'Taken out of OBS.',
    }).then(() => {
      setAsking(false)
      current.reload()
    })
  return (
    <Panel
      id="theme-in-obs"
      title="Your theme in OBS"
      description="Change it here; the scenes in OBS follow. Take it out removes only what Ferrocast added."
    >
      {current.error && !current.data ? (
        <LoadError error={current.error} onRetry={current.reload} />
      ) : current.loading && !current.data ? (
        <Skeleton className="h-20 w-full" />
      ) : !t ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13.5px] text-text-3">None yet.</span>
          <a
            href={href({ name: 'designs', tab: 'themes' })}
            className="fc-press inline-flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface-2 px-3 text-[13.5px] font-semibold text-text hover:border-text-3"
          >
            <MonitorPlay size={16} aria-hidden />
            Pick a theme
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="block w-28 shrink-0 overflow-hidden rounded-[8px] border border-line">
              {theme ? (
                <ScenePreview design={theme} sceneKey="in_game" lazy />
              ) : (
                <Skeleton className="aspect-video w-full" />
              )}
            </span>
            <div className="min-w-0">
              <p className="m-0 truncate text-[15px] font-semibold text-text">{t.design_name}</p>
              <p
                className={cx(
                  'm-0 text-[13px]',
                  t.screens.some((s) => s.found === false) ? 'text-warn' : 'text-text-3',
                )}
              >
                {t.screens.some((s) => s.found === null)
                  ? `${t.screens.length} scenes`
                  : found === t.screens.length
                    ? `${found} scenes in OBS`
                    : `${t.screens.length - found} of ${t.screens.length} scenes missing in OBS`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<PaintBrush size={15} />}
              disabled={!theme}
              onClick={() => setStyling(true)}
            >
              Make it yours
            </Button>
            <a
              href={href({ name: 'designs', tab: 'themes' })}
              className="fc-press inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong bg-surface-2 px-3 text-[13px] font-semibold text-text hover:border-text-3"
            >
              <Swap size={15} aria-hidden />
              Switch theme
            </a>
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowCounterClockwise size={15} />}
              onClick={() => setAsking(true)}
            >
              Take it out
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        size="sm"
        title={`Take ${t?.design_name ?? 'the theme'} out of OBS?`}
        description="Only what Ferrocast added goes. Start show’s scenes go back."
        footer={
          <>
            <Button onClick={() => setAsking(false)}>Keep it</Button>
            <Button variant="danger" busy={busy === 'out'} onClick={takeOut}>
              Take it out
            </Button>
          </>
        }
      />
      {styling && theme && (
        <MakeItYoursDialog
          design={theme}
          onClose={() => {
            setStyling(false)
            current.reload()
          }}
        />
      )}
    </Panel>
  )
}
