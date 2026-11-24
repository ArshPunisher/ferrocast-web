import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  footer,
  className,
}: {
  api: EngineApi
  name: string
  level: EngineLevel | undefined
  filters: EngineFilter[] | null | undefined
  onReload: () => void
  onCleaned?: (() => void) | undefined
  footer?: ReactNode | undefined
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
              verdict === 'good'
                ? 'font-medium text-ok'
                : verdict
                  ? 'font-medium text-warn'
                  : 'text-text-2',
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
          </div>
        </div>
        <div className="flex shrink-0 sm:justify-end">
          {!have ? (
            <Button size="sm" variant="secondary" onClick={onReload} className="w-full sm:w-auto">
              Couldn’t read your mic’s filters. Try again
            </Button>
          ) : plan.length > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              busy={busy === 'clean'}
              onClick={() => void clean()}
              className="w-full whitespace-nowrap sm:w-auto"
            >
              <Sparkle size={15} weight="bold" /> Clean up my mic
            </Button>
          ) : (
            <span className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-ok/35 bg-ok-soft px-2.5 py-1 text-[12.5px] font-semibold whitespace-nowrap text-text sm:w-auto">
              <Check size={14} weight="bold" className="text-ok" aria-hidden="true" /> Mic cleaned
              up
            </span>
          )}
        </div>
      </div>
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
