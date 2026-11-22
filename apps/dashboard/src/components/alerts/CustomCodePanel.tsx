import { useId, useMemo, useRef, useState } from 'react'
import { Plus, ShieldCheck, Trash, Warning } from '@phosphor-icons/react'
import {
  KNOWN_VARS,
  MAX_CUSTOM_FIELDS,
  MAX_CUSTOM_HTML,
  MAX_CSS,
  checkCss,
  checkCustomHtml,
  isValidFieldKey,
  type CustomField,
  type CustomFieldKind,
  type CustomFieldValue,
  type Variation,
} from '@ferrocast/api'
import { Button, Field, Input, Select, Switch, Textarea, cx } from '@ferrocast/ui'

const FIELD_KIND_OPTIONS: { value: CustomFieldKind; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'color', label: 'Colour' },
  { value: 'toggle', label: 'Toggle' },
  { value: 'select', label: 'Dropdown' },
]

const STARTER_HTML = `<div class="custom-card">
  <span class="custom-badge">{badge_label}</span>
  <h2 class="custom-title">{name}</h2>
  <p class="custom-body">{message}</p>
</div>`

const STARTER_CSS = `.custom-card {
  padding: 24px 32px;
  border-radius: 18px;
  background: rgba(16, 18, 22, 0.92);
  border: 2px solid var(--field-accent_color, #ffa424);
  color: #f4f6fa;
  text-align: center;
  font-family: system-ui, sans-serif;
}
.custom-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--field-accent_color, #ffa424);
  color: #101216;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}
.custom-title { margin: 10px 0 4px; font-size: 30px; }
.custom-body { margin: 0; opacity: 0.88; font-size: 18px; }`

const STARTER_FIELDS: CustomField[] = [
  { key: 'badge_label', label: 'Badge label', type: 'text', default: 'New alert' },
  { key: 'accent_color', label: 'Accent colour', type: 'color', default: '#ffa424' },
]

function replaceFieldKind(prev: CustomField, kind: CustomFieldKind): CustomField {
  switch (kind) {
    case 'text':
      return { key: prev.key, label: prev.label, type: 'text', default: 'Label' }
    case 'number':
      return { key: prev.key, label: prev.label, type: 'number', default: 12, min: 0, max: 100 }
    case 'color':
      return { key: prev.key, label: prev.label, type: 'color', default: '#ffa424' }
    case 'toggle':
      return { key: prev.key, label: prev.label, type: 'toggle', default: true }
    case 'select':
      return {
        key: prev.key,
        label: prev.label,
        type: 'select',
        default: 'Option A',
        options: ['Option A', 'Option B'],
      }
  }
}

export function CustomCodePanel({
  v,
  onChange,
}: {
  v: Variation
  onChange: (next: Variation) => void
}) {
  const htmlId = useId()
  const cssId = useId()
  const htmlRef = useRef<HTMLTextAreaElement>(null)
  const [selectDrafts, setSelectDrafts] = useState<Record<string, string>>({})
  /** A key being typed that another field already owns; the schema keeps the old key. */
  const [keyDrafts, setKeyDrafts] = useState<Record<number, string>>({})

  const customEnabled = v.custom_enabled === true
  const html = v.html ?? ''
  const css = v.css ?? ''
  const fields = useMemo(() => v.fields ?? [], [v.fields])
  const values = useMemo(() => v.field_values ?? {}, [v.field_values])

  const cssError = checkCss('Custom CSS', css)
  const htmlTooLong = Array.from(html).length > MAX_CUSTOM_HTML
  // The engine's own rules for custom HTML (code, navigation, fetches, token places).
  const badHtml = useMemo(
    () =>
      customEnabled
        ? (checkCustomHtml(
            '',
            html,
            fields.map((f) => f.key),
          )?.replace(/^Variation '[^']*': /, '') ?? null)
        : null,
    [customEnabled, html, fields],
  )

  const toggleEnabled = (on: boolean) => {
    if (on && !html.trim() && fields.length === 0) {
      onChange({
        ...v,
        custom_enabled: true,
        html: STARTER_HTML,
        css: css.trim() ? css : STARTER_CSS,
        fields: STARTER_FIELDS,
        field_values: { badge_label: 'New alert', accent_color: '#ffa424' },
      })
      return
    }
    onChange({ ...v, custom_enabled: on })
  }

  const addField = () => {
    if (fields.length >= MAX_CUSTOM_FIELDS) return
    let idx = fields.length + 1
    let key = `custom_${idx}`
    const existing = new Set(fields.map((f) => f.key))
    while (existing.has(key) || (KNOWN_VARS as readonly string[]).includes(key)) {
      idx += 1
      key = `custom_${idx}`
    }
    const nextField: CustomField = {
      key,
      label: `Custom ${idx}`,
      type: 'text',
      default: 'Value',
    }
    onChange({
      ...v,
      fields: [...fields, nextField],
      field_values: { ...values, [key]: nextField.default },
    })
  }

  const updateField = (idx: number, patch: Partial<CustomField>) => {
    const prev = fields[idx]
    if (!prev) return
    const updated: CustomField = { ...prev, ...patch }
    const nextFields = fields.map((f, i) => (i === idx ? updated : f))
    const nextValues = { ...values }
    const nextKey = patch.key
    if (nextKey !== undefined && fields.some((f, i) => i !== idx && f.key === nextKey)) {
      // Taken: keep what was typed on screen, but never move the other field's value.
      setKeyDrafts((d) => ({ ...d, [idx]: nextKey }))
      return
    }
    if (nextKey !== undefined) {
      setKeyDrafts((d) => {
        if (!(idx in d)) return d
        const copy = { ...d }
        delete copy[idx]
        return copy
      })
    }
    if (nextKey !== undefined && nextKey !== prev.key) {
      const oldVal = nextValues[prev.key]
      delete nextValues[prev.key]
      if (oldVal !== undefined) nextValues[nextKey] = oldVal
      setSelectDrafts((d) => {
        if (!(prev.key in d)) return d
        const copy = { ...d }
        copy[nextKey] = copy[prev.key]!
        delete copy[prev.key]
        return copy
      })
    }
    if (patch.type !== undefined && patch.type !== prev.type) {
      nextValues[updated.key] = updated.default
    }
    onChange({ ...v, fields: nextFields, field_values: nextValues })
  }

  const removeField = (idx: number) => {
    const prev = fields[idx]
    if (!prev) return
    const nextValues = { ...values }
    delete nextValues[prev.key]
    setKeyDrafts({})
    setSelectDrafts((d) => {
      if (!(prev.key in d)) return d
      const copy = { ...d }
      delete copy[prev.key]
      return copy
    })
    onChange({
      ...v,
      fields: fields.filter((_, i) => i !== idx),
      field_values: nextValues,
    })
  }

  const setFieldValue = (key: string, val: CustomFieldValue) => {
    onChange({ ...v, field_values: { ...values, [key]: val } })
  }

  const insertIntoHtml = (tok: string) => {
    const el = htmlRef.current
    const caller = typeof document !== 'undefined' ? document.activeElement : null
    const start = el?.selectionStart ?? html.length
    const end = el?.selectionEnd ?? start
    const snippet = `{${tok}}`
    onChange({ ...v, html: html.slice(0, start) + snippet + html.slice(end) })
    requestAnimationFrame(() => {
      if (!htmlRef.current) return
      const active = document.activeElement
      if (active && active !== caller && active !== document.body && active !== htmlRef.current) {
        return
      }
      htmlRef.current.focus()
      htmlRef.current.setSelectionRange(start + snippet.length, start + snippet.length)
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-control border border-line bg-surface-2/50 p-3.5">
      <Switch
        checked={customEnabled}
        onChange={toggleEnabled}
        label="Use custom HTML & CSS"
        description="HTML and CSS only, drawn in an isolated frame. No scripts, no links out."
      />

      {customEnabled && (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex items-start gap-2 rounded-control border border-arc/30 bg-arc-soft/30 px-3 py-2 text-[12.5px] font-medium text-text-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-arc" aria-hidden="true" />
            <span>
              HTML and CSS only: scripts, forms, frames and event handlers are removed. Pictures
              load only as small data: images or from the allowed picture hosts. Viewer names and
              messages are always shown as plain text.
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[14px] font-bold text-text">Field schema</h3>
                <p className="text-[12.5px] text-text-3">
                  Reference as <code className="font-mono">{'{key}'}</code> in HTML or{' '}
                  <code className="font-mono">--field-key</code> in CSS.
                </p>
              </div>
              <Button
                size="sm"
                icon={<Plus size={14} />}
                disabled={fields.length >= MAX_CUSTOM_FIELDS}
                onClick={addField}
              >
                Add field
              </Button>
            </div>

            {fields.length === 0 ? (
              <p className="rounded-control border border-dashed border-line px-3 py-2.5 text-[13px] text-text-3">
                No schema fields yet. Add fields to give streamers clean controls for colours,
                badges, or numbers.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {fields.map((f, idx) => {
                  const keyValid = isValidFieldKey(f.key)
                  const currentVal = Object.prototype.hasOwnProperty.call(values, f.key)
                    ? (values[f.key] as CustomFieldValue)
                    : f.default

                  return (
                    <div
                      key={idx}
                      data-schema-field={f.key}
                      className="flex flex-col gap-2.5 rounded-control border border-line bg-surface-1 p-3"
                    >
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`fk-${idx}`}
                            className="text-[12px] font-semibold text-text-2"
                          >
                            Key
                          </label>
                          <Input
                            id={`fk-${idx}`}
                            value={keyDrafts[idx] ?? f.key}
                            aria-invalid={!keyValid || keyDrafts[idx] !== undefined || undefined}
                            onChange={(e) => updateField(idx, { key: e.target.value })}
                            className="font-mono text-[13px]"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`fl-${idx}`}
                            className="text-[12px] font-semibold text-text-2"
                          >
                            Label
                          </label>
                          <Input
                            id={`fl-${idx}`}
                            value={f.label}
                            maxLength={80}
                            onChange={(e) => updateField(idx, { label: e.target.value })}
                          />
                        </div>
                        <div className="flex items-end gap-1.5">
                          <Field label="Type" className="min-w-0 flex-1">
                            {(p) => (
                              <Select
                                {...p}
                                value={f.type}
                                onChange={(e) => {
                                  const k = e.target.value as CustomFieldKind
                                  const nextFields = fields.map((item, j) =>
                                    j === idx ? replaceFieldKind(item, k) : item,
                                  )
                                  const nextValues = {
                                    ...values,
                                    [f.key]: nextFields[idx]!.default,
                                  }
                                  // The old options text no longer describes this field.
                                  setSelectDrafts((d) => {
                                    if (!(f.key in d)) return d
                                    const copy = { ...d }
                                    delete copy[f.key]
                                    return copy
                                  })
                                  onChange({ ...v, fields: nextFields, field_values: nextValues })
                                }}
                              >
                                {FIELD_KIND_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </Field>
                          <button
                            type="button"
                            aria-label={`Remove field ${f.label || f.key}`}
                            onClick={() => removeField(idx)}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line text-text-3 hover:border-danger/60 hover:text-danger focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                          >
                            <Trash size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {keyDrafts[idx] !== undefined && (
                        <p className="text-[12px] font-medium text-danger" role="alert">
                          Another field already uses the key “{keyDrafts[idx]}”. Pick a different
                          one; this field keeps “{f.key}” until you do.
                        </p>
                      )}
                      {!keyValid && (
                        <p className="text-[12px] font-medium text-danger" role="alert">
                          Keys use lowercase letters, numbers, and underscores, and cannot match
                          built-in tokens.
                        </p>
                      )}

                      {f.type === 'select' && (
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`fo-${idx}`}
                            className="text-[12px] font-semibold text-text-2"
                          >
                            Options (comma separated)
                          </label>
                          <Input
                            id={`fo-${idx}`}
                            value={selectDrafts[f.key] ?? (f.options ?? []).join(', ')}
                            onChange={(e) => {
                              const raw = e.target.value
                              setSelectDrafts((d) => ({ ...d, [f.key]: raw }))
                              const parsed = raw
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean)
                              if (parsed.length > 0) {
                                const nextDefault = parsed.includes(String(f.default))
                                  ? f.default
                                  : parsed[0]!
                                const nextFields = fields.map((item, j) =>
                                  j === idx
                                    ? { ...item, options: parsed, default: nextDefault }
                                    : item,
                                )
                                const nextValues = { ...values }
                                if (!parsed.includes(String(currentVal))) {
                                  nextValues[f.key] = parsed[0]!
                                }
                                onChange({ ...v, fields: nextFields, field_values: nextValues })
                              }
                            }}
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <label
                            htmlFor={`fv-${idx}`}
                            className="text-[12px] font-semibold text-text-2"
                          >
                            Value
                          </label>
                          {f.type === 'toggle' ? (
                            <input
                              id={`fv-${idx}`}
                              type="checkbox"
                              checked={Boolean(currentVal)}
                              onChange={(e) => {
                                setFieldValue(f.key, e.target.checked)
                              }}
                              className="h-4 w-4 accent-accent"
                            />
                          ) : f.type === 'color' ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                aria-label={`${f.label || f.key} colour picker`}
                                value={
                                  /^#[0-9a-fA-F]{6}$/.test(String(currentVal))
                                    ? String(currentVal)
                                    : '#ffa424'
                                }
                                onChange={(e) => setFieldValue(f.key, e.target.value)}
                                className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent p-0.5"
                              />
                              <Input
                                id={`fv-${idx}`}
                                value={String(currentVal)}
                                onChange={(e) => setFieldValue(f.key, e.target.value)}
                                className="w-28 font-mono text-[12.5px]"
                              />
                            </div>
                          ) : f.type === 'select' ? (
                            <Select
                              id={`fv-${idx}`}
                              value={String(currentVal)}
                              onChange={(e) => setFieldValue(f.key, e.target.value)}
                            >
                              {(f.options ?? []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </Select>
                          ) : f.type === 'number' ? (
                            <Input
                              id={`fv-${idx}`}
                              type="number"
                              value={Number(currentVal)}
                              min={f.min}
                              max={f.max}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                if (Number.isFinite(n)) setFieldValue(f.key, n)
                              }}
                              className="w-28 font-mono text-[13px]"
                            />
                          ) : (
                            <Input
                              id={`fv-${idx}`}
                              value={String(currentVal)}
                              onChange={(e) => setFieldValue(f.key, e.target.value)}
                              className="min-w-0 flex-1"
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => insertIntoHtml(f.key)}
                          className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-0.5 font-mono text-[11.5px] font-semibold text-text hover:border-arc focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                        >
                          Insert {`{${f.key}}`}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={htmlId} className="fc-label">
                Custom HTML
              </label>
              <span className="font-mono text-[12px] text-text-3 tabular-nums">
                {Array.from(html).length}/{MAX_CUSTOM_HTML}
              </span>
            </div>
            <Textarea
              id={htmlId}
              ref={htmlRef}
              rows={6}
              spellCheck={false}
              value={html}
              onChange={(e) => onChange({ ...v, html: e.target.value })}
              className={cx('font-mono text-[13px]', (htmlTooLong || badHtml) && 'border-danger')}
              placeholder={STARTER_HTML}
            />
            {htmlTooLong && (
              <p className="text-[12.5px] font-medium text-danger" role="alert">
                Custom HTML can be up to {MAX_CUSTOM_HTML} characters.
              </p>
            )}
            {badHtml && (
              <p
                className="flex items-center gap-1.5 text-[12.5px] font-medium text-danger"
                role="alert"
              >
                <Warning size={14} aria-hidden="true" />
                <span>{badHtml}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={cssId} className="fc-label">
                Custom CSS
              </label>
              <span className="font-mono text-[12px] text-text-3 tabular-nums">
                {Array.from(css).length}/{MAX_CSS}
              </span>
            </div>
            <Textarea
              id={cssId}
              rows={5}
              spellCheck={false}
              value={css}
              onChange={(e) => onChange({ ...v, css: e.target.value })}
              className={cx('font-mono text-[13px]', cssError && 'border-danger')}
              placeholder={STARTER_CSS}
            />
            {cssError && (
              <p
                className="flex items-center gap-1.5 text-[12.5px] font-medium text-danger"
                role="alert"
              >
                <Warning size={14} aria-hidden="true" />
                <span>{cssError}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
