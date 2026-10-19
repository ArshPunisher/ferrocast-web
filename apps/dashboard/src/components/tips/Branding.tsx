// Pro: the tip page's colours, avatar and banner (API.md §9.2). Colours get a live contrast
// note (the relay lifts text under 4.5:1 and an accent under 3:1, and the preview shows the
// result before saving); images are checked here for type and size, then re-encoded by the
// relay.

import { useId, useRef, useState } from 'react'
import { ArrowCounterClockwise, Check, Info, UploadSimple, Warning } from '@phosphor-icons/react'
import {
  DEFAULT_TIP_COLOURS,
  TIP_IMAGE_TYPES,
  contrastRatio,
  describeError,
  fixTipColours,
  normaliseHex,
  tipBrandApi,
  tipImageProblem,
  type TipBrand,
  type TipColours,
  type TipImageKind,
} from '@ferrocast/api'
import { Button, Input, cx, toast } from '@ferrocast/ui'
import { useClient } from '../../lib/hooks'

type Field = keyof TipColours

const FIELDS: { key: Field; label: string; against: string }[] = [
  { key: 'background', label: 'Background', against: '' },
  { key: 'text', label: 'Text', against: 'on the background' },
  { key: 'accent', label: 'Accent', against: 'for buttons and the goal bar' },
]

export const savedColours = (b: TipBrand | null): TipColours | null =>
  b?.accent && b.background && b.text
    ? { accent: b.accent, background: b.background, text: b.text }
    : null

export function Branding({
  brand,
  draft,
  onDraft,
  onSaved,
}: {
  brand: TipBrand
  /** The colours being edited (null: what's saved, or the default look). */
  draft: TipColours | null
  onDraft: (c: TipColours | null) => void
  onSaved: (b: TipBrand) => void
}) {
  const client = useClient()
  const saved = savedColours(brand)
  const current = draft ?? saved ?? DEFAULT_TIP_COLOURS
  const [raw, setRaw] = useState<Record<Field, string>>(() => ({ ...current }))
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null)
  const { changes } = fixTipColours(current)
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(saved ?? DEFAULT_TIP_COLOURS)

  const set = (key: Field, value: string) => {
    setRaw((r) => ({ ...r, [key]: value }))
    const hex = normaliseHex(value)
    if (hex) onDraft({ ...current, [key]: hex })
  }

  const save = async () => {
    setBusy('save')
    try {
      const b = await tipBrandApi(client).saveColours(current)
      onSaved(b)
      onDraft(null)
      setRaw({
        accent: b.accent ?? current.accent,
        background: b.background ?? current.background,
        text: b.text ?? current.text,
      })
      toast({
        tone: 'ok',
        message: 'Colours saved. Your tip page uses them now.',
        hint: b.changes.length ? b.changes.map((c) => c.message).join(' ') : null,
      })
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusy(null)
    }
  }

  const reset = async () => {
    setBusy('reset')
    try {
      await tipBrandApi(client).resetColours()
      onSaved({ ...brand, accent: null, background: null, text: null, changes: [] })
      onDraft(null)
      setRaw({ ...DEFAULT_TIP_COLOURS })
      toast({ tone: 'ok', message: 'Back to the default colours.' })
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-[15px] font-bold text-text">Colours</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FIELDS.map((f) => (
            <ColourField
              key={f.key}
              label={f.label}
              value={current[f.key]}
              raw={raw[f.key]}
              invalid={normaliseHex(raw[f.key]) === null}
              note={
                f.key === 'background'
                  ? null
                  : `${contrastRatio(current[f.key], current.background).toFixed(1)}:1 ${f.against}`
              }
              onChange={(v) => set(f.key, v)}
            />
          ))}
        </div>
        <div className="mt-3" aria-live="polite">
          {changes.length > 0 ? (
            <div
              data-testid="contrast-note"
              className="flex gap-2.5 rounded-control border border-accent-line bg-accent-soft px-3 py-2.5"
            >
              <Info size={18} className="mt-0.5 shrink-0 text-accent-text" aria-hidden="true" />
              <div className="text-[14px] leading-snug text-text">
                {changes.map((c) => (
                  <p key={c.field}>
                    <span className="font-semibold">
                      {c.field === 'text' ? 'Text' : 'Accent'} is hard to read.
                    </span>{' '}
                    We’ll use{' '}
                    <span className="inline-flex items-center gap-1 font-mono text-[13px]">
                      <span
                        aria-hidden="true"
                        className="inline-block size-3 rounded-full border border-line-strong"
                        style={{ background: c.to }}
                      />
                      {c.to}
                    </span>{' '}
                    ({c.contrast_after.toFixed(1)}:1) instead.
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <p
              data-testid="contrast-note"
              className="flex items-center gap-1.5 text-[14px] font-semibold text-ok"
            >
              <Check size={15} weight="bold" aria-hidden="true" /> Easy to read
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {saved ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowCounterClockwise size={15} aria-hidden="true" />}
              busy={busy === 'reset'}
              onClick={() => void reset()}
            >
              Default colours
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="primary"
            busy={busy === 'save'}
            disabled={!dirty}
            onClick={() => void save()}
          >
            Save colours
          </Button>
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <h3 className="text-[15px] font-bold text-text">Pictures</h3>
        <div className="mt-3 flex flex-col gap-4">
          <ImageSlot kind="avatar" url={brand.avatar_url} onSaved={onSaved} brand={brand} />
          <ImageSlot kind="banner" url={brand.banner_url} onSaved={onSaved} brand={brand} />
        </div>
      </div>
    </div>
  )
}

function ColourField({
  label,
  value,
  raw,
  invalid,
  note,
  onChange,
}: {
  label: string
  value: string
  raw: string
  invalid: boolean
  note: string | null
  onChange: (v: string) => void
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold text-text">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-11 shrink-0 cursor-pointer rounded-control border border-line-strong bg-inset p-1 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        />
        <Input
          id={id}
          value={raw}
          spellCheck={false}
          autoCapitalize="none"
          maxLength={7}
          aria-invalid={invalid || undefined}
          className="font-mono uppercase"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <p
        className={cx(
          'text-[13px] leading-snug',
          invalid ? 'font-semibold text-danger' : 'text-text-3',
        )}
      >
        {invalid ? 'Use a hex colour like #3461F5.' : (note ?? 'The page behind everything.')}
      </p>
    </div>
  )
}

function ImageSlot({
  kind,
  url,
  brand,
  onSaved,
}: {
  kind: TipImageKind
  url: string | null
  brand: TipBrand
  onSaved: (b: TipBrand) => void
}) {
  const client = useClient()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null)
  const [busy, setBusy] = useState<'up' | 'rm' | null>(null)
  const label = kind === 'avatar' ? 'Avatar' : 'Banner'
  const errId = useId()

  const upload = async (file: File) => {
    setError(null)
    const p = tipImageProblem(kind, file)
    if (p) {
      setError({ message: p, hint: null })
      return
    }
    setBusy('up')
    try {
      onSaved(await tipBrandApi(client).uploadImage(kind, file))
      toast({ tone: 'ok', message: `${label} saved.` })
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setError(null)
    setBusy('rm')
    try {
      await tipBrandApi(client).deleteImage(kind)
      onSaved({ ...brand, [kind === 'avatar' ? 'avatar_url' : 'banner_url']: null, changes: [] })
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-w-0 items-start gap-4" data-testid={`slot-${kind}`}>
      <div
        className={cx(
          'shrink-0 overflow-hidden border border-line-strong bg-inset',
          kind === 'avatar'
            ? 'size-16 rounded-full'
            : 'aspect-[3/1] h-16 rounded-[10px] max-sm:h-12',
        )}
      >
        {url && (
          <img src={url} alt={`Your ${label.toLowerCase()}`} className="size-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-text">{label}</p>
        <p className="text-[13px] text-text-3">
          {kind === 'avatar' ? 'Square, up to 1 MB.' : '3:1, up to 3 MB.'} PNG, JPEG or WebP.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<UploadSimple size={15} aria-hidden="true" />}
            busy={busy === 'up'}
            aria-describedby={error ? errId : undefined}
            onClick={() => input.current?.click()}
          >
            {url ? 'Replace' : 'Upload'}
            <span className="sr-only"> {label.toLowerCase()}</span>
          </Button>
          {url && (
            <Button
              size="sm"
              variant="danger-ghost"
              busy={busy === 'rm'}
              onClick={() => void remove()}
            >
              Remove<span className="sr-only"> {label.toLowerCase()}</span>
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          hidden
          data-testid={`file-${kind}`}
          accept={TIP_IMAGE_TYPES.join(',')}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void upload(f)
          }}
        />
        {error && (
          <p
            id={errId}
            role="alert"
            className="mt-2 flex gap-1.5 text-[13.5px] leading-snug font-semibold text-danger"
          >
            <Warning size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {error.message}
              {error.hint && <span className="block font-normal text-text-2">{error.hint}</span>}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
