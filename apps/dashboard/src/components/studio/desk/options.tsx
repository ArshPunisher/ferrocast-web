// One generic settings form for any OBS source or filter: every option OBS describes, drawn
// from its type (switch, list, number, colour, font, text, file). Used where a kind has no
// purpose-built panel, and under "All settings" where it has one.

import { type EngineOption, type EngineSettings } from '@ferrocast/api'
import { Button, Field, Input, Select, Switch } from '@ferrocast/ui'

interface FormProps {
  opts: EngineOption[]
  values: EngineSettings
  onChange?: ((key: string, value: unknown) => void) | undefined
  disabled?: boolean | undefined
}

/** One generic form for any kind: every option OBS describes, drawn from its type. */
export function OptionsForm({ opts, values, onChange, disabled }: FormProps) {
  const shown = opts.filter((o) => o.visible)
  if (shown.length === 0) return <p className="text-[13px] text-text-3">No options.</p>
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
  const v = values[o.key]
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
    case 'group':
      return (
        <fieldset className="flex flex-col gap-3 rounded-control border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold">{label}</legend>
          <OptionsForm opts={o.group} values={values} onChange={onChange} disabled={disabled} />
        </fieldset>
      )
    case 'button':
      return (
        <Button type="button" variant="secondary" disabled className="self-start">
          {label}
        </Button>
      )
    case 'int':
    case 'float':
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode={o.kind === 'int' ? 'numeric' : 'decimal'}
              disabled={off}
              value={typeof v === 'number' ? v : ''}
              min={o.min ?? undefined}
              max={o.max ?? undefined}
              step={o.step ?? undefined}
              onChange={(e) => {
                const n = e.target.valueAsNumber
                if (Number.isFinite(n)) set(o.kind === 'int' ? Math.round(n) : n)
              }}
            />
          )}
        </Field>
      )
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
    case 'text':
    case 'path':
      return (
        <Field label={label} {...(hint ? { hint } : {})} hintVisible={false}>
          {(p) => (
            <Input
              {...p}
              disabled={off}
              value={typeof v === 'string' ? v : ''}
              autoComplete="off"
              spellCheck={o.kind === 'text'}
              placeholder={o.kind === 'path' ? 'A file on this computer' : undefined}
              onChange={(e) => set(e.target.value)}
            />
          )}
        </Field>
      )
    default:
      // editable_list, frame_rate and the rest: shown, edited in a later step.
      return (
        <Field label={label} hint="Not editable here yet." hintVisible={false}>
          {(p) => <Input {...p} disabled value={v === undefined ? '' : JSON.stringify(v)} />}
        </Field>
      )
  }
}
