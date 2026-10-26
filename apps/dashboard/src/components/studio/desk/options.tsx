// One generic settings form for any OBS source or filter: every option OBS describes, drawn
// from its type (switch, list, number, colour, font, text, file). Used where a kind has no
// purpose-built panel, and under "All settings" where it has one.

import { useState } from 'react'
import { FolderOpen, Plus, Trash } from '@phosphor-icons/react'
import { type EngineOption, type EngineSettings } from '@ferrocast/api'
import { Button, Field, IconButton, Input, Select, Switch, Textarea, cx } from '@ferrocast/ui'
import { inDesktopApp } from '../../../lib/external'
import { useAction } from '../../../lib/hooks'
import { useEngine } from './common'

interface FormProps {
  opts: EngineOption[]
  values: EngineSettings
  onChange?: ((key: string, value: unknown) => void) | undefined
  disabled?: boolean | undefined
}

/** One generic form for any kind: every option OBS describes, drawn from its type. */
export function OptionsForm({ opts, values, onChange, disabled }: FormProps) {
  // Files come first: they're what a picture, video or slideshow needs before anything else.
  const isFile = (o: EngineOption) =>
    o.kind === 'path' || (o.kind === 'editable_list' && o.path === 'files')
  const shown = opts.filter((o) => o.visible).sort((a, b) => Number(isFile(b)) - Number(isFile(a)))
  if (shown.length === 0) return <p className="text-[14px] text-text-3">No options.</p>
  return (
    <div className="flex flex-col gap-3">
      {shown.map((o) => (
        <OptionField key={o.key} o={o} values={values} onChange={onChange} disabled={disabled} />
      ))}
    </div>
  )
}

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

function OptionField({
  o,
  values,
  onChange,
  disabled,
}: { o: EngineOption } & Omit<FormProps, 'opts'>) {
  const label = o.label || o.key
  const hint = o.help || undefined
  const off = disabled || !onChange || !o.enabled
  // A key OBS left unset reads as zero, false or "" there (obs_data_get_*): show it the same.
  const raw = values[o.key]
  const v =
    raw !== undefined
      ? raw
      : o.kind === 'int' || o.kind === 'float'
        ? 0
        : o.kind === 'list'
          ? o.values.find((x) => x === 0 || x === '' || x === false)
          : undefined
  const set = (next: unknown) => onChange?.(o.key, next)
  switch (o.kind) {
    case 'bool':
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
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <Select
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
        </Field>
      )
    }
    case 'group': {
      // A checkable group is off until switched on; its options wait until then.
      const on = !o.checkable || v === true
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
        <Button type="button" variant="secondary" disabled className="self-start">
          {label}
        </Button>
      )
    case 'int':
    case 'float': {
      const num = typeof v === 'number' ? v : null
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
            className={o.slider ? 'w-24! text-right tabular-nums' : 'tabular-nums'}
            onChange={(e) => {
              const n = e.target.valueAsNumber
              if (Number.isFinite(n)) set(round(n))
            }}
          />
          {unit && <span className="shrink-0 text-[14px] text-text-3">{unit}</span>}
        </div>
      )
      if (!o.slider || o.min === null || o.max === null)
        return (
          <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
            {box}
          </Field>
        )
      // OBS shows it as a slider: a slider to drag, the exact number beside it.
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <div className="flex items-center gap-3">
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
        </Field>
      )
    }
    case 'color':
    case 'color_alpha':
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <Input
              {...p}
              type="color"
              disabled={off}
              value={toHex(v)}
              onChange={(e) => set(fromHex(e.target.value, v))}
              className="w-20! p-1"
            />
          )}
        </Field>
      )
    case 'font': {
      const font: Font = v && typeof v === 'object' ? (v as Font) : {}
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
      return <PathField o={o} label={label} hint={hint} value={v} off={off} set={set} />
    case 'editable_list':
      return <ListField o={o} label={label} hint={hint} value={v} off={off} set={set} />
    case 'text': {
      const text = typeof v === 'string' ? v : ''
      // OBS's text kinds: a box for several lines (Custom CSS, a text source), a hidden
      // password, read-only info, or one line.
      if (o.text_type === 'info') {
        return (
          <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
            {(p) => (
              <p id={p.id} className="m-0 text-[14px] whitespace-pre-wrap text-text-2">
                {text}
              </p>
            )}
          </Field>
        )
      }
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) =>
            o.text_type === 'multiline' ? (
              <Textarea
                {...p}
                disabled={off}
                value={text}
                rows={o.monospace ? 6 : 4}
                autoComplete="off"
                spellCheck={!o.monospace}
                className={cx(
                  'min-h-24 resize-y',
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
function PathField({ o, label, hint, value, off, set }: FieldProps) {
  const api = useEngine()
  const { busy, run } = useAction()
  const kind = o.path === 'save' || o.path === 'folder' ? o.path : 'file'
  const browse = async () => {
    const r = await run('browse', () => api.pickFile(kind, o.filter ?? ''))
    if (r?.path) set(r.path)
  }
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
function ListField({ o, label, hint, value, off, set }: FieldProps) {
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
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[14px] font-semibold text-text">{label}</legend>
      {hint && <p className="m-0 text-[13.5px] text-text-3">{hint}</p>}
      {list.length > 0 ? (
        <ol className="m-0 flex list-none flex-col divide-y divide-line rounded-control border border-line p-0">
          {list.map((e, i) => (
            <li key={`${i}-${e.value}`} className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
              <span className="w-5 shrink-0 text-right text-[13px] font-semibold text-text-3 tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium" title={e.value}>
                {name(e.value)}
              </span>
              <IconButton
                label={`Remove ${name(e.value)}`}
                size="sm"
                disabled={off}
                onClick={() => set(list.filter((_, j) => j !== i))}
              >
                <Trash size={15} />
              </IconButton>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 rounded-control border border-dashed border-line px-3 py-4 text-center text-[14px] font-medium text-text-3">
          {files ? 'No files yet.' : 'Nothing yet.'}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Input
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
            disabled={off}
            busy={busy === 'browse'}
            onClick={() => void browse()}
            className="shrink-0"
          >
            <FolderOpen size={16} weight="bold" /> Add files
          </Button>
        )}
      </div>
    </fieldset>
  )
}
