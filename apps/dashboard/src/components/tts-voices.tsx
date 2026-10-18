// Settings › Text-to-speech › Voice (API.md §4 TTS, §9.4). One picker for every voice: this
// computer's own (free) and, with Pro, Ferrocast voices (Hindi and Indian English first),
// read on Ferrocast's servers. Picking a Ferrocast voice keeps the system voice as the
// backup, which reads whenever a Ferrocast voice can't. Preview plays a sample line through
// the same path alerts use. Not Pro but on sale: one calm line, no nagging.

import { useRef, useState } from 'react'
import { Play, WarningCircle } from '@phosphor-icons/react'
import {
  cloudUsageLine,
  cloudUsageShare,
  isCloudVoice,
  proApi,
  proPanelState,
  splitVoices,
  ttsVoicesApi,
  type TtsCloudView,
  type TtsPreview,
  type TtsVoice,
} from '@ferrocast/api'
import { Button, Field, Select, cx, toast } from '@ferrocast/ui'
import { ProChip } from './pro/ProChip'
import { PRO_LINE } from './pro/ProPanel'
import { useAction, useClient, useResource } from '../lib/hooks'
import { href } from '../lib/router'

type Props = {
  /** The system voice saved in the TTS settings (the backup when a Ferrocast voice is picked). */
  systemVoice: string
  voices: TtsVoice[]
  disabled: boolean
  /** Saves the system voice in the TTS settings. */
  onSystemVoice: (id: string) => void
}

function label(v: TtsVoice): string {
  return isCloudVoice(v.id) ? v.name : `${v.name}, ${v.language}`
}

export function TtsVoicePicker({ systemVoice, voices, disabled, onSystemVoice }: Props) {
  const client = useClient()
  const api = ttsVoicesApi(client)
  const pro = useResource((c) => proApi(c).status())
  const cloud = useResource((c) => ttsVoicesApi(c).cloud())
  const { run, busy } = useAction()
  const [heard, setHeard] = useState<TtsPreview | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  const state = pro.error ? 'hidden' : proPanelState(pro.data, 'tts')
  const view: TtsCloudView | null = cloud.data
  const { system, cloud: cloudVoices } = splitVoices(voices)
  const open = state === 'open' && !!view?.available && cloudVoices.length > 0
  const picked = open && view?.voice ? view.voice : systemVoice
  const usingCloud = isCloudVoice(picked)

  const pick = async (id: string) => {
    setHeard(null)
    if (isCloudVoice(id)) {
      const next = await run('voice', () => api.setCloud(id))
      if (next) cloud.set(next)
      return
    }
    onSystemVoice(id)
    if (view?.voice) {
      const next = await run('voice', () => api.setCloud(null))
      if (next) cloud.set(next)
    }
  }

  const preview = async () => {
    const p = await run('preview', () => api.preview(picked || undefined))
    if (!p) return
    setHeard(p)
    const url =
      p.url.startsWith('data:') || p.url.startsWith('blob:') ? p.url : client.mediaUrl(p.media_id)
    audio.current?.pause()
    const a = new Audio(url)
    audio.current = a
    a.play().catch(() =>
      toast({
        tone: 'error',
        message: 'Couldn’t play the preview here.',
        hint: 'Check this device’s sound output, then try again.',
      }),
    )
    if (p.cloud) cloud.reload()
  }

  return (
    <div className="flex flex-col gap-4" data-testid="tts-voice">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Voice" className="min-w-0 flex-1">
          {(p) => (
            <Select
              {...p}
              disabled={disabled || busy === 'voice'}
              value={picked}
              onChange={(e) => void pick(e.target.value)}
            >
              <option value="">This computer’s default</option>
              {open && (
                <optgroup label="Ferrocast voices (Pro)">
                  {cloudVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {label(v)}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="On this computer">
                {system.map((v) => (
                  <option key={v.id} value={v.id}>
                    {label(v)}
                  </option>
                ))}
              </optgroup>
            </Select>
          )}
        </Field>
        <Button
          icon={<Play size={16} weight="fill" />}
          busy={busy === 'preview'}
          disabled={disabled}
          onClick={() => void preview()}
          className="sm:w-auto"
        >
          Preview
        </Button>
      </div>

      {heard?.notice && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control bg-warn-soft px-3 py-2 text-[14px] text-warn"
        >
          <WarningCircle size={18} weight="bold" className="mt-px shrink-0" aria-hidden="true" />
          <span>{heard.notice} You heard this PC’s voice instead.</span>
        </p>
      )}

      {open && usingCloud && (
        <Field
          label="Backup voice"
          hint="Reads when Ferrocast voices can’t."
          className="sm:max-w-[26rem]"
        >
          {(p) => (
            <Select
              {...p}
              disabled={disabled}
              value={systemVoice}
              onChange={(e) => onSystemVoice(e.target.value)}
            >
              <option value="">This computer’s default</option>
              {system.map((v) => (
                <option key={v.id} value={v.id}>
                  {label(v)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {state === 'open' && view?.available && <CloudCard view={view} />}

      {state === 'locked' && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-line bg-surface-2 px-4 py-3"
          data-testid="tts-pro-line"
        >
          <span className="text-[15px] font-semibold text-text">Ferrocast voices</span>
          <ProChip />
          <p className="basis-full text-sm text-text-2">
            Natural Hindi and Indian English voices. {PRO_LINE}{' '}
            <a
              href={href({ name: 'settings', section: 'pro' })}
              className="font-semibold text-accent-text underline-offset-2 hover:underline"
            >
              Settings › Pro
            </a>
          </p>
        </div>
      )}
    </div>
  )
}

function CloudCard({ view }: { view: TtsCloudView }) {
  const u = view.usage
  const share = u ? cloudUsageShare(u) : 0
  const resetDay = u
    ? new Date(u.reset_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    : null
  return (
    <div
      className="flex flex-col gap-3 rounded-panel border border-line bg-surface-2 px-4 py-4 sm:px-5"
      data-testid="tts-cloud"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-text">
          Ferrocast voices
        </span>
        <ProChip />
      </div>
      <p className="max-w-[60ch] text-[14.5px] leading-relaxed text-text-2">
        Natural Hindi and Indian English voices. Only messages that pass your rules are sent.
      </p>
      {u && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[15px] font-semibold text-text tabular-nums" data-testid="tts-usage">
            {cloudUsageLine(u)}
          </p>
          <div
            role="meter"
            aria-label="Characters used this month"
            aria-valuemin={0}
            aria-valuemax={u.limit}
            aria-valuenow={Math.min(u.used, u.limit)}
            className="h-1.5 w-full max-w-[26rem] overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={cx('h-full rounded-full', share >= 1 ? 'bg-warn' : 'bg-accent')}
              style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }}
            />
          </div>
          {resetDay && <p className="text-[13px] text-text-3">Starts again on {resetDay}.</p>}
        </div>
      )}
      {(view.resting || view.fallback) && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control bg-warn-soft px-3 py-2 text-[14px] text-warn"
        >
          <WarningCircle size={18} weight="bold" className="mt-px shrink-0" aria-hidden="true" />
          <span>
            {view.resting
              ? 'Ferrocast voices are resting until next month. This PC’s voice reads meanwhile.'
              : `${view.fallback} This PC’s voice read it instead.`}
          </span>
        </p>
      )}
    </div>
  )
}
