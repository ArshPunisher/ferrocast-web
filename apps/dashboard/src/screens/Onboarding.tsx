import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check } from '@phosphor-icons/react'
import { studioEngineApi } from '@ferrocast/api'
import { Button, SparkField, Wordmark, cx } from '@ferrocast/ui'
import { THEME_EVENT } from '../components/Shell'
import { THEME_APPLIED_EVENT } from '../lib/themes'
import { AccountRow, useConnect } from '../components/accounts'
import { ChoiceCard } from '../components/onboarding/ChoiceCard'
import {
  ImportStep,
  type ImportChoice,
  type ImportedCollectionState,
} from '../components/onboarding/ImportStep'
import { MediaCheckStep } from '../components/onboarding/MediaCheckStep'
import { done, useAction, useClient, useResource } from '../lib/hooks'
import { go } from '../lib/router'
import { useLive } from '../lib/store'

/** What Ferrocast is mostly for (OBS's auto-configuration asks the same first). */
type Use = 'stream' | 'record'

/** The picture sizes offered, biggest first. */
const SIZES = [
  { id: '2160', label: '4K', w: 3840, h: 2160 },
  { id: '1440', label: '1440p (2K)', w: 2560, h: 1440 },
  { id: '1080', label: '1080p (Full HD)', w: 1920, h: 1080 },
  { id: '720', label: '720p (HD)', w: 1280, h: 720 },
] as const
type Size = (typeof SIZES)[number]

/**
 * Video bitrate (kbps) for a size and frame rate: what Twitch and YouTube suggest for a
 * stream (6 Mbps at 1080p60, Twitch's top), more for 1440p and 4K (YouTube's).
 */
export function bitrateFor(h: number, fps: number): number {
  const at30: Record<number, number> = { 720: 3000, 1080: 4500, 1440: 9000, 2160: 20000 }
  const at60: Record<number, number> = { 720: 4500, 1080: 6000, 1440: 13500, 2160: 30000 }
  return (fps > 30 ? at60 : at30)[h] ?? 6000
}

/** The screen's own size in pixels (CSS size times its scaling). */
function screenPixels(): { w: number; h: number } {
  const d = window.devicePixelRatio || 1
  return { w: Math.round(window.screen.width * d), h: Math.round(window.screen.height * d) }
}

/** The biggest offered size that fits the screen, if any does. */
export function fitsScreen(screen: { w: number; h: number }): Size | undefined {
  return SIZES.find((s) => s.w <= screen.w && s.h <= screen.h)
}

/** What the picture starts at: the screen's size, else 1080p. */
export function sizeFor(screen: { w: number; h: number }): Size {
  return fitsScreen(screen) ?? SIZES[2]
}

const STREAM_STEPS = ['Import', 'Camera & mic', 'Use', 'Picture', 'Connect'] as const
const RECORD_STEPS = ['Import', 'Camera & mic', 'Use', 'Picture'] as const

function bgHex(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--fc-bg').trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#0a0b0d'
}

// a light page background means the light theme
const LIGHT_THEMES = new Set(['daylight', 'mist', 'linen', 'contrast', 'light'])
const DARK_THEMES = new Set([
  'graphite',
  'slate',
  'moonlight',
  'forest',
  'ember',
  'obsidian',
  'dark',
])

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 140
}

function isThemeLight(): boolean {
  const theme = document.documentElement.dataset.theme
  if (theme && LIGHT_THEMES.has(theme)) return true
  if (theme && DARK_THEMES.has(theme)) return false
  return isLight(bgHex())
}

export function Onboarding({ demo, onDone }: { demo: boolean; onDone: () => void }) {
  const client = useClient()
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const connectors = useLive((s) => s.connectors)
  const { connect, busy, dialog } = useConnect()
  const overlays = useResource((c) => c.overlays())
  const { run, busy: saving } = useAction()
  const engine = useMemo(() => studioEngineApi(client), [client])
  const [lightTheme, setLightTheme] = useState(isThemeLight)
  useEffect(() => {
    const sync = () => setLightTheme(isThemeLight())
    sync()
    window.addEventListener(THEME_EVENT, sync)
    window.addEventListener(THEME_APPLIED_EVENT, sync)
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    mq?.addEventListener?.('change', sync)
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    return () => {
      window.removeEventListener(THEME_EVENT, sync)
      window.removeEventListener(THEME_APPLIED_EVENT, sync)
      mq?.removeEventListener?.('change', sync)
      mo.disconnect()
    }
  }, [])
  const shouldFocusRef = useRef(false)
  const headingRef = useCallback((el: HTMLHeadingElement | null) => {
    if (!el || !shouldFocusRef.current) return
    shouldFocusRef.current = false
    el.focus({ preventScroll: true })
    // A new step starts at its top, not where the last (longer) one was scrolled to.
    window.scrollTo({ top: 0 })
  }, [])

  const [importChoice, setImportChoice] = useState<ImportChoice>('fresh')
  const [imported, setImported] = useState<ImportedCollectionState | null>(null)
  const [importDone, setImportDone] = useState(false)
  const [mediaChecked, setMediaChecked] = useState(false)
  const [editedAfterImport, setEditedAfterImport] = useState(false)

  const anyConnected = (['twitch', 'youtube', 'kick'] as const).some(
    (p) => connectors?.[p].state === 'connected',
  )
  const [use, setUse] = useState<Use>('stream')
  const screen = useMemo(screenPixels, [])
  const [size, setSize] = useState<Size>(() => sizeFor(screen))
  const [fps, setFps] = useState(60)
  const [pictureDone, setPictureDone] = useState(false)
  const steps = use === 'record' ? RECORD_STEPS : STREAM_STEPS
  const stepDone = (i: number) =>
    [importDone || imported !== null, mediaChecked, step > 2, pictureDone, anyConnected][i] ?? false

  const goTo = (n: number) => {
    shouldFocusRef.current = true
    setDir(n > step ? 1 : -1)
    setStep(n)
  }

  // Apply canvas & encoder choices (skipped when demo engine does not emulate desktop studio).
  const applyPicture = async () => {
    const saved = demo
      ? true
      : await run('picture', async () => {
          const s = await engine.studioSettings()
          await engine.setStudioSettings({
            ...s,
            width: size.w,
            height: size.h,
            fps,
            scale: null,
            encoder: 'hardware',
            video_kbps: bitrateFor(size.h, fps),
            record_quality: 'high',
          })
          return true
        })
    if (!saved) return
    setPictureDone(true)
    if (use === 'record') {
      const ok = await run('finish', () => done(client.completeSetup()))
      if (!ok) return
      go({ name: 'studio' })
      onDone()
      return
    }
    goTo(4)
  }

  // Ends setup. A fresh install also gets the starter overlay in the default look cleanly.
  const completeSetup = async () => {
    if (overlays.data?.length === 0) {
      try {
        await client.createOverlay('Main', 'starter')
      } catch {
        // Overlays offers to make one later.
      }
    }
    return done(client.completeSetup())
  }

  const finish = () => void run('finish', completeSetup).then((ok) => ok && onDone())
  const finishToImport = () =>
    void run('import', completeSetup).then((ok) => {
      if (!ok) return
      go({ name: 'import' })
      onDone()
    })

  const variants = {
    enter: (d: number) => (reduce ? { opacity: 1 } : { opacity: 0, x: d * 24 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => (reduce ? { opacity: 1 } : { opacity: 0, x: d * -24 }),
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-bg lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="relative hidden overflow-hidden border-r border-line lg:block">
        <SparkField
          light={lightTheme}
          className="absolute inset-0 h-full w-full"
          label="The Ferrocast Spark forming from points of light"
        />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="max-w-[24ch] font-display text-[34px] leading-[1.08] font-bold tracking-[-0.03em] text-text">
            Your stream, on your computer.
          </p>
          <p className="mt-3 max-w-[40ch] text-sm leading-relaxed text-text-2">
            Streaming, recording, alerts and chat for Twitch, YouTube and Kick. A few steps and
            you&rsquo;re ready.
          </p>
        </div>
      </div>
      <main
        id="main"
        className="flex min-h-dvh min-w-0 flex-col px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] sm:px-10"
      >
        <div className="flex items-center justify-between">
          <Wordmark size="sm" />
          {demo && <span className="text-[13.5px] text-text-3">Demo mode</span>}
        </div>
        <ol
          className="mt-8 flex flex-wrap items-center gap-1.5 sm:gap-2"
          aria-label="Setup progress"
        >
          {steps.map((s, i) => (
            <li
              key={s}
              className="flex items-center gap-1.5 sm:gap-2"
              aria-current={i === step ? 'step' : undefined}
            >
              <span
                className={cx(
                  'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition-colors',
                  i === step
                    ? 'bg-btn-primary text-on-btn-primary'
                    : stepDone(i)
                      ? 'bg-ok-fill text-white'
                      : 'bg-surface-3 text-text-3',
                )}
              >
                {i !== step && stepDone(i) ? <Check size={13} weight="bold" /> : i + 1}
                <span className="sr-only">
                  {i === step
                    ? ' (current step)'
                    : stepDone(i)
                      ? ' (done)'
                      : i < step
                        ? ' (skipped)'
                        : ''}
                </span>
              </span>
              <span
                className={cx(
                  'sr-only sm:not-sr-only sm:inline sm:text-[13.5px] sm:font-medium',
                  i === step ? 'text-text' : 'text-text-3',
                )}
              >
                {s}
              </span>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="h-px w-4 bg-line-strong sm:w-7" />
              )}
            </li>
          ))}
        </ol>
        <div className="relative mt-8 min-w-0 flex-1">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.section
              key={step}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={reduce ? { duration: 0 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-w-2xl flex-col gap-5"
              aria-labelledby={`step-${step}`}
            >
              {step === 0 && (
                <ImportStep
                  engine={engine}
                  headingId="step-0"
                  headingRef={headingRef}
                  choice={importChoice}
                  onChoiceChange={setImportChoice}
                  imported={imported}
                  editedAfterImport={editedAfterImport}
                  onImportedChange={(next) => {
                    setImported(next)
                    if (!next) {
                      setImportDone(false)
                      setMediaChecked(false)
                      setEditedAfterImport(false)
                    }
                  }}
                  onContinue={() => {
                    setImportDone(true)
                    goTo(1)
                  }}
                />
              )}

              {step === 1 && (
                <MediaCheckStep
                  engine={engine}
                  headingId="step-1"
                  headingRef={headingRef}
                  onBack={() => goTo(0)}
                  onEdited={() => imported && setEditedAfterImport(true)}
                  onContinue={() => {
                    setMediaChecked(true)
                    goTo(2)
                  }}
                />
              )}

              {step === 2 && (
                <>
                  <div>
                    <h1
                      id="step-2"
                      ref={headingRef}
                      tabIndex={-1}
                      className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-balance focus:outline-none sm:text-[32px]"
                    >
                      What will you use Ferrocast for?
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-text-2">
                      Ferrocast sets up the picture and the encoding for it. You can change any of
                      it later in the Studio&rsquo;s settings.
                    </p>
                  </div>
                  <div role="radiogroup" aria-label="Use" className="grid gap-2 sm:grid-cols-2">
                    <ChoiceCard
                      name="use"
                      checked={use === 'stream'}
                      onPick={() => setUse('stream')}
                      title="Streaming"
                      detail="Go live on Twitch, YouTube and Kick, with alerts and chat. Recordings use the same settings."
                    />
                    <ChoiceCard
                      name="use"
                      checked={use === 'record'}
                      onPick={() => setUse('record')}
                      title="Recording only"
                      detail="Videos on this computer at high quality. No accounts or alerts needed."
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      size="lg"
                      variant="ghost"
                      icon={<ArrowLeft size={18} />}
                      onClick={() => goTo(1)}
                    >
                      Back
                    </Button>
                    <Button
                      size="lg"
                      variant="primary"
                      onClick={() => goTo(3)}
                      icon={<ArrowRight size={18} />}
                      className="flex-row-reverse"
                    >
                      Continue
                    </Button>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div>
                    <h1
                      id="step-3"
                      ref={headingRef}
                      tabIndex={-1}
                      className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-balance focus:outline-none sm:text-[32px]"
                    >
                      Picture size and smoothness
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-text-2">
                      Your screen is {screen.w} &times; {screen.h}.{' '}
                      {use === 'stream'
                        ? 'Twitch and Kick show up to 1080p; YouTube takes 1440p and 4K.'
                        : 'Bigger and smoother makes bigger files.'}
                    </p>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Picture size"
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    {SIZES.map((s) => (
                      <ChoiceCard
                        key={s.id}
                        name="size"
                        checked={size.id === s.id}
                        onPick={() => setSize(s)}
                        title={s.label}
                        badge={s.id === fitsScreen(screen)?.id ? 'Your screen' : undefined}
                        detail={
                          s.w > screen.w || s.h > screen.h
                            ? `${s.w} × ${s.h}: bigger than your screen, so no sharper.`
                            : use === 'stream' && s.h > 1080
                              ? `${s.w} × ${s.h}: for YouTube; Twitch and Kick get it smaller.`
                              : `${s.w} × ${s.h}`
                        }
                      />
                    ))}
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Frames per second"
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <ChoiceCard
                      name="fps"
                      checked={fps === 60}
                      onPick={() => setFps(60)}
                      title="60 fps"
                      detail="Smooth: games and fast movement."
                    />
                    <ChoiceCard
                      name="fps"
                      checked={fps === 30}
                      onPick={() => setFps(30)}
                      title="30 fps"
                      detail="Lighter on the computer and the connection: talk and slower shows."
                    />
                  </div>
                  <p className="text-[14px] text-text-3">
                    {use === 'stream'
                      ? `Streams at ${(bitrateFor(size.h, fps) / 1000).toLocaleString()} Mbps with your graphics card’s encoder.`
                      : 'Records at high quality with your graphics card’s encoder.'}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      size="lg"
                      variant="ghost"
                      icon={<ArrowLeft size={18} />}
                      onClick={() => goTo(2)}
                    >
                      Back
                    </Button>
                    <Button
                      size="lg"
                      variant="primary"
                      busy={saving === 'picture' || saving === 'finish'}
                      onClick={() => void applyPicture()}
                    >
                      {use === 'record' ? 'Done: open the Studio' : 'Use these settings'}
                    </Button>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <div>
                    <h1
                      id="step-4"
                      ref={headingRef}
                      tabIndex={-1}
                      className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-balance focus:outline-none sm:text-[32px]"
                    >
                      Connect where you stream
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-text-2">
                      One click each. You sign in on the platform&rsquo;s own page; Ferrocast never
                      sees your password.
                    </p>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {(['twitch', 'youtube', 'kick'] as const).map((p) => (
                      <AccountRow
                        key={p}
                        platform={p}
                        busy={busy === p}
                        onConnect={() => void connect(p)}
                      />
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      size="lg"
                      variant="ghost"
                      icon={<ArrowLeft size={18} />}
                      onClick={() => goTo(3)}
                    >
                      Back
                    </Button>
                    <Button
                      size="lg"
                      variant="primary"
                      busy={saving === 'finish'}
                      disabled={saving !== null}
                      onClick={finish}
                      icon={<ArrowRight size={18} />}
                      className="flex-row-reverse"
                    >
                      {anyConnected ? 'Finish' : 'Skip for now'}
                    </Button>
                    {!anyConnected && (
                      <span className="text-[14px] text-text-3">
                        You can connect later in Settings.
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] text-text-3">
                    Coming from StreamElements or Streamlabs?{' '}
                    <button
                      type="button"
                      onClick={finishToImport}
                      disabled={saving !== null}
                      className="rounded-sm font-medium text-accent-text underline underline-offset-2 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none disabled:opacity-50"
                    >
                      Bring your commands and points
                    </button>
                  </p>
                </>
              )}
            </motion.section>
          </AnimatePresence>
        </div>
      </main>
      {dialog}
    </div>
  )
}
