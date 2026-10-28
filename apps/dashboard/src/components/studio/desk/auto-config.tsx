// OBS's Auto-Configuration Wizard, simpler: what it's for, smooth or light, an upload test,
// then one pick. Better than OBS's: the upload is shared by every platform you go live to
// (Ferrocast sends each its own copy), and Twitch's and Kick's bitrate limits are kept.

import { useState } from 'react'
import { Broadcast, Gauge, Lightning, Record, Sparkle, Timer } from '@phosphor-icons/react'
import { describeError, type StudioSettings, type UploadCheck } from '@ferrocast/api'
import { Button, Dialog, cx } from '@ferrocast/ui'
import { useGoLive } from '../golive'

export interface Recommendation {
  video_kbps: number
  /** Sent smaller than the canvas, or null for the canvas's own size. */
  scale: [number, number] | null
  fps: number
  /** In words, for the summary. */
  why: string
}

/** The highest bitrate each platform takes (Kbps). */
const CAPS: Record<string, number> = { twitch: 6000, kick: 8000, youtube: 12000 }

/** What to stream at, from the upload, the platforms on, how smooth, and the canvas. */
export function recommend(o: {
  upload_kbps: number
  /** Ids of the platforms switched on ("twitch", "youtube", "kick", or a server's). */
  platforms: string[]
  fps: 30 | 60
  canvas: [number, number]
}): Recommendation {
  const n = Math.max(1, o.platforms.length)
  // A quarter kept free: uploads vary, and chat, alerts and the rest share it.
  const share = (o.upload_kbps * 0.75) / n
  const cap = Math.min(12000, ...o.platforms.map((p) => CAPS[p] ?? 12000))
  const kbps = Math.max(1500, Math.min(cap, Math.floor(share / 500) * 500))
  let fps: number = o.fps
  let height: number
  if (fps === 60) {
    if (kbps >= 6000) height = 1080
    else if (kbps >= 3500) height = 720
    else {
      // Too little for 60: smoother at 30 than blocky at 60.
      fps = 30
      height = kbps >= 2500 ? 720 : 480
    }
  } else height = kbps >= 4500 ? 1080 : kbps >= 2500 ? 720 : 480
  const [cw, ch] = o.canvas
  const scale: [number, number] | null =
    height < ch ? [Math.round((cw * height) / ch / 2) * 2, height] : null
  const split = n > 1 ? ` shared by ${n} platforms` : ''
  // When the upload forced a step down, say what would help.
  const tight = fps < o.fps || kbps < 2500 ? ' Your upload is tight: a wired connection helps.' : ''
  return {
    video_kbps: kbps,
    scale,
    fps,
    why: `${(o.upload_kbps / 1000).toFixed(1)} Mbps upload${split}.${tight}`,
  }
}

type Use = 'stream' | 'record'

export function AutoConfigDialog({
  open,
  onClose,
  s,
  onApply,
}: {
  open: boolean
  onClose: () => void
  s: StudioSettings
  onApply: (patch: Partial<StudioSettings>) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Set up for me" size="md">
      {open && <Wizard s={s} onApply={onApply} onClose={onClose} />}
    </Dialog>
  )
}

function Big({
  on,
  icon: Icon,
  title,
  note,
  tone,
  onPick,
}: {
  on: boolean
  icon: typeof Broadcast
  title: string
  note: string
  tone: string
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cx(
        'fc-press flex flex-col items-start gap-2 rounded-panel border-2 p-4 text-left transition-colors',
        'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
        on ? 'fc-picked border-transparent' : 'border-line hover:border-line-strong',
      )}
    >
      <span
        className="grid size-10 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
      >
        <Icon size={22} weight="fill" aria-hidden />
      </span>
      <b className="font-display text-[17px]">{title}</b>
      <span className="text-[14px] text-text-2">{note}</span>
    </button>
  )
}

function Wizard({
  s,
  onApply,
  onClose,
}: {
  s: StudioSettings
  onApply: (patch: Partial<StudioSettings>) => void
  onClose: () => void
}) {
  const golive = useGoLive()
  const [use, setUse] = useState<Use>('stream')
  const [fps, setFps] = useState<30 | 60>(60)
  const [step, setStep] = useState<'pick' | 'test' | 'done'>('pick')
  const [check, setCheck] = useState<UploadCheck | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The bitrate picked, changed by hand (empty: the recommendation).
  const [own, setOwn] = useState<string>('')
  const canvas: [number, number] = [s.width, s.height]

  const run = async () => {
    if (use === 'record') {
      setStep('done')
      return
    }
    setStep('test')
    setError(null)
    try {
      setCheck(await golive.uploadCheck())
      setStep('done')
    } catch (e) {
      const d = describeError(e)
      setError(d.hint ? `${d.message} ${d.hint}` : d.message)
      setStep('pick')
    }
  }
  const rec =
    use === 'stream' && check
      ? recommend({
          upload_kbps: check.verdict.upload_kbps,
          platforms: check.rows.filter((r) => !r.problem).map((r) => r.id),
          fps,
          canvas,
        })
      : null
  const on = check ? check.rows.filter((r) => !r.problem) : []
  const cap = Math.min(12000, ...on.map((r) => CAPS[r.id] ?? 12000))
  const ownKbps = Number(own)
  const kbps = rec ? (own && ownKbps >= 500 ? Math.min(ownKbps, 60000) : rec.video_kbps) : 0
  // Each platform gets its own copy: what the upload carries in all.
  const total = (kbps + 160) * Math.max(1, on.length)
  const upload = check?.verdict.upload_kbps ?? 0
  const apply = () => {
    onApply(
      use === 'record'
        ? { fps, encoder: 'hardware', record_quality: 'high' }
        : rec
          ? // The Mac's hardware encoder: the game keeps the CPU and GPU (OBS's advice too).
            { fps: rec.fps, video_kbps: kbps, scale: rec.scale, encoder: 'hardware' }
          : {},
    )
    onClose()
  }

  if (step === 'test')
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
        <Gauge size={40} weight="duotone" className="text-accent-text motion-safe:animate-pulse" />
        <b className="font-display text-[18px]">Testing your upload…</b>
        <span className="text-[14px] text-text-2">About ten seconds.</span>
      </div>
    )

  if (step === 'done') {
    const size = use === 'record' ? canvas : (rec?.scale ?? canvas)
    const shownFps = use === 'record' ? fps : (rec?.fps ?? fps)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-panel bg-ok-soft p-4">
          <Sparkle size={26} weight="fill" className="shrink-0 text-ok" aria-hidden />
          <div className="flex flex-col">
            <b className="font-display text-[20px]">
              {size[1]}p · {shownFps} fps
              {rec && ` · ${(rec.video_kbps / 1000).toFixed(1)} Mbps`}
            </b>
            <span className="text-[14px] text-text-2">
              {use === 'record'
                ? 'High quality recording, Mac hardware encoder.'
                : `${rec?.why ?? ''} Hardware encoder, so your game keeps the computer.`}
            </span>
          </div>
        </div>
        {rec && (
          <div className="flex flex-col gap-3 rounded-panel border border-line p-4">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
              {on.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-text">{r.name}</span>
                  <span className="font-mono text-text-2 tabular-nums">
                    {kbps.toLocaleString()} kbps
                    {CAPS[r.id] && kbps > CAPS[r.id]! && (
                      <b className="ml-2 text-warn">over its {CAPS[r.id]!.toLocaleString()}</b>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p
              className={cx(
                'm-0 text-[13.5px] font-semibold',
                total > upload * 0.85 ? 'text-warn' : 'text-text-3',
              )}
            >
              Uses {(total / 1000).toFixed(1)} of your {(upload / 1000).toFixed(1)} Mbps upload
              {total > upload * 0.85 ? ': too close, your game and the stream may stutter.' : '.'}
            </p>
            <label className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-text-2">
              Video bitrate
              <input
                type="number"
                inputMode="numeric"
                min={500}
                max={cap}
                step={250}
                value={own || rec.video_kbps}
                onChange={(e) => setOwn(e.target.value)}
                className="h-9 w-28 rounded-control border border-line bg-surface-2 px-2.5 text-right font-mono text-text tabular-nums"
              />
              kbps
              {own && (
                <button
                  type="button"
                  onClick={() => setOwn('')}
                  className="text-[13px] font-bold text-accent-text"
                >
                  Back to {rec.video_kbps.toLocaleString()}
                </button>
              )}
            </label>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setStep('pick')}>
            Back
          </Button>
          <Button variant="primary" onClick={apply}>
            Use this
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Big
          on={use === 'stream'}
          icon={Broadcast}
          title="Streaming"
          note="Tests your upload first."
          tone="var(--fc-danger)"
          onPick={() => setUse('stream')}
        />
        <Big
          on={use === 'record'}
          icon={Record}
          title="Recording"
          note="Best quality on this computer."
          tone="var(--fc-twitch)"
          onPick={() => setUse('record')}
        />
        <Big
          on={fps === 60}
          icon={Lightning}
          title="Smooth"
          note="60 fps, for games."
          tone="var(--fc-accent)"
          onPick={() => setFps(60)}
        />
        <Big
          on={fps === 30}
          icon={Timer}
          title="Light"
          note="30 fps, easy on the computer."
          tone="var(--fc-ok)"
          onPick={() => setFps(30)}
        />
      </div>
      {error && (
        <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => void run()}>
          {use === 'stream' ? 'Test and pick' : 'Pick'}
        </Button>
      </div>
    </div>
  )
}
