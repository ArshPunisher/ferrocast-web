import { useId, useMemo, useRef, useState } from 'react'
import { BracketsCurly, Plus, Warning, X } from '@phosphor-icons/react'
import { KNOWN_VARS, checkTemplate } from '@ferrocast/api'
import { Input, PopoverSurface, Textarea, cx } from '@ferrocast/ui'

const TOKEN_LABELS: Record<string, string> = {
  name: 'Viewer name',
  user: 'Username',
  platform: 'Platform',
  amount: 'Amount',
  currency: 'Currency',
  message: 'Message',
  months: 'Months',
  months_text: 'Months text',
  tier: 'Tier',
  gifter: 'Gifter',
  count: 'Gift count',
  count_text: 'Gift count text',
  value: 'Bits / KICKs',
  unit: 'Unit',
  viewers: 'Raid viewers',
  viewers_text: 'Viewers text',
  reward: 'Reward name',
  cost: 'Reward cost',
}

interface ParsedToken {
  raw: string
  key: string
  start: number
  end: number
  valid: boolean
}

function scanTokens(text: string, allowed: Set<string>): ParsedToken[] {
  const out: ParsedToken[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    if (text[i + 1] === '{') {
      i += 1
      continue
    }
    const end = text.indexOf('}', i + 1)
    if (end === -1) break
    const raw = text.slice(i, end + 1)
    const inner = text.slice(i + 1, end)
    const key = inner.split('|')[0] ?? ''
    if (key.length > 0 && /^[A-Za-z0-9_:]+$/.test(key)) {
      out.push({ raw, key, start: i, end: end + 1, valid: allowed.has(key) })
    }
    i = end
  }
  return out
}

export interface TokenOption {
  key: string
  label: string
  custom?: boolean
}

/**
 * `value` with `token` written over the selection, or null when it would not fit in
 * `maxLength` (cutting the end would slice the token or text the writer did not select).
 */
export function insertTokenAt(
  value: string,
  start: number,
  end: number,
  token: string,
  maxLength: number,
): string | null {
  const next = value.slice(0, start) + token + value.slice(end)
  return next.length > maxLength ? null : next
}

export function tokensForAlert(eventTokens: string[], customKeys: string[]): TokenOption[] {
  const seen = new Set<string>()
  const out: TokenOption[] = []
  for (const key of [...eventTokens, 'name', 'amount', 'message', 'platform']) {
    if (!seen.has(key) && (KNOWN_VARS as readonly string[]).includes(key)) {
      seen.add(key)
      out.push({ key, label: TOKEN_LABELS[key] ?? key })
    }
  }
  for (const key of KNOWN_VARS) {
    if (!seen.has(key)) {
      seen.add(key)
      out.push({ key, label: TOKEN_LABELS[key] ?? key })
    }
  }
  for (const key of customKeys) {
    if (!seen.has(key)) {
      seen.add(key)
      out.push({ key, label: key, custom: true })
    }
  }
  return out
}

export function TokenChipField({
  label,
  value,
  maxLength,
  multiline = false,
  placeholder,
  options,
  allowedSet,
  onChange,
}: {
  label: string
  value: string
  maxLength: number
  multiline?: boolean
  placeholder?: string
  options: TokenOption[]
  allowedSet: Set<string>
  onChange: (next: string) => void
}) {
  const inputId = useId()
  const errId = useId()
  const [announcement, setAnnouncement] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteBtn = useRef<HTMLButtonElement>(null)
  const palettePanel = useRef<HTMLElement>(null)
  const paletteId = useId()
  const inputEl = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([])
  const paletteRefs = useRef<(HTMLButtonElement | null)[]>([])

  const check = checkTemplate(value)
  const used = useMemo(() => scanTokens(value, allowedSet), [value, allowedSet])
  const unknownToken = used.find((t) => !t.valid)
  const error = !check.ok
    ? check.error
    : unknownToken
      ? `Unknown token '${unknownToken.raw}'. Pick one from Tokens or define a custom field.`
      : null

  const quickOptions = options

  /** Writes the token at the caret; false when it would not fit (nothing changed). */
  const insertToken = (key: string): boolean => {
    const token = `{${key}}`
    const el = inputEl.current
    const caller = typeof document !== 'undefined' ? document.activeElement : null
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? start
    const next = insertTokenAt(value, start, end, token, maxLength)
    if (next === null) {
      setAnnouncement(`${token} doesn't fit: ${label} can be up to ${maxLength} characters.`)
      return false
    }
    onChange(next)
    setAnnouncement(`Inserted ${token} into ${label}`)
    const nextPos = Math.min(start + token.length, next.length)
    requestAnimationFrame(() => {
      if (!inputEl.current) return
      const active = document.activeElement
      if (active && active !== caller && active !== document.body && active !== inputEl.current) {
        return
      }
      inputEl.current.focus()
      inputEl.current.setSelectionRange(nextPos, nextPos)
    })
    return true
  }

  const removeToken = (tok: ParsedToken, focusNextIdx: number) => {
    const caller = typeof document !== 'undefined' ? document.activeElement : null
    const before = value.slice(0, tok.start)
    const after = value.slice(tok.end)
    const cleaned =
      before.endsWith(' ') && after.startsWith(' ') ? before.slice(0, -1) + after : before + after
    onChange(cleaned)
    setAnnouncement(`Removed ${tok.raw} from ${label}`)
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== caller && active !== document.body) return
      const targetBtn =
        chipRefs.current[Math.min(focusNextIdx, Math.max(0, used.length - 2))] ?? inputEl.current
      targetBtn?.focus()
    })
  }

  const handleRovingKeyDown = (
    e: React.KeyboardEvent,
    idx: number,
    list: (HTMLButtonElement | null)[],
  ) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      list[(idx + 1) % list.length]?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      list[(idx - 1 + list.length) % list.length]?.focus()
    }
  }

  const controlProps = {
    id: inputId,
    value,
    maxLength,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errId : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="fc-label">
          {label}
        </label>
        <div className="relative flex items-center gap-2">
          <span className="font-mono text-[12px] text-text-3 tabular-nums">
            {value.length}/{maxLength}
          </span>
          <button
            ref={paletteBtn}
            type="button"
            aria-expanded={paletteOpen}
            aria-controls={paletteOpen ? paletteId : undefined}
            aria-label={`Tokens for ${label}`}
            onClick={() => setPaletteOpen((o) => !o)}
            className="fc-press inline-flex h-7 items-center gap-1 rounded-full border border-line-strong bg-surface-1 px-2.5 text-[13px] font-semibold text-text hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            <BracketsCurly size={13} weight="bold" aria-hidden="true" />
            Tokens
          </button>
          <PopoverSurface
            open={paletteOpen}
            onClose={(reason) => {
              setPaletteOpen(false)
              if (reason === 'escape' || reason === 'tab') paletteBtn.current?.focus()
            }}
            anchorRef={paletteBtn}
            surfaceRef={palettePanel}
            placement="bottom"
            align="end"
            gap={6}
            edgePadding={8}
            focusOnOpen="first"
            id={paletteId}
            role="group"
            aria-label={`Insert token into ${label}`}
            className="z-[70] flex max-h-64 w-[min(18rem,calc(100vw-2rem))] flex-col gap-1 rounded-control border border-line-strong bg-surface-1 p-2 shadow-pop [&>*]:shrink-0"
          >
            {quickOptions.map((opt, i) => (
              <button
                key={opt.key}
                ref={(el) => {
                  paletteRefs.current[i] = el
                }}
                type="button"
                data-insert-token={opt.key}
                title={`Insert {${opt.key}} (${opt.label})`}
                onClick={() => {
                  // Closed only when it went in: a refusal keeps the focus on this option.
                  if (insertToken(opt.key)) setPaletteOpen(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                    e.preventDefault()
                    paletteRefs.current[(i + 1) % quickOptions.length]?.focus()
                  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                    e.preventDefault()
                    paletteRefs.current[
                      (i - 1 + quickOptions.length) % quickOptions.length
                    ]?.focus()
                  }
                }}
                className="fc-press flex min-h-9 items-center gap-2 rounded-[8px] px-2 text-left hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                <Plus size={11} weight="bold" aria-hidden="true" className="shrink-0 text-text-3" />
                <span className="font-mono text-[13px] font-semibold text-text">{`{${opt.key}}`}</span>
                <span className="ml-auto truncate text-[13px] text-text-3" title={opt.label}>
                  {opt.label}
                </span>
              </button>
            ))}
          </PopoverSurface>
        </div>
      </div>

      <div
        className={cx(
          'rounded-control border bg-surface-2 p-2 transition-colors focus-within:border-arc focus-within:shadow-[var(--fc-focus)]',
          error ? 'border-danger' : 'border-line',
        )}
      >
        {multiline ? (
          <Textarea
            {...controlProps}
            ref={(el) => {
              inputEl.current = el
            }}
            rows={2}
            className="border-0 bg-transparent px-1 py-1 shadow-none focus-visible:shadow-none"
          />
        ) : (
          <Input
            {...controlProps}
            ref={(el) => {
              inputEl.current = el
            }}
            className="border-0 bg-transparent px-1 py-1 shadow-none focus-visible:shadow-none"
          />
        )}

        {used.length > 0 && (
          <div
            role="group"
            aria-label={`Active tokens in ${label}`}
            className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-2"
          >
            <span className="text-[11.5px] font-semibold text-text-3">In field:</span>
            {used.map((tok, i) => (
              <button
                key={`${tok.start}-${tok.raw}`}
                ref={(el) => {
                  chipRefs.current[i] = el
                }}
                type="button"
                data-token-chip={tok.key}
                data-invalid={tok.valid ? undefined : 'true'}
                aria-label={`Remove token ${tok.raw} from ${label}`}
                onClick={() => removeToken(tok, i)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' || e.key === 'Delete') {
                    e.preventDefault()
                    removeToken(tok, i)
                    return
                  }
                  handleRovingKeyDown(e, i, chipRefs.current.slice(0, used.length))
                }}
                className={cx(
                  'fc-press inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[12px] font-semibold transition-colors focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                  tok.valid
                    ? 'border-accent-line bg-accent-soft text-text hover:border-arc'
                    : 'border-danger/60 bg-danger/10 text-danger hover:border-danger',
                )}
              >
                {!tok.valid && <Warning size={12} aria-hidden="true" />}
                <span>{tok.raw}</span>
                <X size={11} weight="bold" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p id={errId} role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  )
}
