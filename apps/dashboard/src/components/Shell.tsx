import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowSquareOut,
  Bell,
  ChartLine,
  Broadcast,
  ChatsCircle,
  CloudArrowUp,
  Command,
  DotsThreeOutline,
  GearSix,
  HandCoins,
  PaintBrushBroad,
  House,
  Moon,
  SealCheck,
  SidebarSimple,
  UserCircle,
  ShieldCheck,
  SquaresFour,
  Sun,
  UsersThree,
  X,
} from '@phosphor-icons/react'
import { Dialog, LogoMark, Wordmark, cx, toast } from '@ferrocast/ui'
import {
  accountIsPro,
  describeError,
  cloudScreenAllowed,
  proPanelState,
  remoteScreenAllowed,
  type ProFeature,
  type ProView,
} from '@ferrocast/api'
import { href, useRoute, type Route } from '../lib/router'
import { isLimited, useLive } from '../lib/store'
import { isCloud } from '../lib/boot'
import { useClient, useMediaQuery } from '../lib/hooks'
import { PRO_UNLOCKED_EVENT, accountInitials, proPlanLine, useProStatus } from '../lib/pro-status'
import { ProUnlock } from './pro/ProUnlock'
import { StatusStrip } from './StatusStrip'
import { PanicButton } from './PanicButton'
import { RemoteStrip } from './remote'
import { UpdateDialogHost, UpdateNavItem } from './update'
import { AccountAvatar, SidebarAccount } from './account/parts'
import { useAccount } from '../lib/account-status'
import { useUpdateWatch } from '../lib/update'
import { useIsWide } from '../lib/wide'
import { StudioStatusBar } from './studio/desk/status-bar'

type NavItem = {
  route: Route
  label: string
  icon: typeof House
  match: Route['name'][]
  /** A Pro feature: listed only when its panel would show (on this relay, and Pro or on sale). */
  pro?: ProFeature
}

export const NAV: NavItem[] = [
  // Cloud mode's own page: listed only in cloud mode (Home isn't, it needs a PC).
  { route: { name: 'cloud' }, label: 'Cloud', icon: CloudArrowUp, match: ['cloud'] },
  { route: { name: 'home' }, label: 'Home', icon: House, match: ['home', 'recap'] },
  { route: { name: 'studio' }, label: 'Studio', icon: Broadcast, match: ['studio'] },
  { route: { name: 'chat' }, label: 'Chat', icon: ChatsCircle, match: ['chat'] },
  { route: { name: 'alerts' }, label: 'Alerts', icon: Bell, match: ['alerts'] },
  {
    route: { name: 'overlays' },
    label: 'Overlays',
    icon: SquaresFour,
    match: ['overlays', 'overlay'],
  },
  {
    route: { name: 'designs' },
    label: 'Designs',
    icon: PaintBrushBroad,
    match: ['designs', 'designer'],
  },
  { route: { name: 'moderation' }, label: 'Moderation', icon: ShieldCheck, match: ['moderation'] },
  { route: { name: 'bot' }, label: 'Bot', icon: Command, match: ['bot'] },
  {
    route: { name: 'community' },
    label: 'Community',
    icon: UsersThree,
    match: ['community'],
  },
  { route: { name: 'tips' }, label: 'Tips', icon: HandCoins, match: ['tips'] },
  {
    route: { name: 'history' },
    label: 'Insights',
    icon: ChartLine,
    match: ['history'],
    pro: 'history',
  },
  { route: { name: 'settings' }, label: 'Settings', icon: GearSix, match: ['settings', 'import'] },
]

const MOBILE_MAIN = ['home', 'chat', 'alerts', 'moderation']
const CLOUD_MAIN = ['cloud', 'chat', 'alerts', 'overlays']

/** Fired after the sidebar changes the theme, so an open Settings screen can follow. */
export const THEME_EVENT = 'fc-theme-change'

/**
 * Desktop window only: makes a one-time link and opens the dashboard in the default browser,
 * already linked. The desktop sends any pair link to the browser instead of loading it here.
 */
/** Opens the dashboard in the default browser, already linked (desktop window only). */
function useOpenInBrowser(): { open: (() => void) | null; busy: boolean } {
  const client = useClient()
  const [busy, setBusy] = useState(false)
  // A second click while the link is being made would make (and open) a second one.
  const opening = useRef(false)
  // The desktop window only (a phone's injected config has no session token).
  if (!window.__FERROCAST__?.token) return { open: null, busy }
  const open = () => {
    if (opening.current) return
    opening.current = true
    setBusy(true)
    client
      .pairCode()
      .then((l) => {
        // The query makes this a real navigation: a change after # alone stays inside the
        // page, and the desktop would never see it to hand it to the browser.
        window.location.assign(
          `${window.location.origin}/app/?browser=1#pair=${encodeURIComponent(l.code)}`,
        )
      })
      .catch((e: unknown) => {
        const d = describeError(e)
        toast({ tone: 'error', message: d.message, hint: d.hint })
      })
      .finally(() => {
        opening.current = false
        setBusy(false)
      })
  }
  return { open, busy }
}

/**
 * Desktop window only: makes a one-time link and opens the dashboard in the default browser,
 * already linked. The desktop sends any pair link to the browser instead of loading it here.
 */
function OpenInBrowser() {
  const { open, busy } = useOpenInBrowser()
  if (!open) return null
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="fc-press flex h-9 items-center gap-2.5 rounded-control px-2 text-[14.5px] font-medium text-text-3 hover:bg-surface-2 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none disabled:opacity-60"
    >
      <ArrowSquareOut size={17} />
      Open in browser
    </button>
  )
}

type ThemePref = 'system' | 'dark' | 'light'

function useTheme(): {
  theme: 'dark' | 'light'
  pref: ThemePref
  setPref: (p: ThemePref) => void
  toggle: () => void
} {
  const client = useClient()
  const readPref = (): ThemePref => {
    const t = document.documentElement.dataset.theme
    return t === 'dark' || t === 'light' ? t : 'system'
  }
  const resolve = (p: ThemePref): 'dark' | 'light' =>
    p !== 'system' ? p : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  const [pref, setPrefState] = useState(readPref)
  const [theme, setTheme] = useState(() => resolve(readPref()))
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)')
    const on = () => setTheme(resolve(readPref()))
    // Settings › Appearance changes it too.
    const onSet = () => {
      setPrefState(readPref())
      on()
    }
    mq.addEventListener('change', on)
    window.addEventListener(THEME_EVENT, onSet)
    return () => {
      mq.removeEventListener('change', on)
      window.removeEventListener(THEME_EVENT, onSet)
    }
  }, [])
  const setPref = (next: ThemePref) => {
    const root = document.documentElement
    if (next === 'system') delete root.dataset.theme
    else root.dataset.theme = next
    try {
      if (next === 'system') localStorage.removeItem('fc-theme')
      else localStorage.setItem('fc-theme', next)
    } catch {
      // ignore
    }
    setPrefState(next)
    setTheme(resolve(next))
    // Same place Settings › Appearance keeps it, so the two never disagree.
    void client
      .settings()
      .then((s) => client.saveSettings({ ...s, theme: next }))
      .then(() => window.dispatchEvent(new Event(THEME_EVENT)))
      .catch(() => {
        // The local choice above still applies; the engine copy catches up next time.
      })
  }
  return { theme, pref, setPref, toggle: () => setPref(theme === 'dark' ? 'light' : 'dark') }
}

function NavLink({
  item,
  active,
  onNavigate,
  seam = false,
  rail = false,
}: {
  item: NavItem
  active: boolean
  onNavigate?: () => void
  /** Pro: the active item carries the two-tone seam. */
  seam?: boolean
  /** The folded sidebar: the icon alone, its name as a tooltip (and for screen readers). */
  rail?: boolean
}) {
  const Icon = item.icon
  return (
    <a
      href={href(item.route)}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={rail ? item.label : undefined}
      className={cx(
        'fc-press group relative flex h-10 items-center gap-3 rounded-[6px] px-3 text-[15px] font-semibold whitespace-nowrap transition-colors duration-150',
        'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
        // The current page is plain to see: a Molten wash, a bar at its edge, bold Molten text.
        active
          ? 'bg-[color-mix(in_srgb,var(--fc-accent)_18%,transparent)] font-bold text-[var(--fc-molten-text)] shadow-[inset_3px_0_0_var(--fc-accent)]'
          : 'text-text-2 hover:bg-surface-2 hover:text-text',
      )}
    >
      {seam && active && (
        <span
          aria-hidden="true"
          className={cx(
            'fc-seam absolute top-2 bottom-2 w-[3px] rounded-r-[3px]',
            rail ? '-left-2.5' : '-left-3',
          )}
        />
      )}
      <Icon
        size={19}
        weight={active ? 'fill' : 'regular'}
        className={cx('shrink-0', active && 'text-[var(--fc-molten-text)]')}
      />
      <span className={cx(rail ? 'sr-only' : 'min-w-0 truncate')}>{item.label}</span>
    </a>
  )
}

const NAV_KEY = 'fc-nav-folded'

/**
 * The sidebar folds to a rail of icons and back when its logo is clicked (owner's pick
 * "A joined", 10 Nov); remembered on this computer. Folded by default: the Studio gets the
 * room. Its width is `--fc-nav-w` on the page, for the content and the Studio's status bar.
 */
function useNavFold(): [boolean, () => void] {
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(NAV_KEY) !== '0'
    } catch {
      return true
    }
  })
  // Before paint, so the Studio's status bar never starts at the other width.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--fc-nav-w', folded ? '60px' : '15rem')
    return () => {
      root.style.removeProperty('--fc-nav-w')
    }
  }, [folded])
  const flip = () =>
    setFolded((f) => {
      try {
        localStorage.setItem(NAV_KEY, f ? '0' : '1')
      } catch {
        // Private windows: it still folds, just isn't remembered.
      }
      return !f
    })
  return [folded, flip]
}

/** The chrome "PRO" mark by the logo, once Pro is on. */
function ProMark() {
  return (
    <span
      role="img"
      aria-label="Ferrocast Pro is on"
      className="fc-pro-mark inline-flex h-5 shrink-0 items-center rounded-full px-2 font-mono text-[11.5px] font-bold tracking-[0.06em]"
    >
      <span aria-hidden="true">PRO</span>
    </span>
  )
}

/** Bottom of the sidebar once Pro is on: who's signed in, and the plan. */
function AccountChip({ pro }: { pro: ProView }) {
  const connectors = useLive((s) => s.connectors)
  const name =
    connectors?.twitch.account?.name ??
    connectors?.youtube.account?.name ??
    connectors?.kick.account?.name ??
    'Your channel'
  const initials = accountInitials(name)
  return (
    <a
      href={href({ name: 'settings', section: 'pro' })}
      className="fc-press flex items-center gap-2.5 rounded-[12px] border border-line bg-surface-2 p-2.5 hover:border-line-strong focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
      data-testid="pro-account"
    >
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 font-display text-[13px] font-bold text-text"
      >
        {initials}
      </span>
      <span className="min-w-0">
        <b className="block truncate text-[14.5px] leading-tight font-semibold text-text">{name}</b>
        <small className="flex items-center gap-1 text-[13px] text-text-3">
          <SealCheck size={14} weight="fill" className="shrink-0 text-accent-text" aria-hidden />
          {proPlanLine(pro)}
        </small>
      </span>
    </a>
  )
}

/** The sidebar's seam draws down once, right after the unlock closes. */
function useSeamDraw(): boolean {
  const [draw, setDraw] = useState(false)
  useEffect(() => {
    const on = () => setDraw(true)
    window.addEventListener(PRO_UNLOCKED_EVENT, on)
    return () => window.removeEventListener(PRO_UNLOCKED_EVENT, on)
  }, [])
  return draw
}

/**
 * The sticky header's real height as `--fc-top` on the page (the phone's strip and the top
 * bar together, safe area included), so full-height screens like Chat fit the viewport
 * whatever the strip says or how it wraps.
 */
function useHeaderHeight() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const set = () =>
      root.style.setProperty('--fc-top', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    set()
    if (typeof ResizeObserver !== 'function') return () => root.style.removeProperty('--fc-top')
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--fc-top')
    }
  }, [])
  return ref
}

export function Shell({ children, demo }: { children: ReactNode; demo: boolean }) {
  const route = useRoute()
  const wide = useIsWide()
  const { theme, pref: themePref, setPref: setThemePref, toggle: toggleTheme } = useTheme()
  const [more, setMore] = useState(false)
  const [folded, flipNav] = useNavFold()
  const studio = route.name === 'studio'
  const notices = useLive((s) => s.notices)
  const remote = useLive((s) => s.remote)
  const conn = useLive((s) => s.conn)
  const dismiss = useLive((s) => s.dismissNotice)
  const reduce = useReducedMotion()
  useUpdateWatch()

  const firstRoute = useRef(true)
  useEffect(() => {
    setMore(false)
    if (firstRoute.current) {
      firstRoute.current = false
      return
    }
    // Move focus to the new screen so keyboard and screen-reader users land in it.
    document.getElementById('main')?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [route.name])

  const isActive = (i: NavItem) => i.match.includes(route.name)
  // Pro entries show only when their panel would (no nagging): a failed check hides them.
  const proView = useProStatus()
  const account = useAccount()
  const browser = useOpenInBrowser()
  // Pro on this PC, or (on the web dashboard) on the signed-in account.
  const isPro = (!remote && !!proView?.active) || accountIsPro(account)
  // The account bar: the app always (signing in is optional), the web host once it has
  // accounts. A mod's phone never shows it.
  const showAccount = !!account && account.state !== 'off' && (!remote || remote.role === 'owner')
  const seamDraw = useSeamDraw()
  // The PC is off and the cloud bot stands in: chat, bans and history only (M10).
  const limited = isLimited(remote)
  // The Studio's status bar along the window's bottom, as in OBS: on a computer-sized window
  // of this PC's own dashboard (not a phone through Ferrocast's servers).
  const desk = useMediaQuery('(min-width: 1024px)')
  const cloud = isCloud(conn)
  const nav = NAV.filter(
    (i) =>
      // Cloud mode: only what runs in the cloud; a PC's dashboard never lists Cloud.
      (cloud ? cloudScreenAllowed(i.route.name) : i.route.name !== 'cloud') &&
      // A phone can't read Pro's status (it stays on the PC): the relay says whether an
      // owner's phone gets history (`history` on /r/v1/me and the `remote` frame).
      (remote
        ? !i.pro ||
          (i.route.name === 'history' && remote.role === 'owner' && remote.history === true)
        : !i.pro ||
          // Insights is free with an account (30 days): listed whenever the relay keeps history.
          (i.pro === 'history'
            ? !!proView?.features.history
            : proPanelState(proView, i.pro) !== 'hidden')) &&
      // A phone through Ferrocast's servers: only its role's screens (hidden, not greyed).
      (!remote || remoteScreenAllowed(remote.role, i.route.name, limited)),
  )
  const main = cloud ? CLOUD_MAIN : limited ? [...MOBILE_MAIN, 'history'] : MOBILE_MAIN
  const headerRef = useHeaderHeight()
  const tabs = nav.filter((i) => main.includes(i.route.name))
  const ThemeIcon = theme === 'dark' ? Sun : Moon

  return (
    <div className="min-h-dvh bg-bg text-text">
      <a
        href="#main"
        onClick={(e) => {
          // Hash routing: don't let "#main" navigate; just move focus.
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only z-[80] rounded-control bg-btn-primary px-3 py-2 text-sm font-semibold text-on-btn-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar"
        className={cx(
          'fixed inset-y-0 left-0 z-30 hidden flex-col overflow-x-hidden border-r border-line bg-bg pt-3 pb-3 transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none lg:flex',
          // From state, not the page variable: right on the first paint, no slide on load.
          folded ? 'w-[60px] px-2.5' : 'w-60 px-3',
        )}
      >
        {isPro && (
          <motion.span
            // Remounts when the unlock closes, so the new `initial` draws it down once.
            key={seamDraw ? 'draw' : 'still'}
            aria-hidden="true"
            data-testid="pro-seam"
            className="fc-seam pointer-events-none absolute inset-y-0 right-0 w-px origin-top opacity-85"
            initial={seamDraw && !reduce ? { scaleY: 0 } : false}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.65, 0, 0.35, 1] }}
          />
        )}
        <div className={cx('mb-5 flex items-center gap-2', folded ? 'px-0' : 'px-1')}>
          {/* The logo folds the sidebar to icons and back (Home is the first item below). */}
          <button
            type="button"
            onClick={flipNav}
            aria-expanded={!folded}
            aria-label={folded ? 'Show the menu' : 'Hide the menu'}
            title={folded ? 'Show the menu' : 'Hide the menu'}
            className={cx(
              'fc-press group flex h-10 items-center gap-2 rounded-[6px] px-2 hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
              folded ? 'w-10 justify-center px-0' : 'min-w-0 flex-1',
            )}
          >
            {folded ? (
              <LogoMark size={24} />
            ) : (
              <>
                <Wordmark size="sm" />
                <SidebarSimple
                  size={17}
                  aria-hidden
                  className="ml-auto shrink-0 text-text-3 group-hover:text-text"
                />
              </>
            )}
          </button>
          {isPro && !folded && <ProMark />}
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {nav.map((i) => (
            <NavLink key={i.label} item={i} active={isActive(i)} seam={isPro} rail={folded} />
          ))}
        </nav>
        {folded ? (
          <div className="mt-auto flex flex-col items-center gap-1">
            {demo && (
              // Folded, demo mode still says so: a small mark that opens the sidebar's note.
              <button
                type="button"
                onClick={flipNav}
                aria-label="Demo mode: a simulated stream"
                title="Demo mode: a simulated stream"
                className="fc-press mb-1 rounded-full border border-accent-line bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.06em] text-accent-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                DEMO
              </button>
            )}
            <UpdateNavItem rail />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
              className="fc-press grid size-10 place-items-center rounded-[6px] text-text-3 hover:bg-surface-2 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              <ThemeIcon size={18} />
            </button>
            {/* The account and Pro live in the open sidebar: this opens it. */}
            <button
              type="button"
              onClick={flipNav}
              aria-label={account?.state === 'signed_in' ? 'Your account' : 'Sign in and Pro'}
              title={account?.state === 'signed_in' ? 'Your account' : 'Sign in and Pro'}
              className="fc-press grid size-10 place-items-center rounded-[6px] text-text-3 hover:bg-surface-2 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              {account?.state === 'signed_in' ? (
                <AccountAvatar view={account} pro={isPro} />
              ) : (
                <UserCircle size={22} />
              )}
            </button>
          </div>
        ) : (
          <div className="mt-auto flex flex-col gap-2 px-1">
            {demo && <DemoNote />}
            <UpdateNavItem />
            {showAccount && account ? (
              <SidebarAccount
                view={account}
                pro={isPro}
                planLine={proView?.active ? proPlanLine(proView) : null}
                utils={{ openInBrowser: browser.open, theme, toggleTheme, themePref, setThemePref }}
              />
            ) : (
              <>
                {isPro && proView && <AccountChip pro={proView} />}
                <OpenInBrowser />
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="fc-press flex h-9 items-center gap-2.5 rounded-control px-2 text-[14.5px] font-medium text-text-3 hover:bg-surface-2 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                >
                  <ThemeIcon size={17} />
                  {theme === 'dark' ? 'Light theme' : 'Dark theme'}
                </button>
              </>
            )}
          </div>
        )}
      </aside>

      <div
        className={cx(
          'transition-[padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
          folded ? 'lg:pl-[60px]' : 'lg:pl-60',
        )}
      >
        {/* Top bar */}
        <header
          ref={headerRef}
          className={cx(
            'sticky top-0 z-20 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] supports-[backdrop-filter]:bg-bg/85 supports-[backdrop-filter]:backdrop-blur-sm',
            // The Studio on a computer starts at its own one-row header (owner, 10 Nov): no
            // platform strip or Panic above it. Hidden, not removed, so Panic's shortcut still
            // works there.
            studio && 'lg:hidden',
          )}
        >
          {remote && <RemoteStrip remote={remote} />}
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <a href="#/home" className="shrink-0 lg:hidden" aria-label="Ferrocast home">
              <Wordmark
                size="sm"
                className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline"
              />
            </a>
            {isPro && (
              <span className="hidden shrink-0 sm:inline-flex lg:hidden">
                <ProMark />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="hidden sm:block">
                <StatusStrip />
              </div>
              <div className="sm:hidden">
                <StatusStrip compact />
              </div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="fc-press hidden size-9 items-center justify-center rounded-control text-text-3 hover:bg-surface-2 hover:text-text sm:inline-flex lg:hidden"
            >
              <ThemeIcon size={18} />
            </button>
            {showAccount && account?.state === 'signed_in' && (
              <a
                href={href({ name: 'account' })}
                aria-label="Account"
                data-testid="account-avatar-link"
                className="fc-press shrink-0 rounded-full focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none lg:hidden"
              >
                <AccountAvatar view={account} pro={isPro} size={32} />
              </a>
            )}
            {!limited && !cloud && <PanicButton />}
          </div>
        </header>

        <AnimatePresence initial={false}>
          {notices.map((n) => (
            <motion.div
              key={n.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              role={n.level === 'error' ? 'alert' : 'status'}
              className={cx(
                'overflow-hidden border-b',
                n.level === 'warn' && 'border-warn/30 bg-warn-soft',
                n.level === 'error' && 'border-danger/30 bg-danger-soft',
                n.level === 'info' && 'border-line bg-surface-1',
              )}
            >
              <div className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-6">
                <p className="min-w-0 flex-1 text-text">{n.message}</p>
                {n.action && (
                  <a
                    href={n.action.href}
                    className="shrink-0 font-semibold text-accent-text hover:underline"
                  >
                    {n.action.label}
                  </a>
                )}
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => dismiss(n.id)}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-text-3 hover:bg-surface-3 hover:text-text"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <main
          id="main"
          tabIndex={-1}
          className={cx(
            'mx-auto w-full px-4 pt-5 pb-[calc(88px+env(safe-area-inset-bottom))] outline-none sm:px-6 sm:pt-7',
            // Full-width screens (the Studio's desk fills the window) keep a small gap below.
            // The Studio's desk sits close to the window's edges, as a work screen.
            studio && wide
              ? 'max-w-none lg:px-3 lg:pt-2 lg:pb-[calc(0.5rem+var(--fc-statusbar,0px))]'
              : wide
                ? 'max-w-none lg:pb-[calc(1.25rem+var(--fc-statusbar,0px))]'
                : 'max-w-[1400px] lg:pb-[calc(3rem+var(--fc-statusbar,0px))]',
          )}
        >
          {children}
        </main>
      </div>

      {/* Phone tab bar */}
      <nav
        aria-label="Main"
        data-tab-bar
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] supports-[backdrop-filter]:bg-bg/85 supports-[backdrop-filter]:backdrop-blur-sm lg:hidden"
      >
        <ul
          className="mx-auto grid h-16 max-w-lg"
          style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
        >
          {tabs.map((i) => {
            const Icon = i.icon
            const active = isActive(i)
            return (
              <li key={i.label}>
                <a
                  href={href(i.route)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-full flex-col items-center justify-center gap-1 text-[13px] font-medium',
                    active ? 'text-text' : 'text-text-3',
                  )}
                >
                  <Icon
                    size={22}
                    weight={active ? 'fill' : 'regular'}
                    className={active ? 'text-[var(--fc-molten-text)]' : ''}
                  />
                  {i.label === 'Moderation' ? 'Mod' : i.label}
                </a>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-haspopup="dialog"
              className={cx(
                'flex h-full w-full flex-col items-center justify-center gap-1 text-[13px] font-medium',
                [
                  'overlays',
                  'overlay',
                  'bot',
                  'community',
                  'tips',
                  'history',
                  'settings',
                  'import',
                ].includes(route.name)
                  ? 'text-text'
                  : 'text-text-3',
              )}
            >
              <DotsThreeOutline size={22} />
              More
            </button>
          </li>
        </ul>
      </nav>

      {desk && !remote && <StudioStatusBar />}
      {!remote && <ProUnlock pro={proView} />}
      <UpdateDialogHost />

      <Dialog open={more} onClose={() => setMore(false)} title="More" size="sm">
        <nav aria-label="More" className="flex flex-col gap-1 pb-2">
          {nav
            .filter((i) => !main.includes(i.route.name))
            .map((i) => (
              <NavLink
                key={i.label}
                item={i}
                active={isActive(i)}
                onNavigate={() => setMore(false)}
              />
            ))}
          {isPro && proView && (
            <div className="mt-1">
              <AccountChip pro={proView} />
            </div>
          )}
          <UpdateNavItem roomy onOpen={() => setMore(false)} />
          <OpenInBrowser />
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium text-text-3 hover:bg-surface-2 hover:text-text"
          >
            <ThemeIcon size={19} />
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          {demo && (
            <div className="mt-2">
              <DemoNote />
            </div>
          )}
        </nav>
      </Dialog>
    </div>
  )
}

function DemoNote() {
  return (
    <div className="rounded-control border border-accent-line bg-accent-soft px-3 py-2.5 text-[14px] leading-snug text-text-2">
      <span className="font-semibold text-text">Demo mode.</span> This is a simulated stream. Open
      the dashboard from the Ferrocast app to see yours.
    </div>
  )
}
