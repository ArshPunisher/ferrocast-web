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
  /** `wide`: a settings window (wide, a steady height so pages don't jump). */
  size?: 'sm' | 'md' | 'lg' | 'wide' | 'xl'
  /** The content lays itself out edge to edge and scrolls its own parts. */
  flush?: boolean
  /** Bottom sheet on phones, centred card above 640 px. */
  sheetOnMobile?: boolean
  /** The Studio's compact look (owner's pick, design A, 10 Nov): a grey heading band, a
   *  smaller title, tighter padding, small corners. */
  compact?: boolean
}

/** Open dialogs; the page under them doesn't scroll while any is open. */
let scrollLocks = 0
let savedScroll: { overflow: string; gutter: string } | null = null

/** Stops the page behind a dialog scrolling (wheel and touch scroll chain to it otherwise). */
function lockPageScroll(): () => void {
  const root = document.documentElement
  if (scrollLocks++ === 0) {
    savedScroll = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter }
    // Keeps the scrollbar's space, so the page doesn't shift sideways.
    if (root.scrollHeight > root.clientHeight) root.style.scrollbarGutter = 'stable'
    root.style.overflow = 'hidden'
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--scrollLocks === 0 && savedScroll) {
      root.style.overflow = savedScroll.overflow
      root.style.scrollbarGutter = savedScroll.gutter
      savedScroll = null
    }
  }
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
  flush = false,
  sheetOnMobile = true,
  compact = false,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // Opening a dialog moves focus to its first button, which then shows a focus ring on
      // Close though nothing was typed. A field marked for it gets focus (React's autoFocus
      // runs while the dialog is still closed, so it can't); else the panel itself, so Tab
      // starts at the top and nothing is ringed.
      const field = d.querySelector<HTMLElement>('[data-autofocus]')
      if (field) field.focus()
      else panel.current?.focus({ preventScroll: true })
    }
    if (!open && d.open) d.close()
  }, [open])
  useEffect(() => (open ? lockPageScroll() : undefined), [open])
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
        : size === 'wide'
          ? 'sm:max-w-[min(1080px,94vw)] sm:h-[min(780px,90dvh)]'
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
            ref={panel}
            tabIndex={-1}
            // The Studio's live picture leaves itself out under this panel.
            data-over-preview
            initial={reduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cx(
              'pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line-strong bg-surface-1 shadow-pop outline-none',
              compact
                ? sheetOnMobile
                  ? 'rounded-t-[14px] sm:rounded-[7px]'
                  : 'mx-4 rounded-[7px]'
                : sheetOnMobile
                  ? 'rounded-t-[20px] sm:rounded-panel'
                  : 'mx-4 rounded-panel',
              width,
            )}
          >
            <div
              className={cx(
                'flex justify-between',
                compact
                  ? 'min-h-11 flex-none items-center gap-3 border-b border-line-strong bg-dock-head py-2 pr-2 pl-4'
                  : 'items-start gap-4 px-5 pt-5 pb-3 sm:px-6',
              )}
            >
              <div className="min-w-0">
                <h2
                  className={cx(
                    'font-display tracking-tight text-text',
                    compact ? 'text-[15px] font-bold' : 'text-lg font-semibold',
                  )}
                >
                  {title}
                </h2>
                {description && (
                  <div
                    className={cx(
                      'text-text-2',
                      compact ? 'mt-0.5 text-[12.5px]' : 'mt-1 text-sm leading-relaxed',
                    )}
                  >
                    {description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={cx(
                  'fc-press inline-flex shrink-0 items-center justify-center text-text-3 hover:bg-surface-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                  compact ? 'size-7 rounded-[5px]' : '-mt-1 -mr-2 size-9 rounded-control',
                )}
              >
                <X size={compact ? 15 : 18} />
              </button>
            </div>
            {children &&
              (flush ? (
                <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
              ) : (
                <div
                  className={cx(
                    'relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
                    compact ? 'px-4 py-3' : 'px-5 pb-5 sm:px-6',
                  )}
                >
                  {children}
                </div>
              ))}
            {footer && (
              <div
                className={cx(
                  'flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2',
                  compact
                    ? 'px-3 py-2 pb-[max(8px,env(safe-area-inset-bottom))] [&_button]:h-8 [&_button]:rounded-[6px] [&_button]:px-3 [&_button]:text-[13px]'
                    : 'px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6',
                )}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </dialog>
  )
}

export interface ConfirmProps {
  open: boolean
  onClose: () => void
  /** The question: "Remove Webcam from Main?" */
  title: string
  /** One short line under it. */
  description?: ReactNode
  /** The button that does it ("Remove"); red unless `danger` is false. */
  confirm: string
  /** The one that doesn't ("Keep"). */
  cancel?: string
  onConfirm: () => void
  danger?: boolean
}

/**
 * A small yes-or-no card in the middle of the window (owner's pick C3, 11 Nov): the question,
 * one line, and two buttons side by side. A native modal dialog, so the page and the Studio's
 * picture dim under it, Escape and a click outside keep things as they are.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirm,
  cancel = 'Keep',
  onConfirm,
  danger = true,
}: ConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // The safe button first: Enter keeps it, as a slip shouldn't remove anything.
      d.querySelector<HTMLButtonElement>('[data-cancel]')?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])
  useEffect(() => (open ? lockPageScroll() : undefined), [open])
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
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="fc-dialog m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-text backdrop:bg-[rgb(4_5_8/0.62)]"
    >
      {open && (
        <div className="pointer-events-none flex h-full w-full items-center justify-center p-4">
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="fc-confirm-title"
            // The Studio's live picture leaves itself out under this card.
            data-over-preview
            initial={reduce ? false : { opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto w-full max-w-[300px] rounded-[12px] border border-line-strong bg-surface-1 p-4 shadow-pop"
          >
            <h2 id="fc-confirm-title" className="text-[15px] font-bold text-balance text-text">
              {title}
            </h2>
            {description && <p className="mt-1 text-[13.5px] text-text-3">{description}</p>}
            <div className="mt-3.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                data-cancel
                onClick={onClose}
                className="fc-press h-9 rounded-[8px] border border-line-strong bg-surface-1 text-[14px] font-semibold text-text hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                {cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onConfirm()
                }}
                className={cx(
                  'fc-press h-9 rounded-[8px] text-[14px] font-semibold focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                  danger
                    ? 'bg-danger-fill text-white hover:brightness-110'
                    : 'bg-[var(--fc-btn-primary)] text-[var(--fc-on-btn-primary)] hover:bg-[var(--fc-btn-primary-hover)]',
                )}
              >
                {confirm}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </dialog>
  )
}

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Stays put above the scrolling body (a search, filters). */
  tools?: ReactNode
  children?: ReactNode
  footer?: ReactNode
}

/**
 * A side panel from the right, full height: a long list to look through or a form to edit,
 * without leaving the page. Native <dialog> like Dialog (focus trap, Escape, inert page).
 */
export function Sheet({ open, onClose, title, tools, children, footer }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // As Dialog: a marked field, else the panel (no ring on its first button).
      const field = d.querySelector<HTMLElement>('[data-autofocus]')
      if (field) field.focus()
      else panel.current?.focus({ preventScroll: true })
    }
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
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="fc-dialog m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-text backdrop:bg-[rgb(4_5_8/0.5)]"
    >
      {open && (
        <div className="pointer-events-none flex h-full w-full justify-end">
          <motion.div
            ref={panel}
            tabIndex={-1}
            // The Studio's live picture leaves itself out under this panel.
            data-over-preview
            initial={reduce ? false : { x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="pointer-events-auto flex h-full w-full max-w-[480px] flex-col border-l border-line-strong bg-surface-1 shadow-pop outline-none"
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
              <h2 className="min-w-0 flex-1 truncate font-display text-xl font-extrabold tracking-tight text-text">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="fc-press inline-flex size-9 shrink-0 items-center justify-center rounded-control border border-line-strong text-text-2 hover:bg-surface-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                <X size={18} />
              </button>
            </div>
            {tools && (
              <div className="flex-none border-b border-line px-5 py-3.5 sm:px-6">{tools}</div>
            )}
            <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] px-5 py-4 sm:px-6">
              {children}
            </div>
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
  // In the top layer (a manual popover), shown again whenever the toasts change, so it sits
  // above an open dialog: a toast from a dialog's action showed behind its backdrop.
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof el.showPopover !== 'function') return
    try {
      if (el.matches(':popover-open')) el.hidePopover()
      if (list.length) el.showPopover()
    } catch {
      // Not supported here: it stays a fixed layer under dialogs, as before.
    }
  }, [list])
  return (
    <section
      ref={ref}
      popover="manual"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 top-[max(8px,env(safe-area-inset-top))] bottom-auto z-[70] m-0 flex h-fit w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent px-3 py-0 text-inherit sm:top-auto sm:right-4 sm:bottom-[calc(1rem+var(--fc-statusbar,0px))] sm:left-auto sm:w-auto sm:items-end"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            // The Studio's live picture leaves itself out under this panel.
            data-over-preview
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
                <p className="mt-0.5 text-[14px] leading-snug break-words text-text-3">{t.hint}</p>
              )}
              {t.action && (
                <button
                  type="button"
                  className="mt-1.5 text-[14px] font-semibold text-accent-text hover:underline focus-visible:underline focus-visible:outline-none"
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
