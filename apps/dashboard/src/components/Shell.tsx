import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Bell,
  ChatsCircle,
  Command,
  DotsThreeOutline,
  GearSix,
  HandCoins,
  House,
  Moon,
  ShieldCheck,
  SquaresFour,
  Sun,
  UsersThree,
  X,
} from '@phosphor-icons/react'
import { Dialog, Wordmark, cx } from '@ferrocast/ui'
import { href, useRoute, type Route } from '../lib/router'
import { useLive } from '../lib/store'
import { StatusStrip } from './StatusStrip'
import { PanicButton } from './PanicButton'

type NavItem = { route: Route; label: string; icon: typeof House; match: Route['name'][] }

export const NAV: NavItem[] = [
  { route: { name: 'home' }, label: 'Home', icon: House, match: ['home', 'recap'] },
  { route: { name: 'chat' }, label: 'Chat', icon: ChatsCircle, match: ['chat'] },
  { route: { name: 'alerts' }, label: 'Alerts', icon: Bell, match: ['alerts'] },
  {
    route: { name: 'overlays' },
    label: 'Overlays',
    icon: SquaresFour,
    match: ['overlays', 'overlay'],
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
  { route: { name: 'settings' }, label: 'Settings', icon: GearSix, match: ['settings'] },
]

const MOBILE_MAIN = ['home', 'chat', 'alerts', 'moderation']

function useTheme(): ['dark' | 'light', () => void] {
  const read = (): 'dark' | 'light' => {
    const t = document.documentElement.dataset.theme
    if (t === 'dark' || t === 'light') return t
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)')
    const on = () => setTheme(read())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return [
    theme,
    () => {
      const next = theme === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem('fc-theme', next)
      } catch {
        // ignore
      }
      setTheme(next)
    },
  ]
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <a
      href={href(item.route)}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'fc-press group flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150',
        'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
        active ? 'bg-surface-3 text-text' : 'text-text-3 hover:bg-surface-2 hover:text-text',
      )}
    >
      <Icon
        size={19}
        weight={active ? 'fill' : 'regular'}
        className={active ? 'text-accent-text' : ''}
      />
      {item.label}
    </a>
  )
}

export function Shell({ children, demo }: { children: ReactNode; demo: boolean }) {
  const route = useRoute()
  const [theme, toggleTheme] = useTheme()
  const [more, setMore] = useState(false)
  const notices = useLive((s) => s.notices)
  const dismiss = useLive((s) => s.dismissNotice)
  const reduce = useReducedMotion()

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
        className="sr-only z-[80] rounded-control bg-accent px-3 py-2 text-sm font-semibold text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-bg px-3 pt-4 pb-3 lg:flex">
        <a
          href="#/home"
          className="mb-6 flex items-center px-2 focus-visible:outline-none"
          aria-label="Ferrocast home"
        >
          <Wordmark size="sm" />
        </a>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map((i) => (
            <NavLink key={i.label} item={i} active={isActive(i)} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-1">
          {demo && <DemoNote />}
          <button
            type="button"
            onClick={toggleTheme}
            className="fc-press flex h-9 items-center gap-2.5 rounded-control px-2 text-[13px] font-medium text-text-3 hover:bg-surface-2 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            <ThemeIcon size={17} />
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] supports-[backdrop-filter]:bg-bg/85 supports-[backdrop-filter]:backdrop-blur-sm">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <a href="#/home" className="shrink-0 lg:hidden" aria-label="Ferrocast home">
              <Wordmark
                size="sm"
                className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline"
              />
            </a>
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
            <PanicButton />
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
          className="mx-auto w-full max-w-[1400px] px-4 pt-5 pb-[calc(88px+env(safe-area-inset-bottom))] outline-none sm:px-6 sm:pt-7 lg:pb-12"
        >
          {children}
        </main>
      </div>

      {/* Phone tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] supports-[backdrop-filter]:bg-bg/85 supports-[backdrop-filter]:backdrop-blur-sm lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {NAV.filter((i) => MOBILE_MAIN.includes(i.route.name)).map((i) => {
            const Icon = i.icon
            const active = isActive(i)
            return (
              <li key={i.label}>
                <a
                  href={href(i.route)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
                    active ? 'text-text' : 'text-text-3',
                  )}
                >
                  <Icon
                    size={22}
                    weight={active ? 'fill' : 'regular'}
                    className={active ? 'text-accent-text' : ''}
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
                'flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
                ['overlays', 'overlay', 'bot', 'tips', 'settings'].includes(route.name)
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

      <Dialog open={more} onClose={() => setMore(false)} title="More" size="sm">
        <nav aria-label="More" className="flex flex-col gap-1 pb-2">
          {NAV.filter((i) => !MOBILE_MAIN.includes(i.route.name)).map((i) => (
            <NavLink
              key={i.label}
              item={i}
              active={isActive(i)}
              onNavigate={() => setMore(false)}
            />
          ))}
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
    <div className="rounded-control border border-accent-line bg-accent-soft px-3 py-2.5 text-[12.5px] leading-snug text-text-2">
      <span className="font-semibold text-text">Demo mode.</span> This is a simulated stream. Open
      the dashboard from the Ferrocast app to see yours.
    </div>
  )
}
