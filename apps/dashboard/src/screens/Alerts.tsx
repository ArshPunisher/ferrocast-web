import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowCounterClockwise,
  Bell,
  BracketsCurly,
  CaretDown,
  ChatCircleText,
  Diamond,
  Gift,
  HandCoins,
  Heart,
  Lightning,
  PaintBrushBroad,
  Play,
  Plus,
  RocketLaunch,
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
  Star,
  Trash,
  UploadSimple,
  type Icon,
} from '@phosphor-icons/react'
import {
  BUILTIN_SOUND_PREFIX,
  KNOWN_VARS,
  PLATFORM_LABEL,
  SOUND_GROUPS,
  SOUND_LABEL,
  checkTemplate,
  eventVars,
  newVariation,
  pickLook,
  platformsFor,
  renderAlert,
  renderOnto,
  ruleBuiltinSound,
  sample,
  validateRule,
  type AlertRule,
  type Condition,
  type Design,
  type FerroEvent,
  type Media,
  type Platform,
  type Variation,
} from '@ferrocast/api'
import {
  Button,
  EmptyState,
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
import { LoadError, PageHeader } from '../components/Panel'
import { TestAlertMenu } from '../components/alerts-live'
import { AlertStage, alertHasSound } from '../components/AlertStage'
import { Menu } from '../components/Menu'
import { useAction, useClient, useResource } from '../lib/hooks'
import { href } from '../lib/router'
import { useUnsavedWarning } from '../lib/unsaved'
import { useLive } from '../lib/store'
import { previewMediaUrl } from '../lib/media-url'
import { builtinSoundUrl, playBuiltin, unlockAudio } from '@ferrocast/overlays'

type CondType = Exclude<Condition['type'], 'all' | 'any'>

const COND_LABEL: Record<CondType, string> = {
  amount_at_least: 'Amount is at least',
  amount_below: 'Amount is below',
  tier_at_least: 'Sub tier is at least',
  months_at_least: 'Months subscribed at least',
  platform_is: 'Comes from',
  is_gifted: 'Is a gift',
  has_message: 'Has a message',
  message_contains: 'Message contains',
}

/** One emblem per event kind, the same glyphs the alert designs use (event-icons.ts). */
const KIND_ICON: Record<string, Icon> = {
  follow: Heart,
  subscription: Star,
  gift_batch: Gift,
  platform_gift: Diamond,
  paid_message: ChatCircleText,
  tip: HandCoins,
  raid: RocketLaunch,
  reward_redemption: Sparkle,
}

function defaultCondition(t: CondType): Condition {
  switch (t) {
    case 'amount_at_least':
    case 'amount_below':
      return { type: t, value: 500, currency: null }
    case 'tier_at_least':
      return { type: t, tier: 2 }
    case 'months_at_least':
      return { type: t, months: 12 }
    case 'platform_is':
      return { type: t, platform: 'twitch' }
    case 'message_contains':
      return { type: t, text: '' }
    default:
      return { type: t }
  }
}

function sampleFor(rule: AlertRule, platform: Platform | null): FerroEvent | null {
  const kind = rule.kinds[0] ?? 'follow'
  const ps = kind === 'tip' ? (['twitch'] as Platform[]) : platformsFor(kind)
  const p = platform && ps.includes(platform) ? platform : (ps[0] ?? 'twitch')
  return sample(kind, p, Date.now())
}

/** What a rule's row says on the right: off, how many looks, or on. */
function ruleStatus(r: AlertRule): string {
  if (!r.enabled) return 'Off'
  return r.variations.length > 1 ? `${r.variations.length} looks` : 'On'
}

/**
 * "Insert" menu: puts `{var}` at the caret of the last focused template field. Lists the
 * variables this kind of event fills in (with the sample's value), else the common ones.
 */
function InsertVarMenu({
  event,
  onPick,
}: {
  event: FerroEvent | null
  onPick: (v: string) => void
}) {
  const vars = event ? eventVars(event) : {}
  const names = KNOWN_VARS.filter((v) => v in vars)
  const list = names.length > 0 ? names : KNOWN_VARS.slice(0, 10)
  const short = (x: string) => (x.length > 18 ? `${x.slice(0, 17)}…` : x)
  return (
    <Menu
      label="Insert a variable"
      align="end"
      trigger={(p) => (
        <Button
          {...p}
          size="sm"
          variant="ghost"
          icon={<BracketsCurly size={15} />}
          title="Insert a variable where the cursor is"
          onMouseDown={(e) => e.preventDefault()}
        >
          Insert
          <CaretDown size={12} className="-mr-0.5 opacity-70" />
        </Button>
      )}
      items={list.map((v) => ({
        key: v,
        label: <span className="font-mono text-[13px]">{`{${v}}`}</span>,
        ...(vars[v] ? { hint: short(vars[v]) } : {}),
        onSelect: () => onPick(v),
      }))}
    />
  )
}

const MB = 1024 * 1024
/**
 * The engine's limits (API.md, Media), checked before uploading so a big file gets the
 * same clear 413/415 message even if the connection would be cut mid-upload.
 */
function checkUpload(f: File): { message: string; hint: string } | null {
  const type = f.type || ''
  if (type === 'image/svg+xml' || /\.svg$/i.test(f.name))
    return {
      message: 'SVG images aren’t allowed, because they can carry scripts.',
      hint: 'Export it as PNG or WebP instead.',
    }
  const kinds: [RegExp, number, string][] = [
    [/^image\/(png|jpeg|gif|webp)$/, 10 * MB, 'Images can be up to 10 MB.'],
    [/^audio\/(mpeg|ogg|wav|x-wav|wave)$/, 5 * MB, 'Sounds can be up to 5 MB.'],
    [/^video\/(webm|mp4)$/, 50 * MB, 'Videos can be up to 50 MB.'],
  ]
  const k = kinds.find(([re]) => re.test(type))
  if (!k) return null // unknown type: let the engine decide and explain (415)
  if (f.size > k[1]) return { message: k[2], hint: 'Trim or compress it, then try again.' }
  return null
}

function MediaPicker({
  kind,
  value,
  media,
  onChange,
  onUploaded,
  volume,
}: {
  kind: 'sound' | 'image'
  value: string | null
  /** For the built-in sound preview. */
  volume?: number
  media: Media[]
  onChange: (id: string | null) => void
  onUploaded: (m: Media) => void
}) {
  const client = useClient()
  const file = useRef<HTMLInputElement>(null)
  const { run, busy } = useAction()
  const list = media.filter((m) =>
    kind === 'image' ? m.kind === 'image' || m.kind === 'video' : m.kind === 'sound',
  )
  const accept =
    kind === 'sound'
      ? 'audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav'
      : 'image/png,image/jpeg,image/gif,image/webp,video/webm,video/mp4'
  const limits =
    kind === 'sound'
      ? 'MP3, OGG or WAV, up to 5 MB'
      : 'PNG, JPEG, GIF or WebP up to 10 MB, WebM or MP4 up to 50 MB'
  return (
    <Field label={kind === 'sound' ? 'Sound' : 'Image or video'}>
      {(p) => (
        <div className="flex gap-2">
          <Select
            {...p}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            className="min-w-0 flex-1"
          >
            <option value="">{kind === 'sound' ? 'No sound' : 'No image'}</option>
            {kind === 'sound' ? (
              <>
                {SOUND_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.sounds.map((id) => (
                      <option key={id} value={`${BUILTIN_SOUND_PREFIX}${id}`}>
                        {SOUND_LABEL[id]}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {(list.length > 0 || (value && !ruleBuiltinSound(value))) && (
                  <optgroup label="Your sounds">
                    {list.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </>
            ) : (
              list.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))
            )}
          </Select>
          {kind === 'sound' && ruleBuiltinSound(value) && (
            <IconButton
              variant="secondary"
              label={`Play ${SOUND_LABEL[ruleBuiltinSound(value) ?? 'none']}`}
              onClick={() => {
                unlockAudio()
                const b = ruleBuiltinSound(value)
                if (b) playBuiltin(b, volume ?? 70, true)
              }}
            >
              <Play size={16} />
            </IconButton>
          )}
          <input
            ref={file}
            type="file"
            accept={accept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const problem = checkUpload(f)
              if (problem) {
                toast({ tone: 'error', message: problem.message, hint: problem.hint })
                return
              }
              void run('upload', () => client.upload(f, f.name), {
                success: (m) => `${m.name} uploaded.`,
              }).then((m) => {
                if (m) {
                  onUploaded(m)
                  onChange(m.id)
                }
              })
            }}
          />
          <Button
            type="button"
            icon={<UploadSimple size={16} />}
            busy={busy === 'upload'}
            title={limits}
            aria-label={`Upload ${kind === 'sound' ? 'a sound' : 'an image or video'} (${limits})`}
            onClick={() => file.current?.click()}
          >
            Upload
          </Button>
        </div>
      )}
    </Field>
  )
}

function ConditionEditor({
  value,
  onChange,
}: {
  value: Condition | null
  onChange: (c: Condition) => void
}) {
  const c =
    value && value.type !== 'all' && value.type !== 'any'
      ? value
      : defaultCondition('amount_at_least')
  return (
    <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
      <Field label="Use this look when">
        {(p) => (
          <Select
            {...p}
            value={c.type}
            onChange={(e) => onChange(defaultCondition(e.target.value as CondType))}
          >
            {(Object.keys(COND_LABEL) as CondType[]).map((t) => (
              <option key={t} value={t}>
                {COND_LABEL[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {(c.type === 'amount_at_least' || c.type === 'amount_below') && (
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <Field label="Amount">
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="decimal"
                min={0}
                title="Money, bits, viewers or gifted subs"
                value={c.value}
                onChange={(e) => onChange({ ...c, value: Number(e.target.value) || 0 })}
              />
            )}
          </Field>
          <Field label="Currency">
            {(p) => (
              <Select
                {...p}
                value={c.currency ?? ''}
                onChange={(e) => onChange({ ...c, currency: e.target.value || null })}
              >
                <option value="">Any</option>
                {['INR', 'USD', 'EUR', 'GBP', 'BRL', 'JPY'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      )}
      {c.type === 'tier_at_least' && (
        <Field label="Tier">
          {(p) => (
            <Select
              {...p}
              value={c.tier}
              onChange={(e) => onChange({ ...c, tier: Number(e.target.value) })}
            >
              <option value={1}>Tier 1 or Prime</option>
              <option value={2}>Tier 2</option>
              <option value={3}>Tier 3</option>
            </Select>
          )}
        </Field>
      )}
      {c.type === 'months_at_least' && (
        <Field label="Months">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={c.months}
              onChange={(e) => onChange({ ...c, months: Math.max(1, Number(e.target.value) || 1) })}
            />
          )}
        </Field>
      )}
      {c.type === 'platform_is' && (
        <Field label="Platform">
          {(p) => (
            <Select
              {...p}
              value={c.platform}
              onChange={(e) => onChange({ ...c, platform: e.target.value as Platform })}
            >
              {(['twitch', 'youtube', 'kick', 'tips'] as const).map((x) => (
                <option key={x} value={x}>
                  {PLATFORM_LABEL[x]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {c.type === 'message_contains' && (
        <Field label="Text">
          {(p) => (
            <Input
              {...p}
              value={c.text}
              maxLength={100}
              onChange={(e) => onChange({ ...c, text: e.target.value })}
            />
          )}
        </Field>
      )}
    </div>
  )
}

/** A short settings group with its own heading, divided from the one above by a hairline. */
function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-line pt-5">
      <div className="-my-1 flex min-h-8 items-center justify-between gap-3">
        <h3 id={id} className="font-display text-base font-bold tracking-tight text-text">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function VariationEditor({
  v,
  isDefault,
  media,
  event,
  onChange,
  onUploaded,
  onDelete,
}: {
  v: Variation
  isDefault: boolean
  media: Media[]
  event: FerroEvent | null
  onChange: (v: Variation) => void
  onUploaded: (m: Media) => void
  onDelete: () => void
}) {
  const focused = useRef<{
    el: HTMLInputElement | HTMLTextAreaElement
    key: 'title' | 'body'
  } | null>(null)
  const titleCheck = checkTemplate(v.title)
  const bodyCheck = checkTemplate(v.body)
  const insert = (name: string) => {
    const f = focused.current ?? null
    const key = f?.key ?? 'title'
    const el = f?.el
    const src = v[key]
    const token = `{${name}}`
    const at = el ? (el.selectionStart ?? src.length) : src.length
    const end = el ? (el.selectionEnd ?? at) : at
    onChange({ ...v, [key]: src.slice(0, at) + token + src.slice(end) })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + token.length, at + token.length)
    })
  }
  const seconds = Math.round(v.duration_ms / 100) / 10
  return (
    <div className="flex flex-col gap-5">
      {!isDefault && (
        <div className="flex flex-col gap-3 rounded-control border border-line bg-surface-2 p-3">
          <div className="flex items-end gap-2">
            <Field label="Look name" className="flex-1">
              {(p) => (
                <Input
                  {...p}
                  value={v.name}
                  maxLength={40}
                  onChange={(e) => onChange({ ...v, name: e.target.value })}
                />
              )}
            </Field>
            <IconButton label="Delete this look" variant="danger-ghost" onClick={onDelete}>
              <Trash size={17} />
            </IconButton>
          </div>
          <ConditionEditor
            value={v.condition}
            onChange={(condition) => onChange({ ...v, condition })}
          />
        </div>
      )}

      <Section title="Message" action={<InsertVarMenu event={event} onPick={insert} />}>
        <Field label="Headline" error={titleCheck.ok ? null : titleCheck.error}>
          {(p) => (
            <Input
              {...p}
              value={v.title}
              maxLength={300}
              onFocus={(e) => (focused.current = { el: e.currentTarget, key: 'title' })}
              onChange={(e) => onChange({ ...v, title: e.target.value })}
            />
          )}
        </Field>
        <Field label="Second line" error={bodyCheck.ok ? null : bodyCheck.error}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={v.body}
              maxLength={500}
              placeholder="Empty for a one-line alert"
              onFocus={(e) => (focused.current = { el: e.currentTarget, key: 'body' })}
              onChange={(e) => onChange({ ...v, body: e.target.value })}
            />
          )}
        </Field>
      </Section>

      <Section title="Look">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
          <div className="flex flex-col gap-1.5">
            <span className="fc-label">Layout</span>
            <Segmented
              label="Layout"
              value={
                (['stack', 'side', 'banner'].includes(v.layout) ? v.layout : 'stack') as
                  'stack' | 'side' | 'banner'
              }
              onChange={(layout) => onChange({ ...v, layout })}
              options={[
                { value: 'stack', label: 'Stacked' },
                { value: 'side', label: 'Side' },
                { value: 'banner', label: 'Banner' },
              ]}
            />
          </div>
          <Field label={`On screen for ${seconds} s`} className="min-w-44 flex-1">
            {(p) => (
              <input
                {...p}
                type="range"
                min={1000}
                max={30000}
                step={500}
                value={v.duration_ms}
                aria-valuetext={`${seconds} seconds`}
                onChange={(e) => onChange({ ...v, duration_ms: Number(e.target.value) })}
                className="h-10 w-full"
              />
            )}
          </Field>
        </div>
      </Section>

      <Section title="Sound and media">
        <MediaPicker
          kind="sound"
          value={v.sound}
          volume={v.volume}
          media={media}
          onChange={(sound) => onChange({ ...v, sound })}
          onUploaded={onUploaded}
        />
        <MediaPicker
          kind="image"
          value={v.image}
          media={media}
          onChange={(image) => onChange({ ...v, image })}
          onUploaded={onUploaded}
        />
        <Field label={`Volume ${v.volume}%`}>
          {(p) => (
            <input
              {...p}
              type="range"
              min={0}
              max={100}
              value={v.volume}
              aria-valuetext={`${v.volume} percent`}
              onChange={(e) => onChange({ ...v, volume: Number(e.target.value) })}
              className="h-8 w-full"
            />
          )}
        </Field>
      </Section>

      <details className="group border-t border-line pt-4">
        <summary className="-mx-1 flex cursor-pointer list-none items-center gap-2 rounded-control px-1 py-1 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <span className="font-display text-base font-bold tracking-tight text-text">More</span>
          <CaretDown
            size={14}
            weight="bold"
            aria-hidden="true"
            className="text-text-3 transition-transform duration-200 group-open:rotate-180"
          />
          <span className="ml-auto truncate text-[13px] font-medium text-text-3">
            {isDefault ? 'Read aloud, custom CSS' : 'Read aloud, CSS, priority'}
          </span>
        </summary>
        <div className="flex flex-col gap-4 pt-4">
          <Switch
            checked={v.tts}
            onChange={(tts) => onChange({ ...v, tts })}
            label="Read the message aloud"
            description="Follows your TTS rules. Turn TTS on in Settings first."
          />
          <Field label="Custom CSS" hint="Applies only inside this alert.">
            {(p) => (
              <Textarea
                {...p}
                rows={4}
                spellCheck={false}
                className="font-mono text-[12.5px]"
                placeholder=".fc-alert-title { letter-spacing: 0.02em }"
                value={v.css}
                maxLength={20000}
                onChange={(e) => onChange({ ...v, css: e.target.value })}
              />
            )}
          </Field>
          {!isDefault && (
            <Field label="Priority" hint="When several looks match, the highest wins.">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={-100}
                  max={100}
                  value={v.priority}
                  onChange={(e) =>
                    onChange({ ...v, priority: Math.round(Number(e.target.value) || 0) })
                  }
                />
              )}
            </Field>
          )}
        </div>
      </details>
    </div>
  )
}

/**
 * The editor for one rule: the settings panel and, beside it on wide screens, the live
 * preview. Renders two grid cells (the parent grid places them).
 */
function RuleEditor({
  rule,
  media,
  onSaved,
  onUploaded,
  onToggle,
}: {
  rule: AlertRule
  media: Media[]
  onSaved: (r: AlertRule) => void
  onUploaded: (m: Media) => void
  onToggle: (enabled: boolean) => void
}) {
  const client = useClient()
  const { run, busy } = useAction()
  const [draft, setDraft] = useState(rule)
  const [vi, setVi] = useState(0)
  const [previewPlatform, setPreviewPlatform] = useState<Platform | null>(null)
  const [sound, setSound] = useState(false)
  const [replay, setReplay] = useState(0)
  const reduce = useReducedMotion()
  // A different rule replaces the draft. The same rule changing underneath (saved, or
  // switched on/off) must not throw away edits in progress.
  const lastRule = useRef(rule)
  useEffect(() => {
    const prev = lastRule.current
    lastRule.current = rule
    if (prev.id !== rule.id) {
      setDraft(rule)
      setVi(0)
      setPreviewPlatform(null)
      return
    }
    setDraft((d) =>
      JSON.stringify(d) === JSON.stringify(prev) ? rule : { ...d, enabled: rule.enabled },
    )
  }, [rule])
  const dirty = JSON.stringify(draft) !== JSON.stringify(rule)
  useUnsavedWarning(dirty)
  const error = validateRule(draft)
  const v = draft.variations[vi] ?? draft.variations[0]
  const kind = draft.kinds[0] ?? 'follow'
  const kindPlatforms = kind === 'tip' ? [] : platformsFor(kind)
  // The platform picked in "Preview as", if this kind has it; the preview, the control and
  // "Test on stream" all use this one value.
  const pickedPlatform =
    previewPlatform && kindPlatforms.includes(previewPlatform) ? previewPlatform : null
  const event = useMemo(() => sampleFor(draft, pickedPlatform), [draft, pickedPlatform])
  // The alert design in use dresses every alert on stream (its look, words, picture and
  // sound), so the preview plays it too; without one, the rule's own look.
  const activeDesign = useResource(async (c) => {
    const { design_id } = await c.activeAlertDesign()
    return design_id ? c.design(design_id) : null
  })
  const design: Design | null = activeDesign.data?.kind === 'alert' ? activeDesign.data : null
  const preview = useMemo(() => {
    if (!v || !event) return null
    let a = renderAlert('preview', draft, v, event)
    const look = design ? pickLook(design, event) : null
    if (design && look) a = renderOnto(a, design, look.key, look.variation, event)
    const url = (id: string | null) => {
      const b = ruleBuiltinSound(id)
      if (b) return builtinSoundUrl(b)
      return id && media.some((x) => x.id === id) ? previewMediaUrl(client, media, id) : null
    }
    return { ...a, sound: url(a.sound), image: url(a.image) }
  }, [draft, v, event, media, client, design])
  if (!v) return null
  const setV = (nv: Variation) =>
    setDraft({ ...draft, variations: draft.variations.map((x, i) => (i === vi ? nv : x)) })
  const addVariation = () => {
    const nv: Variation = {
      ...newVariation(
        `${draft.id}-${Date.now().toString(36)}`,
        draft.variations[0]?.title ?? '{name}',
      ),
      name: 'New look',
      priority: 5,
      condition: defaultCondition(kind === 'subscription' ? 'months_at_least' : 'amount_at_least'),
      sound: draft.variations[0]?.sound ?? null,
    }
    setDraft({ ...draft, variations: [...draft.variations, nv] })
    setVi(draft.variations.length)
  }
  const save = () =>
    void run('save', () => client.saveAlertRule(draft), {
      success: `“${draft.name}” saved. New alerts use it right away.`,
    }).then((r) => r && onSaved(r))
  const togglePlatform = (p: Platform) => {
    const all = draft.platforms.length === 0 ? [...kindPlatforms] : draft.platforms
    const next = all.includes(p) ? all.filter((x) => x !== p) : [...all, p]
    setDraft({ ...draft, platforms: next.length === kindPlatforms.length ? [] : next })
  }

  return (
    <>
      <div className="order-3 flex min-w-0 flex-col gap-4 xl:order-2">
        <div className="fc-editor @container rounded-panel border border-line bg-surface-1 p-4 shadow-1 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="rule-name" className="sr-only">
                Rule name
              </label>
              <input
                id="rule-name"
                value={draft.name}
                maxLength={40}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="-ml-1.5 w-full rounded-control border border-transparent bg-transparent px-1.5 py-0.5 font-display text-xl font-bold tracking-tight text-text hover:border-line focus:border-accent-text focus:outline-none"
              />
            </div>
            <div className="order-3 flex w-full flex-wrap items-center gap-1.5 @lg:order-none @lg:w-auto">
              {kindPlatforms.length > 1 ? (
                <div role="group" aria-label="Platforms" className="flex flex-wrap gap-1.5">
                  {kindPlatforms.map((p) => {
                    const on = draft.platforms.length === 0 || draft.platforms.includes(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={on}
                        title={
                          on ? `Plays for ${PLATFORM_LABEL[p]}` : `Off for ${PLATFORM_LABEL[p]}`
                        }
                        onClick={() => togglePlatform(p)}
                        className={cx(
                          'fc-press inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-semibold focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                          on
                            ? 'border-accent-line bg-accent-soft text-text'
                            : 'border-line text-text-3 line-through decoration-text-3/60 hover:text-text-2',
                        )}
                      >
                        <PlatformMark platform={p} size={12} />
                        {PLATFORM_LABEL[p]}
                      </button>
                    )
                  })}
                </div>
              ) : (
                (kind === 'tip' ? (['tips'] as Platform[]) : kindPlatforms).map((p) => (
                  <span
                    key={p}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface-3 px-2.5 text-[12.5px] font-semibold text-text-2"
                  >
                    <PlatformMark platform={p} size={12} />
                    {p === 'tips' ? 'Tip page' : PLATFORM_LABEL[p]}
                  </span>
                ))
              )}
            </div>
            <Switch
              checked={rule.enabled}
              onChange={onToggle}
              label={`${rule.name} alert`}
              hideLabel
            />
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            <div role="tablist" aria-label="Looks" className="contents">
              {draft.variations.map((x, i) => (
                <button
                  key={x.id}
                  role="tab"
                  type="button"
                  aria-selected={i === vi}
                  onClick={() => setVi(i)}
                  className={cx(
                    'fc-press h-8 max-w-[18ch] truncate rounded-full border px-3.5 text-[13px] font-semibold focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                    i === vi
                      ? 'border-accent-line bg-accent-soft text-text'
                      : 'border-line text-text-2 hover:border-line-strong hover:text-text',
                  )}
                >
                  {x.condition === null ? 'Default' : x.name || 'Untitled'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={addVariation}
              className="fc-press inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 text-[13px] font-semibold text-text-2 hover:border-text-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              <Plus size={14} aria-hidden="true" />
              Add a look
            </button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={v.id}
              role="tabpanel"
              aria-label={v.condition === null ? 'Default look' : v.name || 'Untitled look'}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.1 } }}
              transition={{ duration: 0.18 }}
            >
              <VariationEditor
                v={v}
                isDefault={v.condition === null}
                media={media}
                event={event}
                onChange={setV}
                onUploaded={onUploaded}
                onDelete={() => {
                  setDraft({ ...draft, variations: draft.variations.filter((_, i) => i !== vi) })
                  setVi(0)
                }}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {dirty && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-3 rounded-panel border border-line-strong bg-surface-1 px-4 py-3 shadow-pop lg:bottom-4"
            >
              <p
                className={cx(
                  'min-w-0 flex-1 text-[13.5px]',
                  error ? 'font-semibold text-danger' : 'font-medium text-text-2',
                )}
                role={error ? 'alert' : undefined}
              >
                {error ?? 'Unsaved changes'}
              </p>
              <Button size="sm" variant="ghost" onClick={() => setDraft(rule)}>
                Discard
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!!error}
                busy={busy === 'save'}
                onClick={save}
              >
                Save
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <aside
        aria-label="Live preview"
        className="order-2 flex min-w-0 flex-col gap-3 xl:sticky xl:top-[calc(env(safe-area-inset-top)+76px)] xl:order-3 xl:self-start"
      >
        <AlertStage
          alert={preview}
          theme="molten"
          controls={false}
          sound={sound}
          replay={replay}
          className="shadow-1"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            icon={<ArrowCounterClockwise size={15} />}
            onClick={() => setReplay((n) => n + 1)}
          >
            Replay
          </Button>
          {alertHasSound(preview) ? (
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={!sound}
              title={sound ? 'Mute the preview' : 'Play the preview with sound'}
              icon={sound ? <SpeakerHigh size={15} /> : <SpeakerSlash size={15} />}
              onClick={() => {
                unlockAudio()
                setSound((s) => !s)
              }}
            >
              Mute
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-text-3">
              <SpeakerSlash size={15} aria-hidden="true" /> No sound
            </span>
          )}
          <Button
            size="sm"
            variant="primary"
            className="ml-auto"
            icon={<Lightning size={15} weight="fill" />}
            busy={busy === 'test'}
            onClick={() =>
              void run('test', () => client.test(kind, pickedPlatform ?? undefined), {
                success: dirty
                  ? 'Test sent. It uses the saved version; save to test your changes.'
                  : 'Test sent to your overlays.',
              })
            }
          >
            Test on stream
          </Button>
        </div>
        {design && (
          <p className="text-[13.5px] leading-snug text-text-2">
            Alerts play with your alert design,{' '}
            <a
              href={href({ name: 'designer', id: design.id })}
              className="font-semibold text-accent-text hover:underline"
            >
              {design.name}
            </a>
            . Its look, words and sound replace the ones set here.
          </p>
        )}
        {kindPlatforms.length > 1 && (
          <div className="flex items-center gap-2.5">
            <span className="fc-label">Preview as</span>
            <Segmented
              label="Preview as"
              size="sm"
              value={pickedPlatform ?? (kindPlatforms[0] as Platform)}
              onChange={setPreviewPlatform}
              options={kindPlatforms.map((p) => ({
                value: p,
                label: <PlatformMark platform={p} size={12} />,
                title: `Preview a ${PLATFORM_LABEL[p]} event`,
              }))}
            />
          </div>
        )}
      </aside>
    </>
  )
}

/** Opens the designer on the alert design in use, or the gallery when there is none. */
function AlertDesignButton() {
  const active = useResource((c) => c.activeAlertDesign())
  const id = active.data?.design_id
  return (
    <a
      href={id ? href({ name: 'designer', id }) : href({ name: 'designs' })}
      className="fc-press inline-flex h-10 items-center gap-2 rounded-control border border-line-strong bg-surface-3 px-4 text-sm font-semibold whitespace-nowrap text-text hover:border-text-3 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
    >
      <PaintBrushBroad size={16} aria-hidden="true" />
      {id ? 'Alert designer' : 'Alert designs'}
    </a>
  )
}

/** The event list: a column on wide screens, a row of pills that scrolls sideways below. */
function RuleList({ list, selectedId }: { list: AlertRule[]; selectedId: string | undefined }) {
  const row = useRef<HTMLElement>(null)
  // Keep the chosen pill in view in the sideways row (no effect on the column layout).
  useEffect(() => {
    const nav = row.current
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return
    const left = el.offsetLeft - nav.offsetLeft
    if (left < nav.scrollLeft || left + el.offsetWidth > nav.scrollLeft + nav.clientWidth)
      nav.scrollLeft = left - 16
  }, [selectedId])
  return (
    <nav
      ref={row}
      aria-label="Alert rules"
      className="fc-scroll order-1 -mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 xl:mx-0 xl:flex-col xl:gap-1 xl:overflow-visible xl:px-0 xl:pb-0"
    >
      {list.map((r) => {
        const active = selectedId === r.id
        const Glyph = KIND_ICON[r.kinds[0] ?? ''] ?? Bell
        const status = ruleStatus(r)
        return (
          <a
            key={r.id}
            href={href({ name: 'alerts', rule: r.id })}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'fc-press relative flex h-11 shrink-0 items-center gap-2.5 rounded-full border pr-4 pl-3.5 text-[15px] font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150',
              'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none xl:w-full xl:pr-3.5',
              active
                ? 'border-line-strong bg-surface-1 text-text shadow-1'
                : 'border-line text-text-2 hover:bg-surface-2 hover:text-text xl:border-transparent',
            )}
          >
            <Glyph
              size={19}
              weight={active ? 'fill' : 'regular'}
              aria-hidden="true"
              className={cx('shrink-0', active ? 'text-accent-text' : 'text-text-3')}
            />
            <span className={cx('min-w-0 truncate', !r.enabled && !active && 'text-text-3')}>
              {r.name}
            </span>
            <span className="ml-auto pl-1 text-[12px] font-semibold text-text-3">
              <span className="sr-only">, </span>
              {status}
            </span>
          </a>
        )
      })}
    </nav>
  )
}

export function Alerts({ ruleId }: { ruleId?: string | undefined }) {
  const rules = useResource((c) => c.alertRules())
  const media = useResource((c) => c.media())
  const client = useClient()
  const { run } = useAction()
  const queue = useLive((s) => s.queue)
  const list = rules.data ?? []
  const selected = list.find((r) => r.id === ruleId) ?? list[0]

  const toggle = (r: AlertRule, enabled: boolean) => {
    rules.set((prev) => (prev ?? []).map((x) => (x.id === r.id ? { ...x, enabled } : x)))
    void run('toggle', () => client.saveAlertRule({ ...r, enabled }), {
      success: enabled ? `${r.name} on.` : `${r.name} off. Those events go to the feed only.`,
    }).then((saved) => {
      if (!saved) rules.reload()
    })
  }

  return (
    <div>
      <PageHeader
        title="Alerts"
        actions={
          <>
            <AlertDesignButton />
            <TestAlertMenu variant="primary" />
          </>
        }
      />
      {queue?.paused && (
        <p className="mb-4 rounded-control border border-warn/30 bg-warn-soft px-3 py-2 text-[13.5px] font-medium text-warn">
          Alerts are paused. Resume them from Home.
        </p>
      )}
      {rules.error ? (
        <LoadError error={rules.error} onRetry={rules.reload} />
      ) : rules.loading && !rules.data ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[212px_minmax(0,1fr)_minmax(340px,0.9fr)] xl:gap-5">
          <div className="flex gap-2 overflow-hidden xl:flex-col xl:gap-1">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-32 shrink-0 rounded-full xl:w-full" />
            ))}
          </div>
          <Skeleton className="h-[520px] rounded-panel" />
          <Skeleton className="hidden aspect-video rounded-panel xl:block" />
        </div>
      ) : list.length === 0 || !selected ? (
        <EmptyState title="No alert rules">
          Reset to the defaults in Settings → Data, or import from StreamElements or Streamlabs.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[212px_minmax(0,1fr)_minmax(340px,0.9fr)] xl:items-start xl:gap-5">
          <RuleList list={list} selectedId={selected.id} />
          <RuleEditor
            rule={selected}
            media={media.data ?? []}
            onUploaded={(m) => media.set((prev) => [...(prev ?? []), m])}
            onSaved={(r) => rules.set((prev) => (prev ?? []).map((x) => (x.id === r.id ? r : x)))}
            onToggle={(on) => toggle(selected, on)}
          />
        </div>
      )}
    </div>
  )
}
