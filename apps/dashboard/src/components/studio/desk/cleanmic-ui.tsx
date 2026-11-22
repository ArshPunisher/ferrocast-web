import { useEffect, useRef, useState } from 'react'
import { Check, Sparkle } from '@phosphor-icons/react'
import type { EngineFilter, EngineLevel, studioEngineApi } from '@ferrocast/api'
import { Button, InfoTip, cx, toast } from '@ferrocast/ui'
import { useAction } from '../../../lib/hooks'
import {
  cleanMicPlan,
  freeName,
  micGainDb,
  MIC_LEVEL_FILTER,
  VERDICT_WORDS,
  voiceUsualPeak,
  voiceVerdict,
} from './cleanmic'

type EngineApi = ReturnType<typeof studioEngineApi>

/** Evaluates live mic peaks and applies the multi-stage Clean up my mic filter chain in one click. */
export function CleanMicControl({
  api,
  name,
  level,
  filters,
  onReload,
  onCleaned,
  className,
}: {
  api: EngineApi
  name: string
  level: EngineLevel | undefined
  filters: EngineFilter[] | null | undefined
  onReload: () => void
  onCleaned?: (() => void) | undefined
  className?: string | undefined
}) {
  const { run, busy } = useAction()
  const peaks = useRef<number[]>([])
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    peaks.current = []
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
  const plan = have
    ? cleanMicPlan(
        have.map((f) => f.kind),
        { gainDb },
      )
    : []
  const gainStep = plan.find((f) => f.kind === 'gain_filter')

  const clean = async () => {
    const taken = (have ?? []).map((f) => f.name)
    const added: string[] = []
    setFailed(null)
    const ok = await run(
      'clean',
      async () => {
        try {
          // Apply one at a time in chain order; gain moves to top so later stages hear the boosted voice.
          for (const f of plan) {
            const n = freeName(f.name, taken)
            taken.push(n)
            await api.addFilter(name, { ...f, name: n })
            added.push(n)
            if (f.kind === 'gain_filter') await api.editFilter(name, n, 'top')
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

  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-2', className)}>
      <span
        className={cx(
          'text-[13.5px] font-semibold',
          verdict === 'good' ? 'text-ok' : verdict ? 'text-warn' : 'text-text-3',
        )}
        aria-live="polite"
      >
        {verdict ? VERDICT_WORDS[verdict] : 'Talk for a few seconds to check your level.'}
        {gainStep && usual !== null && (
          <>
            {' '}
            <span className="font-normal text-text-2">
              Cleaning up will also raise it by {gainDb} dB.
            </span>
            <InfoTip label={`About ${MIC_LEVEL_FILTER}`}>
              Your voice peaks around {Math.round(usual)} dB. A {MIC_LEVEL_FILTER.toLowerCase()}{' '}
              step adds {gainDb} dB first, so it peaks near -12 dB and the rest of the chain has
              something to work on. Change it in Filters.
            </InfoTip>
          </>
        )}
      </span>
      {failed && (
        <p role="alert" className="w-full text-[13px] font-medium text-danger">
          {failed}
        </p>
      )}
      {!have ? (
        <Button size="sm" variant="secondary" onClick={onReload}>
          Couldn’t read your mic’s filters. Try again
        </Button>
      ) : plan.length > 0 ? (
        <Button size="sm" variant="secondary" busy={busy === 'clean'} onClick={() => void clean()}>
          <Sparkle size={15} weight="bold" /> Clean up my mic
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ok">
          <Check size={14} weight="bold" /> Mic cleaned up
        </span>
      )}
    </div>
  )
}
