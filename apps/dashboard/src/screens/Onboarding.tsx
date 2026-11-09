import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check } from '@phosphor-icons/react'
import { studioEngineApi } from '@ferrocast/api'
import { Button, SparkField, Wordmark, cx } from '@ferrocast/ui'
import { AccountRow, useConnect } from '../components/accounts'
import { done, useAction, useClient, useResource } from '../lib/hooks'
import { useLive } from '../lib/store'
import { go } from '../lib/router'

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

/** One pick of a radio group, as a card (the look picker's style). */
function Choice({
  name,
  checked,
  onPick,
  title,
  detail,
  badge,
}: {
  name: string
  checked: boolean
  onPick: () => void
  title: string
  detail: string
  badge?: string | undefined
}) {
  return (
    <label
      className={cx(
        'flex cursor-pointer flex-col gap-1 rounded-[12px] border px-4 py-3 transition-colors has-[:focus-visible]:shadow-[var(--fc-focus)]',
        checked ? 'fc-picked border-transparent' : 'border-line hover:border-line-strong',
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onPick} />
      <span className="flex items-center gap-2">
        <span className="text-[15px] font-bold text-text">{title}</span>
        {badge && (
          <span className="rounded-full border border-current px-2 py-px text-[12px] font-medium opacity-80">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[13.5px] leading-snug text-text-2">{detail}</span>
    </label>
  )
}

// Setup ends at Connect: the look and adding the overlay live in Overlays (owner, 10 Nov).
const STREAM_STEPS = ['Use', 'Picture', 'Connect'] as const
const RECORD_STEPS = ['Use', 'Picture'] as const

function bgHex(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--fc-bg').trim()
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#0a0b0d'
}

// a light page background means the light theme
const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 140
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
  const bg = useMemo(bgHex, [])
  const anyConnected = (['twitch', 'youtube', 'kick'] as const).some(
    (p) => connectors?.[p].state === 'connected',
  )
  // First what it's for and the picture (as OBS's auto-configuration), then the rest.
  const [use, setUse] = useState<Use>('stream')
  const screen = useMemo(screenPixels, [])
  const [size, setSize] = useState<Size>(() => sizeFor(screen))
  const [fps, setFps] = useState(60)
  const [pictureDone, setPictureDone] = useState(false)
  const steps = use === 'record' ? RECORD_STEPS : STREAM_STEPS
  // A step only gets its tick when it was really done: skipping "Connect" leaves it open.
  const stepDone = (i: number) => [step > 0, pictureDone, anyConnected][i] ?? false

  const goTo = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
  }
  // The picture and encoding for what it's for: the canvas at that size and rate, a bitrate
  // that fits it, recordings at high quality when that's the point. The demo has no Studio.
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
            record_quality: use === 'record' ? 'high' : 'stream',
          })
          return true
        })
    if (!saved) return
    setPictureDone(true)
    if (use === 'record') {
      // Nothing to connect or show on stream: straight to the Studio.
      const ok = await run('finish', () => done(client.completeSetup()))
      if (!ok) return
      go({ name: 'studio' })
      onDone()
      return
    }
    goTo(2)
  }
  // Ends setup. A fresh install also gets the starter overlay in the default look, quietly
  // (it was made by the removed "Pick a look" step), so alerts and chat have somewhere to show.
  const completeSetup = async () => {
    if (overlays.data?.length === 0) {
      try {
        await client.createOverlay('Main', 'starter')
      } catch {
        // Not needed to finish: Overlays offers to make one.
      }
    }
    return done(client.completeSetup())
  }
  const finish = () => void run('finish', completeSetup).then((ok) => ok && onDone())
  // Finishes setup and opens the importer (for people moving from StreamElements or Streamlabs).
  const finishToImport = () =>
    void run('import', completeSetup).then((ok) => {
      if (!ok) return
      go({ name: 'import' })
      onDone()
    })

  const variants = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * 24 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * -24 }),
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-bg lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="relative hidden overflow-hidden border-r border-line lg:block">
        <SparkField
          light={isLight(bg)}
          className="absolute inset-0 h-full w-full"
          label="The Ferrocast Spark forming from points of light"
        />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="max-w-[24ch] font-display text-[34px] leading-[1.08] font-bold tracking-[-0.03em] text-text">
            Your stream, on your computer.
          </p>
          <p className="mt-3 max-w-[40ch] text-sm leading-relaxed text-text-2">
            Streaming, recording, alerts and chat for Twitch, YouTube and Kick. A few questions and
            you’re ready.
          </p>
        </div>
      </div>
      <main
        id="main"
        className="flex min-h-dvh flex-col px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] sm:px-10"
      >
        <div className="flex items-center justify-between">
          <Wordmark size="sm" />
          {demo && <span className="text-[13.5px] text-text-3">Demo mode</span>}
        </div>
        <ol className="mt-8 flex items-center gap-2" aria-label="Setup progress">
          {steps.map((s, i) => (
            <li
              key={s}
              className="flex items-center gap-2"
              aria-current={i === step ? 'step' : undefined}
            >
              <span
                className={cx(
                  'inline-flex size-6 items-center justify-center rounded-full text-[13px] font-semibold transition-colors',
                  i === step
                    ? 'bg-btn-primary text-on-btn-primary'
                    : stepDone(i)
                      ? 'bg-ok text-white'
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
                  'hidden text-[14px] font-medium sm:inline',
                  i === step ? 'text-text' : 'text-text-3',
                )}
              >
                {s}
              </span>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="h-px w-6 bg-line-strong sm:w-10" />
              )}
            </li>
          ))}
        </ol>
        <div className="relative mt-8 flex-1">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.section
              key={step}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-w-2xl flex-col gap-5"
              aria-labelledby={`step-${step}`}
            >
              {step === 0 && (
                <>
                  <div>
                    <h1
                      id="step-0"
                      className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-balance sm:text-[32px]"
                    >
                      What will you use Ferrocast for?
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-text-2">
                      Ferrocast sets up the picture and the encoding for it. You can change any of
                      it later in the Studio’s settings.
                    </p>
                  </div>
                  <div role="radiogroup" aria-label="Use" className="grid gap-2 sm:grid-cols-2">
                    <Choice
                      name="use"
                      checked={use === 'stream'}
                      onPick={() => setUse('stream')}
                      title="Streaming"
                      detail="Go live on Twitch, YouTube and Kick, with alerts and chat. Recordings use the same settings."
                    />
                    <Choice
                      name="use"
                      checked={use === 'record'}
                      onPick={() => setUse('record')}
                      title="Recording only"
                      detail="Videos on this computer at high quality. No accounts or alerts needed."
                    />
                  </div>
                  <div>
                    <Button
                      size="lg"
                      variant="primary"
                      onClick={() => goTo(1)}
                      icon={<ArrowRight size={18} />}
                      className="flex-row-reverse"
                    >
                      Continue
                    </Button>
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <div>
                    <h1
                      id="step-1"
                      className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-balance sm:text-[32px]"
                    >
                      Picture size and smoothness
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-text-2">
                      Your screen is {screen.w} × {screen.h}.{' '}
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
                      <Choice
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
                    <Choice
                      name="fps"
                      checked={fps === 60}
                      onPick={() => setFps(60)}
                      title="60 fps"
                      detail="Smooth: games and fast movement."
                    />
                    <Choice
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
                  <div className="flex gap-3">
                    <Button
                      size="lg"
                      variant="ghost"
                      icon={<ArrowLeft size={18} />}
                      onClick={() => goTo(0)}
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
              {step === 2 && (
                <>
                  <div>
                    <h1
                      id="step-2"
                      className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-balance sm:text-[32px]"
                    >
                      Connect where you stream
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-text-2">
                      One click each. You sign in on the platform’s own page; Ferrocast never sees
                      your password.
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
                      onClick={() => goTo(1)}
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
