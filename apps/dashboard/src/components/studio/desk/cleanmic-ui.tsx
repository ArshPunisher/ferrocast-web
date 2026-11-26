import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Sparkle } from '@phosphor-icons/react'
import type { EngineFilter, EngineLevel, studioEngineApi } from '@ferrocast/api'
import { Button, InfoTip, Switch, cx, toast } from '@ferrocast/ui'
import { useAction } from '../../../lib/hooks'
import {
  CLEAN_EXPANDER,
  cleanMicPlan,
  dismissCleanMicUpdate,
  expanderMoveCount,
  freeName,
  isLegacyCleanMic,
  micGainDb,
  MIC_LEVEL_FILTER,
  needsCleanMicUpdate,
  NOISE_KINDS,
  pickCleanupCompressor,
  preCompMoveCount,
  readCleanMicUpdateSkipped,
  VERDICT_WORDS,
  voiceUsualPeak,
  voiceVerdict,
} from './cleanmic'

type EngineApi = ReturnType<typeof studioEngineApi>

/** Appends Quiet between words and moves it immediately before an existing compressor, rolling back on failure. */
export async function insertExpanderBeforeComp(
  api: EngineApi,
  sourceName: string,
  currentFilters: readonly EngineFilter[],
  extraMoves = 0,
): Promise<string> {
  const taken = currentFilters.map((f) => f.name)
  const expName = freeName(CLEAN_EXPANDER.name, taken)
  await api.addFilter(sourceName, { ...CLEAN_EXPANDER, name: expName })
  try {
    const moves = expanderMoveCount(currentFilters) + extraMoves
    for (let i = 0; i < moves; i++) {
      await api.editFilter(sourceName, expName, 'up')
    }
    return expName
  } catch (e) {
    await api.removeFilter(sourceName, expName).catch(() => undefined)
    throw e
  }
}

/** Evaluates live mic peaks and applies the multi-stage Clean up my mic filter chain in one click. */
export function CleanMicControl({
  api,
  name,
  level,
  filters,
  onReload,
  onCleaned,
  footer,
  className,
  undone = 0,
  isLive = false,
}: {
  api: EngineApi
  name: string
  level: EngineLevel | undefined
  filters: EngineFilter[] | null | undefined
  onReload: () => void
  onCleaned?: (() => void) | undefined
  footer?: ReactNode | undefined
  className?: string | undefined
  undone?: number | undefined
  isLive?: boolean | undefined
}) {
  const { run, busy } = useAction()
  const peaks = useRef<number[]>([])
  const lastGainRef = useRef(9)
  const [failed, setFailed] = useState<string | null>(null)
  const [preBoost, setPreBoost] = useState(true)
  const [compRead, setCompRead] = useState<{
    key: string
    settings: Record<string, unknown>
  } | null>(null)
  const [updateSkipped, setUpdateSkipped] = useState(() => readCleanMicUpdateSkipped(name))

  useEffect(() => {
    peaks.current = []
    lastGainRef.current = 9
    setUpdateSkipped(readCleanMicUpdateSkipped(name))
  }, [name])

  useEffect(() => {
    if (!level) return
    peaks.current.push(Math.max(level.peak[0], level.peak[1]))
    if (peaks.current.length > 100) peaks.current.shift()
  }, [level])

  const verdict = voiceVerdict(peaks.current)
  const usual = voiceUsualPeak(peaks.current)
  const gainDb = micGainDb(peaks.current)
  const have = filters ?? null
  const compFilter = have ? pickCleanupCompressor(have) : null
  const compName = compFilter?.name ?? null
  const compEnabled = compFilter?.enabled ?? false
  const compKey = compName ? `${name}\0${compName}` : ''
  const filterKey = have?.map((f) => `${f.kind}:${f.name}:${f.enabled}`).join('\n') ?? ''

  useEffect(() => {
    if (!compName || typeof api.filterSettings !== 'function') {
      setCompRead(null)
      return
    }
    let cancelled = false
    void api.filterSettings(name, compName).then(
      (s) => {
        if (cancelled) return
        setCompRead({ key: compKey, settings: s })
        const gain = Number(s.output_gain ?? 0)
        if (gain > 0) lastGainRef.current = gain
      },
      () => {
        if (!cancelled) setCompRead(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [api, name, compName, compKey, compEnabled, filterKey, undone])

  const compSettings = compRead && compRead.key === compKey ? compRead.settings : null
  const compLoading =
    compFilter !== null && typeof api.filterSettings === 'function' && compSettings === null
  const autoBoostOn = compFilter
    ? compSettings === null
      ? false
      : compFilter.enabled && Number(compSettings.output_gain ?? 0) > 0
    : preBoost

  const legacyCleaned = isLegacyCleanMic(have)
  const planKinds = have
    ? legacyCleaned && updateSkipped
      ? [...have.map((f) => f.kind), 'expander_filter']
      : have.map((f) => f.kind)
    : null
  const plan = planKinds ? cleanMicPlan(planKinds, { gainDb, autoBoost: preBoost }) : []
  const gainStep = plan.find((f) => f.kind === 'gain_filter')
  const showUpdateOffer = needsCleanMicUpdate(have, compSettings, updateSkipped)

  const clean = async () => {
    const baseFilters = have ?? []
    const taken = baseFilters.map((f) => f.name)
    const added: string[] = []
    const moveBeforeComp = preCompMoveCount(baseFilters)
    setFailed(null)
    const ok = await run(
      'clean',
      async () => {
        try {
          // Apply one at a time in chain order; gain moves to top and noise/expander move before any existing compressor.
          for (const f of plan) {
            const n = freeName(f.name, taken)
            taken.push(n)
            await api.addFilter(name, { ...f, name: n })
            added.push(n)
            if (f.kind === 'gain_filter') {
              await api.editFilter(name, n, 'top')
            } else if (
              moveBeforeComp > 0 &&
              (f.kind === 'expander_filter' || NOISE_KINDS.has(f.kind))
            ) {
              for (let i = 0; i < moveBeforeComp; i++) {
                await api.editFilter(name, n, 'up')
              }
            }
          }
          return true
        } catch (e) {
          // Half a chain (or a boost left after the limiter) is worse than none: take it back.
          for (const n of added.reverse()) await api.removeFilter(name, n).catch(() => undefined)
          setFailed(
            'Cleaning up didn’t finish, so nothing was changed. Check the mic is connected and try again.',
          )
          throw e
        }
      },
      { once: true },
    )
    onReload()
    if (ok) {
      // What was measured before the clean-up says nothing about the cleaned voice.
      peaks.current = []
      toast({ tone: 'ok', message: 'Your mic is cleaned up: noise out, level even, no clipping.' })
      onCleaned?.()
    }
  }

  const updateCleanup = async () => {
    if (!have) return
    setFailed(null)
    const ok = await run(
      'update-clean',
      async () => {
        try {
          await insertExpanderBeforeComp(api, name, have)
          return true
        } catch (e) {
          setFailed(
            'Couldn’t update cleanup, so nothing was changed. Check the mic is connected and try again.',
          )
          throw e
        }
      },
      { once: true },
    )
    if (ok) {
      onReload()
      toast({ tone: 'ok', message: 'Cleanup updated: pauses stay quiet now.' })
    }
  }

  const dismissUpdate = () => {
    dismissCleanMicUpdate(name)
    setUpdateSkipped(true)
  }

  const toggleAutoBoost = async (next: boolean) => {
    if (!compFilter) {
      setPreBoost(next)
      return
    }
    const baseFilters = have ?? []
    const res = await run(
      'auto-boost',
      async () => {
        const current =
          typeof api.filterSettings === 'function'
            ? await api.filterSettings(name, compFilter.name)
            : {}
        if (!next) {
          const curGain = Number(current.output_gain ?? 0)
          if (curGain > 0) lastGainRef.current = curGain
          const nextSettings = { ...current, output_gain: 0 }
          await api.updateFilter(name, compFilter.name, nextSettings)
          return { nextSettings, message: 'Auto boost off (0 dB).' }
        }
        const targetDb = lastGainRef.current > 0 ? lastGainRef.current : 9
        const hasExpanderOrGate = baseFilters.some(
          (f) => f.kind === 'expander_filter' || f.kind === 'noise_gate_filter',
        )
        const addedExp = hasExpanderOrGate
          ? null
          : await insertExpanderBeforeComp(api, name, baseFilters)
        const wasDisabled = !compFilter.enabled
        try {
          if (wasDisabled) await api.editFilter(name, compFilter.name, 'enable')
          const nextSettings = { ...current, output_gain: targetDb }
          await api.updateFilter(name, compFilter.name, nextSettings)
          return { nextSettings, message: `Auto boost on (+${targetDb} dB).` }
        } catch (e) {
          if (wasDisabled)
            await api.editFilter(name, compFilter.name, 'disable').catch(() => undefined)
          if (addedExp) await api.removeFilter(name, addedExp).catch(() => undefined)
          throw e
        }
      },
      { once: true },
    )
    if (res) {
      setCompRead({ key: compKey, settings: res.nextSettings })
      onReload()
      toast({ tone: 'ok', message: res.message })
    }
  }

  return (
    <div
      data-testid="clean-mic-tile"
      className={cx(
        'flex flex-col gap-2.5 rounded-[12px] border border-line bg-surface-1 p-3',
        className,
      )}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-[13.5px] leading-tight font-semibold text-text">Auto mic cleanup</p>
          <div
            className={cx(
              'text-[12.5px] leading-snug',
              !have
                ? 'font-medium text-warn'
                : verdict === 'good'
                  ? 'font-medium text-ok'
                  : verdict
                    ? 'font-medium text-warn'
                    : 'text-text-2',
            )}
            aria-live="polite"
          >
            {!have ? (
              'Couldn’t read your mic’s filters.'
            ) : (
              <>
                {verdict ? VERDICT_WORDS[verdict] : 'Talk for a few seconds to check your level.'}
                {gainStep && usual !== null && (
                  <>
                    {' '}
                    <span className="font-normal text-text-2">
                      Cleaning up will also raise it by {gainDb} dB.
                    </span>
                    <InfoTip label={`About ${MIC_LEVEL_FILTER}`}>
                      Your voice peaks around {Math.round(usual)} dB. A{' '}
                      {MIC_LEVEL_FILTER.toLowerCase()} step adds {gainDb} dB first, so it peaks near
                      -12 dB and the rest of the chain has something to work on. Change it in
                      Filters.
                    </InfoTip>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 sm:justify-end">
          {!have ? (
            <Button size="sm" variant="secondary" onClick={onReload} className="w-full sm:w-auto">
              Try again
            </Button>
          ) : showUpdateOffer ? null : plan.length > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              busy={busy === 'clean'}
              onClick={() => void clean()}
              className="w-full whitespace-nowrap sm:w-auto"
            >
              <Sparkle size={15} weight="bold" aria-hidden="true" /> Clean up my mic
            </Button>
          ) : (
            <span className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-ok/35 bg-ok-soft px-2.5 py-1 text-[12.5px] font-semibold whitespace-nowrap text-text sm:w-auto">
              <Check size={14} weight="bold" className="text-ok" aria-hidden="true" /> Mic cleaned
              up
            </span>
          )}
        </div>
      </div>
      <div className="border-t border-line/60 pt-2">
        <Switch
          checked={autoBoostOn}
          onChange={(next) => void toggleAutoBoost(next)}
          disabled={busy !== null || !have || compLoading}
          label="Auto boost"
          description="Raises uneven speech after cleanup (+9 dB by default). Turn off before or after cleanup to leave gain at 0 dB."
        />
      </div>
      {showUpdateOffer && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] leading-snug text-text-2">
          <span>
            Quiet pauses between words can still get boosted.
            {isLive ? ' Safe live: applies smoothly.' : ''}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              disabled={busy !== null}
              busy={busy === 'update-clean'}
              onClick={() => void updateCleanup()}
            >
              Update cleanup
            </Button>
            <Button size="xs" variant="ghost" disabled={busy !== null} onClick={dismissUpdate}>
              Keep current
            </Button>
          </div>
        </div>
      )}
      {failed && (
        <p
          role="alert"
          className="rounded-[8px] border border-danger/35 bg-danger-soft px-2.5 py-1.5 text-[12.5px] font-medium text-text"
        >
          {failed}
        </p>
      )}
      {footer && <div className="border-t border-line pt-2.5">{footer}</div>}
    </div>
  )
}
