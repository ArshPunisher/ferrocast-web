// Live captions (plan item 7): speech to text from a Studio mic, shown on stream by a text
// source named "Captions". On a Mac, macOS's own recognizer (no download) or Whisper; elsewhere
// Whisper (30 Oct): a model downloaded once, Hindi and more, and captions in English. Nothing
// leaves the computer either way.

import { useCallback, useEffect, useState } from 'react'
import { ClosedCaptioning, DownloadSimple } from '@phosphor-icons/react'
import type { EngineCaptions, ScenesConfig, SpeechModel } from '@ferrocast/api'
import { Button, Field, Segmented, Select, Switch } from '@ferrocast/ui'
import { Panel } from '../Panel'
import { useAction, type Resource } from '../../lib/hooks'
import { useStudio } from './common'
import { useEngine } from './desk/common'
import { MIC_KIND, type RigInput } from './rig-lists'
import {
  CAPTIONS_SOURCE,
  WHISPER_LANGUAGES,
  canListen,
  captionsBox,
  captionsStep,
  pickMic,
} from './captions-box'

type Engine = 'apple' | 'whisper'
type ModelId = SpeechModel['id']

/** A choice kept in this browser (a convenience; never needed to work). */
function useKept<T extends string>(key: string, first: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? first
    } catch {
      return first
    }
  })
  const set = (x: T) => {
    setV(x)
    try {
      localStorage.setItem(key, x)
    } catch {
      // Private window: the choice lasts this visit.
    }
  }
  return [v, set]
}

export function LiveCaptions({
  inputs,
  preferred = [],
  cfg,
}: {
  /** The scene switcher's settings (Clip by voice lives there). */
  cfg?: Resource<ScenesConfig>
  /** The Studio's sounds (null while it isn't running). */
  inputs: RigInput[] | null
  /** Pre-flight's mics, tried first. */
  preferred?: string[]
}) {
  const api = useEngine()
  const studio = useStudio()
  const { run, busy } = useAction()
  const [c, setC] = useState<EngineCaptions | null>(null)
  const [failed, setFailed] = useState(false)
  const [mic, setMic] = useState<string | null>(null)
  const [models, setModels] = useState<SpeechModel[] | null>(null)
  const [pickedEngine, setEngine] = useKept<Engine>('fc-captions-engine', 'apple')
  const [model, setModel] = useKept<ModelId>('fc-captions-model', 'base')
  const [language, setLanguage] = useKept<string>('fc-captions-language', 'auto')
  const [english, setEnglish] = useKept<'on' | 'off'>('fc-captions-english', 'off')

  const read = useCallback(() => {
    api.captions().then(
      (v) => {
        setC(v)
        setFailed(false)
      },
      () => setFailed(true),
    )
  }, [api])

  // Often while listening (what's heard shows here), seldom otherwise (macOS's answer).
  useEffect(() => {
    read()
    const every = c?.on ? 1500 : 5000
    const t = window.setInterval(() => {
      if (!document.hidden) read()
    }, every)
    return () => window.clearInterval(t)
  }, [read, c?.on])

  // The models, again every 1.5 s while one downloads.
  const downloading = models?.some((m) => m.state === 'downloading') ?? false
  useEffect(() => {
    let live = true
    const look = () =>
      api.speechModels().then(
        (m) => live && setModels(m),
        () => live && setModels([]),
      )
    void look()
    const t = downloading ? window.setInterval(() => void look(), 1500) : 0
    return () => {
      live = false
      window.clearInterval(t)
    }
  }, [api, downloading])

  const mics = (inputs ?? []).filter((i) => MIC_KIND.test(i.kind)).map((i) => i.name)
  const chosen = mic && mics.includes(mic) ? mic : pickMic(c?.source ?? null, mics, preferred)

  // Without the app (the browser demo, an old Ferrocast) there's nothing to show.
  if (failed && !c) return null
  if (!c) return null
  const step = captionsStep(c)
  const mac = step !== 'elsewhere'
  // Off a Mac there's only Whisper; while on, what's listening.
  const engine: Engine = c.on && c.engine ? c.engine : mac ? pickedEngine : 'whisper'
  const m = models?.find((x) => x.id === model)
  const usable = canListen(engine, step, m)

  const voice = cfg?.data?.clip_by_voice ?? false
  const setVoice = async (on: boolean) => {
    if (!cfg?.data) return
    const prev = cfg.data
    cfg.set({ ...prev, clip_by_voice: on })
    const saved = await run('voice', () => studio.saveSwitcher({ clip_by_voice: on }))
    cfg.set(saved ?? prev)
  }

  const turn = async (on: boolean) => {
    const v = await run('captions', () =>
      api.setCaptions(
        on && chosen
          ? engine === 'whisper'
            ? { source: chosen, engine, model, language, translate: english === 'on' }
            : { source: chosen, engine }
          : null,
      ),
    )
    if (v) setC(v)
  }

  const addBox = async () => {
    const made = await run(
      'box',
      async () => {
        const [scenes, stats, sources] = await Promise.all([
          api.scenes(),
          api.stats(),
          api.sources(),
        ])
        const b = captionsBox(stats.canvas.width, stats.canvas.height)
        // One taken out of its scenes lingers (for undo): put that one back, its look kept.
        const { item } = sources.some((s) => s.name === CAPTIONS_SOURCE)
          ? await api.addExisting(scenes.current, CAPTIONS_SOURCE)
          : await api.addSource(scenes.current, b.source)
        const t = await api.transform(scenes.current, item.id)
        await api.setTransform(scenes.current, item.id, {
          ...t,
          x: b.x,
          y: b.y,
          alignment: 5,
          bounds: 'none',
        })
        return scenes.current
      },
      { success: (scene) => `Captions box added to ${scene}.` },
    )
    if (made) read()
  }

  return (
    <Panel
      title="Live captions"
      icon={<ClosedCaptioning size={18} weight="bold" aria-hidden />}
      description="What you say, as text on stream. Heard on this computer only."
    >
      <div className="flex flex-col gap-4">
        {mac && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">Listen with</span>
            <Segmented
              label="Listen with"
              value={engine}
              options={[
                { value: 'apple', label: 'This Mac' },
                { value: 'whisper', label: 'Whisper' },
              ]}
              onChange={(v) => !c.on && setEngine(v)}
            />
          </div>
        )}
        {engine === 'apple' && step === 'ask' && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[14.5px] text-text-2">
              macOS asks once before Ferrocast can hear speech.
            </p>
            <Button
              variant="primary"
              busy={busy === 'ask'}
              onClick={async () => {
                const v = await run('ask', () => api.askCaptions())
                if (v) setC(v)
              }}
            >
              Allow speech recognition
            </Button>
          </div>
        )}
        {engine === 'apple' && step === 'blocked' && (
          <p className="text-[14.5px] text-text-2">
            Speech recognition is off for Ferrocast. Turn it on in System Settings, Privacy &amp;
            Security, Speech Recognition, then open Ferrocast again. Or pick Whisper.
          </p>
        )}
        {engine === 'whisper' && models && (
          <WhisperOptions
            models={models}
            model={model}
            onModel={setModel}
            language={language}
            onLanguage={setLanguage}
            english={english === 'on'}
            onEnglish={(v) => setEnglish(v ? 'on' : 'off')}
            locked={c.on}
            onModels={setModels}
          />
        )}
        {c.error && !c.on && (
          <p role="alert" className="text-[14.5px] text-danger">
            {c.error}
          </p>
        )}
        {(usable || c.on) && (
          <>
            {mics.length === 0 && !c.on ? (
              <p className="text-[14.5px] text-text-2">
                Add a mic to your scenes first, then pick it here.
              </p>
            ) : (
              <>
                <Field label="Listen to">
                  {(p) => (
                    <Select
                      {...p}
                      disabled={c.on}
                      value={c.on ? (c.source ?? '') : (chosen ?? '')}
                      onChange={(e) => setMic(e.target.value)}
                    >
                      {/* While on, the sound in use shows even after it left the scenes. */}
                      {(c.on && c.source && !mics.includes(c.source)
                        ? [c.source, ...mics]
                        : mics
                      ).map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Switch
                  label="Captions on"
                  {...(c.on ? { description: `Listening to ${c.source ?? chosen ?? ''}.` } : {})}
                  disabled={busy === 'captions' || (!c.on && !chosen)}
                  checked={c.on}
                  onChange={(v) => void turn(v)}
                />
                {cfg?.data && (
                  <Switch
                    label="Say “clip that” to clip"
                    description="While captions are on, saying “clip that” saves the replay buffer, like !clip. At most every 20 seconds."
                    disabled={busy === 'voice'}
                    checked={voice}
                    onChange={(v) => void setVoice(v)}
                  />
                )}
              </>
            )}
            {!c.box && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[14.5px] text-text-2">
                  A text source named “{CAPTIONS_SOURCE}” shows them on stream.
                </p>
                <Button busy={busy === 'box'} onClick={addBox}>
                  Add a captions box
                </Button>
              </div>
            )}
            {c.on && (
              <p
                aria-live="polite"
                className="min-h-[3.2em] rounded-lg border border-line bg-surface-2 px-3 py-2 text-[15px] font-medium text-text"
              >
                {c.text || <span className="text-text-3">Say something…</span>}
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}

/** Whisper's model (downloaded once), language and English captions. */
function WhisperOptions({
  models,
  model,
  onModel,
  language,
  onLanguage,
  english,
  onEnglish,
  locked,
  onModels,
}: {
  models: SpeechModel[]
  model: ModelId
  onModel: (m: ModelId) => void
  language: string
  onLanguage: (l: string) => void
  english: boolean
  onEnglish: (v: boolean) => void
  /** While captions are on: changes apply when they're turned on again. */
  locked: boolean
  onModels: (m: SpeechModel[]) => void
}) {
  const api = useEngine()
  const { run, busy } = useAction()
  const m = models.find((x) => x.id === model)
  return (
    <div className="flex flex-col gap-3">
      <Field label="Model">
        {(p) => (
          <Select
            {...p}
            disabled={locked}
            value={model}
            onChange={(e) => onModel(e.target.value as ModelId)}
          >
            {models.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label} · {x.mb} MB{x.state === 'ready' ? ' · downloaded' : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {m && m.state !== 'ready' && (
        <div className="flex flex-wrap items-center gap-3" role="status" aria-live="polite">
          {m.state === 'downloading' ? (
            <>
              <p className="text-[14.5px] text-text-2">Downloading… {m.percent ?? 0}%</p>
              <progress
                className="h-2 min-w-32 flex-1 accent-[var(--fc-arc)]"
                max={100}
                value={m.percent ?? 0}
                aria-label="Download progress"
              />
            </>
          ) : (
            <>
              <p className="text-[14.5px] text-text-2">
                {m.state === 'failed'
                  ? `The download didn’t finish: ${m.reason ?? 'try again'}.`
                  : `Downloaded once (${m.mb} MB), then it works without the internet.`}
              </p>
              <Button
                variant="primary"
                icon={<DownloadSimple size={15} weight="bold" />}
                busy={busy === 'get'}
                onClick={async () => {
                  const v = await run('get', () => api.fetchSpeechModel(m.id))
                  if (v) onModels(v)
                }}
              >
                {m.state === 'failed' ? 'Try again' : 'Download'}
              </Button>
            </>
          )}
        </div>
      )}
      <Field label="Language you speak">
        {(p) => (
          <Select
            {...p}
            disabled={locked}
            value={language}
            onChange={(e) => onLanguage(e.target.value)}
          >
            {WHISPER_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Switch
        label="Captions in English"
        description="Whatever you speak, the captions come out in English."
        disabled={locked}
        checked={english}
        onChange={onEnglish}
      />
    </div>
  )
}
