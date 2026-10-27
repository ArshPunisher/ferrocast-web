// The alert designer's Motion area (the approved motion board, 20 Oct): recipes and the
// entrance, text, exit, idle and particle lists as live swatches; feel, impact, placement and
// sound under them; Play, Surprise me, Copy motion from another alert and tip-size test amounts
// on top. Every swatch runs the overlay's own engine, so what plays here is what plays in OBS.

import { useDeferredValue, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CaretDown,
  Check,
  Play,
  Shuffle,
  SpeakerHigh,
  SpeakerSlash,
  UploadSimple,
  Waveform,
} from '@phosphor-icons/react'
import {
  COLORS_LABEL,
  EVENT_LABEL,
  IDLES,
  IDLE_INFO,
  IN_INFO,
  MOTION_IN,
  MOTION_OUT,
  MOTION_TEXT,
  OUT_INFO,
  PALETTES,
  PARTICLES,
  PARTICLE_COLORS,
  PARTICLE_INFO,
  RECIPES,
  RECIPE_IDS,
  SIMPLE_IN,
  SIMPLE_OUT,
  SIMPLE_TEXT,
  SPOTS,
  SPOT_LABEL,
  TEXT_INFO,
  applyRecipe,
  copyMotion,
  designSample,
  feelOf,
  FEELS,
  isMotionIn,
  isMotionOut,
  motionOf,
  motionPlan,
  surpriseMotion,
  usualAmount,
  withAnimChange,
  withMotionTiming,
  type AlertIn,
  type AlertLook,
  type AlertOut,
  type EventKey,
  type Motion,
  type MotionDirection,
  type MotionInfo,
  type ParticleColors,
  type TextAnim,
} from '@ferrocast/api'
import { mountMotionSwatch, type SwatchKind } from '@ferrocast/overlays'
import { Button, Segmented, Select, Switch, cx, toast } from '@ferrocast/ui'
import { Range, type SectionProps } from './inspector'
import type { Scene, StageTick } from './DesignStage'
import { tempoOf } from '../../lib/tempo'

/** What the Motion area needs from the designer around it (the stage and the test bar). */
export interface MotionStage {
  play: () => void
  sound: boolean
  onSound: () => void
  scene: Scene
  onScene: (s: Scene) => void
  /** A screenshot to preview over (an object URL), or null for the built-in backdrops. */
  onShot: (url: string | null) => void
  amount: number | null
  onAmount: (v: number) => void
  /** Other events in this design with their own look (Copy motion from…). */
  others: { key: EventKey; look: AlertLook }[]
  tick: StageTick | null
  /** Turns the look's own sound into a URL (Find the tempo). */
  soundUrl: (id: string) => string | null
}

type SecKey = 'recipe' | 'in' | 'text' | 'out' | 'idle' | 'parts'

const MAX_SHOT = 10 * 1024 * 1024

// ------------------------------------------------------------------ pieces

/** A live loop of one option, mounted only while it's on screen. */
function Swatch({ kind, id, look }: { kind: SwatchKind; id: string; look: AlertLook }) {
  const ref = useRef<HTMLSpanElement>(null)
  const m = motionOf(look)
  const key = useDeferredValue(
    JSON.stringify([
      look.colors,
      m.bounce,
      m.speed,
      m.stagger,
      m.colors,
      m.custom_color,
      m.direction,
    ]),
  )
  const latest = useRef(look)
  latest.current = look
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const sw = mountMotionSwatch(box, kind, id, latest.current)
    if (typeof IntersectionObserver !== 'function') {
      sw.start()
      return () => sw.destroy()
    }
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.isIntersecting) sw.start()
        else sw.stop()
      }
    })
    io.observe(box)
    return () => {
      io.disconnect()
      sw.destroy()
    }
  }, [kind, id, key])
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="relative block aspect-[16/10] w-[80px] shrink-0 overflow-hidden rounded-[9px] border border-[rgb(255_255_255/0.06)] bg-[#0b0d12]"
    />
  )
}

function OptionRow({
  on,
  info,
  onPick,
  swatch,
}: {
  on: boolean
  info: MotionInfo
  onPick: () => void
  swatch: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cx(
        'fc-press grid w-full grid-cols-[80px_minmax(0,1fr)] items-center gap-3 rounded-[12px] p-1.5 text-left focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
        on ? 'bg-accent-soft shadow-[inset_0_0_0_1px_var(--fc-accent-line)]' : 'hover:bg-surface-2',
      )}
    >
      {swatch}
      <span className="min-w-0">
        <b className="flex items-center gap-1.5 text-[15px] font-semibold text-text">
          {info.name}
          {on && <Check size={13} weight="bold" className="text-accent-text" aria-hidden="true" />}
        </b>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-text-3">{info.desc}</span>
      </span>
    </button>
  )
}

/** The simple (1.0) choices, as chips under the motion designer's list. */
function SimpleChips<T extends string>({
  label,
  ids,
  value,
  info,
  onPick,
}: {
  label: string
  ids: readonly T[]
  value: string
  info: Record<T, MotionInfo>
  onPick: (v: T) => void
}) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="mt-2 flex flex-col gap-1.5 px-1.5">
      <span id={id} className="text-[13.5px] font-medium text-text-3">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={v === value}
            title={info[v].desc}
            onClick={() => onPick(v)}
            className={cx(
              'fc-press inline-flex h-8 items-center rounded-full border px-3 text-[14px] font-medium focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
              v === value
                ? 'fc-picked border-transparent'
                : 'border-line text-text-2 hover:border-line-strong',
            )}
          >
            {info[v].name}
          </button>
        ))}
      </div>
    </div>
  )
}

function Section({
  id,
  label,
  value,
  open,
  onToggle,
  children,
}: {
  id: SecKey
  label: string
  value: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const body = `motion-sec-${id}`
  return (
    <section data-sec={id} className="border-line not-first:border-t">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={onToggle}
          className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-[10px] px-2.5 py-3 text-left hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        >
          <span className="font-display text-[16px] font-bold tracking-tight text-text">
            {label}
          </span>
          <span
            className={cx(
              'max-w-[130px] truncate font-mono text-[13.5px]',
              open ? 'text-accent-text' : 'text-text-3',
            )}
          >
            {value}
          </span>
          <CaretDown
            size={15}
            aria-hidden="true"
            className={cx(
              'text-text-3 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>
      {open && (
        <div id={body} className="flex flex-col gap-0.5 pb-2.5">
          {children}
        </div>
      )}
    </section>
  )
}

function Fieldset({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3.5 border-0 border-t border-line p-0 pt-4">
      <legend className="float-left mb-0.5 w-full p-0 font-display text-[17px] font-bold tracking-tight text-text">
        {legend}
      </legend>
      {children}
    </fieldset>
  )
}

const DIR_ICON: Record<Exclude<MotionDirection, 'auto'>, typeof ArrowDown> = {
  top: ArrowDown,
  left: ArrowRight,
  right: ArrowLeft,
  bottom: ArrowUp,
}

const swatchOf = (c: ParticleColors, look: AlertLook, m: Motion): string => {
  if (c === 'rainbow')
    return 'conic-gradient(#ff4d6d,#ffa424,#ffe14d,#3dd193,#33d4ff,#9a8cff,#ff4d6d)'
  if (c === 'custom') return m.custom_color
  if (c === 'brand')
    return `linear-gradient(135deg, ${look.colors.accent}, ${look.colors.highlight})`
  const p = PALETTES[c]
  return `linear-gradient(135deg, ${p[0]}, ${p[1]})`
}

function formatPreset(amount: number, u: NonNullable<ReturnType<typeof usualAmount>>): string {
  if (u.unit === 'money' && u.currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: u.currency,
        maximumFractionDigits: 0,
      }).format(amount)
    } catch {
      return `${amount} ${u.currency}`
    }
  }
  const unit = { bits: 'bits', kicks: 'KICKs', jewels: 'Jewels', gifts: 'gifts', money: '' }[u.unit]
  return `${amount.toLocaleString()} ${unit}`
}

// ------------------------------------------------------------------ the area

export function MotionSection({
  look,
  set,
  ev,
  stage,
  timing = false,
}: SectionProps & {
  stage?: MotionStage
  /** Show the length sliders (the guided view has no timeline). */
  timing?: boolean
}) {
  const m = motionOf(look)
  // The tempo finder answers later: it patches the look as it is then, not as it was.
  const latest = useRef(look)
  latest.current = look
  const alive = useRef(true)
  useEffect(
    () => () => {
      alive.current = false
    },
    [],
  )
  const [open, setOpen] = useState<SecKey | null>('in')
  const [shotErr, setShotErr] = useState<string | null>(null)
  const [tempo, setTempo] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  })

  const apply = (next: AlertLook, merge = false) =>
    set(
      { anim: next.anim, motion: next.motion as Motion, duration_ms: next.duration_ms },
      { merge },
    )
  /** Changes motion settings; the ones a recipe sets make the motion "Custom". */
  const setM = (patch: Partial<Motion>, opts: { merge?: boolean; keepRecipe?: boolean } = {}) =>
    apply(
      withMotionTiming({
        ...look,
        motion: { ...m, ...patch, recipe: opts.keepRecipe ? m.recipe : null },
      }),
      opts.merge,
    )
  const setAnim = (patch: Partial<AlertLook['anim']>) => {
    const anim = { ...look.anim, ...patch }
    // Moving from a 1.0 entrance to one of these: the words come in with the hit.
    if (patch.in && isMotionIn(patch.in) && !isMotionIn(look.anim.in)) anim.text_delay_ms = 0
    apply(withAnimChange(look, { ...look, anim, motion: { ...m, recipe: null } }))
  }

  const plan = motionPlan(look)
  const recipeName = m.recipe ? RECIPES[m.recipe].name : 'Custom'
  const toggle = (k: SecKey) => setOpen((o) => (o === k ? null : k))
  const feel = feelOf(m)

  // Test amounts: a tenth, one, ten and a hundred times a usual one for this event.
  const sample = designSample(ev)
  const usual = sample ? usualAmount(sample) : null
  const presets = usual ? [0.1, 1, 10, 100].map((x) => Math.round(usual.amount * x)) : []

  // The beat lamp follows the playhead.
  const beatOn =
    !!stage?.tick &&
    stage.tick.phase !== 'idle' &&
    plan.beat !== null &&
    stage.tick.t % plan.beat < 110

  const pickShot = (f: File | undefined) => {
    setShotErr(null)
    if (!f) return
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) {
      setShotErr(`“${f.name}” isn’t a supported image. Use a PNG, JPG, WebP or GIF screenshot.`)
      return
    }
    if (f.size > MAX_SHOT) {
      setShotErr(
        `That screenshot is ${(f.size / 1048576).toFixed(1)} MB. Use one under 10 MB (a PNG or JPG export of your scene).`,
      )
      return
    }
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => stage?.onShot(url)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setShotErr(
        `“${f.name}” couldn’t be opened. It may be damaged; try exporting the screenshot again.`,
      )
    }
    img.src = url
  }

  const findTempo = async () => {
    const ref = look.sound.ref
    const url = ref ? stage?.soundUrl(ref) : null
    if (!url) return
    setTempo({ busy: true, error: null })
    try {
      const bpm = await tempoOf(url)
      if (!alive.current) return
      const now = latest.current
      apply(withMotionTiming({ ...now, motion: { ...motionOf(now), bpm, beat: true } }))
      setTempo({ busy: false, error: null })
      toast({ tone: 'ok', message: `Your sound runs at about ${bpm} BPM.` })
    } catch (e) {
      if (!alive.current) return
      setTempo({ busy: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const sw = (kind: SwatchKind, id: string) => <Swatch kind={kind} id={id} look={look} />

  return (
    <div className="flex flex-col gap-4">
      {stage && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={stage.play}
            className="fc-press inline-flex min-h-12 flex-1 basis-full items-center justify-center gap-2 rounded-[12px] bg-[linear-gradient(180deg,#b25600_0%,#9a4c00_100%)] px-5 text-[17px] font-semibold text-white shadow-[0_1px_0_rgb(255_255_255/0.22)_inset,0_10px_24px_-12px_rgb(178_86_0/0.9)] hover:bg-[linear-gradient(180deg,#a85100_0%,#8e4600_100%)] focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            <Play size={17} weight="fill" aria-hidden="true" />
            Play alert
          </button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Shuffle size={15} />}
            onClick={() => apply(surpriseMotion(look))}
          >
            Surprise me
          </Button>
          <Button
            size="sm"
            variant="secondary"
            aria-pressed={stage.sound}
            icon={stage.sound ? <SpeakerHigh size={15} /> : <SpeakerSlash size={15} />}
            onClick={stage.onSound}
          >
            {stage.sound ? 'Sound on' : 'Sound off'}
          </Button>
          <div className="min-w-[11rem] flex-1">
            <Select
              aria-label="Copy motion from another alert"
              value=""
              disabled={!stage.others.length}
              className="h-9"
              onChange={(e) => {
                const o = stage.others.find((x) => x.key === e.target.value)
                if (!o) return
                apply(copyMotion(o.look, look))
                toast({
                  tone: 'ok',
                  message: `Copied the motion from your ${EVENT_LABEL[o.key].toLowerCase()} alert.`,
                })
              }}
            >
              <option value="">
                {stage.others.length ? 'Copy motion from…' : 'No other alert to copy from'}
              </option>
              {stage.others.map((o) => (
                <option key={o.key} value={o.key}>
                  {EVENT_LABEL[o.key]} alert
                </option>
              ))}
            </Select>
          </div>
          {usual && (
            <div className="flex basis-full flex-col gap-1.5">
              <span className="text-[13.5px] font-medium text-text-3">Test with</span>
              <Segmented
                label="Test amount"
                size="sm"
                value={String(stage.amount ?? usual.amount)}
                options={presets.map((p) => ({ value: String(p), label: formatPreset(p, usual) }))}
                onChange={(v) => stage.onAmount(Number(v))}
                className="max-w-full self-start overflow-x-auto"
              />
            </div>
          )}
        </div>
      )}

      <div className="-mx-1.5 rounded-[14px] border border-line bg-surface-1 px-1.5">
        <Section
          id="recipe"
          label="Recipes"
          value={recipeName}
          open={open === 'recipe'}
          onToggle={() => toggle('recipe')}
        >
          {RECIPE_IDS.map((id) => (
            <OptionRow
              key={id}
              on={m.recipe === id}
              info={RECIPES[id]}
              onPick={() => apply(applyRecipe(look, id))}
              swatch={sw('recipe', id)}
            />
          ))}
        </Section>
        <Section
          id="in"
          label="Entrance"
          value={IN_INFO[look.anim.in].name}
          open={open === 'in'}
          onToggle={() => toggle('in')}
        >
          {MOTION_IN.map((id) => (
            <OptionRow
              key={id}
              on={look.anim.in === id}
              info={IN_INFO[id]}
              onPick={() => setAnim({ in: id })}
              swatch={sw('in', id)}
            />
          ))}
          <SimpleChips<AlertIn>
            label="Simple"
            ids={SIMPLE_IN}
            value={look.anim.in}
            info={IN_INFO}
            onPick={(v) => setAnim({ in: v })}
          />
        </Section>
        <Section
          id="text"
          label="Text"
          value={TEXT_INFO[look.anim.text].name}
          open={open === 'text'}
          onToggle={() => toggle('text')}
        >
          {MOTION_TEXT.map((id) => (
            <OptionRow
              key={id}
              on={look.anim.text === id}
              info={TEXT_INFO[id]}
              onPick={() => setAnim({ text: id })}
              swatch={sw('text', id)}
            />
          ))}
          <SimpleChips<TextAnim>
            label="Simple"
            ids={SIMPLE_TEXT}
            value={look.anim.text}
            info={TEXT_INFO}
            onPick={(v) => setAnim({ text: v })}
          />
        </Section>
        <Section
          id="out"
          label="Exit"
          value={OUT_INFO[look.anim.out].name}
          open={open === 'out'}
          onToggle={() => toggle('out')}
        >
          {MOTION_OUT.map((id) => (
            <OptionRow
              key={id}
              on={look.anim.out === id}
              info={OUT_INFO[id]}
              onPick={() => setAnim({ out: id })}
              swatch={sw('out', id)}
            />
          ))}
          <SimpleChips<AlertOut>
            label="Simple"
            ids={SIMPLE_OUT}
            value={look.anim.out}
            info={OUT_INFO}
            onPick={(v) => setAnim({ out: v })}
          />
        </Section>
        <Section
          id="idle"
          label="While on screen"
          value={IDLE_INFO[m.idle].name}
          open={open === 'idle'}
          onToggle={() => toggle('idle')}
        >
          {IDLES.map((id) => (
            <OptionRow
              key={id}
              on={m.idle === id}
              info={IDLE_INFO[id]}
              onPick={() => setM({ idle: id })}
              swatch={sw('idle', id)}
            />
          ))}
        </Section>
        <Section
          id="parts"
          label="Particles"
          value={PARTICLE_INFO[m.particles].name}
          open={open === 'parts'}
          onToggle={() => toggle('parts')}
        >
          <div
            role="group"
            aria-label="Particle colour"
            className="flex flex-wrap items-center gap-2 px-1.5 pt-1 pb-2.5"
          >
            <span className="w-full text-[13.5px] font-medium text-text-3">Colour</span>
            {PARTICLE_COLORS.filter((c) => c !== 'custom').map((c) => (
              <button
                key={c}
                type="button"
                aria-label={COLORS_LABEL[c]}
                title={COLORS_LABEL[c]}
                aria-pressed={m.colors === c}
                onClick={() => setM({ colors: c })}
                className={cx(
                  'size-[30px] rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)] focus-visible:outline-2 focus-visible:outline-offset-[6px] focus-visible:outline-accent-text',
                  m.colors === c &&
                    'shadow-[0_0_0_2px_var(--fc-surface-1),0_0_0_4px_var(--fc-arc)]',
                )}
                style={{ background: swatchOf(c, look, m) }}
              />
            ))}
            <label
              title={COLORS_LABEL.custom}
              className={cx(
                'relative size-[30px] cursor-pointer rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)] has-[:focus-visible]:shadow-[var(--fc-focus)]',
                m.colors === 'custom' &&
                  'shadow-[0_0_0_2px_var(--fc-surface-1),0_0_0_4px_var(--fc-arc)]',
              )}
              style={{ background: m.custom_color }}
            >
              <input
                type="color"
                aria-label={
                  m.colors === 'custom'
                    ? 'Your own particle colour (in use)'
                    : 'Pick your own particle colour'
                }
                value={/^#[0-9a-f]{6}$/i.test(m.custom_color) ? m.custom_color : '#ff5aa5'}
                onChange={(e) =>
                  setM({ colors: 'custom', custom_color: e.target.value }, { merge: true })
                }
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </div>
          {PARTICLES.map((id) => (
            <OptionRow
              key={id}
              on={m.particles === id}
              info={PARTICLE_INFO[id]}
              onPick={() => setM({ particles: id })}
              swatch={sw('parts', id)}
            />
          ))}
        </Section>
      </div>

      <Fieldset legend="Feel">
        <Segmented
          label="Feel preset"
          size="sm"
          value={feel ?? ''}
          options={(['calm', 'lively', 'punchy'] as const).map((f) => ({
            value: f,
            label: f[0]?.toUpperCase() + f.slice(1),
          }))}
          onChange={(f) => setM({ ...FEELS[f as keyof typeof FEELS] }, { keepRecipe: true })}
          className="self-start"
        />
        <Range
          label="Bounce"
          value={m.bounce}
          min={0}
          max={100}
          format={(v) => (v < 20 ? 'Firm' : v < 55 ? 'Some' : v < 80 ? 'Lots' : 'Wild')}
          onChange={(v, merge) => setM({ bounce: v }, { merge, keepRecipe: true })}
        />
        <Range
          label="Speed"
          value={m.speed}
          min={60}
          max={160}
          step={5}
          format={(v) => `${(v / 100).toFixed(2).replace(/\.?0+$/, '')}×`}
          onChange={(v, merge) => setM({ speed: v }, { merge, keepRecipe: true })}
        />
        <Range
          label="Letters arrive"
          value={m.stagger}
          min={0}
          max={90}
          step={2}
          format={(v) => (v === 0 ? 'All together' : `${v} ms apart`)}
          onChange={(v, merge) => setM({ stagger: v }, { merge, keepRecipe: true })}
        />
      </Fieldset>

      <Fieldset legend="Impact">
        <Switch
          checked={m.shake}
          onChange={(shake) => setM({ shake })}
          label="Screen shake"
          description="Rattles the scene on landing"
        />
        <Switch
          checked={m.flash}
          onChange={(flash) => setM({ flash })}
          label="Flash"
          description="A bright frame on the hit"
        />
        <Switch
          checked={m.vignette}
          onChange={(vignette) => setM({ vignette })}
          label="Vignette pulse"
          description="Edges darken for a beat"
        />
        <Switch
          checked={m.zoom_punch}
          onChange={(zoom_punch) => setM({ zoom_punch })}
          label="Zoom punch"
          description="The whole scene bumps forward"
        />
        <Switch
          checked={m.by_amount}
          onChange={(by_amount) => setM({ by_amount }, { keepRecipe: true })}
          label="Bigger tips hit harder"
          description="More shake, particles and volume as the amount grows"
        />
        <p className="text-[13.5px] leading-snug text-text-3">
          Impacts come with the entrances and exits above; the simple ones have none.
        </p>
      </Fieldset>

      <Fieldset legend="Placement">
        <div className="flex flex-wrap items-start gap-5">
          <div role="group" aria-label="Where it sits" className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-text-2" aria-hidden="true">
              Where it sits
            </span>
            <div className="grid w-max grid-cols-[repeat(3,34px)] grid-rows-[repeat(3,24px)] gap-1 rounded-[10px] border border-line bg-inset p-1.5">
              {SPOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={SPOT_LABEL[s]}
                  title={SPOT_LABEL[s]}
                  aria-pressed={m.position === s}
                  onClick={() => setM({ position: s }, { keepRecipe: true })}
                  className={cx(
                    'rounded-[5px] border focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                    m.position === s
                      ? 'border-arc bg-arc'
                      : 'border-line-strong bg-surface-2 hover:bg-surface-3',
                  )}
                />
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[14px] font-medium text-text-2" id="motion-dir">
              Comes in from
            </span>
            <div role="group" aria-labelledby="motion-dir" className="flex flex-wrap gap-1">
              {(['auto', 'top', 'left', 'right', 'bottom'] as const).map((d) => {
                const I = d === 'auto' ? null : DIR_ICON[d]
                const label = {
                  auto: 'Auto',
                  top: 'Top',
                  left: 'Left',
                  right: 'Right',
                  bottom: 'Bottom',
                }[d]
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={I ? label : undefined}
                    title={label}
                    aria-pressed={m.direction === d}
                    onClick={() => setM({ direction: d }, { keepRecipe: true })}
                    className={cx(
                      'fc-press inline-flex h-[34px] min-w-[38px] items-center justify-center rounded-[9px] border px-2.5 text-[14.5px] font-semibold focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                      m.direction === d
                        ? 'fc-picked border-transparent'
                        : 'border-line-strong bg-surface-2 text-text-2',
                    )}
                  >
                    {I ? <I size={15} aria-hidden="true" /> : label}
                  </button>
                )
              })}
            </div>
            <p className="text-[13.5px] leading-snug text-text-3">
              Used by Elastic drop, Dash in, Flip and shine, Slide and blur.
            </p>
          </div>
        </div>
        {stage && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-text-2">Preview over</span>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Preview backdrop"
                size="sm"
                value={stage.scene}
                options={[
                  { value: 'game', label: 'Game' },
                  { value: 'light', label: 'Bright' },
                  { value: 'checker', label: 'Clear' },
                ]}
                onChange={(s) => {
                  stage.onShot(null)
                  stage.onScene(s as Scene)
                }}
              />
              <label className="fc-press inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-line-strong bg-surface-2 px-3 text-[14px] font-medium text-text has-[:focus-visible]:shadow-[var(--fc-focus)]">
                <UploadSimple size={14} aria-hidden="true" />
                Your screenshot
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => {
                    pickShot(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            {shotErr && (
              <p role="alert" className="text-[14px] text-danger">
                {shotErr}
              </p>
            )}
            <p className="text-[13.5px] leading-snug text-text-3">
              Only for this preview; the screenshot never leaves this computer.
            </p>
          </div>
        )}
      </Fieldset>

      <Fieldset legend="Sound">
        <Switch
          checked={m.impact_sounds}
          onChange={(impact_sounds) => setM({ impact_sounds }, { keepRecipe: true })}
          label="Impact sounds"
          description="Simple hits on each landing, at this alert’s volume. They play with the alert’s own sound, never instead of it."
        />
        <Switch
          checked={m.beat}
          onChange={(beat) => setM({ beat }, { keepRecipe: true })}
          label="Land on the beat"
          description="Waits so the hit falls on a beat of your alert sound. Works with the entrances above, not the simple ones."
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Range
                label="Music tempo"
                value={m.bpm}
                min={70}
                max={170}
                format={(v) => `${v} BPM`}
                onChange={(v, merge) => setM({ bpm: v }, { merge, keepRecipe: true })}
              />
            </div>
            <span
              aria-hidden="true"
              className={cx(
                'mt-5 size-3 shrink-0 rounded-full',
                beatOn ? 'bg-accent' : 'bg-line-strong',
              )}
            />
          </div>
          {look.sound.ref && stage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Waveform size={15} />}
                busy={tempo.busy}
                onClick={() => void findTempo()}
              >
                Find your sound’s tempo
              </Button>
            </div>
          ) : (
            <p className="text-[13.5px] leading-snug text-text-3">
              Set this to your alert sound’s tempo. With your own sound picked, Ferrocast can find
              it for you.
            </p>
          )}
          {tempo.error && (
            <p role="alert" className="text-[14px] text-danger">
              {tempo.error}
            </p>
          )}
        </div>
      </Fieldset>

      {timing && (
        <Fieldset legend="Timing">
          {!isMotionIn(look.anim.in) && (
            <Range
              label="Entrance length"
              value={look.anim.in_ms}
              min={150}
              max={1500}
              step={50}
              unit="ms"
              onChange={(v, merge) => set({ anim: { ...look.anim, in_ms: v } }, { merge })}
            />
          )}
          {!isMotionOut(look.anim.out) && (
            <Range
              label="Exit length"
              value={look.anim.out_ms}
              min={150}
              max={1500}
              step={50}
              unit="ms"
              onChange={(v, merge) => set({ anim: { ...look.anim, out_ms: v } }, { merge })}
            />
          )}
          <Range
            label="Text delay"
            value={look.anim.text_delay_ms}
            min={0}
            max={3000}
            step={100}
            format={(v) => `${(v / 1000).toFixed(1)} s`}
            onChange={(v, merge) => set({ anim: { ...look.anim, text_delay_ms: v } }, { merge })}
          />
          <Range
            label="Alert length"
            value={look.duration_ms}
            min={2000}
            max={20_000}
            step={500}
            format={(v) => `${(v / 1000).toFixed(1)} s`}
            onChange={(v, merge) =>
              set(
                { duration_ms: Math.max(v, look.anim.in_ms + look.anim.out_ms + 1000) },
                { merge },
              )
            }
          />
          <p className="text-[13.5px] leading-snug text-text-3">
            The motion designer’s entrances and exits take their length from Feel.
          </p>
        </Fieldset>
      )}

      <Fieldset legend="How long it stays">
        <Segmented
          label="How long it stays"
          size="sm"
          value={look.duration_ms <= 4500 ? '4' : look.duration_ms <= 7500 ? '6' : '9'}
          options={[
            { value: '4', label: 'Short' },
            { value: '6', label: 'Normal' },
            { value: '9', label: 'Long' },
          ]}
          onChange={(v) =>
            set({
              duration_ms: Math.max(Number(v) * 1000, look.anim.in_ms + look.anim.out_ms + 1000),
            })
          }
          className="self-start"
        />
      </Fieldset>
    </div>
  )
}
