import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X, CheckCircle, WarningCircle, Info } from '@phosphor-icons/react'
import { cx } from '../cx'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** `xl`: most of the screen (a big picker), its body filling the height. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Bottom sheet on phones, centred card above 640 px. */
  sheetOnMobile?: boolean
}

/**
 * Native <dialog> (focus trap, Escape, inert background for free) with a short scale-in.
 * Opens from the centre: dialogs are not anchored to a trigger.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  sheetOnMobile = true,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    d.addEventListener('cancel', onCancel)
    return () => d.removeEventListener('cancel', onCancel)
  }, [onClose])
  const width =
    size === 'sm'
      ? 'sm:max-w-md'
      : size === 'lg'
        ? 'sm:max-w-3xl'
        : size === 'xl'
          ? 'sm:max-w-[min(1280px,92vw)] sm:h-[min(860px,88dvh)]'
          : 'sm:max-w-xl'
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cx(
        'fc-dialog m-0 max-h-none max-w-none bg-transparent p-0 text-text backdrop:bg-[rgb(4_5_8/0.62)]',
        'h-dvh w-screen',
      )}
    >
      {open && (
        <div
          className={cx(
            'pointer-events-none flex h-full w-full justify-center',
            sheetOnMobile ? 'items-end sm:items-center' : 'items-center',
            'p-0 sm:p-6',
          )}
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cx(
              'pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line-strong bg-surface-1 shadow-pop',
              sheetOnMobile ? 'rounded-t-[20px] sm:rounded-panel' : 'mx-4 rounded-panel',
              width,
            )}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 sm:px-6">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold tracking-tight text-text">
                  {title}
                </h2>
                {description && (
                  <div className="mt-1 text-sm leading-relaxed text-text-2">{description}</div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="fc-press -mt-1 -mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-control text-text-3 hover:bg-surface-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                <X size={18} />
              </button>
            </div>
            {children && (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">
                {children}
              </div>
            )}
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </dialog>
  )
}

// ------------------------------------------------------------------ toasts

export type ToastTone = 'info' | 'ok' | 'warn' | 'error'
export interface Toast {
  id: number
  tone: ToastTone
  message: string
  hint?: string | null
  action?: { label: string; run: () => void }
  /**
   * Toasts about the same thing share a key (`panic`, `obs`, `account:twitch`): a new one
   * replaces the old one instead of stacking, so switching panic on then off shows only
   * the latest state. Without a key, an identical toast (same tone and words) replaces
   * the one on screen instead of stacking a copy.
   */
  key?: string
}

let toasts: Toast[] = []
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** At most this many toasts at once; the oldest goes first. */
const MAX_TOASTS = 4

export function toast(t: Omit<Toast, 'id'> & { duration?: number }): number {
  const id = nextId++
  const { duration, ...rest } = t
  const key = t.key ?? `${t.tone}:${t.message}`
  const next: Toast = { ...rest, key, id }
  let list = toasts
  const old = list.find((x) => x.key === key)
  if (old) {
    clearTimeout(timers.get(old.id))
    timers.delete(old.id)
    // Same place in the stack, new content: no jump, no duplicate.
    list = list.map((x) => (x.id === old.id ? next : x))
  } else list = [...list, next]
  while (list.length > MAX_TOASTS) {
    const [first, ...others] = list
    if (first) {
      clearTimeout(timers.get(first.id))
      timers.delete(first.id)
    }
    list = others
  }
  toasts = list
  emit()
  const ms = duration ?? (t.tone === 'error' ? 7000 : 3800)
  timers.set(
    id,
    setTimeout(() => dismissToast(id), ms),
  )
  return id
}

export function dismissToast(id: number): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** The toasts on screen now (tests). */
export function currentToasts(): readonly Toast[] {
  return toasts
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => toasts

const icons: Record<ToastTone, ReactNode> = {
  info: <Info size={18} weight="fill" className="text-accent-text" />,
  ok: <CheckCircle size={18} weight="fill" className="text-ok" />,
  warn: <WarningCircle size={18} weight="fill" className="text-warn" />,
  error: <WarningCircle size={18} weight="fill" className="text-danger" />,
}

/** Bottom-right on desktop, top on phones (thumbs live at the bottom). Errors are assertive. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot)
  const reduce = useReducedMotion()
  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 top-[max(8px,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-3 sm:top-auto sm:right-4 sm:bottom-4 sm:left-auto sm:items-end"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.key ?? t.id}
            layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.14 } }
            }
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-panel border border-line-strong bg-surface-1 p-3.5 pr-2 shadow-pop"
          >
            <span className="mt-px">{icons[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words text-text">{t.message}</p>
              {t.hint && (
                <p className="mt-0.5 text-[13px] leading-snug break-words text-text-3">{t.hint}</p>
              )}
              {t.action && (
                <button
                  type="button"
                  className="mt-1.5 text-[13px] font-semibold text-accent-text hover:underline focus-visible:underline focus-visible:outline-none"
                  onClick={() => {
                    t.action?.run()
                    dismissToast(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissToast(t.id)}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-text-3 hover:bg-surface-3 hover:text-text"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  )
}

/** Copies text and reports whether it worked (clipboard can be blocked in some webviews). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Shows content for a moment after an action (e.g. "Copied"). */
export function useFlash(ms = 1600): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return [
    on,
    () => {
      setOn(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setOn(false), ms)
    },
  ]
}
