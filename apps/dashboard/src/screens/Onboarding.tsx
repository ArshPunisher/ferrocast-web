import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, CopySimple } from '@phosphor-icons/react'
import {
  DEFAULT_THEME,
  anySample,
  defaultRules,
  renderAlert,
  selectAlert,
  type Overlay,
  type Theme,
} from '@ferrocast/api'
import { Button, Skeleton, SparkField, Wordmark, copyText, cx, toast } from '@ferrocast/ui'
import { AccountRow, useConnect } from '../components/accounts'
import { AlertStage } from '../components/AlertStage'
import { ObsIcon, useAddToObs } from '../components/obs'
import { done, useAction, useClient, useResource } from '../lib/hooks'
import { useLive } from '../lib/store'
import { go } from '../lib/router'

const STEPS = ['Connect', 'Pick a look', 'Add to OBS'] as const

function previewAlert() {
  const e = anySample('subscription')
  if (!e) return null
  const sel = selectAlert(defaultRules(), e)
  return sel ? { ...renderAlert('onboarding', sel.rule, sel.variation, e), sound: null } : null
}

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
  const themes = useResource((c) => c.themes())
  const overlays = useResource((c) => c.overlays())
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const { run, busy: saving } = useAction()
  const { add, busy: adding, guide } = useAddToObs()
  const [added, setAdded] = useState(false)
  const alert = useMemo(previewAlert, [])
  const bg = useMemo(bgHex, [])
  const anyConnected = (['twitch', 'youtube', 'kick'] as const).some(
    (p) => connectors?.[p].state === 'connected',
  )
  const main: Overlay | undefined = overlays.data?.[0]

  const goTo = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
  }
  const applyTheme = async () => {
    // A fresh install has no overlay yet: make the starter one, then give it the look.
    const base = main ?? (await run('theme', () => client.createOverlay('Main', 'starter')))
    if (!base) return
    if (!main) overlays.set((p) => [...(p ?? []), base])
    const next: Overlay = {
      ...base,
      widgets: base.widgets.map((w) => ({ ...w, config: { ...w.config, theme } }) as typeof w),
    }
    const saved = await run('theme', () => client.saveOverlay(next))
    if (saved) overlays.set((p) => (p ?? []).map((o) => (o.id === saved.id ? saved : o)))
    goTo(2)
  }
  const finish = () =>
    void run('finish', () => done(client.completeSetup())).then((ok) => ok && onDone())
  // Finishes setup and opens the importer (for people moving from StreamElements or Streamlabs).
  const finishToImport = () =>
    void run('import', () => done(client.completeSetup())).then((ok) => {
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
            Alerts, chat and moderation for Twitch, YouTube and Kick. Three steps and you’re ready.
          </p>
        </div>
      </div>
      <main
        id="main"
        className="flex min-h-dvh flex-col px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] sm:px-10"
      >
        <div className="flex items-center justify-between">
          <Wordmark size="sm" />
          {demo && <span className="text-[12.5px] text-text-3">Demo mode</span>}
        </div>
        <ol className="mt-8 flex items-center gap-2" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className="flex items-center gap-2"
              aria-current={i === step ? 'step' : undefined}
            >
              <span
                className={cx(
                  'inline-flex size-6 items-center justify-center rounded-full text-[12px] font-semibold transition-colors',
                  i < step
                    ? 'bg-ok text-white'
                    : i === step
                      ? 'bg-accent text-on-accent'
                      : 'bg-surface-3 text-text-3',
                )}
              >
                {i < step ? <Check size={13} weight="bold" /> : i + 1}
              </span>
              <span
                className={cx(
                  'hidden text-[13px] font-medium sm:inline',
                  i === step ? 'text-text' : 'text-text-3',
                )}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && (
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
                      className="font-display text-[28px] font-bold tracking-[-0.03em] text-balance sm:text-[32px]"
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
                      variant="primary"
                      onClick={() => goTo(1)}
                      icon={<ArrowRight size={18} />}
                      className="flex-row-reverse"
                    >
                      {anyConnected ? 'Continue' : 'Skip for now'}
                    </Button>
                    {!anyConnected && (
                      <span className="text-[13px] text-text-3">
                        You can connect later in Settings.
                      </span>
                    )}
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <div>
                    <h1
                      id="step-1"
                      className="font-display text-[28px] font-bold tracking-[-0.03em] text-balance sm:text-[32px]"
                    >
                      Pick a look
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-text-2">
                      This is how alerts and chat appear on stream. Change it any time.
                    </p>
                  </div>
                  <AlertStage alert={alert} theme={theme} label={`Preview of the ${theme} look`} />
                  {!themes.data ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : (
                    <div
                      role="radiogroup"
                      aria-label="Look"
                      className="grid grid-cols-2 gap-2 sm:grid-cols-5"
                    >
                      {themes.data.map((t: Theme) => (
                        <label
                          key={t.id}
                          title={t.description}
                          className={cx(
                            'flex cursor-pointer flex-col gap-0.5 rounded-[12px] border px-3 py-2.5 transition-colors has-[:focus-visible]:shadow-[var(--fc-focus)]',
                            theme === t.id
                              ? 'border-accent-line bg-accent-soft'
                              : 'border-line hover:border-line-strong',
                          )}
                        >
                          <input
                            type="radio"
                            name="theme"
                            className="sr-only"
                            checked={theme === t.id}
                            onChange={() => setTheme(t.id)}
                          />
                          <span className="text-sm font-semibold text-text">{t.name}</span>
                          <span className="line-clamp-2 text-[11.5px] leading-snug text-text-3">
                            {t.description}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
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
                      busy={saving === 'theme'}
                      onClick={() => void applyTheme()}
                    >
                      Use this look
                    </Button>
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <div>
                    <h1
                      id="step-2"
                      className="font-display text-[28px] font-bold tracking-[-0.03em] text-balance sm:text-[32px]"
                    >
                      Add it to OBS
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-text-2">
                      Ferrocast puts your overlay into the current OBS scene. If OBS isn’t connected
                      yet, copy the URL and paste it into a Browser source.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      size="lg"
                      variant="primary"
                      icon={added ? <Check size={18} weight="bold" /> : <ObsIcon size={18} />}
                      disabled={!main}
                      busy={adding !== null}
                      onClick={() => main && void add(main).then((ok) => ok && setAdded(true))}
                    >
                      {added ? 'Added to OBS' : 'Add to OBS'}
                    </Button>
                    <Button
                      size="lg"
                      icon={<CopySimple size={18} />}
                      disabled={!main}
                      onClick={() =>
                        main &&
                        void copyText(main.url).then((ok) =>
                          toast(
                            ok
                              ? {
                                  tone: 'ok',
                                  message: 'URL copied.',
                                  hint: 'In OBS: Sources → + → Browser → paste, 1920 × 1080.',
                                }
                              : { tone: 'error', message: 'Couldn’t copy it.' },
                          ),
                        )
                      }
                    >
                      Copy URL instead
                    </Button>
                  </div>
                  <div className="flex gap-3 border-t border-line pt-5">
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
                      variant={added ? 'primary' : 'secondary'}
                      busy={saving === 'finish'}
                      onClick={finish}
                    >
                      {added ? 'Open my dashboard' : 'I’ll do it later'}
                    </Button>
                  </div>
                  <p className="text-[13px] text-text-3">
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
      {guide}
    </div>
  )
}
