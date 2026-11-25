import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowCounterClockwise,
  Bell,
  ChatCircleText,
  Diamond,
  Gift,
  HandCoins,
  Heart,
  Lightning,
  PaintBrushBroad,
  Play,
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
  defaultAlertAnim,
  defaultRules,
  describeError,
  eventVars,
  newVariation,
  pickLook,
  platformsFor,
  renderAlert,
  renderOnto,
  ruleBuiltinSound,
  sample,
  validateCustomVariation,
  validateRule,
  MAX_WEIGHT,
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
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError, PageHeader } from '../components/Panel'
import { TestAlertMenu } from '../components/alerts-live'
import { AlertStage, alertHasSound } from '../components/AlertStage'
import { AlertTimeline } from '../components/alerts/AlertTimeline'
import { CustomCodePanel } from '../components/alerts/CustomCodePanel'
import { PropertyGroup } from '../components/alerts/PropertyGroup'
import { DockHandle, useDockWidth } from '../components/alerts/DockHandle'
import { LEFT_DOCK, RIGHT_DOCK } from '../lib/dock-size'
import { TokenChipField, tokensForAlert } from '../components/alerts/TokenChipField'
import { VariationCards } from '../components/alerts/VariationCards'
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

function previewEventFor(rule: AlertRule, platform: Platform): FerroEvent {
  for (const kind of rule.kinds) {
    const match = sample(kind, platform, Date.now())
    if (match) return match
  }
  const fallbackKind =
    platform === 'tips' ? 'tip' : platform === 'youtube' ? 'subscription' : 'follow'
  return (
    sample(fallbackKind, platform, Date.now()) ??
    sample(rule.kinds[0] ?? 'follow', platform, Date.now()) ??
    sample('tip', 'tips', Date.now())!
  )
}

function supportedStreamTestPlatform(rule: AlertRule, preferred: Platform): Platform | undefined {
  const kind = rule.kinds[0] ?? 'follow'
  if (kind === 'tip') return undefined
  const supported = platformsFor(kind)
  return supported.includes(preferred) ? preferred : supported[0]
}

/** What a rule's row says on the right: off, how many looks, or on. */
function ruleStatus(r: AlertRule): string {
  if (!r.enabled) return 'Off'
  return r.variations.length > 1 ? `${r.variations.length} looks` : 'On'
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
function VariationEditor({
  ruleName,
  listens,
  v,
  isDefault,
  media,
  event,
  onChange,
  onUploaded,
  onDelete,
}: {
  ruleName: string
  /** The rule's platforms (they apply to every look), shown in this look's group. */
  listens: { shown: Platform[]; on: Platform[]; toggle: (p: Platform) => void }
  v: Variation
  isDefault: boolean
  media: Media[]
  event: FerroEvent | null
  onChange: (v: Variation) => void
  onUploaded: (m: Media) => void
  onDelete: () => void
}) {
  const eventKeys = useMemo(
    () => (event ? Object.keys(eventVars(event)) : ['name', 'amount', 'message']),
    [event],
  )
  const customKeys = useMemo(() => (v.fields ?? []).map((f) => f.key), [v.fields])
  const tokenOptions = useMemo(() => tokensForAlert(eventKeys, customKeys), [eventKeys, customKeys])
  const allowedTokens = useMemo(() => new Set<string>([...KNOWN_VARS, ...customKeys]), [customKeys])

  return (
    <div className="flex flex-col gap-2.5">
      <PropertyGroup
        title="This look"
        summary={isDefault ? 'Default' : v.name || 'Untitled look'}
        defaultOpen
      >
        {!isDefault && (
          <>
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
          </>
        )}
        <fieldset className="m-0 flex flex-col gap-0.5 border-0 p-0">
          <legend className="fc-label mb-1 px-0">Rule listens on</legend>
          {listens.shown.map((p) => {
            const on = listens.on.includes(p)
            const onlyOne = on && listens.on.length === 1
            return (
              <label
                key={p}
                className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[8px] px-1.5 text-[14.5px] font-medium text-text hover:bg-surface-2 has-[:disabled]:cursor-default has-[:disabled]:hover:bg-transparent"
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={onlyOne}
                  onChange={() => listens.toggle(p)}
                  className="size-4 accent-[var(--fc-accent)]"
                />
                <PlatformMark platform={p} size={14} />
                {p === 'tips' ? 'Tip page' : PLATFORM_LABEL[p]}
              </label>
            )
          })}
          <p className="px-1.5 pt-1 text-[13px] text-text-3">Applies to every look in {ruleName}</p>
        </fieldset>
      </PropertyGroup>

      <PropertyGroup title="Message and tokens" summary={v.title} defaultOpen>
        <TokenChipField
          label="Headline"
          value={v.title}
          maxLength={300}
          options={tokenOptions}
          allowedSet={allowedTokens}
          onChange={(title) => onChange({ ...v, title })}
        />
        <TokenChipField
          label="Second line"
          value={v.body}
          maxLength={500}
          multiline
          placeholder="Empty for a one-line alert"
          options={tokenOptions}
          allowedSet={allowedTokens}
          onChange={(body) => onChange({ ...v, body })}
        />
      </PropertyGroup>

      <PropertyGroup title="Layout and media" summary="Layout, sound, picture" defaultOpen>
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
      </PropertyGroup>

      <PropertyGroup
        title="Custom HTML, CSS and schema"
        summary={v.custom_enabled ? 'On' : 'Off'}
        defaultOpen={v.custom_enabled}
      >
        <CustomCodePanel v={v} onChange={onChange} />
      </PropertyGroup>

      <PropertyGroup
        title={isDefault ? 'Read aloud (TTS)' : 'Read aloud, priority, chance'}
        summary={v.tts ? 'Reads aloud' : undefined}
      >
        <Switch
          checked={v.tts}
          onChange={(tts) => onChange({ ...v, tts })}
          label="Read the message aloud"
          description="Follows your TTS rules. Turn TTS on in Settings first."
        />
        {!isDefault && (
          <>
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
            <Field
              label="Chance"
              hint="Looks with the same priority share the alerts by this weight. 0 means never while another one has a weight."
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_WEIGHT}
                  value={v.weight}
                  onChange={(e) =>
                    onChange({
                      ...v,
                      weight: Math.min(
                        MAX_WEIGHT,
                        Math.max(0, Math.round(Number(e.target.value) || 0)),
                      ),
                    })
                  }
                />
              )}
            </Field>
          </>
        )}
      </PropertyGroup>
    </div>
  )
}

/**
 * The editor for one rule: the settings panel and, beside it on wide screens, the live
 * preview. Renders two grid cells (the parent grid places them).
 */
function RuleEditor({
  rule,
  rules,
  media,
  onSaved,
  onUploaded,
  onToggle,
  notice,
}: {
  rule: AlertRule
  /** A line under the top bar (a partial restore of the starter rules, with its retry). */
  notice?: ReactNode
  /** Every rule, for the left dock's list. */
  rules: AlertRule[]
  media: Media[]
  onSaved: (r: AlertRule) => void
  onUploaded: (m: Media) => void
  onToggle: (enabled: boolean) => void
}) {
  const client = useClient()
  const { run, busy } = useAction()
  const [draft, setDraft] = useState(rule)
  const [vi, setVi] = useState(0)
  const leftDock = useDockWidth(LEFT_DOCK)
  const rightDock = useDockWidth(RIGHT_DOCK)
  const [previewPlatform, setPreviewPlatform] = useState<Platform>(() =>
    rule.kinds[0] === 'tip' ? 'tips' : (platformsFor(rule.kinds[0] ?? 'follow')[0] ?? 'twitch'),
  )
  const [previewStatus, setPreviewStatus] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<{ message: string; hint?: string } | null>(null)
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
      setPreviewPlatform(
        rule.kinds[0] === 'tip' ? 'tips' : (platformsFor(rule.kinds[0] ?? 'follow')[0] ?? 'twitch'),
      )
      setPreviewStatus(null)
      setSaveError(null)
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
  const [fireTick, setFireTick] = useState(0)
  const event = useMemo(() => {
    void fireTick
    return previewEventFor(draft, previewPlatform)
  }, [draft, previewPlatform, fireTick])
  // The alert design in use dresses every alert on stream (its look, words, picture and
  // sound), so the preview plays it too; without one, or when custom HTML/CSS is active,
  // the rule's own look plays directly.
  const activeDesign = useResource(async (c) => {
    const { design_id } = await c.activeAlertDesign()
    return design_id ? c.design(design_id) : null
  })
  const design: Design | null = activeDesign.data?.kind === 'alert' ? activeDesign.data : null
  const customPreviewError = useMemo(
    () => (v?.custom_enabled ? validateCustomVariation(v) : null),
    [v],
  )
  const preview = useMemo(() => {
    if (!v || !event || customPreviewError) return null
    let a = renderAlert(`preview-${fireTick}`, draft, v, event)
    const look = design && !v.custom_enabled ? pickLook(design, event) : null
    if (design && look && !v.custom_enabled)
      a = renderOnto(a, design, look.key, look.variation, event)
    const url = (id: string | null) => {
      const b = ruleBuiltinSound(id)
      if (b) return builtinSoundUrl(b)
      return id && media.some((x) => x.id === id) ? previewMediaUrl(client, media, id) : null
    }
    return { ...a, sound: url(a.sound), image: url(a.image) }
  }, [draft, v, event, media, client, design, fireTick, customPreviewError])
  if (!v) return null
  const setV = (nv: Variation) => {
    setSaveError(null)
    setDraft({ ...draft, variations: draft.variations.map((x, i) => (i === vi ? nv : x)) })
  }
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
  const save = async () => {
    setSaveError(null)
    const submittedId = draft.id
    const saved = await run(
      'save',
      async () => {
        try {
          return await client.saveAlertRule(draft)
        } catch (e) {
          const d = describeError(e)
          // The user may have moved to another rule while this was in flight: its form
          // must not show this one's refusal.
          if (lastRule.current.id === submittedId)
            setSaveError({ message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
          throw e
        }
      },
      { success: `“${draft.name}” saved. New alerts use it right away.`, quiet: true },
    )
    if (saved) onSaved(saved)
  }
  const togglePlatform = (p: Platform) => {
    const all = draft.platforms.length === 0 ? [...kindPlatforms] : draft.platforms
    const next = all.includes(p) ? all.filter((x) => x !== p) : [...all, p]
    // At least one stays: an empty list would mean "every platform".
    if (next.length === 0) return
    setDraft({ ...draft, platforms: next.length === kindPlatforms.length ? [] : next })
  }
  const firePlatformTest = (p: Platform) => {
    setPreviewPlatform(p)
    setFireTick((t) => t + 1)
    setReplay((r) => r + 1)
    const ev = previewEventFor(draft, p)
    const evVars = eventVars(ev)
    const actorName = evVars.name ?? PLATFORM_LABEL[p]
    setPreviewStatus(`Previewing ${PLATFORM_LABEL[p]} test alert (${actorName}).`)
  }

  const kindPlatformsShown = (
    kind === 'tip' ? (['tips'] as Platform[]) : kindPlatforms
  ) as Platform[]
  const listening = kindPlatformsShown.filter(
    (p) => draft.platforms.length === 0 || draft.platforms.includes(p),
  )
  const previewOff =
    !listening.includes(previewPlatform) && kindPlatformsShown.includes(previewPlatform)
  const banner = saveError ?? (dirty && error ? { message: error } : null)

  return (
    <div
      data-testid="alert-editor"
      className="fc-editor flex min-h-0 flex-col bg-bg lg:h-[calc(100dvh-var(--fc-top,56px)-var(--fc-statusbar,0px))] lg:overflow-hidden"
    >
      {/* Top bar: where I am, what is unsaved, and the ways out. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface-1 px-3 py-2 lg:h-[52px] lg:flex-nowrap lg:py-0">
        <h1 className="sr-only">Alerts</h1>
        <label htmlFor="rule-name" className="sr-only">
          Rule name
        </label>
        <input
          id="rule-name"
          value={draft.name}
          maxLength={40}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="min-w-[8rem] flex-1 rounded-control border border-transparent bg-transparent px-1.5 py-0.5 font-display text-lg font-bold tracking-tight text-text hover:border-line focus:border-accent-text focus:outline-none lg:w-40 lg:flex-none xl:w-52"
        />
        <div className="inline-flex h-8 shrink-0 items-center self-center rounded-full border border-line-strong bg-surface-2 pr-1.5 pl-3 [&_label]:leading-none">
          {/* The switch is the state (a screen reader hears "Rule, switch, on"). */}
          <Switch checked={rule.enabled} onChange={onToggle} label="Rule" />
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {dirty && (
            <span
              role="status"
              className="inline-flex h-7 items-center rounded-full border border-warn/40 bg-warn-soft px-2.5 text-[13.5px] font-semibold text-warn"
            >
              Unsaved edits
            </span>
          )}
          <AlertDesignButton />
          <Button
            size="sm"
            variant="ghost"
            disabled={!dirty}
            onClick={() => {
              setSaveError(null)
              setDraft(rule)
              // The added look is gone: the first look is the one shown.
              setVi(0)
            }}
          >
            Discard
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!dirty || !!error}
            busy={busy === 'save'}
            onClick={() => void save()}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Lightning size={14} weight="fill" />}
            busy={busy === 'test'}
            onClick={() =>
              void run(
                'test',
                () => client.test(kind, supportedStreamTestPlatform(draft, previewPlatform)),
                {
                  success: dirty
                    ? 'Test sent. It uses the saved version; save to test your changes.'
                    : 'Test sent to your overlays.',
                },
              )
            }
          >
            Test on stream
          </Button>
        </div>
      </header>

      {notice}

      {banner && (
        <div
          role="alert"
          className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-[14px] text-danger"
        >
          <span className="font-semibold">{banner.message}</span>
          {'hint' in banner && banner.hint && (
            <span className="ml-2 text-text-2">{banner.hint}</span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
        {/* Left dock: the alert rules, and this rule's looks. */}
        <div
          className="relative order-2 min-w-0 lg:order-none lg:h-full lg:min-h-0 lg:w-[var(--dock-l)] lg:shrink-0"
          style={{ '--dock-l': `${leftDock.width}px` } as React.CSSProperties}
        >
          <aside
            aria-label="Alert rules and looks"
            className="fc-scroll flex min-w-0 flex-col gap-3 border-b border-line bg-surface-1 p-3 lg:h-full lg:min-h-0 lg:overflow-x-hidden lg:overflow-y-auto lg:border-r lg:border-b-0"
          >
            <RuleList list={rules} selectedId={rule.id} />
            <div className="border-t border-line pt-3">
              <VariationCards
                compact
                variations={draft.variations}
                selectedIndex={vi}
                onSelect={setVi}
                onAdd={addVariation}
                onDelete={(idx) => {
                  if (draft.variations[idx]?.condition === null) return
                  setDraft({ ...draft, variations: draft.variations.filter((_, i) => i !== idx) })
                  setVi((cur) => (cur >= idx ? Math.max(0, cur - 1) : cur))
                }}
              />
            </div>
          </aside>
          <DockHandle
            spec={LEFT_DOCK}
            label="Resize the alert rules dock"
            width={leftDock.width}
            otherWidth={rightDock.width}
            growsRight={1}
            onResize={leftDock.set}
            onReset={leftDock.reset}
            className="-right-1.5"
          />
        </div>

        {/* Centre: the live stage and, right under it, the timeline. */}
        <section
          aria-label="Live preview"
          className="fc-scroll order-1 flex min-h-0 min-w-0 flex-col gap-3 bg-inset p-3 lg:order-none lg:flex-1 lg:overflow-y-auto"
        >
          <div className="relative mx-auto w-full shrink-0 lg:max-w-[max(340px,calc((100dvh-28rem)*16/9))]">
            <AlertStage
              alert={preview}
              theme="molten"
              controls={false}
              sound={sound}
              replay={replay}
              className="shadow-1"
              {...(customPreviewError
                ? {
                    emptyMessage: `Preview paused: ${customPreviewError.replace(/^Variation '[^']*': /, '')}`,
                  }
                : {})}
            />
            {/* On the stage: which platform's sample to preview, replay and sound, what it is. */}
            <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-wrap items-start justify-between gap-1.5">
              <div
                role="group"
                aria-label="Preview"
                className="pointer-events-auto inline-flex max-w-full flex-wrap items-center gap-1 rounded-[10px] border border-line-strong bg-surface-1/95 p-1 pl-2.5 text-text shadow-1 backdrop-blur-sm"
              >
                <span aria-hidden="true" className="mr-1 text-[12.5px] font-semibold text-text">
                  Preview
                </span>
                {(['twitch', 'youtube', 'kick', 'tips'] as Platform[]).map((p) => {
                  const supported = kindPlatformsShown.includes(p)
                  const active = previewPlatform === p
                  return (
                    <button
                      key={p}
                      type="button"
                      data-platform-test={p}
                      aria-pressed={active}
                      aria-label={`Preview as ${p === 'tips' ? 'Tips' : PLATFORM_LABEL[p]}`}
                      title={
                        supported
                          ? `Preview as ${PLATFORM_LABEL[p]}`
                          : `${PLATFORM_LABEL[p]} has no alert of this kind`
                      }
                      disabled={!supported}
                      onClick={() => firePlatformTest(p)}
                      className={cx(
                        'fc-press grid size-8 place-items-center rounded-[7px] border transition-colors focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
                        active
                          ? 'border-pick bg-surface-1 ring-2 ring-pick'
                          : 'border-line bg-surface-2 hover:border-line-strong hover:bg-surface-3',
                      )}
                    >
                      <PlatformMark platform={p} size={15} />
                    </button>
                  )
                })}
              </div>
              <div className="pointer-events-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setReplay((n) => n + 1)}
                  className="fc-press inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface-1/95 px-2.5 text-[13.5px] font-semibold text-text shadow-1 backdrop-blur-sm hover:border-text-3 hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none sm:h-9 sm:px-3 sm:text-[14px]"
                >
                  <ArrowCounterClockwise size={15} aria-hidden="true" />
                  Replay
                </button>
                {alertHasSound(preview) ? (
                  <button
                    type="button"
                    aria-pressed={!sound}
                    title={sound ? 'Mute the preview' : 'Play the preview with sound'}
                    onClick={() => {
                      unlockAudio()
                      setSound((x) => !x)
                    }}
                    className="fc-press inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface-1/95 px-2.5 text-[13.5px] font-semibold text-text shadow-1 backdrop-blur-sm hover:border-text-3 hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none sm:h-9 sm:px-3 sm:text-[14px]"
                  >
                    {sound ? (
                      <SpeakerHigh size={15} aria-hidden="true" />
                    ) : (
                      <SpeakerSlash size={15} aria-hidden="true" />
                    )}
                    Mute
                  </button>
                ) : (
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface-1/95 px-2.5 text-[13.5px] font-semibold text-text-2 shadow-1 backdrop-blur-sm sm:h-9 sm:px-3 sm:text-[14px]">
                    <SpeakerSlash size={15} aria-hidden="true" /> No sound
                  </span>
                )}
              </div>
            </div>
            <p className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[13px] font-medium text-white/90">
              <PlatformMark platform={previewPlatform} size={12} />
              Simulated {previewPlatform === 'tips' ? 'Tips' : PLATFORM_LABEL[previewPlatform]}{' '}
              sample
            </p>
            <span className="sr-only" aria-live="polite">
              {previewStatus}
            </span>
          </div>
          {previewOff && (
            <p role="status" className="text-[14px] font-medium text-warn">
              This rule doesn’t listen on {PLATFORM_LABEL[previewPlatform]}, so a real{' '}
              {PLATFORM_LABEL[previewPlatform]} event would not play it.
            </p>
          )}
          <AlertTimeline
            durationMs={v.duration_ms}
            anim={v.anim ?? defaultAlertAnim()}
            onChange={(duration_ms, anim) => setV({ ...v, duration_ms, anim })}
          />
          {design && !v.custom_enabled && (
            <p className="text-[14px] leading-snug text-text-2">
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
        </section>

        {/* Right dock: collapsible property groups for the look picked on the left. */}
        <div
          className="relative order-3 min-w-0 lg:order-none lg:h-full lg:min-h-0 lg:w-[var(--dock-r)] lg:shrink-0"
          style={{ '--dock-r': `${rightDock.width}px` } as React.CSSProperties}
        >
          <DockHandle
            spec={RIGHT_DOCK}
            label="Resize the properties dock"
            width={rightDock.width}
            otherWidth={leftDock.width}
            growsRight={-1}
            onResize={rightDock.set}
            onReset={rightDock.reset}
            className="-left-1.5"
          />
          <aside
            aria-label="Look properties"
            className="fc-scroll flex min-w-0 flex-col gap-2.5 border-t border-line bg-surface-1 p-3 lg:h-full lg:min-h-0 lg:overflow-x-hidden lg:overflow-y-auto lg:border-t-0 lg:border-l"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
              <Switch
                checked={draft.interrupt}
                onChange={(interrupt) => setDraft({ ...draft, interrupt })}
                label="Interrupt the alert on screen"
                description="A new one replaces the alert playing now instead of waiting. While alerts are paused it waits."
              />
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={v.id}
                role="tabpanel"
                aria-label={v.condition === null ? 'Default look' : v.name || 'Untitled look'}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reduce ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.1 } }
                }
                transition={{ duration: 0.18 }}
              >
                <VariationEditor
                  ruleName={draft.name}
                  listens={{ shown: kindPlatformsShown, on: listening, toggle: togglePlatform }}
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
          </aside>
        </div>
      </div>
    </div>
  )
}

/** Opens the designer on the alert design in use, or the gallery when there is none. */
function AlertDesignButton() {
  const active = useResource((c) => c.activeAlertDesign())
  const id = active.data?.design_id
  return (
    <a
      href={id ? href({ name: 'designer', id }) : href({ name: 'designs' })}
      className="fc-press inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong bg-surface-3 px-3 text-[14.5px] font-semibold whitespace-nowrap text-text hover:border-text-3 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
    >
      <PaintBrushBroad size={16} aria-hidden="true" />
      {id ? 'Alert designer' : 'Alert designs'}
    </a>
  )
}

/** The alert rules: a tight column in the left dock, wrapping pills where there is no dock. */
function RuleList({ list, selectedId }: { list: AlertRule[]; selectedId: string | undefined }) {
  return (
    <nav aria-label="Alert rules" className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="fc-label">Alert rules</span>
        <span className="font-mono text-[12.5px] text-text-3 tabular-nums">{list.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 lg:flex-col lg:flex-nowrap lg:gap-0.5">
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
                'fc-press relative flex h-9 shrink-0 items-center gap-2 rounded-full border pr-3 pl-3 text-[14.5px] font-semibold whitespace-nowrap transition-[background-color,border-color,color] duration-150 lg:w-full lg:rounded-[10px]',
                'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                active
                  ? 'fc-picked border-transparent'
                  : 'border-line text-text-2 hover:bg-surface-2 hover:text-text lg:border-transparent',
              )}
            >
              <Glyph
                size={17}
                weight={active ? 'fill' : 'regular'}
                aria-hidden="true"
                className={cx('shrink-0', active || r.enabled ? 'text-accent-text' : 'text-text-3')}
              />
              <span className={cx('min-w-0 truncate', !r.enabled && !active && 'text-text-3')}>
                {r.name}
              </span>
              <span
                className={cx(
                  'ml-auto pl-1 text-[12.5px] font-bold',
                  r.enabled ? 'text-ok' : 'text-text-3',
                )}
              >
                <span className="sr-only">, </span>
                {status}
              </span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}

export function Alerts({ ruleId }: { ruleId?: string | undefined }) {
  const rules = useResource((c) => c.alertRules())
  const media = useResource((c) => c.media())
  const client = useClient()
  const { busy, run } = useAction()
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

  /** Starter rules that failed to come back last time: offered again until they do. */
  const [restoreLeft, setRestoreLeft] = useState(0)
  const restoreDefaults = () => {
    void run(
      'restore',
      async () => {
        // Only what is missing, so a retry after a partial failure doesn't clash with the
        // rules that did get created.
        const have = new Set((rules.data ?? []).map((r) => r.id))
        const todo = defaultRules().filter((r) => !have.has(r.id))
        const results = await Promise.allSettled(todo.map((r) => client.createAlertRule(r)))
        const created = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
        if (created.length > 0) rules.set((prev) => [...(prev ?? []), ...created])
        const failed = results.length - created.length
        setRestoreLeft(failed)
        const firstFailure = results.find((r) => r.status === 'rejected')
        if (failed > 0 && firstFailure?.status === 'rejected') throw firstFailure.reason
      },
      { success: 'Starter alert rules restored.' },
    )
  }

  const inEditor = !rules.error && !(rules.loading && !rules.data) && list.length > 0 && !!selected
  if (inEditor && selected)
    return (
      <>
        <RuleEditor
          rule={selected}
          rules={list}
          media={media.data ?? []}
          onUploaded={(m) => media.set((prev) => [...(prev ?? []), m])}
          onSaved={(r) => rules.set((prev) => (prev ?? []).map((x) => (x.id === r.id ? r : x)))}
          onToggle={(on) => toggle(selected, on)}
          notice={
            queue?.paused || restoreLeft > 0 ? (
              <>
                {queue?.paused && (
                  <p
                    role="status"
                    className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-[14.5px] font-medium text-warn"
                  >
                    Alerts are paused. Resume them from Home.
                  </p>
                )}
                {restoreLeft > 0 && (
                  <p className="flex flex-wrap items-center gap-3 border-b border-warn/30 bg-warn-soft px-4 py-2 text-[14.5px] font-medium text-warn">
                    {restoreLeft} starter {restoreLeft === 1 ? 'rule' : 'rules'} couldn&apos;t be
                    restored.
                    <Button size="sm" busy={busy === 'restore'} onClick={restoreDefaults}>
                      Restore the rest
                    </Button>
                  </p>
                )}
              </>
            ) : null
          }
        />
      </>
    )

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
        <p className="mb-4 rounded-control border border-warn/30 bg-warn-soft px-3 py-2 text-[14.5px] font-medium text-warn">
          Alerts are paused. Resume them from Home.
        </p>
      )}
      {restoreLeft > 0 && list.length > 0 && (
        <p className="mb-4 flex flex-wrap items-center gap-3 rounded-control border border-warn/30 bg-warn-soft px-3 py-2 text-[14.5px] font-medium text-warn">
          {restoreLeft} starter {restoreLeft === 1 ? 'rule' : 'rules'} couldn&apos;t be restored.
          <Button size="sm" busy={busy === 'restore'} onClick={restoreDefaults}>
            Restore the rest
          </Button>
        </p>
      )}
      {rules.error ? (
        <LoadError error={rules.error} onRetry={rules.reload} />
      ) : rules.loading && !rules.data ? (
        <div
          data-testid="alerts-loading"
          className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[236px_minmax(0,1fr)_minmax(340px,0.9fr)] xl:gap-5"
        >
          <div className="flex flex-wrap gap-2 overflow-hidden xl:flex-col xl:gap-1">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-32 shrink-0 rounded-full xl:w-full" />
            ))}
          </div>
          <Skeleton className="h-[520px] rounded-panel" />
          <Skeleton className="hidden aspect-video rounded-panel xl:block" />
        </div>
      ) : (
        <EmptyState
          title="No alert rules"
          action={
            <Button variant="primary" busy={busy === 'restore'} onClick={restoreDefaults}>
              Restore default rules
            </Button>
          }
        >
          Restore starter rules here, or import alerts from StreamElements or Streamlabs in
          Settings.
        </EmptyState>
      )}
    </div>
  )
}
