// The account's pieces shared by the sidebar, the plans page and the Account page
// (design board 2026-10-21-accounts: sidebar and Get Pro from option B).

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowSquareOut,
  ArrowUpRight,
  CaretUpDown,
  Desktop,
  Moon,
  SignIn,
  SignOut,
  Sparkle,
  SpinnerGap,
  Sun,
  UserCircle,
} from '@phosphor-icons/react'
import { accountName, accountPlanLine, describeError, type AccountView } from '@ferrocast/api'
import { LogoMark, toast } from '@ferrocast/ui'
import { accountApi, publishAccount, reloadAccount } from '../../lib/account-status'
import { accountInitials } from '../../lib/pro-status'
import { href } from '../../lib/router'
import { openExternal } from '../../lib/external'

/** The person's picture (Google's), or their initials. Pro gets the two-tone seam ring. */
export function AccountAvatar({
  view,
  pro,
  size = 32,
  gap,
}: {
  view: AccountView
  pro: boolean
  size?: number
  /** The ring's inner gap matches what's behind the avatar. */
  gap?: string | undefined
}) {
  const a = view.account
  const name = accountName(a)
  const [broken, setBroken] = useState(false)
  const inner =
    a?.avatar_url && !broken ? (
      <img
        src={a.avatar_url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="size-full rounded-full object-cover"
        width={size}
        height={size}
      />
    ) : (
      <span
        className="grid size-full place-items-center rounded-full bg-surface-3 font-display font-bold text-text"
        style={{ fontSize: Math.round(size * 0.36) }}
      >
        {accountInitials(name)}
      </span>
    )
  if (!pro)
    return (
      <span
        aria-hidden="true"
        className="inline-grid shrink-0 overflow-hidden rounded-full border border-line-strong"
        style={{ width: size, height: size }}
      >
        {inner}
      </span>
    )
  const ring = size >= 56 ? 3 : 2
  return (
    <span
      aria-hidden="true"
      className="fc-ring inline-grid shrink-0 rounded-full"
      style={{ width: size, height: size, padding: ring }}
    >
      <span
        className="grid overflow-hidden rounded-full"
        style={{ border: `${ring}px solid ${gap ?? 'var(--fc-bg)'}` }}
      >
        {inner}
      </span>
    </span>
  )
}

/** The chrome PRO chip (same metal as the one by the logo). */
export function ProChrome({ className = '' }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Pro"
      className={`fc-pro-mark inline-flex h-[18px] shrink-0 items-center rounded-full px-[7px] font-mono text-[10px] font-bold tracking-[0.07em] ${className}`}
    >
      <span aria-hidden="true">PRO</span>
    </span>
  )
}

/** Get Pro: the sidebar's one solid orange button (white text), to the plans page. */
export function GetProButton({ className = '' }: { className?: string }) {
  return (
    <a
      href={href({ name: 'plans' })}
      data-testid="get-pro"
      className={`fc-press flex h-[38px] items-center justify-center gap-2 rounded-control bg-btn-primary px-3.5 text-[14px] font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] hover:bg-btn-primary-hover focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none ${className}`}
    >
      <LogoMark size={18} className="text-white! [--fc-brand-arc:#ffffff]" />
      Get Pro
    </a>
  )
}

/**
 * Starts signing in: the app opens the browser (the engine waits for it), the web dashboard
 * goes to the relay's sign-in page. Errors come back as a toast with what to do.
 */
export async function startSignIn(label?: string): Promise<boolean> {
  const api = accountApi()
  if (!api) return false
  try {
    const { url } = await api.signIn(label)
    if (api.where === 'web') {
      window.location.assign(url)
      return true
    }
    openExternal(url)
    await reloadAccount()
    return true
  } catch (e) {
    const d = describeError(e)
    toast({ tone: 'error', message: d.message, hint: d.hint })
    return false
  }
}

export async function cancelSignIn(): Promise<void> {
  const api = accountApi()
  if (!api) return
  await api.cancelSignIn().catch(() => undefined)
  await reloadAccount()
}

export async function signOut(everywhere = false): Promise<boolean> {
  const api = accountApi()
  if (!api) return false
  try {
    await api.signOut(everywhere)
    if (api.where === 'web') {
      // The web dashboard needs an account: back to the sign-in page.
      window.location.assign(`${window.location.origin}/login?next=${encodeURIComponent('/app/')}`)
      return true
    }
    publishAccount({ state: 'signed_out' })
    toast({ tone: 'ok', message: 'Signed out. Everything free keeps working.' })
    return true
  } catch (e) {
    const d = describeError(e)
    toast({ tone: 'error', message: d.message, hint: d.hint })
    return false
  }
}

const barBase =
  'fc-press flex w-full items-center gap-2.5 rounded-[12px] border border-line bg-surface-1 p-2 text-left focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none'

function Who({ title, sub }: { title: ReactNode; sub: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <b className="flex min-w-0 items-center gap-1.5 text-[13.5px] leading-tight font-semibold text-text">
        {title}
      </b>
      <small className="block truncate text-[12px] leading-snug text-text-3">{sub}</small>
    </span>
  )
}

export interface Utils {
  /** Opens this dashboard in the browser (desktop window only); null hides it. */
  openInBrowser: (() => void) | null
  theme: 'dark' | 'light'
  toggleTheme: () => void
  /** What the person picked: Auto follows the system. */
  themePref: 'system' | 'dark' | 'light'
  setThemePref: (p: 'system' | 'dark' | 'light') => void
}

const THEMES = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'Auto', Icon: Desktop },
] as const

/**
 * Signed out, when there's no menu: the theme (Light / Dark / Auto), then Open in browser,
 * stacked above the sign-in bar (design board 2026-10-22-polish, option 1B).
 */
function UtilStack({ utils }: { utils: Utils }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        role="group"
        aria-label="Theme"
        className="grid grid-cols-3 gap-0.5 rounded-control border border-line bg-surface-2 p-[3px]"
      >
        {THEMES.map(({ value, label, Icon }) => {
          const on = utils.themePref === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              title={value === 'system' ? 'Match your system' : undefined}
              onClick={() => utils.setThemePref(value)}
              className={`fc-press flex h-[30px] items-center justify-center gap-1.5 rounded-[7px] text-[12.5px] focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none ${
                on
                  ? 'bg-surface-1 font-semibold text-text shadow-[0_1px_2px_rgb(0_0_0/0.16),0_0_0_1px_var(--fc-line)]'
                  : 'font-medium text-text-3 hover:text-text'
              }`}
            >
              <Icon size={15} aria-hidden />
              {label}
            </button>
          )
        })}
      </div>
      {utils.openInBrowser && (
        <button
          type="button"
          onClick={utils.openInBrowser}
          className="fc-press flex h-10 items-center gap-2.5 rounded-control px-2.5 text-[13.5px] font-medium text-text-2 hover:bg-surface-2 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        >
          <ArrowSquareOut size={17} className="text-text-3" aria-hidden />
          <span className="flex-1 text-left">Open in browser</span>
          <ArrowUpRight size={14} className="text-text-3" aria-hidden />
        </button>
      )}
      <hr className="mx-1 my-0.5 border-line" />
    </div>
  )
}

function Menu({
  view,
  utils,
  onClose,
}: {
  view: AccountView
  utils: Utils
  onClose: (focusBar: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const items = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    items()[0]?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose(true)
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const list = items()
      const i = list.indexOf(document.activeElement as HTMLElement)
      const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
      list[n]?.focus()
    }
    const outside = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(false)
    }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', outside)
    }
  }, [onClose])
  const item =
    'flex h-[34px] w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13.5px] text-text-2 hover:bg-surface-2 hover:text-text focus-visible:bg-surface-2 focus-visible:text-text focus-visible:outline-none'
  const ThemeIcon = utils.theme === 'dark' ? Sun : Moon
  const go = (h: string) => {
    onClose(false)
    location.hash = h
  }
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Account"
      className="absolute inset-x-0 bottom-[calc(100%+6px)] z-40 rounded-[12px] border border-line-strong bg-surface-1 p-1.5 shadow-[var(--fc-shadow-pop)]"
    >
      <div className="mb-1 border-b border-line px-2 pt-2 pb-2.5">
        <b className="block truncate text-[13.5px] font-semibold text-text">
          {accountName(view.account)}
        </b>
        <small className="block truncate text-[12px] text-text-3">{view.account?.email}</small>
      </div>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => go(href({ name: 'account' }))}
      >
        <UserCircle size={16} aria-hidden />
        Account
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => go(href({ name: 'plans' }))}
      >
        <Sparkle size={16} aria-hidden />
        Plans
      </button>
      <hr className="my-1 border-line" />
      {utils.openInBrowser && (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={() => {
            onClose(false)
            utils.openInBrowser?.()
          }}
        >
          <ArrowSquareOut size={16} aria-hidden />
          Open in browser
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          utils.toggleTheme()
          onClose(true)
        }}
      >
        <ThemeIcon size={16} aria-hidden />
        {utils.theme === 'dark' ? 'Light theme' : 'Dark theme'}
      </button>
      <hr className="my-1 border-line" />
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          onClose(false)
          void signOut()
        }}
      >
        <SignOut size={16} aria-hidden />
        Sign out
      </button>
    </div>
  )
}

/**
 * The sidebar's foot (option B): Get Pro for non-Pro, then the account bar. Signed out, a
 * small row keeps Open in browser and the theme switch; signed in, they live in the menu.
 */
export function SidebarAccount({
  view,
  pro,
  planLine,
  utils,
}: {
  view: AccountView
  /** Pro on this PC (its own or the account's). */
  pro: boolean
  /** "Pro, yearly" for this PC's Pro, when the account itself doesn't say. */
  planLine: string | null
  utils: Utils
}) {
  const [open, setOpen] = useState(false)
  const barRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  // Stable, so the open menu's effect doesn't re-run (and refocus its first item) each render.
  const close = useCallback((focusBar: boolean) => {
    setOpen(false)
    if (focusBar) barRef.current?.focus()
  }, [])

  if (view.state === 'pending')
    return (
      <div className="flex flex-col gap-2" data-testid="account-bar" data-state="pending">
        <UtilStack utils={utils} />
        <div role="status" className={`${barBase} cursor-default`}>
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-accent-text">
            <SpinnerGap size={16} className="motion-safe:animate-spin" aria-hidden />
          </span>
          <Who
            title={<span className="truncate">Finish in browser</span>}
            sub="Waiting for sign-in"
          />
          <button
            type="button"
            onClick={() => void cancelSignIn()}
            className="rounded-[6px] text-[12px] font-semibold text-accent-text underline underline-offset-[3px] focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            Cancel
          </button>
        </div>
      </div>
    )

  if (view.state !== 'signed_in')
    return (
      <div className="flex flex-col gap-2" data-testid="account-bar" data-state={view.state}>
        <UtilStack utils={utils} />
        {!pro && view.state !== 'disabled' && <GetProButton />}
        {view.state === 'disabled' ? (
          <div role="status" className={`${barBase} cursor-default`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-danger">
              <UserCircle size={18} aria-hidden />
            </span>
            <Who
              title={<span className="truncate">Account turned off</span>}
              sub={view.error?.hint ?? 'Write to support.'}
            />
          </div>
        ) : (
          <button
            type="button"
            className={barBase}
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void startSignIn().finally(() => setBusy(false))
            }}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-text-3">
              <UserCircle size={18} aria-hidden />
            </span>
            <Who title={<span className="truncate">Sign in</span>} sub="Pro on every PC" />
            <SignIn size={16} className="shrink-0 text-text-3" aria-hidden />
          </button>
        )}
      </div>
    )

  const name = accountName(view.account)
  const line =
    pro && view.pro?.active ? accountPlanLine(view) : pro ? (planLine ?? 'Pro') : 'Free plan'
  return (
    <div
      className="flex flex-col gap-2"
      data-testid="account-bar"
      data-state="signed_in"
      data-pro={pro || undefined}
    >
      {!pro && <GetProButton />}
      <div className="relative">
        {open && <Menu view={view} utils={utils} onClose={close} />}
        <button
          ref={barRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`${barBase} ${pro ? 'fc-seam-card border-line-strong' : ''}`}
        >
          <AccountAvatar view={view} pro={pro} gap={pro ? 'var(--fc-surface-1)' : undefined} />
          <Who
            title={
              <>
                <span className="truncate">{name}</span>
                {pro && <ProChrome />}
              </>
            }
            sub={line}
          />
          <CaretUpDown size={16} className="relative shrink-0 text-text-3" aria-hidden />
        </button>
      </div>
    </div>
  )
}
