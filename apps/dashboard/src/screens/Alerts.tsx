import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CaretLeft, Lightning, Plus, Trash, UploadSimple } from '@phosphor-icons/react'
import {
  KIND_LABEL,
  KNOWN_VARS,
  PLATFORM_LABEL,
  checkTemplate,
  newVariation,
  platformsFor,
  renderAlert,
  sample,
  validateRule,
  type AlertRule,
  type Condition,
  type FerroEvent,
  type Media,
  type Platform,
  type Variation,
} from '@ferrocast/api'
import {
  Badge,
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
import { AlertStage } from '../components/AlertStage'
import { useAction, useClient, useMediaQuery, useResource } from '../lib/hooks'
import { go, href } from '../lib/router'
import { useUnsavedWarning } from '../lib/unsaved'
import { useLive } from '../lib/store'

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

/** Inserts `{var}` at the caret of the focused template field. */
function VarChips({ onPick }: { onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1" aria-label="Insert a variable">
      {KNOWN_VARS.slice(0, 10).map((v) => (
        <button
          key={v}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(v)}
          className="fc-press rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-text-2 hover:border-accent-line hover:text-text"
        >
          {`{${v}}`}
        </button>
      ))}
    </div>
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
}: {
  kind: 'sound' | 'image'
  value: string | null
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
  return (
    <Field
      label={kind === 'sound' ? 'Sound' : 'Image or video'}
      hint={
        kind === 'sound'
          ? 'MP3, OGG or WAV, up to 5 MB.'
          : 'PNG, JPEG, GIF, WebP up to 10 MB, or WebM/MP4 up to 50 MB.'
      }
    >
      {(p) => (
        <div className="flex gap-2">
          <Select
            {...p}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            className="min-w-0 flex-1"
          >
            <option value="">{kind === 'sound' ? 'No sound' : 'No image'}</option>
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <Field label="Amount" hint="Money, bits, viewers or gifted subs.">
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="decimal"
                min={0}
                value={c.value}
                onChange={(e) => onChange({ ...c, value: Number(e.target.value) || 0 })}
              />
            )}
          </Field>
          <Field label="Currency" optional>
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

function VariationEditor({
  v,
  isDefault,
  media,
  onChange,
  onUploaded,
  onDelete,
}: {
  v: Variation
  isDefault: boolean
  media: Media[]
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
  return (
    <div className="flex flex-col gap-4">
      {!isDefault && (
        <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface-2 p-3">
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
      <Field
        label="Second line"
        error={bodyCheck.ok ? null : bodyCheck.error}
        hint="Usually {message}. Leave empty for a one-line alert."
      >
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            value={v.body}
            maxLength={500}
            onFocus={(e) => (focused.current = { el: e.currentTarget, key: 'body' })}
            onChange={(e) => onChange({ ...v, body: e.target.value })}
          />
        )}
      </Field>
      <VarChips onPick={insert} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-text-2">Layout</span>
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
        <Field label={`On screen for ${Math.round(v.duration_ms / 100) / 10} s`}>
          {(p) => (
            <input
              {...p}
              type="range"
              min={1000}
              max={30000}
              step={500}
              value={v.duration_ms}
              onChange={(e) => onChange({ ...v, duration_ms: Number(e.target.value) })}
              className="h-10 w-full"
            />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MediaPicker
          kind="sound"
          value={v.sound}
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
      </div>
      <Field label={`Volume ${v.volume}%`}>
        {(p) => (
          <input
            {...p}
            type="range"
            min={0}
            max={100}
            value={v.volume}
            onChange={(e) => onChange({ ...v, volume: Number(e.target.value) })}
            className="h-8 w-full"
          />
        )}
      </Field>
      <Switch
        checked={v.tts}
        onChange={(tts) => onChange({ ...v, tts })}
        label="Read the message aloud"
        description="Uses text-to-speech with your TTS rules: minimum amount, word filter and approval first. TTS itself is off until you turn it on in Settings."
      />
      <details className="group rounded-[12px] border border-line">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-semibold text-text-2 hover:text-text">
          Advanced: custom CSS and priority
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3">
          <Field
            label="Custom CSS"
            hint="Applies only inside this alert. Example: .fc-alert-title { letter-spacing: 0.02em }"
          >
            {(p) => (
              <Textarea
                {...p}
                rows={4}
                spellCheck={false}
                className="font-mono text-[12.5px]"
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

function RuleEditor({
  rule,
  media,
  onSaved,
  onUploaded,
  onBack,
}: {
  rule: AlertRule
  media: Media[]
  onSaved: (r: AlertRule) => void
  onUploaded: (m: Media) => void
  onBack?: () => void
}) {
  const client = useClient()
  const { run, busy } = useAction()
  const [draft, setDraft] = useState(rule)
  const [vi, setVi] = useState(0)
  const [previewPlatform, setPreviewPlatform] = useState<Platform | null>(null)
  const reduce = useReducedMotion()
  // A different rule replaces the draft. The same rule changing underneath (saved, or
  // switched on/off from the list) must not throw away edits in progress.
  const lastRule = useRef(rule)
  useEffect(() => {
    const prev = lastRule.current
    lastRule.current = rule
    if (prev.id !== rule.id) {
      setDraft(rule)
      setVi(0)
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
  const preview = useMemo(() => {
    if (!v) return null
    const e = sampleFor(draft, previewPlatform)
    if (!e) return null
    const a = renderAlert('preview', draft, v, e)
    const url = (id: string | null) => {
      if (!id) return null
      const m = media.find((x) => x.id === id)
      return m
        ? m.url.startsWith('data:') || m.url.startsWith('blob:')
          ? m.url
          : client.mediaUrl(id)
        : null
    }
    return { ...a, sound: url(a.sound), image: url(a.image) }
  }, [draft, v, previewPlatform, media, client])
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {onBack && (
          <IconButton label="Back to all alerts" onClick={onBack}>
            <CaretLeft size={18} />
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          <label htmlFor="rule-name" className="sr-only">
            Rule name
          </label>
          <input
            id="rule-name"
            value={draft.name}
            maxLength={40}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full rounded-control border border-transparent bg-transparent px-1 font-display text-xl font-bold tracking-tight text-text hover:border-line focus:border-accent-text focus:outline-none"
          />
          <p className="px-1 text-[13px] text-text-3">Plays for: {KIND_LABEL[kind] ?? kind}</p>
        </div>
        <Switch
          checked={draft.enabled}
          onChange={(enabled) => setDraft({ ...draft, enabled })}
          label="Alert on"
          hideLabel
        />
      </div>

      {kindPlatforms.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-text-2">Platforms</span>
          {kindPlatforms.map((p) => {
            const on = draft.platforms.length === 0 || draft.platforms.includes(p)
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => togglePlatform(p)}
                className={cx(
                  'fc-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium',
                  on
                    ? 'border-accent-line bg-accent-soft text-text'
                    : 'border-line text-text-3 line-through decoration-text-3/60',
                )}
              >
                <PlatformMark platform={p} size={13} />
                {PLATFORM_LABEL[p]}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex min-w-0 flex-col gap-4 2xl:order-2">
          <AlertStage alert={preview} theme="molten" />
          <div className="flex flex-wrap items-center gap-2">
            {kindPlatforms.length > 1 && (
              <Segmented
                label="Preview as"
                size="sm"
                value={
                  previewPlatform && kindPlatforms.includes(previewPlatform)
                    ? previewPlatform
                    : (kindPlatforms[0] as Platform)
                }
                onChange={setPreviewPlatform}
                options={kindPlatforms.map((p) => ({
                  value: p,
                  label: <PlatformMark platform={p} size={12} />,
                  title: `Preview a ${PLATFORM_LABEL[p]} event`,
                }))}
              />
            )}
            <Button
              size="sm"
              className="ml-auto"
              icon={<Lightning size={15} weight="fill" />}
              busy={busy === 'test'}
              onClick={() =>
                void run('test', () => client.test(kind, previewPlatform ?? undefined), {
                  success: dirty
                    ? 'Test sent. It uses the saved version; save to test your changes.'
                    : 'Test sent to your overlays.',
                })
              }
            >
              Test on stream
            </Button>
          </div>
        </div>
        <div className="min-w-0 2xl:order-1">
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <div role="tablist" aria-label="Looks" className="contents">
              {draft.variations.map((x, i) => (
                <button
                  key={x.id}
                  role="tab"
                  type="button"
                  aria-selected={i === vi}
                  onClick={() => setVi(i)}
                  className={cx(
                    'fc-press h-8 max-w-[18ch] truncate rounded-full border px-3 text-[12.5px] font-semibold focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                    i === vi
                      ? 'border-accent-line bg-accent-soft text-text'
                      : 'border-line text-text-3 hover:text-text',
                  )}
                >
                  {x.condition === null ? 'Default' : x.name || 'Untitled'}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={addVariation}>
              Add a look
            </Button>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={v.id}
              role="tabpanel"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.1 } }}
              transition={{ duration: 0.18 }}
            >
              <VariationEditor
                v={v}
                isDefault={v.condition === null}
                media={media}
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
                'min-w-0 flex-1 text-[13px]',
                error ? 'font-medium text-danger' : 'text-text-2',
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
  )
}

export function Alerts({ ruleId }: { ruleId?: string | undefined }) {
  const rules = useResource((c) => c.alertRules())
  const media = useResource((c) => c.media())
  const client = useClient()
  const { run } = useAction()
  const wide = useMediaQuery('(min-width: 1024px)')
  const queue = useLive((s) => s.queue)
  const list = rules.data ?? []
  const selected = list.find((r) => r.id === ruleId) ?? (wide ? list[0] : undefined)
  const showList = wide || !ruleId

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
        description="What plays on stream for each kind of support. Every rule has a default look; add looks for bigger moments."
        actions={<TestAlertMenu />}
      />
      {rules.error ? (
        <LoadError error={rules.error} onRetry={rules.reload} />
      ) : rules.loading && !rules.data ? (
        <div className="grid gap-2 lg:grid-cols-[300px_1fr]">
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
          <Skeleton className="hidden h-[480px] lg:block" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState title="No alert rules">
          Reset to the defaults in Settings → Data, or import from StreamElements or Streamlabs.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
          {showList && (
            <nav aria-label="Alert rules" className="flex flex-col gap-1">
              {queue?.paused && (
                <p className="mb-2 rounded-control border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
                  Alerts are paused. Resume them from Home.
                </p>
              )}
              {list.map((r) => {
                const active = selected?.id === r.id
                return (
                  <div
                    key={r.id}
                    className={cx(
                      'flex items-center gap-3 rounded-[12px] border px-3 py-2.5 transition-colors',
                      active
                        ? 'border-accent-line bg-accent-soft'
                        : 'border-transparent hover:bg-surface-2',
                    )}
                  >
                    <a
                      href={href({ name: 'alerts', rule: r.id })}
                      aria-current={active ? 'page' : undefined}
                      className="min-w-0 flex-1 focus-visible:outline-none"
                    >
                      <span
                        className={cx(
                          'block truncate text-sm font-semibold',
                          r.enabled ? 'text-text' : 'text-text-3',
                        )}
                      >
                        {r.name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-text-3">
                        {r.variations.length > 1 ? `${r.variations.length} looks` : '1 look'}
                        {r.platforms.length > 0 && (
                          <span className="inline-flex gap-1">
                            ·{' '}
                            {r.platforms.map((p) => (
                              <PlatformMark key={p} platform={p} size={11} />
                            ))}
                          </span>
                        )}
                        {!r.enabled && <Badge>Off</Badge>}
                      </span>
                    </a>
                    <Switch
                      checked={r.enabled}
                      onChange={(on) => toggle(r, on)}
                      label={`${r.name} alert`}
                      hideLabel
                    />
                  </div>
                )
              })}
            </nav>
          )}
          {selected && (wide || ruleId) && (
            <div className="min-w-0 rounded-panel border border-line bg-surface-1 p-4 shadow-1 sm:p-5">
              <RuleEditor
                rule={selected}
                media={media.data ?? []}
                onUploaded={(m) => media.set((prev) => [...(prev ?? []), m])}
                onSaved={(r) =>
                  rules.set((prev) => (prev ?? []).map((x) => (x.id === r.id ? r : x)))
                }
                {...(!wide ? { onBack: () => go({ name: 'alerts' }) } : {})}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
