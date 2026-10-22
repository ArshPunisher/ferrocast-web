// The designer: an alert design edited in one of two views over the same data. Stage (A2):
// a big live stage, a floating tabbed inspector and a timeline. Guided (A3): cards for
// Look, Text, Sound and Motion beside a sticky preview, with an Advanced switch. The view
// is remembered per person. Theme, scene and widget designs open their own editors.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowArcLeft,
  ArrowArcRight,
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  Check,
  Code,
  Copy,
  Image as ImageIcon,
  Monitor,
  Palette,
  PaperPlaneTilt,
  PencilSimple,
  Play,
  Plus,
  Shuffle,
  SpeakerHigh,
  SpeakerSlash,
  Sparkle,
  TextAa,
} from '@phosphor-icons/react'
import {
  EVENT_KEYS,
  EVENT_LABEL,
  EVENT_SAMPLE,
  baseLook,
  describeError,
  hasAmount,
  looksFor,
  previewAlert,
  stripBrand,
  validateDesign,
  type AlertDesign,
  type AlertLook,
  type Design,
  type DesignVariation,
  type EventKey,
  type Media,
  withSuggestedSounds,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  IconButton,
  Input,
  Segmented,
  Select,
  Skeleton,
  Switch,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError } from '../components/Panel'
import {
  DesignStage,
  type Scene,
  type StageHandle,
  type StageTick,
} from '../components/design/DesignStage'
import { Timeline } from '../components/design/Timeline'
import { MotionSection, type MotionStage } from '../components/design/motion'
import {
  CssSection,
  EVENT_ICON,
  LookSection,
  SoundSection,
  StyleSection,
  TextSection,
  WhenSection,
  conditionText,
  type SectionProps,
  type SetLook,
} from '../components/design/inspector'
import { BrandChip } from '../components/design/brand-chip'
import { StylePicker } from '../components/design/StylePicker'
import { SceneDesigner, WidgetDesigner } from '../components/design/LayoutDesigners'
import { useHistory, useUndoKeys } from '../lib/history'
import { useAction, useClient, useMediaQuery, useResource } from '../lib/hooks'
import { go, href, leaveTo } from '../lib/router'
import { galleryTab } from '../components/design/gallery'
import { useLeaveGuard } from '../lib/unsaved'
import { previewMediaUrl } from '../lib/media-url'
import { unlockAudio, unlockImpactAudio } from '@ferrocast/overlays'

export type DesignerView = 'stage' | 'guided'
const VIEW_KEY = 'fc.designer.view'

export function readView(): DesignerView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'guided' ? 'guided' : 'stage'
  } catch {
    return 'stage'
  }
}
function saveView(v: DesignerView): void {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* private window: the choice lasts this visit */
  }
}

export function Designer({ id }: { id: string }) {
  const res = useResource((c) => c.design(id), [id])
  if (res.error) return <LoadError error={res.error} onRetry={res.reload} />
  if (!res.data)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="aspect-video w-full" />
      </div>
    )
  const d = res.data
  if (d.kind === 'alert') return <AlertDesigner key={d.id} design={d} onSaved={(x) => res.set(x)} />
  if (d.kind === 'widget')
    return <WidgetDesigner key={d.id} design={d} onSaved={(x) => res.set(x)} />
  return <SceneDesigner key={d.id} design={d} onSaved={(x) => res.set(x)} />
}

/** Saving: your own design is updated; a built-in becomes your own copy (without the mark). */
export function useDesignSave(design: Design, onSaved: (d: Design) => void) {
  const client = useClient()
  const { run, busy } = useAction()
  const save = async (draft: Design): Promise<Design | undefined> => {
    // A built-in's copy drops the Ferrocast mark layers before it's checked and saved.
    const candidate = design.built_in
      ? { ...stripBrand(draft), built_in: false, branded: false }
      : draft
    const problem = validateDesign(candidate)
    if (problem) {
      toast({ tone: 'error', message: 'This design can’t be saved yet.', hint: problem })
      return undefined
    }
    if (design.built_in) {
      const mine = await run(
        'save',
        () =>
          client.createDesign({ ...candidate, origin: { type: 'duplicate', from: design.name } }),
        { success: (d) => `Saved as ${d.name}, your own copy without Ferrocast branding.` },
      )
      // The draft is saved as the copy: leave without asking to save it again.
      if (mine) leaveTo(href({ name: 'designer', id: mine.id }))
      return mine
    }
    const saved = await run('save', () => client.saveDesign(draft), { success: 'Design saved.' })
    if (saved) onSaved(saved)
    return saved
  }
  return { save, busy }
}

function AlertDesigner({ design, onSaved }: { design: AlertDesign; onSaved: (d: Design) => void }) {
  const client = useClient()
  const { run, busy } = useAction()
  const h = useHistory<AlertDesign>(design)
  useUndoKeys(h)
  const draft = h.value
  const [ev, setEv] = useState<EventKey>('tip')
  const [vi, setVi] = useState(0)
  const [view, setView] = useState<DesignerView>(readView)
  const [amount, setAmount] = useState<number | null>(null)
  const [longName, setLongName] = useState(false)
  const [scene, setScene] = useState<Scene>('game')
  // A screenshot of the streamer's own scene to preview over (an object URL, never uploaded).
  const [shot, setShot] = useState<string | null>(null)
  useEffect(() => () => void (shot && URL.revokeObjectURL(shot)), [shot])
  // On unless the streamer muted it last time (the preview used to start muted every time).
  const [sound, setSoundState] = useState(() => {
    try {
      return localStorage.getItem('fc.previewSound') !== '0'
    } catch {
      return true
    }
  })
  const setSound = (f: (v: boolean) => boolean) =>
    setSoundState((v) => {
      const next = f(v)
      try {
        localStorage.setItem('fc.previewSound', next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  const [tick, setTick] = useState<StageTick | null>(null)
  const media = useResource((c) => c.media())
  const stage = useRef<StageHandle>(null)
  const { save, busy: saving } = useDesignSave(design, (d) => {
    onSaved(d)
    if (d.kind === 'alert') h.reset(d)
  })
  const dirty = JSON.stringify(draft) !== JSON.stringify(design)
  const leaving = useLeaveGuard(dirty)
  const [askDuplicate, setAskDuplicate] = useState(false)

  const variations = looksFor(draft, ev)
  const ownKey = draft.content.events[ev]
    ? ev
    : (EVENT_KEYS.find((k) => draft.content.events[k]) ?? 'tip')
  const index = Math.min(vi, Math.max(0, variations.length - 1))
  const variation = variations[index]
  const look = variation?.look ?? baseLook()
  const alert = useMemo(
    () =>
      previewAlert(draft, ev, {
        amount,
        longName,
        variationId: variation?.id ?? null,
        id: `designer-${ev}`,
      }),
    [draft, ev, amount, longName, variation?.id],
  )
  // Through the client: the engine's own url needs the session (1.0.0 showed the event art
  // instead of an uploaded picture because the request was refused).
  const mediaUrl = (mid: string) => previewMediaUrl(client, media.data, mid)

  /** Edits the variation on screen (for an event without its own look yet, it gets one). */
  const editVariations = (
    fn: (vs: DesignVariation[]) => DesignVariation[],
    opts?: { merge?: boolean },
  ) =>
    h.set((d) => {
      const own =
        d.content.events[ev]?.variations ??
        structuredClone(looksFor(d, ev)).map((v, i) => ({ ...v, id: `${ev}-${i}` }))
      return {
        ...d,
        content: { ...d.content, events: { ...d.content.events, [ev]: { variations: fn(own) } } },
      }
    }, opts)
  const setLook: SetLook = (patch, opts) =>
    editVariations(
      (vs) => vs.map((v, i) => (i === index ? { ...v, look: { ...v.look, ...patch } } : v)),
      opts,
    )
  const addVariation = () => {
    editVariations((vs) => {
      const base = vs[0] ?? {
        id: `${ev}-0`,
        name: 'Default',
        condition: null,
        priority: 0,
        look: baseLook(),
      }
      return [
        ...vs,
        {
          id: `${ev}-${Date.now().toString(36)}`,
          name: `Variation ${vs.length}`,
          condition: hasAmount(ev)
            ? { type: 'amount_at_least', value: 1000, currency: null }
            : { type: 'has_message' },
          priority: vs.length * 5,
          look: structuredClone(base.look),
        },
      ]
    })
    setVi(variations.length)
  }
  const removeVariation = (i: number) => {
    editVariations((vs) => vs.filter((_, k) => k !== i))
    setVi(0)
  }
  const onUploaded = (m: Media) => media.set((prev) => [...(prev ?? []), m])
  const props: SectionProps = {
    look,
    set: setLook,
    onSuggestSounds: () => {
      h.set((d) => withSuggestedSounds(d))
      toast({
        tone: 'ok',
        message: 'Each event has its suggested sound now.',
        hint: 'Undo puts them back. Save to keep them.',
      })
    },
    advanced: true,
    ev,
    media: media.data ?? [],
    onUploaded,
  }
  const changeView = (v: DesignerView) => {
    setView(v)
    saveView(v)
  }

  const sendTest = async () => {
    // A built-in tests as it is; your own design tests with what's on screen (saved first).
    let target: Design | undefined = design
    if (!design.built_in && dirty) target = await save(draft)
    if (!target) return
    const s = EVENT_SAMPLE[ev]
    await run(
      'test',
      () =>
        client.testAlert({
          kind: s.kind,
          ...(s.platform ? { platform: s.platform } : {}),
          design_id: target.id,
          // A Sub test needs a first month, or the engine's sample plays the Resub look.
          ...(amount && hasAmount(ev)
            ? { amount }
            : s.months !== undefined
              ? { amount: s.months }
              : {}),
        }),
      {
        success:
          design.built_in && dirty
            ? 'Test alert sent with the built-in look. Save your copy to test your changes.'
            : 'Test alert sent to your overlays.',
      },
    )
  }
  const use = () =>
    void run('use', () => client.useDesign(draft.id), {
      success: `${draft.name} now plays your alerts.${design.built_in ? ' It is a built-in, so it keeps the small Ferrocast mark.' : ''}`,
    })

  const header = (
    <DesignerHeader
      design={design}
      name={draft.name}
      onName={(name) => h.set((d) => ({ ...d, name }), { merge: true })}
      history={h}
      view={view}
      onView={changeView}
      dirty={dirty}
      saving={saving === 'save'}
      onSave={() => void save(draft)}
      onUse={use}
      using={busy === 'use'}
      onDuplicate={() => setAskDuplicate(true)}
    />
  )
  const testBar = (
    <div className="flex flex-wrap items-center gap-2">
      {hasAmount(ev) && (
        <label className="flex items-center gap-1.5 text-[13.5px] text-text-3">
          Amount
          <div className="w-24">
            <Input
              type="number"
              min={0}
              step={50}
              inputMode="decimal"
              value={amount ?? ''}
              placeholder="750"
              onChange={(e) =>
                setAmount(e.target.value ? Math.max(0, Number(e.target.value)) : null)
              }
              className="h-8"
              aria-label="Test amount"
            />
          </div>
        </label>
      )}
      <Button
        size="sm"
        variant="ghost"
        aria-pressed={longName}
        onClick={() => setLongName((v) => !v)}
      >
        Long name
      </Button>
      <Button
        size="sm"
        variant="primary"
        icon={<PaperPlaneTilt size={15} />}
        busy={busy === 'test'}
        onClick={() => void sendTest()}
        className="ml-auto"
      >
        Send test alert
      </Button>
    </div>
  )
  const stageTools = (
    <>
      <div className="absolute top-2.5 left-2.5 flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          icon={<Monitor size={14} />}
          onClick={() =>
            setScene((s) => (s === 'game' ? 'light' : s === 'light' ? 'checker' : 'game'))
          }
          aria-label={`Backdrop: ${scene}. Change backdrop`}
        >
          {scene === 'game' ? 'Game' : scene === 'light' ? 'Bright' : 'Clear'}
        </Button>
      </div>
      <div className="absolute top-2.5 right-2.5 flex gap-1">
        <IconButton
          size="sm"
          variant="secondary"
          label={sound ? 'Mute preview' : 'Play preview sound'}
          aria-pressed={sound}
          onClick={() => {
            unlockAudio()
            unlockImpactAudio()
            setSound((v) => !v)
          }}
        >
          {sound ? <SpeakerHigh size={15} /> : <SpeakerSlash size={15} />}
        </IconButton>
        <IconButton
          size="sm"
          variant="secondary"
          label="Replay"
          onClick={() => stage.current?.play()}
        >
          <ArrowsClockwise size={15} />
        </IconButton>
      </div>
    </>
  )
  const eventSelect = (
    <div className="w-44 shrink-0">
      <Select
        aria-label="Event"
        value={ev}
        onChange={(e) => (setEv(e.target.value as EventKey), setVi(0))}
        className="h-9"
      >
        {EVENT_KEYS.map((k) => (
          <option key={k} value={k}>
            {EVENT_LABEL[k]}
            {draft.content.events[k] ? '' : ' (uses its plainer look)'}
          </option>
        ))}
      </Select>
    </div>
  )
  const variationTabs = (
    <div
      role="group"
      aria-label="Variations"
      className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]"
    >
      {variations.map((v, i) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={i === index}
          title={conditionText(v.condition)}
          onClick={() => setVi(i)}
          className={cx(
            'fc-press inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium',
            i === index
              ? 'border-accent-line bg-accent-soft text-text'
              : 'border-line text-text-2 hover:border-line-strong',
          )}
        >
          {v.name}
        </button>
      ))}
      {variations.length < 10 && (
        <IconButton size="sm" variant="ghost" label="Add a variation" onClick={addVariation}>
          <Plus size={14} />
        </IconButton>
      )}
    </div>
  )
  const preview = (
    <DesignStage
      alert={alert}
      scene={scene}
      shot={shot}
      sound={sound}
      // Every change replays the alert, so the effect of a setting is seen (and heard).
      autoplay
      loop={view === 'guided'}
      handle={stage}
      onTick={setTick}
      mediaUrl={mediaUrl}
      refresh={media.data?.length ?? 0}
      label={`${EVENT_LABEL[ev]} alert preview`}
      fill={view === 'stage'}
      className={view === 'stage' ? 'h-full' : ''}
    >
      {stageTools}
    </DesignStage>
  )

  const motionStage: MotionStage = {
    play: () => stage.current?.play(),
    sound,
    onSound: () => {
      unlockAudio()
      unlockImpactAudio()
      setSound((v) => !v)
    },
    scene,
    onScene: setScene,
    onShot: setShot,
    amount,
    onAmount: setAmount,
    others: EVENT_KEYS.filter((k) => k !== ev && draft.content.events[k]).flatMap((k) => {
      const v = draft.content.events[k]?.variations[0]
      return v ? [{ key: k, look: v.look }] : []
    }),
    tick,
    soundUrl: (id) => mediaUrl(id),
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      {view === 'stage' ? (
        <StageView
          eventSelect={eventSelect}
          variationTabs={variationTabs}
          testBar={testBar}
          preview={preview}
          props={props}
          ev={ev}
          look={look}
          setLook={setLook}
          tick={tick}
          motion={motionStage}
          onReplay={() => stage.current?.play()}
          when={
            <WhenSection
              variations={variations}
              selected={index}
              onSelect={setVi}
              onAdd={addVariation}
              onRemove={removeVariation}
              onChange={(i, v) => editVariations((vs) => vs.map((x, k) => (k === i ? v : x)))}
            />
          }
          brand={design.built_in ? <BrandNote onDuplicate={() => setAskDuplicate(true)} /> : null}
        />
      ) : (
        <GuidedView
          ev={ev}
          ownKey={ownKey}
          onEv={(k) => (setEv(k), setVi(0))}
          draft={draft}
          testBar={testBar}
          preview={preview}
          props={props}
          variationTabs={variationTabs}
          motion={motionStage}
          onReplay={() => stage.current?.play()}
          brand={design.built_in ? <BrandNote onDuplicate={() => setAskDuplicate(true)} /> : null}
          onSave={() => void save(draft)}
          sendButton={
            <Button
              variant="primary"
              icon={<PaperPlaneTilt size={15} />}
              busy={busy === 'test'}
              onClick={() => void sendTest()}
              className="flex-1"
            >
              Send test
            </Button>
          }
          when={
            <WhenSection
              variations={variations}
              selected={index}
              onSelect={setVi}
              onAdd={addVariation}
              onRemove={removeVariation}
              onChange={(i, v) => editVariations((vs) => vs.map((x, k) => (k === i ? v : x)))}
            />
          }
        />
      )}
      <DuplicateDialog
        open={askDuplicate}
        design={design}
        onClose={() => setAskDuplicate(false)}
        onDone={(d) => {
          setAskDuplicate(false)
          go({ name: 'designer', id: d.id })
        }}
      />
      <Dialog
        open={leaving.pending !== null}
        onClose={leaving.stay}
        size="sm"
        title="Save your design first?"
        description={
          design.built_in
            ? 'Your changes to this built-in only stay if you save them as your own copy.'
            : 'You changed this design. Overlays keep the saved version until you save.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={leaving.stay}>
              Stay
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                h.reset(design)
                leaving.leave()
              }}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              busy={saving === 'save'}
              onClick={() => void save(draft).then((d) => d && leaving.leave())}
            >
              {design.built_in ? 'Save my copy' : 'Save and leave'}
            </Button>
          </>
        }
      />
    </div>
  )
}

function BrandNote({ onDuplicate }: { onDuplicate: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2.5 rounded-[14px] border border-line bg-surface-2 px-3.5 py-3">
      <p className="text-[13.5px] leading-snug text-text-2">
        <b className="font-semibold text-text">Built-in design.</b> It shows a small Ferrocast mark
        on stream. Your edits stay a draft until you save your own copy.
      </p>
      <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={onDuplicate}>
        Duplicate to edit
      </Button>
    </div>
  )
}

export function DesignerHeader({
  design,
  name,
  onName,
  history,
  view,
  onView,
  dirty,
  saving,
  onSave,
  onUse,
  using,
  onDuplicate,
}: {
  design: Design
  name: string
  onName: (n: string) => void
  history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }
  view?: DesignerView
  onView?: (v: DesignerView) => void
  dirty: boolean
  saving: boolean
  onSave: () => void
  onUse?: () => void
  using?: boolean
  onDuplicate: () => void
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <a
          href={href({
            name: 'designs',
            tab: design.built_in ? galleryTab(design) : 'mine',
          })}
          className="fc-press inline-flex size-10 items-center justify-center rounded-control text-text-3 hover:bg-surface-2 hover:text-text"
          aria-label="Back to designs"
        >
          <CaretLeft size={18} />
        </a>
        {design.built_in ? (
          <h1 className="min-w-0 truncate font-display text-2xl font-bold tracking-tight">
            {name}
          </h1>
        ) : (
          // Reads as the page title; a pencil on hover says it can be renamed, and editing shows
          // a soft fill and an underline instead of a boxed field.
          <label className="group inline-flex min-w-0 items-center gap-1.5 rounded-control px-1.5 py-0.5 hover:bg-surface-2 focus-within:bg-surface-2 focus-within:shadow-[inset_0_-2px_0_var(--color-accent)]">
            <input
              aria-label="Design name"
              value={name}
              maxLength={60}
              size={Math.min(28, Math.max(6, name.length + 1))}
              spellCheck={false}
              onChange={(e) => onName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="min-w-0 bg-transparent font-display text-2xl font-bold tracking-tight text-text outline-none"
            />
            <PencilSimple
              size={16}
              aria-hidden="true"
              className="shrink-0 text-text-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-0"
            />
          </label>
        )}
        {design.built_in ? <BrandChip label="Built-in" /> : <Badge tone="accent">Mine</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view && onView && (
          <Segmented
            label="Designer view"
            size="sm"
            value={view}
            options={[
              { value: 'stage', label: 'Stage', title: 'Big stage, inspector and timeline' },
              { value: 'guided', label: 'Guided', title: 'Step by step cards' },
            ]}
            onChange={onView}
          />
        )}
        <IconButton size="sm" label="Undo" disabled={!history.canUndo} onClick={history.undo}>
          <ArrowArcLeft size={16} />
        </IconButton>
        <IconButton size="sm" label="Redo" disabled={!history.canRedo} onClick={history.redo}>
          <ArrowArcRight size={16} />
        </IconButton>
        {onUse && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Play size={14} />}
            busy={using ?? false}
            onClick={onUse}
          >
            Use
          </Button>
        )}
        {design.built_in ? (
          <Button
            size="sm"
            variant={dirty ? 'primary' : 'secondary'}
            icon={<Copy size={14} />}
            busy={saving}
            onClick={dirty ? onSave : onDuplicate}
          >
            {dirty ? 'Save my copy' : 'Duplicate & customise'}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            icon={<Check size={14} />}
            busy={saving}
            disabled={!dirty}
            onClick={onSave}
          >
            {dirty ? 'Save' : 'Saved'}
          </Button>
        )}
      </div>
    </div>
  )
}

export function DuplicateDialog({
  open,
  design,
  onClose,
  onDone,
}: {
  open: boolean
  design: Design
  onClose: () => void
  onDone: (d: Design) => void
}) {
  const client = useClient()
  const { run, busy } = useAction()
  const [name, setName] = useState(`${design.name} copy`.slice(0, 60))
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Duplicate & customise"
      description="Makes your own copy, fully editable, without any Ferrocast branding."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Copy size={15} />}
            busy={busy === 'dup'}
            onClick={() =>
              void run('dup', () => client.duplicateDesign(design.id, name.trim() || undefined), {
                success: (d) => `${d.name} added to My designs.`,
              }).then((d) => d && onDone(d))
            }
          >
            Make my copy
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 text-[13.5px] font-medium text-text-2">
        Name
        <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
    </Dialog>
  )
}

// ------------------------------------------------------------------ A2: stage view

const TABS = [
  { id: 'look', label: 'Look', icon: ImageIcon },
  { id: 'text', label: 'Text', icon: TextAa },
  { id: 'style', label: 'Style', icon: Palette },
  { id: 'motion', label: 'Motion', icon: Sparkle },
  { id: 'sound', label: 'Sound', icon: SpeakerHigh },
  { id: 'when', label: 'When', icon: Shuffle },
  { id: 'css', label: 'CSS', icon: Code },
] as const
type TabId = (typeof TABS)[number]['id']

function StageView({
  eventSelect,
  variationTabs,
  testBar,
  preview,
  props,
  ev,
  look,
  setLook,
  tick,
  motion,
  onReplay,
  when,
  brand,
}: {
  eventSelect: React.ReactNode
  variationTabs: React.ReactNode
  testBar: React.ReactNode
  preview: React.ReactNode
  props: SectionProps
  ev: EventKey
  look: AlertLook
  setLook: SetLook
  tick: StageTick | null
  motion: MotionStage
  onReplay: () => void
  when: React.ReactNode
  brand: React.ReactNode
}) {
  const [tab, setTab] = useState<TabId>('look')
  const [sheetOpen, setSheetOpen] = useState(false)
  const phone = useMediaQuery('(max-width: 899px)')
  const pick = (t: TabId) => {
    if (phone && t === tab && sheetOpen) return setSheetOpen(false)
    setTab(t)
    if (phone) setSheetOpen(true)
  }
  const Icon = EVENT_ICON[ev]
  const body = (
    <div className="flex flex-col gap-4 p-4">
      {tab === 'look' && brand}
      {tab === 'look' && <LookSection {...props} />}
      {tab === 'text' && <TextSection {...props} />}
      {tab === 'style' && <StyleSection {...props} />}
      {tab === 'motion' && <MotionSection {...props} stage={motion} />}
      {tab === 'sound' && <SoundSection {...props} />}
      {tab === 'when' && when}
      {tab === 'css' && <CssSection {...props} />}
    </div>
  )
  const tabs = (
    <div
      role="tablist"
      aria-label="Inspector sections"
      className="flex shrink-0 gap-0.5 overflow-x-auto p-1.5 [scrollbar-width:none]"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === tab}
          aria-controls="designer-pane"
          onClick={() => pick(t.id)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            const i = TABS.findIndex((x) => x.id === tab) + (e.key === 'ArrowRight' ? 1 : -1)
            const next = TABS[(i + TABS.length) % TABS.length]
            if (next) {
              setTab(next.id)
              document.getElementById(`tab-${next.id}`)?.focus()
            }
          }}
          className={cx(
            'flex min-h-12 flex-1 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[9px] px-2 text-[12.5px] font-semibold',
            t.id === tab
              ? 'bg-surface-3 text-text [&_svg]:text-accent-text'
              : 'text-text-3 hover:bg-surface-2 hover:text-text',
          )}
        >
          <t.icon size={18} />
          {t.label}
        </button>
      ))}
    </div>
  )
  return (
    <div className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface-1 max-[899px]:pb-[calc(64px+env(safe-area-inset-bottom))]">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <Icon size={18} className="shrink-0 text-accent-text" aria-hidden="true" />
        {eventSelect}
        <div className="min-w-0 flex-1 max-[899px]:order-5 max-[899px]:basis-full">
          {variationTabs}
        </div>
      </div>
      <div className="relative min-h-0 bg-inset p-3 min-[900px]:h-[min(64dvh,620px)] min-[900px]:p-5">
        <div className="relative aspect-video w-full min-[900px]:absolute min-[900px]:top-5 min-[900px]:bottom-5 min-[900px]:left-5 min-[900px]:right-[392px] min-[900px]:aspect-auto min-[900px]:w-auto">
          {preview}
        </div>
        <section
          aria-label="Inspector"
          className={cx(
            'flex flex-col overflow-hidden border border-line-strong bg-surface-1 shadow-pop',
            'min-[900px]:absolute min-[900px]:top-5 min-[900px]:right-5 min-[900px]:bottom-5 min-[900px]:w-[356px] min-[900px]:rounded-panel',
            'max-[899px]:fixed max-[899px]:inset-x-0 max-[899px]:bottom-[calc(64px+env(safe-area-inset-bottom))] max-[899px]:z-40 max-[899px]:rounded-t-[18px]',
            phone && sheetOpen ? 'max-[899px]:h-[62dvh]' : '',
          )}
        >
          {phone && (
            <span
              aria-hidden="true"
              className="mx-auto mt-2 block h-1 w-9 shrink-0 rounded bg-line-strong"
            />
          )}
          {!phone && tabs}
          {(!phone || sheetOpen) && (
            <div
              id="designer-pane"
              role="tabpanel"
              aria-labelledby={`tab-${tab}`}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line"
            >
              {body}
            </div>
          )}
          {phone && <div className="border-t border-line">{tabs}</div>}
        </section>
      </div>
      <Timeline look={look} set={setLook} tick={tick} onCommit={onReplay} />
      <div className="border-t border-line px-3 py-2.5">{testBar}</div>
    </div>
  )
}

// ------------------------------------------------------------------ A3: guided view

const STEPS = [
  { id: 'look', label: 'Look', sub: 'Pick a frame, a layout and a picture', icon: Palette },
  { id: 'text', label: 'Text', sub: 'What it says and how it looks', icon: TextAa },
  {
    id: 'sound',
    label: 'Sound',
    sub: 'A sound, and whether to read messages aloud',
    icon: SpeakerHigh,
  },
  { id: 'motion', label: 'Motion', sub: 'How it comes in and goes out', icon: Sparkle },
] as const

function GuidedView({
  ev,
  onEv,
  draft,
  testBar,
  preview,
  props,
  variationTabs,
  motion,
  brand,
  onSave,
  when,
  sendButton,
}: {
  sendButton: React.ReactNode
  ev: EventKey
  ownKey: EventKey
  onEv: (k: EventKey) => void
  draft: AlertDesign
  testBar: React.ReactNode
  preview: React.ReactNode
  props: SectionProps
  variationTabs: React.ReactNode
  motion: MotionStage
  onReplay: () => void
  brand: React.ReactNode
  onSave: () => void
  when: React.ReactNode
}) {
  const [advanced, setAdvanced] = useState(false)
  const [step, setStep] = useState(0)
  const [done, setDone] = useState<Set<number>>(new Set())
  const cards = useRef<(HTMLElement | null)[]>([])
  const p = { ...props, advanced }
  const goTo = (i: number, scroll: boolean) => {
    if (i > step)
      setDone((d) => new Set([...d, ...Array.from({ length: i - step }, (_, k) => step + k)]))
    setStep(i)
    if (scroll)
      requestAnimationFrame(() =>
        cards.current[i]?.scrollIntoView({
          block: 'start',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        }),
      )
  }
  useEffect(() => setStep((s) => s), [ev])
  const last = step === STEPS.length - 1
  return (
    <div className="flex flex-col gap-4 pb-[calc(72px)] lg:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Make your {EVENT_LABEL[ev].toLowerCase()} alert
        </h2>
        <span className="flex-1" />
        <div className="flex h-10 items-center gap-2.5 rounded-full border border-line bg-surface-1 pr-1.5 pl-3">
          <Switch checked={advanced} onChange={setAdvanced} label="Advanced" />
        </div>
      </div>
      <div
        role="group"
        aria-label="Which event is this for?"
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        {EVENT_KEYS.map((k) => {
          const I = EVENT_ICON[k]
          return (
            <button
              key={k}
              type="button"
              aria-pressed={k === ev}
              onClick={() => onEv(k)}
              className={cx(
                'fc-press inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-medium',
                k === ev
                  ? 'border-accent-line bg-accent-soft text-text'
                  : 'border-line text-text-2 hover:border-line-strong',
                !draft.content.events[k] && 'border-dashed',
              )}
            >
              <I size={15} />
              {EVENT_LABEL[k]}
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="flex min-w-0 flex-col gap-2.5 max-lg:order-2">
          {variationTabs}
          <nav aria-label="Steps" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-current={i === step ? 'step' : undefined}
                onClick={() => goTo(i, false)}
                className={cx(
                  'flex min-h-10 flex-1 shrink-0 items-center gap-2 rounded-full border pr-3.5 pl-2 text-[13.5px] font-semibold',
                  i === step
                    ? 'border-accent-text bg-accent-soft text-text'
                    : 'border-line bg-surface-1 text-text-3',
                )}
              >
                <span
                  className={cx(
                    'grid size-6 place-items-center rounded-full font-mono text-[12.5px] font-bold',
                    done.has(i) && i !== step
                      ? 'bg-btn-primary text-on-btn-primary'
                      : i === step
                        ? 'bg-accent-text text-bg'
                        : 'bg-surface-3 text-text-2',
                  )}
                >
                  {done.has(i) && i !== step ? <Check size={13} weight="bold" /> : i + 1}
                </span>
                {s.label}
              </button>
            ))}
          </nav>
          {STEPS.map((s, i) => {
            const open = i === step
            return (
              <section
                key={s.id}
                ref={(el) => void (cards.current[i] = el)}
                aria-labelledby={`card-${s.id}`}
                className="overflow-hidden rounded-[18px] border border-line bg-surface-1"
              >
                <h3 className="m-0">
                  <button
                    type="button"
                    id={`card-${s.id}`}
                    aria-expanded={open}
                    aria-controls={`card-body-${s.id}`}
                    onClick={() => goTo(i, false)}
                    className="flex min-h-16 w-full items-center gap-3 px-4 text-left focus-visible:shadow-[inset_0_0_0_2px_var(--fc-accent-text)] focus-visible:outline-none"
                  >
                    <span
                      className={cx(
                        'grid size-9 shrink-0 place-items-center rounded-[10px]',
                        open
                          ? 'bg-[color-mix(in_srgb,var(--fc-accent)_16%,transparent)] text-molten-text'
                          : 'bg-surface-3 text-text-2',
                      )}
                    >
                      <s.icon size={20} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <b className="font-display text-[17px] font-bold tracking-tight text-text">
                        {s.label}
                      </b>
                      <span className="truncate text-[13.5px] text-text-3">{s.sub}</span>
                    </span>
                  </button>
                </h3>
                {open && (
                  <div id={`card-body-${s.id}`} className="flex flex-col gap-4 px-4 pt-1 pb-4">
                    {s.id === 'look' && <StylePicker ev={ev} look={p.look} set={p.set} />}
                    {s.id === 'look' && <LookSection {...p} />}
                    {s.id === 'text' && <TextSection {...p} />}
                    {s.id === 'text' && advanced && <StyleSection {...p} />}
                    {s.id === 'sound' && <SoundSection {...p} />}
                    {s.id === 'motion' && <MotionSection {...p} stage={motion} timing={advanced} />}
                    {s.id === 'motion' && advanced && (
                      <div className="flex flex-col gap-3 rounded-[14px] border border-dashed border-line-strong bg-surface-2 p-3.5">
                        <span className="font-mono text-[12.5px] font-semibold text-accent-text">
                          Advanced
                        </span>
                        {when}
                        <CssSection {...p} />
                      </div>
                    )}
                    <div className="flex justify-end">
                      {i < STEPS.length - 1 ? (
                        <Button variant="secondary" onClick={() => goTo(i + 1, true)}>
                          Next: {STEPS[i + 1]?.label}
                          <CaretRight size={15} />
                        </Button>
                      ) : (
                        <Button variant="secondary" icon={<Check size={16} />} onClick={onSave}>
                          Save alert
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
        <aside
          aria-label="Preview"
          className="flex flex-col gap-2.5 lg:sticky lg:top-4 max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:-mx-4 max-lg:border-b max-lg:border-line max-lg:bg-bg max-lg:px-4 max-lg:py-2.5"
        >
          <div className="mx-auto w-full max-lg:max-w-[calc(32dvh*16/9)]">{preview}</div>
          <div className="max-lg:hidden">{testBar}</div>
          <div className="max-lg:hidden">{brand}</div>
        </aside>
      </div>
      <div className="flex flex-col gap-2 lg:hidden">{brand}</div>
      <div className="lg:hidden">{testBar}</div>
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t border-line bg-[color-mix(in_srgb,var(--fc-bg)_94%,transparent)] px-4 py-2.5 backdrop-blur lg:hidden">
        {sendButton}
        <Button variant="secondary" onClick={() => (last ? onSave() : goTo(step + 1, true))}>
          {last ? 'Save alert' : `Next: ${STEPS[step + 1]?.label}`}
        </Button>
      </div>
    </div>
  )
}

export function errorText(e: unknown): string {
  return describeError(e).message
}
