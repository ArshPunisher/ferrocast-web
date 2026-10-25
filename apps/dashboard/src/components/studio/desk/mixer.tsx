// The Audio panel: every sound in the scene on air, with a live meter and a fader on it like
// OBS's mixer. Devices heard in every scene come first ("Everywhere"), then the scene's own.

import { useEffect, useRef, useState } from 'react'
import { DotsThree, Headphones, Plus, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { type EngineAudio, type EngineLevel } from '@ferrocast/api'
import { Button, IconButton, InfoTip, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction } from '../../../lib/hooks'
import { kindIcon, useDesk, type EngineApi } from './common'
import { DockHeader } from './layout'

/** The fader is cubic like OBS's: halfway is about -18 dB, the top is 0 dB. */
export const toDb = (pos: number): number =>
  pos <= 0 ? -100 : Math.max(-100, 60 * Math.log10(pos))
export const toPos = (db: number): number => (db <= -100 ? 0 : Math.min(1, 10 ** (db / 60)))
/** Where a level sits on the meter: -60 dB at the left, 0 at the right. */
export const meterPct = (db: number): number => Math.max(0, Math.min(100, ((db + 60) / 60) * 100))

/** Live levels for these sounds, read about ten times a second while shown. */
export function useLevels(api: EngineApi, names: string[]): Record<string, EngineLevel> {
  const [levels, setLevels] = useState<Record<string, EngineLevel>>({})
  const key = names.join('\n')
  useEffect(() => {
    if (!key) return
    let alive = true
    let timer = 0
    const list = key.split('\n')
    const tick = async () => {
      try {
        const v = await api.levels(list)
        if (alive) setLevels(v)
      } catch {
        // Stopped or busy: the next tick tries again.
      }
      if (alive) timer = window.setTimeout(() => void tick(), 100)
    }
    void tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [api, key])
  return levels
}

/** Two thin bars (left, right) with the volume fader over them. */
export function Meter({
  level,
  muted,
  volumeDb,
  label,
  onVolume,
  tall,
}: {
  level: EngineLevel | undefined
  muted: boolean
  volumeDb: number
  label: string
  onVolume: (db: number) => void
  tall?: boolean
}) {
  const [pos, setPos] = useState<number | null>(null)
  const shown = pos ?? toPos(volumeDb)
  const last = useRef(0)
  const peaks = level?.peak ?? [-100, -100]
  return (
    <div className={cx('relative min-w-0', tall ? 'h-[30px] w-full flex-none' : 'h-6 flex-1')}>
      <div
        className={cx(
          'absolute inset-x-0 flex flex-col',
          tall ? 'top-[6px] gap-1' : 'top-1 gap-[3px]',
        )}
      >
        {peaks.map((p, i) => (
          <div
            key={i}
            className={cx(
              'relative overflow-hidden rounded-full bg-surface-3',
              tall ? 'h-[7px]' : 'h-[5px]',
            )}
          >
            <div
              className={cx(
                'absolute inset-0 rounded-full bg-[linear-gradient(90deg,var(--fc-ok)_0_66%,var(--fc-warn)_66%_85%,var(--fc-danger)_85%_100%)] transition-[clip-path] duration-75',
                muted && 'opacity-40 grayscale',
              )}
              style={{ clipPath: `inset(0 ${100 - meterPct(p)}% 0 0)` }}
            />
          </div>
        ))}
      </div>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={`${toDb(shown).toFixed(1)} dB`}
        min={0}
        max={1000}
        value={Math.round(shown * 1000)}
        onChange={(e) => {
          const p = Number(e.target.value) / 1000
          setPos(p)
          // Sent as it moves, at most every 80 ms; the last value always goes.
          const now = Date.now()
          if (now - last.current > 80) {
            last.current = now
            onVolume(toDb(p))
          }
        }}
        onPointerUp={() => {
          if (pos !== null) onVolume(toDb(pos))
          setPos(null)
        }}
        onKeyUp={() => {
          if (pos !== null) onVolume(toDb(pos))
          setPos(null)
        }}
        className="fc-fader absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none bg-transparent"
      />
    </div>
  )
}

function Channel({ a, level }: { a: EngineAudio; level: EngineLevel | undefined }) {
  const { api, audio, edit } = useDesk()
  const { run } = useAction()
  const Icon = kindIcon(a.kind)
  const setAudio = (patch: Partial<Pick<EngineAudio, 'volume_db' | 'muted' | 'monitor'>>) => {
    // Shown at once; the engine follows.
    audio.set((list) => (list ?? []).map((x) => (x.name === a.name ? { ...x, ...patch } : x)))
    void run(`audio:${a.name}`, () => api.setAudio(a.name, patch), { quiet: false })
  }
  const hearing = a.monitor !== 'off'
  return (
    <div className="rounded-[10px] px-2.5 py-2 hover:bg-surface-2">
      <div className="flex items-center gap-2 text-[13.5px]">
        <Icon size={16} className="shrink-0 text-text-3" aria-hidden />
        <span className={cx('min-w-0 flex-1 truncate font-semibold', a.muted && 'text-text-3')}>
          {a.name}
        </span>
        <span
          className={cx(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            a.channel ? 'bg-accent-soft text-accent-text' : 'bg-surface-3 text-text-2',
          )}
        >
          {a.channel ? 'Everywhere' : 'This scene'}
        </span>
        <span className="w-16 shrink-0 text-right font-mono text-[12px] text-text-2 tabular-nums">
          {a.muted ? 'Muted' : `${a.volume_db.toFixed(1)} dB`}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-0.5">
        <Meter
          level={level}
          muted={a.muted}
          volumeDb={a.volume_db}
          label={`${a.name} volume`}
          onVolume={(volume_db) => setAudio({ volume_db: Math.round(volume_db * 10) / 10 })}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={a.muted ? `Unmute ${a.name}` : `Mute ${a.name}`}
          aria-pressed={a.muted}
          className={cx(a.muted && 'text-danger')}
          onClick={() => setAudio({ muted: !a.muted })}
        >
          {a.muted ? <SpeakerSlash size={15} /> : <SpeakerHigh size={15} />}
        </IconButton>
        <IconButton
          size="sm"
          variant="ghost"
          label={
            hearing
              ? `Stop hearing ${a.name} in your headphones`
              : `Hear ${a.name} in your headphones`
          }
          aria-pressed={hearing}
          className={cx(hearing && 'bg-accent-soft text-accent-text')}
          onClick={() => setAudio({ monitor: hearing ? 'off' : 'me_and_stream' })}
        >
          <Headphones size={15} />
        </IconButton>
        <IconButton
          size="sm"
          variant="ghost"
          label={`${a.name} settings`}
          onClick={() => edit(a.name)}
        >
          <DotsThree size={16} weight="bold" />
        </IconButton>
      </div>
    </div>
  )
}

export function AudioDock() {
  const { api, audio, setAdding } = useDesk()
  const list = audio.data
  const levels = useLevels(api, list?.map((a) => a.name) ?? [])
  return (
    <section aria-label="Audio" className="flex min-h-0 flex-1 flex-col">
      <DockHeader
        id="audio"
        info={
          <InfoTip label="About audio">
            Every scene has its own sounds. Devices marked Everywhere play in all of them.
          </InfoTip>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {audio.error && !list ? (
          <LoadError error={audio.error} onRetry={audio.reload} />
        ) : !list ? (
          <Skeleton className="h-28" />
        ) : list.length === 0 ? (
          <p className="m-0 p-2.5 text-[13.5px] text-text-2">No sound in this scene yet.</p>
        ) : (
          list.map((a) => <Channel key={a.name} a={a} level={levels[a.name]} />)
        )}
      </div>
      <footer className="flex flex-none items-center gap-0.5 border-t border-line px-1.5 py-1">
        <Button size="sm" variant="ghost" onClick={() => setAdding('mic')}>
          <Plus size={14} /> Add sound
        </Button>
      </footer>
    </section>
  )
}
