// OBS's Advanced Audio Properties: every sound in one table, with its volume, mono, balance,
// sync offset, who hears it and the audio tracks (1 to 6) it goes into. Each change is one
// undo step (slider moves join into one).

import { useEffect, useState } from 'react'
import { type EngineAudio, type EngineAudioChange, type EngineMonitor } from '@ferrocast/api'
import { Dialog, InfoTip, Input, Segmented, Select, Skeleton, Switch, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, useResource } from '../../../lib/hooks'
import { useDesk } from './common'

const HEAR: { value: EngineMonitor; label: string }[] = [
  { value: 'off', label: 'Stream only' },
  { value: 'only_me', label: 'Only me' },
  { value: 'me_and_stream', label: 'Me and the stream' },
]

const TRACKS = [1, 2, 3, 4, 5, 6]

/** Balance as people read it: "Centre", "L 40%", "R 25%". */
export function balanceLabel(b: number): string {
  const off = Math.round((b - 0.5) * 200)
  if (off === 0) return 'Centre'
  return off < 0 ? `L ${-off}%` : `R ${off}%`
}

/** Opens on `focus` (a sound's name) or on every sound (an empty string); null is closed. */
export function AdvancedAudio({ focus, onClose }: { focus: string | null; onClose: () => void }) {
  const { api, scene, scenes } = useDesk()
  const { run } = useAction()
  const [scope, setScope] = useState<'scene' | 'all'>('all')
  const names = scenes.data?.scenes.map((s) => s.name).join('\n') ?? ''
  const open = focus !== null
  const list = useResource(async () => {
    if (!open) return null
    const from = scope === 'all' && names ? names.split('\n') : [scene]
    const lists = await Promise.all(from.map((n) => api.audio(n)))
    const seen = new Set<string>()
    return lists.flat().filter((a) => !seen.has(a.name) && seen.add(a.name))
  }, [api, open, scope, names, scene])
  // The row asked for comes into view.
  useEffect(() => {
    if (!focus || !list.data) return
    document.getElementById(rowId(focus))?.scrollIntoView({ block: 'nearest' })
  }, [focus, list.data])

  const change = (name: string, patch: EngineAudioChange) => {
    // Shown at once; the engine follows.
    list.set((l) => (l ?? []).map((x) => (x.name === name ? { ...x, ...patch } : x)))
    void run(`audio:${name}`, () => api.setAudio(name, patch), { quiet: false })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Advanced audio"
      description="Every sound's balance, timing and tracks."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          label="Which sounds"
          value={scope}
          options={[
            { value: 'scene', label: 'This scene' },
            { value: 'all', label: 'All' },
          ]}
          onChange={setScope}
        />
        <InfoTip label="About tracks">
          Recordings can keep up to 6 audio tracks. Track 1 is what the stream hears; the others let
          you keep, say, your mic and the game apart for editing.
        </InfoTip>
      </div>
      {list.error && !list.data ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Skeleton className="h-40" />
      ) : list.data.length === 0 ? (
        <p className="m-0 text-[13.5px] font-medium text-text-2">No sound here yet.</p>
      ) : (
        <div className="flex flex-col gap-2 lg:gap-0">
          <div
            aria-hidden
            className="hidden grid-cols-[minmax(120px,1.4fr)_80px_48px_minmax(150px,1.2fr)_96px_168px_196px] gap-3 border-b border-line px-2 pb-2 text-[12px] font-bold text-text-3 lg:grid"
          >
            <span>Sound</span>
            <span>Volume</span>
            <span>Mono</span>
            <span>Balance</span>
            <span>Sync (ms)</span>
            <span>Hear it</span>
            <span>Tracks</span>
          </div>
          {list.data.map((a) => (
            <SoundRow
              key={a.name}
              a={a}
              focused={a.name === focus}
              onChange={(p) => change(a.name, p)}
            />
          ))}
        </div>
      )}
    </Dialog>
  )
}

const rowId = (name: string) => `adv-audio-${encodeURIComponent(name)}`

function SoundRow({
  a,
  focused,
  onChange,
}: {
  a: EngineAudio
  focused: boolean
  onChange: (p: EngineAudioChange) => void
}) {
  const [volume, setVolume] = useState(a.volume_db.toFixed(1))
  const [sync, setSync] = useState(String(a.sync_ms ?? 0))
  useEffect(() => setVolume(a.volume_db.toFixed(1)), [a.volume_db])
  useEffect(() => setSync(String(a.sync_ms ?? 0)), [a.sync_ms])
  const tracks = a.tracks ?? TRACKS
  const commitVolume = () => {
    const v = Math.min(26, Math.max(-100, Number(volume)))
    // Unchanged (or not a number): nothing is sent, so no empty undo step.
    if (Number.isFinite(v) && v.toFixed(1) !== a.volume_db.toFixed(1)) onChange({ volume_db: v })
    else setVolume(a.volume_db.toFixed(1))
  }
  const commitSync = () => {
    const v = Math.min(20000, Math.max(-950, Math.round(Number(sync))))
    if (Number.isFinite(v) && v !== (a.sync_ms ?? 0)) onChange({ sync_ms: v })
    else setSync(String(a.sync_ms ?? 0))
  }
  const cell = 'flex items-center gap-2 lg:block'
  const small = 'w-[72px] shrink-0 whitespace-nowrap text-[12px] font-bold text-text-3 lg:hidden'
  return (
    <div
      id={rowId(a.name)}
      className={cx(
        'grid grid-cols-1 gap-x-4 gap-y-2 rounded-[10px] sm:grid-cols-2 border border-line p-3 lg:grid-cols-[minmax(120px,1.4fr)_80px_48px_minmax(150px,1.2fr)_96px_168px_196px] lg:items-center lg:gap-3 lg:rounded-none lg:border-0 lg:border-b lg:px-2 lg:py-2',
        focused && 'bg-accent/8',
      )}
    >
      <span
        className="truncate text-[13.5px] font-semibold text-text sm:col-span-2 lg:col-span-1"
        title={a.name}
      >
        {a.name}
      </span>
      <label className={cell}>
        <span className={small}>Volume</span>
        <Input
          aria-label={`Volume of ${a.name}, dB`}
          inputMode="decimal"
          name="volume_db"
          autoComplete="off"
          className="h-8! w-20 text-[13px] tabular-nums"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          onBlur={commitVolume}
          onKeyDown={(e) => e.key === 'Enter' && commitVolume()}
        />
      </label>
      <div className={cell}>
        <span className={small}>Mono</span>
        <Switch
          hideLabel
          label={`Mono for ${a.name}`}
          checked={!!a.mono}
          onChange={(on) => onChange({ mono: on })}
        />
      </div>
      <label className={cx(cell, 'min-w-0')}>
        <span className={small}>Balance</span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            aria-label={`Balance of ${a.name}`}
            aria-valuetext={balanceLabel(a.balance ?? 0.5)}
            className="min-w-0 flex-1 accent-[var(--fc-accent)]"
            value={a.balance ?? 0.5}
            disabled={!!a.mono}
            onChange={(e) => onChange({ balance: Number(e.target.value) })}
            onDoubleClick={() => onChange({ balance: 0.5 })}
          />
          <span className="w-14 flex-none text-right text-[12px] font-semibold text-text-2 tabular-nums">
            {balanceLabel(a.balance ?? 0.5)}
          </span>
        </span>
      </label>
      <label className={cell}>
        <span className={small}>Sync (ms)</span>
        <Input
          aria-label={`Sync offset of ${a.name}, ms`}
          inputMode="numeric"
          name="sync_ms"
          autoComplete="off"
          className="h-8! w-24 text-[13px] tabular-nums"
          value={sync}
          onChange={(e) => setSync(e.target.value)}
          onBlur={commitSync}
          onKeyDown={(e) => e.key === 'Enter' && commitSync()}
        />
      </label>
      <label className={cell}>
        <span className={small}>Hear it</span>
        <Select
          aria-label={`Who hears ${a.name}`}
          className="h-8! w-full text-[13px]"
          value={a.monitor}
          onChange={(e) => onChange({ monitor: e.target.value as EngineMonitor })}
        >
          {HEAR.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </Select>
      </label>
      <div className={cell} role="group" aria-label={`Audio tracks for ${a.name}`}>
        <span className={small}>Tracks</span>
        <span className="flex gap-1">
          {TRACKS.map((t) => {
            const on = tracks.includes(t)
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                aria-label={`Track ${t}`}
                className={cx(
                  'grid size-9 touch-manipulation place-items-center lg:size-7 rounded-[6px] border text-[12px] font-bold tabular-nums transition-colors active:scale-[0.96]',
                  on
                    ? 'border-accent/60 bg-accent/20 text-text'
                    : 'border-line bg-surface-2 text-text-3 hover:border-line-strong',
                )}
                onClick={() =>
                  onChange({
                    tracks: on
                      ? tracks.filter((x) => x !== t)
                      : [...tracks, t].sort((x, y) => x - y),
                  })
                }
              >
                {t}
              </button>
            )
          })}
        </span>
      </div>
    </div>
  )
}
