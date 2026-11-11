// One generic settings form for any OBS source or filter: every option OBS describes, drawn
// from its type (switch, list, number, colour, font, text, file). Used where a kind has no
// purpose-built panel, and under "All settings" where it has one.

import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import { FolderOpen, Plus, Trash } from '@phosphor-icons/react'
import { type EngineOption, type EngineSettings } from '@ferrocast/api'
import {
  Button,
  Field,
  IconButton,
  InfoTip,
  Input,
  Select,
  Switch,
  Textarea,
  cx,
} from '@ferrocast/ui'
import { inDesktopApp } from '../../../lib/external'
import { useAction } from '../../../lib/hooks'
import { useEngine } from './common'
import { Seg } from './drawer-kit'

interface FormProps {
  opts: EngineOption[]
  /** The kind's whole form, when `opts` is only part of it (a "More" section): what decides
   *  whether an option shows can sit in the other part. */
  all?: EngineOption[] | undefined
  values: EngineSettings
  onChange?: ((key: string, value: unknown) => void) | undefined
  disabled?: boolean | undefined
  /** One line per setting (label, then its control): for the narrow source panel. */
  compact?: boolean | undefined
}

/**
 * How compact rows are drawn (owner's pick, source drawer design A, 10 Nov): `lined` in the
 * drawer's Settings tab, each setting one 36 px line across the drawer with a line under it;
 * `plain` inside an opened filter's grey box.
 */
export const RowLook = createContext<'lined' | 'inset' | 'plain'>('plain')

/** In lined rows, what isn't one line (a box of text, a list, a note) gets its own padded
 *  block across the drawer, never a stretched row. */
function Block({ children }: { children: ReactNode }) {
  const look = useContext(RowLook)
  if (look === 'plain') return children
  return (
    <div data-row className={cx('border-b border-line py-2.5', look === 'lined' && 'px-3')}>
      {children}
    </div>
  )
}

/** One generic form for any kind: every option OBS describes, drawn from its type. */
export function OptionsForm({ opts, all, values, onChange, disabled, compact }: FormProps) {
  // Files come first: they're what a picture, video or slideshow needs before anything else.
  const isFile = (o: EngineOption) =>
    o.kind === 'path' || (o.kind === 'editable_list' && o.path === 'files')
  const applies = (o: EngineOption) => {
    const w = o.shown_when
    if (!w) return true
    const by = (all ?? opts).find((x) => x.key === w.key)
    return !by || w.values.includes(valueOf(by, values) as string | number | boolean)
  }
  const lined = useContext(RowLook) !== 'plain'
  const shown = opts
    .filter((o) => o.visible && applies(o))
    .sort((a, b) => Number(isFile(b)) - Number(isFile(a)))
  // Part of a bigger form (a section of the drawer) with nothing showing now: nothing at all.
  if (shown.length === 0 && all) return null
  if (shown.length === 0)
    return (
      <Block>
        <p className="m-0 text-[13px] text-text-3">No options.</p>
      </Block>
    )
  return (
    <div className={cx('flex flex-col', compact ? (lined ? 'gap-0' : 'gap-2') : 'gap-3')}>
      {shown.map((o) => (
        <OptionField
          key={o.key}
          o={o}
          values={values}
          onChange={onChange}
          disabled={disabled}
          compact={compact}
        />
      ))}
    </div>
  )
}

/** An option's value: a key OBS left unset reads as zero, false or "" there (obs_data_get_*),
 *  so it's shown (and decides what else shows) the same. */
export function valueOf(o: EngineOption, values: Record<string, unknown>): unknown {
  const raw = values[o.key]
  if (raw !== undefined) return raw
  if (o.kind === 'int' || o.kind === 'float') return 0
  if (o.kind === 'bool') return false
  if (o.kind === 'list') return o.values.find((x) => x === 0 || x === '' || x === false)
  return undefined
}

/** A slider's number as people read it: a share of its range in percent when OBS gives it no
 *  unit (a key's similarity of 400 of 1000 is 40%; a contrast of -4 to 4 is -100% to +100%),
 *  else the number itself. */
export function shownNumber(o: EngineOption, v: number): number {
  const { min, max } = o
  if (!o.slider || o.suffix || min === null || max === null || max <= min) return v
  if (min < 0 && max > 0) return Math.round((v >= 0 ? v / max : v / -min) * 100)
  return Math.round(((v - min) / (max - min)) * 100)
}

/** Back from what `shownNumber` shows to OBS's value, on the option's own steps. */
export function storedNumber(o: EngineOption, shown: number): number {
  const { min, max } = o
  let v = shown
  if (o.slider && !o.suffix && min !== null && max !== null && max > min) {
    v =
      min < 0 && max > 0
        ? shown >= 0
          ? (Math.min(shown, 100) / 100) * max
          : (Math.max(shown, -100) / 100) * -min
        : min + (Math.min(Math.max(shown, 0), 100) / 100) * (max - min)
  }
  if (min !== null) v = Math.max(min, v)
  if (max !== null) v = Math.min(max, v)
  const step = o.step ?? (o.kind === 'int' ? 1 : 0)
  if (o.kind === 'int') return Math.round(v)
  return step > 0 ? Math.round(v / step) * step : v
}

/** A number in the compact panel: a thin slider (when OBS draws one) and a small box with the
 *  value, typed into without arrows; it's sent when you leave the box or press Enter. */
function CompactNumber({
  id,
  o,
  label,
  value,
  off,
  set,
}: {
  id?: string
  o: EngineOption
  label: string
  value: number | null
  off: boolean
  set: (v: unknown) => void
}) {
  const percent = o.slider && !o.suffix && o.min !== null && o.max !== null
  const unit = percent ? '%' : o.suffix.trim()
  const shown = value === null ? null : shownNumber(o, value)
  const text =
    shown === null ? '' : `${percent && shown > 0 && (o.min ?? 0) < 0 ? '+' : ''}${shown}`
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft.replace(/[^0-9.+-]/g, ''))
    if (draft.trim() !== '' && Number.isFinite(n)) set(storedNumber(o, n))
    setDraft(null)
  }
  const slider = o.slider && o.min !== null && o.max !== null
  // Filled from zero: on a -/+ range (contrast, saturation) from where 0 sits to the thumb.
  const at = (n: number) =>
    o.max !== null && o.min !== null && o.max > o.min ? ((n - o.min) / (o.max - o.min)) * 100 : 0
  const zero = o.min !== null && o.min < 0 && o.max !== null && o.max > 0 ? at(0) : 0
  const here = value === null ? zero : at(value)
  const [from, fill] = [`${Math.min(zero, here)}%`, `${Math.max(zero, here)}%`]
  return (
    <>
      {slider && (
        <input
          type="range"
          aria-label={label}
          aria-valuetext={text ? `${text}${unit ? ` ${unit}` : ''}` : undefined}
          disabled={off}
          min={o.min ?? 0}
          max={o.max ?? 100}
          step={o.step ?? (o.kind === 'int' ? 1 : 'any')}
          value={value ?? o.min ?? 0}
          onChange={(e) => {
            const n = Number(e.target.value)
            set(o.kind === 'int' ? Math.round(n) : n)
          }}
          className="fc-slim min-w-0 flex-1"
          style={{ ['--from' as string]: from, ['--fill' as string]: fill }}
        />
      )}
      <span
        className={cx(
          'flex h-7 shrink-0 items-center rounded-[7px] bg-surface-3 pr-1.5 focus-within:shadow-[var(--fc-focus)]',
          slider ? 'w-[3.75rem]' : 'w-24',
        )}
      >
        <input
          id={id}
          type="text"
          inputMode={o.kind === 'int' && !percent ? 'numeric' : 'decimal'}
          autoComplete="off"
          spellCheck={false}
          disabled={off}
          aria-label={slider ? `${label}, exact` : undefined}
          value={draft ?? text}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setDraft(null)
          }}
          className="h-full w-full min-w-0 bg-transparent pl-1.5 text-right font-mono text-[12.5px] text-text tabular-nums outline-none"
        />
        {unit && <span className="pl-0.5 text-[11px] text-text-3">{unit}</span>}
      </span>
    </>
  )
}

type WrapProps = {
  label: string
  hint: string | undefined
  children: (p: { id?: string; 'aria-describedby'?: string }) => ReactNode
}

/** The label above its control (the roomy form). */
function FieldWrap({ label, hint, children }: WrapProps) {
  return (
    <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
      {children}
    </Field>
  )
}

/** The label beside its control (the compact form). */
function CompactWrap({ label, hint, children }: WrapProps) {
  return (
    <Row label={label} hint={hint}>
      {children}
    </Row>
  )
}

/** Quick colours beside a colour's own picker: white, black, and the brand's three. */
const SWATCHES = [
  { hex: '#ffffff', name: 'White' },
  { hex: '#000000', name: 'Black' },
  { hex: '#ffa424', name: 'Molten' },
  { hex: '#33d4ff', name: 'Arc' },
  { hex: '#3ddc84', name: 'Green' },
]

/** OBS keeps colours as 0xAABBGGRR. */
export function toHex(v: unknown): string {
  const n = typeof v === 'number' ? v >>> 0 : 0
  const rgb = [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff]
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

export function fromHex(hex: string, old: unknown): number {
  const alpha = typeof old === 'number' ? (old >>> 24) & 0xff : 0xff
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return ((alpha << 24) | (b << 16) | (g << 8) | r) >>> 0
}

type Font = { face?: string; size?: number; style?: string; flags?: number }

/** A compact setting: its label on the left, its control on the same line. */
function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint: string | undefined
  children: (p: { id: string }) => ReactNode
}) {
  const id = useId()
  const look = useContext(RowLook)
  // The label never takes a second line (owner, 9 Nov): a long one ends in "…", whole on hover.
  // Lined: exactly one 36 px line, whatever is in it (owner, 10 Nov).
  return (
    <div
      data-row
      className={cx(
        'grid items-center gap-x-2.5',
        look === 'lined' &&
          'h-9 grid-cols-[7.75rem_minmax(0,1fr)] border-b border-line pr-2.5 pl-3',
        // Inside an opened filter: the same lines, from the filter's name across.
        look === 'inset' && 'h-9 grid-cols-[7.5rem_minmax(0,1fr)] border-b border-line',
        look === 'plain' && 'min-h-8 grid-cols-[6.5rem_minmax(0,1fr)]',
      )}
    >
      <span className="flex min-w-0 items-center gap-1">
        <label
          htmlFor={id}
          title={label}
          className="min-w-0 truncate text-[12.5px] font-semibold whitespace-nowrap text-text-2"
        >
          {label}
        </label>
        {hint && <InfoTip label={`About ${label.toLowerCase()}`}>{hint}</InfoTip>}
      </span>
      <div className="flex min-w-0 items-center gap-2">{children({ id })}</div>
    </div>
  )
}

function OptionField({
  o,
  values,
  onChange,
  disabled,
  compact,
}: { o: EngineOption } & Omit<FormProps, 'opts' | 'all'>) {
  // OBS's own wording names OBS where it means this app (macOS Screen Capture's "Hide OBS
  // from capture" leaves out the app the plugin runs in: here, Ferrocast's own windows).
  const label = (o.label || o.key).replace(/\bOBS\b(?= from capture)/, 'Ferrocast')
  const hint = o.help || undefined
  const off = disabled || !onChange || !o.enabled
  const v = valueOf(o, values)
  const set = (next: unknown) => onChange?.(o.key, next)
  switch (o.kind) {
    case 'bool':
      if (compact)
        return (
          <Row label={label} hint={hint}>
            {(p) => (
              <span className="ml-auto">
                <Switch
                  id={p.id}
                  label={label}
                  hideLabel
                  checked={v === true}
                  onChange={set}
                  disabled={off}
                />
              </span>
            )}
          </Row>
        )
      return (
        <Switch
          label={label}
          {...(hint ? { description: hint } : {})}
          checked={v === true}
          onChange={set}
          disabled={off}
        />
      )
    case 'list': {
      const at = o.values.findIndex((x) => x === v)
      // A few short choices: a segmented choice on its line, as in the design (Count: For a
      // set time / Until a time).
      if (
        compact &&
        o.choices.length >= 2 &&
        o.choices.length <= 4 &&
        o.choices.every((c) => c.length <= 16)
      )
        return (
          <Row label={label} hint={hint}>
            {() => (
              <Seg
                label={label}
                value={at < 0 ? null : at}
                disabled={off}
                options={o.choices.map((c, i) => ({ value: i, label: c, title: c }))}
                onChange={(i) => set(o.values[i])}
              />
            )}
          </Row>
        )
      const Wrap = compact ? CompactWrap : FieldWrap
      return (
        <Wrap label={label} hint={hint}>
          {(p) => (
            <Select
              className={compact ? 'h-7! rounded-[5px]! py-0! pl-2! text-[12.5px]!' : undefined}
              {...p}
              disabled={off}
              value={at < 0 ? '' : String(at)}
              onChange={(e) => set(o.values[Number(e.target.value)])}
            >
              {at < 0 && (
                <option value="">{o.choices.length ? 'Choose' : 'Nothing to choose'}</option>
              )}
              {o.choices.map((c, i) => (
                <option key={`${i}-${c}`} value={String(i)}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Wrap>
      )
    }
    case 'group': {
      // A checkable group is off until switched on; its options wait until then.
      const on = !o.checkable || v === true
      if (compact)
        return (
          <fieldset className="m-0 flex flex-col border-0 p-0">
            <legend className="contents">
              <span className="flex h-[30px] items-center gap-2 border-b border-line bg-surface-2 pr-2.5 pl-3 text-[11px] font-bold tracking-[0.07em] text-text-2 uppercase">
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {o.checkable && (
                  <Switch label={label} hideLabel checked={on} onChange={set} disabled={off} />
                )}
              </span>
            </legend>
            {on && (
              <OptionsForm
                compact
                opts={o.group}
                values={values}
                onChange={onChange}
                disabled={disabled}
              />
            )}
          </fieldset>
        )
      return (
        <fieldset className="flex flex-col gap-3 rounded-control border border-line p-3">
          <legend className="px-1 text-[14px] font-semibold">
            {o.checkable ? (
              <Switch label={label} checked={on} onChange={set} disabled={off} />
            ) : (
              label
            )}
          </legend>
          {on && (
            <OptionsForm opts={o.group} values={values} onChange={onChange} disabled={disabled} />
          )}
        </fieldset>
      )
    }
    case 'button':
      return (
        <Block>
          <Button
            type="button"
            variant="secondary"
            size={compact ? 'xs' : 'md'}
            disabled
            className="self-start"
          >
            {label}
          </Button>
        </Block>
      )
    case 'int':
    case 'float': {
      const num = typeof v === 'number' ? v : null
      if (compact)
        return (
          <Row label={label} hint={hint}>
            {(p) => <CompactNumber {...p} o={o} label={label} value={num} off={off} set={set} />}
          </Row>
        )
      const unit = o.suffix
      const round = (n: number) => (o.kind === 'int' ? Math.round(n) : n)
      const box = (p: { id?: string; 'aria-describedby'?: string }) => (
        <div className="flex items-center gap-2">
          <Input
            {...p}
            type="number"
            inputMode={o.kind === 'int' ? 'numeric' : 'decimal'}
            disabled={off}
            value={num ?? ''}
            min={o.min ?? undefined}
            max={o.max ?? undefined}
            step={o.step ?? undefined}
            className={cx(
              'tabular-nums',
              o.slider && 'w-24! text-right',
              compact && 'h-8! w-[4.5rem]! px-2! text-right text-[13px]!',
            )}
            onChange={(e) => {
              const n = e.target.valueAsNumber
              if (Number.isFinite(n)) set(round(n))
            }}
          />
          {unit && (
            <span className={cx('shrink-0 text-text-3', compact ? 'text-[12.5px]' : 'text-[14px]')}>
              {unit.trim()}
            </span>
          )}
        </div>
      )
      const Wrap = compact ? CompactWrap : FieldWrap
      if (!o.slider || o.min === null || o.max === null)
        return (
          <Wrap label={label} hint={hint}>
            {box}
          </Wrap>
        )
      // OBS shows it as a slider: a slider to drag, the exact number beside it.
      return (
        <Wrap label={label} hint={hint}>
          {(p) => (
            <div className={cx('flex min-w-0 flex-1 items-center', compact ? 'gap-2' : 'gap-3')}>
              <input
                type="range"
                aria-label={label}
                aria-valuetext={num === null ? undefined : `${num}${unit ? ` ${unit}` : ''}`}
                disabled={off}
                min={o.min ?? 0}
                max={o.max ?? 100}
                step={o.step ?? (o.kind === 'int' ? 1 : 'any')}
                value={num ?? o.min ?? 0}
                onChange={(e) => set(round(Number(e.target.value)))}
                className="h-6 min-w-0 flex-1 cursor-pointer accent-[var(--fc-accent)] disabled:opacity-50"
              />
              {box(p)}
            </div>
          )}
        </Wrap>
      )
    }
    case 'color':
    case 'color_alpha': {
      const Wrap = compact ? CompactWrap : FieldWrap
      if (compact)
        return (
          <Row label={label} hint={hint}>
            {(p) => (
              <>
                <Input
                  {...p}
                  type="color"
                  disabled={off}
                  value={toHex(v)}
                  onChange={(e) => set(fromHex(e.target.value, v))}
                  className="h-7! w-10! shrink-0 rounded-[5px]! p-0.5"
                />
                <span role="group" aria-label={`${label}: quick picks`} className="flex gap-1">
                  {SWATCHES.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      aria-label={`${label}: ${c.name}`}
                      aria-pressed={toHex(v) === c.hex}
                      title={c.name}
                      disabled={off}
                      onClick={() => set(fromHex(c.hex, v))}
                      className={cx(
                        'size-[18px] shrink-0 rounded-[4px] border border-line-strong outline-none focus-visible:shadow-[var(--fc-focus)]',
                        toHex(v) === c.hex &&
                          'shadow-[0_0_0_2px_var(--fc-surface-1),0_0_0_3.5px_var(--fc-arc)]',
                      )}
                      style={{ background: c.hex }}
                    />
                  ))}
                </span>
                <span className="ml-auto font-mono text-[12px] text-text-2 uppercase tabular-nums">
                  {toHex(v)}
                </span>
              </>
            )}
          </Row>
        )
      return (
        <Wrap label={label} hint={hint}>
          {(p) => (
            <Input
              {...p}
              type="color"
              disabled={off}
              value={toHex(v)}
              onChange={(e) => set(fromHex(e.target.value, v))}
              className={compact ? 'h-7! w-10! shrink-0 rounded-[5px]! p-0.5' : 'w-20! p-1'}
            />
          )}
        </Wrap>
      )
    }
    case 'font': {
      const font: Font = v && typeof v === 'object' ? (v as Font) : {}
      if (compact)
        return (
          <Row label={label} hint={hint}>
            {(p) => (
              <>
                <Input
                  {...p}
                  disabled={off}
                  value={font.face ?? ''}
                  autoComplete="off"
                  className="h-7! min-w-0 flex-1 rounded-[5px]! px-2! text-[12.5px]!"
                  onChange={(e) => set({ ...font, face: e.target.value })}
                />
                <span role="group" aria-label={`${label}: style`} className="flex shrink-0 gap-0.5">
                  {(
                    [
                      [1, 'B', 'Bold', 'font-bold'],
                      [2, 'I', 'Italic', 'italic'],
                    ] as const
                  ).map(([bit, letter, name, look]) => {
                    const on = ((font.flags ?? 0) & bit) !== 0
                    return (
                      <button
                        key={bit}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${label}: ${name.toLowerCase()}`}
                        title={name}
                        disabled={off}
                        onClick={() => set({ ...font, flags: (font.flags ?? 0) ^ bit })}
                        className={cx(
                          'grid size-7 place-items-center rounded-[5px] border text-[13px] outline-none focus-visible:shadow-[var(--fc-focus)] disabled:opacity-50',
                          look,
                          on
                            ? 'fc-picked border-transparent'
                            : 'border-line bg-surface-2 text-text-2 hover:border-line-strong',
                        )}
                      >
                        {letter}
                      </button>
                    )
                  })}
                </span>
                <Input
                  aria-label={`${label}: size`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  disabled={off}
                  value={font.size ?? ''}
                  className="h-7! w-16! shrink-0 rounded-[5px]! px-2! text-right font-mono text-[12px]! tabular-nums"
                  onChange={(e) => {
                    const n = e.target.valueAsNumber
                    if (Number.isFinite(n) && n > 0) set({ ...font, size: Math.round(n) })
                  }}
                />
              </>
            )}
          </Row>
        )
      return (
        <fieldset className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <legend className="sr-only">{label}</legend>
          <Field label={`${label}: face`}>
            {(p) => (
              <Input
                {...p}
                disabled={off}
                value={font.face ?? ''}
                autoComplete="off"
                onChange={(e) => set({ ...font, face: e.target.value })}
              />
            )}
          </Field>
          <Field label="Size">
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                disabled={off}
                value={font.size ?? ''}
                onChange={(e) => {
                  const n = e.target.valueAsNumber
                  if (Number.isFinite(n) && n > 0) set({ ...font, size: Math.round(n) })
                }}
              />
            )}
          </Field>
        </fieldset>
      )
    }
    case 'path':
      return (
        <PathField
          o={o}
          label={label}
          hint={hint}
          value={v}
          off={off}
          set={set}
          compact={!!compact}
        />
      )
    case 'editable_list':
      return (
        <Block>
          <ListField
            o={o}
            label={label}
            hint={hint}
            value={v}
            off={off}
            set={set}
            compact={!!compact}
          />
        </Block>
      )
    case 'text': {
      const text = typeof v === 'string' ? v : ''
      // OBS's text kinds: a box for several lines (Custom CSS, a text source), a hidden
      // password, read-only info, or one line.
      if (compact && o.text_type !== 'info' && o.text_type !== 'multiline')
        return (
          <Row label={label} hint={hint}>
            {(p) => (
              <Input
                {...p}
                type={o.text_type === 'password' ? 'password' : 'text'}
                disabled={off}
                value={text}
                autoComplete="off"
                spellCheck={o.text_type !== 'password'}
                className="h-7! rounded-[5px]! px-2! text-[12.5px]!"
                onChange={(e) => set(e.target.value)}
              />
            )}
          </Row>
        )
      if (o.text_type === 'info') {
        return (
          <Block>
            <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
              {(p) => (
                <p id={p.id} className="m-0 text-[13px] whitespace-pre-wrap text-text-2">
                  {text}
                </p>
              )}
            </Field>
          </Block>
        )
      }
      return (
        <Block>
          <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
            {(p) =>
              o.text_type === 'multiline' ? (
                <Textarea
                  {...p}
                  disabled={off}
                  value={text}
                  rows={compact ? (o.monospace ? 5 : 3) : o.monospace ? 6 : 4}
                  autoComplete="off"
                  spellCheck={!o.monospace}
                  className={cx(
                    compact ? 'min-h-16 resize-y px-2.5! py-2! text-[13px]!' : 'min-h-24 resize-y',
                    o.monospace && 'font-mono text-[13px] leading-relaxed',
                  )}
                  onChange={(e) => set(e.target.value)}
                />
              ) : (
                <Input
                  {...p}
                  type={o.text_type === 'password' ? 'password' : 'text'}
                  disabled={off}
                  value={text}
                  autoComplete="off"
                  spellCheck={o.text_type !== 'password'}
                  onChange={(e) => set(e.target.value)}
                />
              )
            }
          </Field>
        </Block>
      )
    }
    default:
      // frame_rate and the rest: shown, edited in a later step.
      return (
        <Field label={label} hint="Not editable here yet." hintVisible={false}>
          {(p) => <Input {...p} disabled value={v === undefined ? '' : JSON.stringify(v)} />}
        </Field>
      )
  }
}

interface FieldProps {
  o: EngineOption
  label: string
  hint: string | undefined
  value: unknown
  off: boolean
  set: (v: unknown) => void
}

/** A file or folder: its path, and Browse for the computer's own file dialog (in the app). */
function PathField({
  o,
  label,
  hint,
  value,
  off,
  set,
  compact = false,
}: FieldProps & { compact?: boolean }) {
  const api = useEngine()
  const { busy, run } = useAction()
  const kind = o.path === 'save' || o.path === 'folder' ? o.path : 'file'
  const browse = async () => {
    const r = await run('browse', () => api.pickFile(kind, o.filter ?? ''))
    if (r?.path) set(r.path)
  }
  if (compact)
    return (
      <Row label={label} hint={hint}>
        {(p) => (
          <>
            <Input
              {...p}
              disabled={off}
              value={typeof value === 'string' ? value : ''}
              title={typeof value === 'string' ? value : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder={kind === 'folder' ? 'A folder' : 'A file'}
              className="h-7! min-w-0 flex-1 rounded-[5px]! px-2! font-mono text-[11.5px]!"
              onChange={(e) => set(e.target.value)}
            />
            {inDesktopApp() && (
              <IconButton
                size="xs"
                variant="ghost"
                label={
                  kind === 'folder' ? `Pick a folder for ${label}` : `Pick a file for ${label}`
                }
                disabled={off || busy === 'browse'}
                onClick={() => void browse()}
              >
                <FolderOpen size={15} weight="bold" />
              </IconButton>
            )}
          </>
        )}
      </Row>
    )
  return (
    <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
      {(p) => (
        <div className="flex items-center gap-2">
          <Input
            {...p}
            disabled={off}
            value={typeof value === 'string' ? value : ''}
            autoComplete="off"
            spellCheck={false}
            placeholder={
              kind === 'folder' ? 'A folder on this computer' : 'A file on this computer'
            }
            onChange={(e) => set(e.target.value)}
          />
          {inDesktopApp() && (
            <Button
              type="button"
              variant="secondary"
              disabled={off}
              busy={busy === 'browse'}
              onClick={() => void browse()}
              className="shrink-0"
            >
              <FolderOpen size={16} weight="bold" /> Browse
            </Button>
          )}
        </div>
      )}
    </Field>
  )
}

type Entry = { value: string; hidden?: boolean; selected?: boolean }

/** OBS's editable list (a Slideshow's pictures, a list of words): add, remove, reorder. */
function ListField({
  o,
  label,
  hint,
  value,
  off,
  set,
  compact = false,
}: FieldProps & { compact?: boolean }) {
  const api = useEngine()
  const { busy, run } = useAction()
  const [typed, setTyped] = useState('')
  const list: Entry[] = Array.isArray(value)
    ? value
        .filter((e): e is Entry => !!e && typeof (e as Entry).value === 'string')
        .map((e) => ({ value: e.value, hidden: !!e.hidden, selected: false }))
    : []
  const files = o.path === 'files'
  const add = (vals: string[]) => {
    const fresh = vals.map((v) => v.trim()).filter((v) => v && !list.some((e) => e.value === v))
    if (fresh.length)
      set([...list, ...fresh.map((v) => ({ value: v, hidden: false, selected: false }))])
  }
  const browse = async () => {
    const r = await run('browse', () => api.pickFiles(o.filter ?? ''))
    if (r?.path) add(r.path)
  }
  const name = (v: string) => (files ? (v.split(/[\\/]/).pop() ?? v) : v)
  return (
    <fieldset className={cx('flex flex-col', compact ? 'gap-1.5' : 'gap-2')}>
      <legend
        className={cx(
          'flex items-center gap-1',
          compact
            ? 'mb-1.5 text-[12.5px] font-semibold text-text-2'
            : 'mb-1.5 text-[14px] font-semibold text-text',
        )}
      >
        {label}
        {compact && list.length > 0 && (
          <span className="font-mono text-[10.5px] text-text-3">{list.length}</span>
        )}
        {compact && hint && <InfoTip label={`About ${label.toLowerCase()}`}>{hint}</InfoTip>}
      </legend>
      {!compact && hint && <p className="m-0 text-[13.5px] text-text-3">{hint}</p>}
      {list.length > 0 ? (
        <ol
          className={cx(
            'm-0 flex list-none flex-col divide-y divide-line border border-line p-0',
            compact ? 'rounded-[6px]' : 'rounded-control',
          )}
        >
          {list.map((e, i) => (
            <li
              key={`${i}-${e.value}`}
              className={cx(
                'flex items-center gap-2 pr-1.5',
                compact ? 'h-8 pl-2.5' : 'py-1.5 pl-3',
              )}
            >
              <span
                className={cx(
                  'w-5 shrink-0 text-right font-semibold text-text-3 tabular-nums',
                  compact ? 'font-mono text-[11px]' : 'text-[13px]',
                )}
              >
                {i + 1}
              </span>
              <span
                className={cx(
                  'min-w-0 flex-1 truncate font-medium',
                  compact ? 'text-[12.5px]' : 'text-[14.5px]',
                )}
                title={e.value}
              >
                {name(e.value)}
              </span>
              <IconButton
                label={`Remove ${name(e.value)}`}
                size={compact ? 'xs' : 'sm'}
                disabled={off}
                onClick={() => set(list.filter((_, j) => j !== i))}
              >
                <Trash size={15} />
              </IconButton>
            </li>
          ))}
        </ol>
      ) : (
        <p
          className={cx(
            'm-0 border border-dashed border-line text-center font-medium text-text-3',
            compact
              ? 'rounded-[6px] px-3 py-2.5 text-[12.5px]'
              : 'rounded-control px-3 py-4 text-[14px]',
          )}
        >
          {files ? 'No files yet.' : 'Nothing yet.'}
        </p>
      )}
      <div className={cx('flex items-center', compact ? 'gap-1.5' : 'gap-2')}>
        <Input
          className={compact ? 'h-7! rounded-[5px]! px-2! text-[12.5px]!' : undefined}
          aria-label={files ? `Add a file path or address to ${label}` : `Add to ${label}`}
          disabled={off}
          value={typed}
          autoComplete="off"
          spellCheck={!files}
          placeholder={files ? 'Paste a path' : 'Type and press Enter'}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add([typed])
              setTyped('')
            }
          }}
        />
        <IconButton
          label="Add"
          size={compact ? 'xs' : 'md'}
          disabled={off || !typed.trim()}
          onClick={() => {
            add([typed])
            setTyped('')
          }}
        >
          <Plus size={16} weight="bold" />
        </IconButton>
        {files && inDesktopApp() && (
          <Button
            type="button"
            variant="secondary"
            size={compact ? 'xs' : 'md'}
            disabled={off}
            busy={busy === 'browse'}
            onClick={() => void browse()}
            className="shrink-0"
          >
            <FolderOpen size={compact ? 14 : 16} weight="bold" /> Add files
          </Button>
        )}
      </div>
    </fieldset>
  )
}
