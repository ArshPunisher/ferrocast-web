// The "Don't miss" lane (Home), stream markers with exports (Studio and the recap), the
// moments settings, and the global listener for the streamer-only sound and scene hotkeys.

import { useEffect, useRef, useState } from 'react'
import { DownloadSimple, PushPin, SpeakerHigh, Trash, X } from '@phosphor-icons/react'
import {
  describeError,
  relativeTime,
  timecode,
  type LaneItem,
  type Marker,
  type MomentsConfig,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Select,
  Skeleton,
  Switch,
  toast,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useClient, useNow, useResource } from '../../lib/hooks'
import { useLive } from '../../lib/store'
import { playMomentSound, saveBlob, useStudio } from './common'

const KIND: Record<string, string> = {
  tip: 'Tip',
  superchat: 'Super Chat',
  bits: 'Bits',
  gift: 'Gifts',
  raid: 'Raid',
  first_chatter: 'First chat',
  chat_spike: 'Chat spike',
  clip: 'Clip',
  manual: 'Marker',
}

/** The lane: live frames win; the first load fills it. */
function useLane(): [LaneItem[] | undefined, (l: LaneItem[]) => void] {
  const studio = useStudio()
  const live = useLive((s) => s.studio.lane)
  const first = useResource(() => studio.lane(), [studio])
  // Frames and the route both list newest first.
  return [live ?? first.data ?? undefined, first.set]
}

export function DontMissLane() {
  const studio = useStudio()
  const [lane, setLane] = useLane()
  const now = useNow(15_000)
  const { run } = useAction()
  if (!lane || lane.length === 0) return null
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <PushPin size={16} weight="fill" className="text-accent-text" aria-hidden="true" />
          Don’t miss
          <Badge tone="accent">{lane.length}</Badge>
        </span>
      }
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void run('all', () => studio.dismissAll()).then((l) => l && setLane(l))}
        >
          Clear all
        </Button>
      }
    >
      <ul
        className="-mx-1 flex gap-2 overflow-x-auto pb-1"
        aria-label="Moments you might have missed"
      >
        {lane.map((i) => (
          <li
            key={i.id}
            className="relative flex w-64 shrink-0 flex-col gap-1 rounded-control border border-accent-line bg-accent-soft px-3 py-2.5 pr-9"
          >
            <span className="text-[12px] font-semibold text-accent-text">
              {KIND[i.kind] ?? 'Moment'} · {relativeTime(i.at, now)}
            </span>
            <span className="text-sm font-semibold break-words text-text">{i.title}</span>
            {i.detail && (
              <span className="line-clamp-2 text-[13px] break-words text-text-2">{i.detail}</span>
            )}
            <IconButton
              size="sm"
              label={`Dismiss: ${i.title}`}
              className="absolute top-1 right-1"
              onClick={() =>
                void run(i.id, () => studio.dismiss(i.id)).then((l) => l && setLane(l))
              }
            >
              <X size={14} />
            </IconButton>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function MarkersPanel({ since, title = 'Markers' }: { since?: number; title?: string }) {
  const studio = useStudio()
  const client = useClient()
  const tick = useLive((s) => s.studio.markers)
  const list = useResource(() => studio.markers(since), [studio, since, tick])
  const [label, setLabel] = useState('')
  const { run, busy } = useAction()
  const download = (format: 'csv' | 'txt') =>
    void run(format, async () => {
      const blob = await client.downloadFile(studio.exportPath(format, since))
      saveBlob(blob, `ferrocast-markers.${format}`)
      return true
    })
  return (
    <Panel
      title={title}
      description="Big moments and chat spikes, with their time in the stream, for editing."
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            icon={<DownloadSimple size={14} />}
            busy={busy === 'csv'}
            onClick={() => download('csv')}
          >
            CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<DownloadSimple size={14} />}
            busy={busy === 'txt'}
            onClick={() => download('txt')}
          >
            Text
          </Button>
        </>
      }
    >
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run('add', () => studio.addMarker(label.trim() || undefined), {
            success: 'Marker added.',
          }).then((m) => {
            if (!m) return
            setLabel('')
            list.set((p) => [...(p ?? []), m])
          })
        }}
      >
        <label htmlFor="marker-label" className="sr-only">
          Marker label
        </label>
        <Input
          id="marker-label"
          value={label}
          maxLength={200}
          placeholder="What just happened?"
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button type="submit" busy={busy === 'add'}>
          Add marker
        </Button>
      </form>
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Skeleton className="h-24" />
      ) : list.data.length === 0 ? (
        <p className="text-[13px] text-text-3">
          No markers yet. Big tips, raids, chat spikes and clips add them by themselves.
        </p>
      ) : (
        <ol className="-mx-2 flex flex-col">
          {list.data.map((m: Marker) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-control px-2 py-1.5 hover:bg-surface-2"
            >
              <span className="w-20 shrink-0 font-mono text-[13px] tabular-nums text-text-2">
                {m.offset_ms === null ? '--:--:--' : timecode(m.offset_ms)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-text">{m.label}</span>
              <Badge>{KIND[m.kind] ?? m.kind}</Badge>
              {m.clip && <Badge tone="accent">Clip</Badge>}
              <IconButton
                size="sm"
                variant="danger-ghost"
                label={`Delete marker ${m.label}`}
                onClick={() =>
                  void run(`del:${m.id}`, async () => {
                    await studio.deleteMarker(m.id)
                    list.set((p) => (p ?? []).filter((x) => x.id !== m.id))
                    return true
                  })
                }
              >
                <Trash size={14} />
              </IconButton>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

export function MomentsSettings() {
  const studio = useStudio()
  const cfg = useResource(() => studio.momentsConfig(), [studio])
  const { run } = useAction()
  const c = cfg.data
  if (cfg.error) return <LoadError error={cfg.error} onRetry={cfg.reload} />
  if (!c) return <Skeleton className="h-48" />
  const save = (patch: Partial<MomentsConfig>) => {
    const prev = c
    cfg.set({ ...c, ...patch })
    void run('save', () => studio.saveMomentsConfig(patch)).then((r) => cfg.set(r ?? prev))
  }
  const num = (
    label: string,
    key: 'big_tip' | 'big_gift_value' | 'big_sub_gift' | 'raid_viewers',
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      {(p) => (
        <Input
          {...p}
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={c[key]}
          onBlur={(e) => {
            const n = Math.max(0, Math.round(Number(e.target.value)))
            if (Number.isFinite(n) && n !== c[key]) save({ [key]: n })
          }}
        />
      )}
    </Field>
  )
  return (
    <Panel title="What counts as big" description="Pinned on Home with a sound only you hear.">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {num('Tips and Super Chats from', 'big_tip', 'In your main currency.')}
          {num('Bits or Kicks from', 'big_gift_value')}
          {num('Gifted subs at once from', 'big_sub_gift')}
          {num('Raids with at least', 'raid_viewers', 'Viewers. 1 pins every raid.')}
        </div>
        <Switch
          label="Pin first-time chatters"
          checked={c.first_chatters}
          onChange={(v) => save({ first_chatters: v })}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Sound" className="w-40">
            {(p) => (
              <Select
                {...p}
                value={c.sound}
                onChange={(e) => save({ sound: e.target.value as MomentsConfig['sound'] })}
              >
                <option value="chime">Chime</option>
                <option value="coin">Coin</option>
                <option value="bell">Bell</option>
                <option value="none">No sound</option>
              </Select>
            )}
          </Field>
          <Field label={`Volume ${c.volume}%`} className="min-w-40 flex-1">
            {(p) => (
              <input
                {...p}
                type="range"
                min={0}
                max={100}
                step={5}
                className="h-10 w-full accent-[var(--fc-accent)]"
                value={c.volume}
                onChange={(e) => cfg.set({ ...c, volume: Number(e.target.value) })}
                onPointerUp={(e) => save({ volume: Number((e.target as HTMLInputElement).value) })}
                onKeyUp={(e) => save({ volume: Number((e.target as HTMLInputElement).value) })}
              />
            )}
          </Field>
          <Button
            icon={<SpeakerHigh size={15} />}
            onClick={() => playMomentSound(c.sound, c.volume)}
          >
            Test sound
          </Button>
        </div>
        <Switch
          label="Add markers for big moments and chat spikes"
          checked={c.markers}
          onChange={(v) => save({ markers: v })}
        />
        <Switch
          label="Also add Twitch stream markers"
          description="Shows them in Twitch’s highlighter. Needs Twitch reconnected once."
          checked={c.twitch_markers}
          onChange={(v) => save({ twitch_markers: v })}
        />
      </div>
    </Panel>
  )
}

/**
 * Always mounted: plays the streamer-only sound when a moment is pinned, and switches
 * scenes with Alt+1 … Alt+9 (outside text fields).
 */
export function StudioGlobal() {
  const studio = useStudio()
  const added = useLive((s) => s.studio.added)
  const last = useRef<string | null>(null)
  const keys = useRef<string[]>([])
  useEffect(() => {
    if (!added || added.item.id === last.current) return
    last.current = added.item.id
    playMomentSound(added.sound, added.volume)
  }, [added])
  useEffect(() => {
    let alive = true
    studio
      .switcher()
      .then((c) => {
        if (alive) keys.current = c.hotkeys
      })
      .catch(() => {})
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const n = Number(e.code.replace('Digit', ''))
      if (!e.code.startsWith('Digit') || n < 1 || n > 9) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const scene = keys.current[n - 1]
      if (!scene) return
      e.preventDefault()
      studio
        .switchScene(scene)
        .then(() => toast({ tone: 'ok', message: `Switched to ${scene}.` }))
        .catch((err: unknown) => {
          const d = describeError(err)
          toast({ tone: 'error', message: d.message, hint: d.hint })
        })
    }
    const onSaved = () =>
      void studio
        .switcher()
        .then((c) => (keys.current = c.hotkeys))
        .catch(() => {})
    window.addEventListener('keydown', onKey)
    window.addEventListener('focus', onSaved)
    window.addEventListener('fc-studio-hotkeys', onSaved)
    return () => {
      window.removeEventListener('fc-studio-hotkeys', onSaved)
      alive = false
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('focus', onSaved)
    }
  }, [studio])
  return null
}
