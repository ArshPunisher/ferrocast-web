import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { ApiError, describeError, type FerroEvent } from '@ferrocast/api'
import { Button, SparkMark, Skeleton, Toaster, Wordmark } from '@ferrocast/ui'
import { clearSession, connect, demo, pair, pairCodeFromHash, type Connection } from './lib/boot'
import { startLive, stopLive, useLive } from './lib/store'
import { useRoute } from './lib/router'
import { Shell } from './components/Shell'
import { Home } from './screens/Home'
import { StudioGlobal } from './components/studio/moments'

// Home is in the first bundle; other screens load when first opened.
const Chat = lazy(() => import('./screens/Chat').then((m) => ({ default: m.Chat })))
const Alerts = lazy(() => import('./screens/Alerts').then((m) => ({ default: m.Alerts })))
const Overlays = lazy(() => import('./screens/Overlays').then((m) => ({ default: m.Overlays })))
const OverlayEditor = lazy(() =>
  import('./screens/OverlayEditor').then((m) => ({ default: m.OverlayEditor })),
)
const Moderation = lazy(() =>
  import('./screens/Moderation').then((m) => ({ default: m.Moderation })),
)
const Bot = lazy(() => import('./screens/Bot').then((m) => ({ default: m.Bot })))
const Community = lazy(() => import('./screens/Community').then((m) => ({ default: m.Community })))
const Recap = lazy(() => import('./screens/Recap').then((m) => ({ default: m.Recap })))
const Tips = lazy(() => import('./screens/Tips').then((m) => ({ default: m.Tips })))
const Designs = lazy(() => import('./screens/Designs').then((m) => ({ default: m.Designs })))
const Designer = lazy(() => import('./screens/Designer').then((m) => ({ default: m.Designer })))
const Import = lazy(() => import('./screens/Import').then((m) => ({ default: m.Import })))
const Studio = lazy(() => import('./screens/Studio').then((m) => ({ default: m.Studio })))
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })))
const Onboarding = lazy(() =>
  import('./screens/Onboarding').then((m) => ({ default: m.Onboarding })),
)

type Phase =
  | { kind: 'booting' }
  | { kind: 'pairing'; base: string; code: string; error: string | null; hint: string | null }
  | { kind: 'failed'; error: ApiError | null; message: string; hint: string | null }
  | { kind: 'ready' }

async function hydrate(conn: Connection): Promise<boolean> {
  const live = useLive.getState()
  live.setConn(conn)
  const status = await conn.client.status()
  live.setStatus(status)
  const [chat, page, queue, tts, stats] = await Promise.all([
    conn.client.chat(200).catch(() => [] as FerroEvent[]),
    conn.client
      .events({ limit: 60 })
      .catch(() => ({ events: [] as FerroEvent[], next_before: null })),
    conn.client.queue().catch(() => null),
    conn.client.ttsPending().catch(() => []),
    conn.client.sessionStats().catch(() => null),
  ])
  live.seed({ chat, events: page.events })
  if (queue) live.setQueue(queue)
  live.setTts(tts)
  if (stats) useLive.setState({ viewers: stats.viewers })
  startLive(conn)
  return status.setup_done
}

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'booting' })
  const [setupDone, setSetupDone] = useState(true)
  const conn = useLive((s) => s.conn)
  const route = useRoute()

  // StrictMode (and "Try again") can start a boot while another is still running; only
  // the newest one may change what's on screen.
  const bootId = useRef(0)

  const start = useCallback(async (c: Connection, id: number) => {
    try {
      const done = await hydrate(c)
      if (id !== bootId.current) return
      setSetupDone(done)
      setPhase({ kind: 'ready' })
    } catch (e) {
      if (id !== bootId.current) return
      stopLive()
      const err = e instanceof ApiError ? e : null
      const d = describeError(e)
      if (err?.status === 401 && c.mode === 'browser') clearSession()
      setPhase({ kind: 'failed', error: err, message: d.message, hint: d.hint })
    }
  }, [])

  const boot = useCallback(async () => {
    const id = ++bootId.current
    setPhase({ kind: 'booting' })
    const r = await connect()
    if (id !== bootId.current) return
    if ('unpaired' in r) {
      setPhase({
        kind: 'failed',
        error: null,
        message: 'Link this browser to Ferrocast',
        hint: 'In the Ferrocast app, open Settings → Advanced → “Make a link”, then open that link here. Links work once and last 2 minutes.',
      })
      return
    }
    if ('pairing' in r) {
      setPhase({
        kind: 'pairing',
        base: r.pairing.base,
        code: r.pairing.code,
        error: null,
        hint: null,
      })
      try {
        const c = await pair(r.pairing.base, r.pairing.code)
        if (id !== bootId.current) return
        await start(c, id)
      } catch (e) {
        if (id !== bootId.current) return
        // The code is single use: drop it so "Try again" doesn't resend a spent code.
        history.replaceState(null, '', location.pathname + location.search)
        const d = describeError(e)
        setPhase({
          kind: 'pairing',
          base: r.pairing.base,
          code: r.pairing.code,
          error: d.message,
          hint: d.hint,
        })
      }
      return
    }
    await start(r, id)
  }, [start])

  useEffect(() => {
    void boot()
    return () => stopLive()
  }, [boot])

  // A pairing link pasted into a tab that's already open only changes the hash: pair now
  // instead of waiting for a reload.
  useEffect(() => {
    const onHash = () => {
      if (pairCodeFromHash()) void boot()
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [boot])

  const tryDemo = async () => {
    const id = ++bootId.current
    setPhase({ kind: 'booting' })
    await start(await demo(), id)
  }

  if (phase.kind === 'booting' || (phase.kind === 'ready' && !conn)) return <Splash />
  if (phase.kind === 'pairing')
    return <Pairing phase={phase} onRetry={() => void boot()} onDemo={() => void tryDemo()} />
  if (phase.kind === 'failed')
    return <BootFailed phase={phase} onRetry={() => void boot()} onDemo={() => void tryDemo()} />

  const isDemo = conn?.mode === 'demo'
  if (!setupDone)
    return (
      <>
        <ScreenBoundary>
          <Suspense fallback={<Splash />}>
            <Onboarding demo={isDemo} onDone={() => setSetupDone(true)} />
          </Suspense>
        </ScreenBoundary>
        <Toaster />
      </>
    )

  let screen
  switch (route.name) {
    case 'chat':
      screen = <Chat />
      break
    case 'alerts':
      screen = <Alerts ruleId={route.rule} />
      break
    case 'overlays':
      screen = <Overlays />
      break
    case 'overlay':
      screen = <OverlayEditor id={route.id} />
      break
    case 'moderation':
      screen = <Moderation />
      break
    case 'bot':
      screen = <Bot />
      break
    case 'community':
      screen = <Community section={route.section} />
      break
    case 'recap':
      screen = <Recap />
      break
    case 'tips':
      screen = <Tips />
      break
    case 'settings':
      screen = <Settings section={route.section} />
      break
    case 'import':
      screen = <Import source={route.source} demo={isDemo} />
      break
    case 'designs':
      screen = <Designs tab={route.tab ?? 'themes'} />
      break
    case 'designer':
      screen = <Designer id={route.id} />
      break
    case 'studio':
      screen = <Studio section={route.section} />
      break
    default:
      screen = <Home />
  }
  return (
    <>
      <Shell demo={isDemo}>
        <ScreenBoundary key={route.name}>
          <Suspense fallback={<ScreenLoading />}>{screen}</Suspense>
        </ScreenBoundary>
      </Shell>
      <StudioGlobal />
      <Toaster />
    </>
  )
}

/**
 * Keeps one broken screen (a render bug, or a chunk that vanished because the app updated
 * while this tab was open) from blanking the whole dashboard.
 */
class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Screen failed to render', error, info.componentStack)
  }
  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="alert"
        className="flex max-w-lg flex-col items-start gap-3 rounded-panel border border-danger/30 bg-danger-soft p-5"
      >
        <h1 className="font-display text-lg font-semibold">This screen couldn’t open.</h1>
        <p className="text-sm text-text-2">
          Ferrocast may have updated while this window was open. Reloading fixes it, and nothing you
          saved is lost.
        </p>
        <Button variant="primary" onClick={() => location.reload()}>
          Reload
        </Button>
      </div>
    )
  }
}

function ScreenLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-64" />
    </div>
  )
}

function Splash() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg"
      role="status"
      aria-label="Starting Ferrocast"
    >
      <SparkMark size={72} />
      <p className="text-sm text-text-3">Connecting to Ferrocast…</p>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-10">
      <div className="flex w-full max-w-md flex-col items-start gap-5">
        <Wordmark />
        {children}
      </div>
    </main>
  )
}

function Pairing({
  phase,
  onRetry,
  onDemo,
}: {
  phase: Extract<Phase, { kind: 'pairing' }>
  onRetry: () => void
  onDemo: () => void
}) {
  return (
    <Centered>
      {phase.error ? (
        <div role="alert" className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">{phase.error}</h1>
          {phase.hint && <p className="text-sm leading-relaxed text-text-2">{phase.hint}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
            <Button variant="ghost" onClick={onDemo}>
              Look around the demo
            </Button>
          </div>
        </div>
      ) : (
        <div role="status" className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">Linking this browser…</h1>
          <p className="text-sm text-text-2">
            Using the one-time code <span className="font-mono text-text">{phase.code}</span> from
            your Ferrocast app.
          </p>
        </div>
      )}
    </Centered>
  )
}

function BootFailed({
  phase,
  onRetry,
  onDemo,
}: {
  phase: Extract<Phase, { kind: 'failed' }>
  onRetry: () => void
  onDemo: () => void
}) {
  const offline = phase.error?.offline ?? false
  return (
    <Centered>
      <div role="alert" className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">{phase.message}</h1>
        {phase.hint && <p className="text-sm leading-relaxed text-text-2">{phase.hint}</p>}
        {offline && (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-text-2">
            <li>Open the Ferrocast app (it may be in your tray or menu bar).</li>
            <li>Choose “Open in browser” to get a fresh link.</li>
          </ol>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="ghost" onClick={onDemo}>
            Look around the demo
          </Button>
        </div>
      </div>
    </Centered>
  )
}
