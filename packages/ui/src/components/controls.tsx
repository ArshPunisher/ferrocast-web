import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cx } from '../cx'
import { InfoTip } from './infotip'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary:
    'bg-btn-primary text-on-btn-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_6px_18px_-8px_var(--fc-btn-primary)] hover:bg-btn-primary-hover',
  secondary:
    'bg-surface-3 text-text border border-line-strong hover:border-text-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]',
  ghost: 'text-text-2 hover:text-text hover:bg-surface-3',
  danger:
    'bg-danger-fill text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] hover:brightness-110',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[14.5px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-[16px] gap-2.5',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  busy?: boolean
}

/** Pressable everywhere: scales to 0.97 on press, never wraps its label. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, busy, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'fc-press inline-flex shrink-0 items-center justify-center rounded-control font-semibold whitespace-nowrap select-none',
        'transition-[background-color,border-color,color,transform,filter] duration-150 ease-out',
        'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
        'disabled:cursor-not-allowed',
        // A primary that can't be pressed yet goes neutral instead of a faded, glowing orange;
        // a busy one keeps its colour.
        variant === 'primary' && disabled && !busy
          ? 'border border-line bg-surface-3 text-text-3'
          : cx(variants[variant], 'disabled:opacity-50'),
        sizes[size],
        className,
      )}
      {...rest}
    >
      {busy ? <span className="fc-busy" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: Variant
  size?: Size
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, children, type, ...rest },
  ref,
) {
  const dim = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10'
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cx(
        'fc-press inline-flex shrink-0 items-center justify-center rounded-control',
        'transition-[background-color,color,transform] duration-150 ease-out',
        'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none disabled:opacity-40',
        variants[variant],
        dim,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

export interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  /** Hide the visible label (still announced). */
  hideLabel?: boolean
  disabled?: boolean
  description?: string
  id?: string
}

export function Switch({
  checked,
  onChange,
  label,
  hideLabel,
  disabled,
  description,
  id,
}: SwitchProps) {
  const auto = useId()
  const sid = id ?? auto
  return (
    <div className="flex items-start justify-between gap-4">
      {!hideLabel && (
        <div className="flex min-w-0 items-center gap-1">
          <label htmlFor={sid} className="text-sm font-medium text-text">
            {label}
          </label>
          {description && <InfoTip>{description}</InfoTip>}
        </div>
      )}
      <button
        id={sid}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={hideLabel ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors duration-200',
          'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none disabled:opacity-40',
          checked ? 'border-arc bg-arc' : 'border-line-strong bg-surface-3',
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'absolute top-[3px] left-[3px] size-4 rounded-full shadow-sm transition-transform duration-200 ease-[var(--fc-ease-out)]',
            checked ? 'translate-x-4 bg-surface-1' : 'translate-x-0 bg-text-3',
          )}
        />
      </button>
    </div>
  )
}

export interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (props: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }) => ReactNode
  className?: string
  optional?: boolean
  /** Keep the hint under the field (a live count) instead of behind the (i). */
  hintVisible?: boolean
}

/** Label above, hint below the control, error below that. Never placeholder-as-label. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional,
  hintVisible,
}: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const described =
    [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined
  const props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean } = { id }
  if (described) props['aria-describedby'] = described
  if (error) props['aria-invalid'] = true
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <div className="flex min-h-6 items-center gap-1">
        <label htmlFor={id} className="text-[14.5px] font-semibold text-text">
          {label}
          {optional && <span className="ml-1.5 font-normal text-text-3">optional</span>}
        </label>
        {hint && !hintVisible && <InfoTip id={hintId}>{hint}</InfoTip>}
      </div>
      {children(props)}
      {hint && hintVisible && !error && (
        <p id={hintId} className="text-[14px] leading-snug text-text-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-[14px] leading-snug font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

const inputBase =
  'w-full rounded-control border border-line-strong bg-inset px-3 text-[15.5px] text-text placeholder:text-text-3 ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-text-3 ' +
  'focus:border-accent-text focus:shadow-[0_0_0_3px_var(--fc-accent-soft)] focus:outline-none ' +
  'aria-[invalid=true]:border-danger disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input ref={ref} autoComplete="off" className={cx(inputBase, 'h-10', className)} {...rest} />
    )
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={3}
      className={cx(inputBase, 'py-2 leading-relaxed', className)}
      {...rest}
    />
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cx(inputBase, 'fc-select h-10 cursor-pointer appearance-none pr-9', className)}
        {...rest}
      >
        {children}
      </select>
    )
  },
)

export interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
}

/** A radio group drawn as a segmented control (arrow keys move, like any radio group). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className,
}: SegmentedProps<T>) {
  const name = useId()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('inline-flex rounded-control border border-line bg-inset p-0.5', className)}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <label
            key={o.value}
            title={o.title}
            className={cx(
              'relative cursor-pointer rounded-[8px] font-semibold whitespace-nowrap transition-colors duration-150',
              'has-[:focus-visible]:shadow-[var(--fc-focus)]',
              size === 'sm' ? 'px-2.5 py-1 text-[13.5px]' : 'px-3.5 py-1.5 text-[14px]',
              // The picked one is plain to see: Arc and bold on a raised chip.
              on
                ? 'bg-surface-1 font-bold text-accent-text shadow-[var(--fc-shadow-1)] ring-1 ring-accent-line'
                : 'text-text-2 hover:bg-surface-3 hover:text-text',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={on}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        )
      })}
    </div>
  )
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'pro'
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-text-2 border-line',
  accent: 'bg-accent-soft text-accent-text border-accent-line',
  ok: 'bg-ok-soft text-ok border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  pro: 'bg-transparent text-text-2 border-line-strong',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[12.5px] font-semibold whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** "Pro" marked calmly: an outline chip, never a colour shout or a lock screen. */
export function ProBadge() {
  return (
    <Badge tone="pro" title="Part of Ferrocast Pro. Everything free stays free.">
      Pro
    </Badge>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-line-strong border-b-2 bg-surface-2 px-1.5 font-mono text-[12px] font-medium text-text-2">
      {children}
    </kbd>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cx('fc-skeleton rounded-control bg-surface-3', className)} />
  )
}
