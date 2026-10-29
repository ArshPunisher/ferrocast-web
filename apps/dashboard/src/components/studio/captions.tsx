// Live captions (plan item 7): on-device speech to text from a Studio mic, shown on stream
// by a text source named "Captions". Mac first; elsewhere the card says so.

import { useCallback, useEffect, useState } from 'react'
import { ClosedCaptioning } from '@phosphor-icons/react'
import type { EngineCaptions, ScenesConfig } from '@ferrocast/api'
import { Button, Field, Select, Switch } from '@ferrocast/ui'
import { Panel } from '../Panel'
import { useAction, type Resource } from '../../lib/hooks'
import { useStudio } from './common'
import { useEngine } from './desk/common'
import { MIC_KIND, type RigInput } from './rig-lists'
import { CAPTIONS_SOURCE, captionsBox, captionsStep, pickMic } from './captions-box'

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

  const mics = (inputs ?? []).filter((i) => MIC_KIND.test(i.kind)).map((i) => i.name)
  const chosen = mic && mics.includes(mic) ? mic : pickMic(c?.source ?? null, mics, preferred)

  // Without the app (the browser demo, an old Ferrocast) there's nothing to show.
  if (failed && !c) return null
  if (!c) return null
  const step = captionsStep(c)

  const voice = cfg?.data?.clip_by_voice ?? false
  const setVoice = async (on: boolean) => {
    if (!cfg?.data) return
    const prev = cfg.data
    cfg.set({ ...prev, clip_by_voice: on })
    const saved = await run('voice', () => studio.saveSwitcher({ clip_by_voice: on }))
    cfg.set(saved ?? prev)
  }

  const turn = async (on: boolean) => {
    const v = await run('captions', () => api.setCaptions(on ? chosen : null))
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
      description="What you say, as text on stream. Heard on this Mac only."
    >
      <div className="flex flex-col gap-4">
        {step === 'elsewhere' && (
          <p className="text-[14.5px] text-text-2">Live captions work on a Mac for now.</p>
        )}
        {step === 'ask' && (
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
        {step === 'blocked' && (
          <p className="text-[14.5px] text-text-2">
            Speech recognition is off for Ferrocast. Turn it on in System Settings, Privacy &amp;
            Security, Speech Recognition, then open Ferrocast again.
          </p>
        )}
        {step === 'ready' && (
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
                      ).map((m) => (
                        <option key={m} value={m}>
                          {m}
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
