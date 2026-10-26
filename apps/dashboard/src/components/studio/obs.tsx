// OBS helpers: health, scene switching with sources, clip that, BRB and the switcher's
// settings (chat !scene allow-list, BRB, ads, hotkeys).

import { useState } from 'react'
import { Coffee, Scissors } from '@phosphor-icons/react'
import { type ObsHealth, type ObsScenes, type ScenesConfig } from '@ferrocast/api'
import { Badge, Button, Field, Kbd, Select, Skeleton, Switch, cx, toast } from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useResource, type Resource } from '../../lib/hooks'
import { useLive } from '../../lib/store'
import { useStudio } from './common'

/** The watcher's reading from the live socket, loaded once before a frame arrives. */
export function useObsHealth(): ObsHealth | null | undefined {
  const studio = useStudio()
  const live = useLive((s) => s.studio.health)
  const first = useResource(() => studio.health().then((h) => h.health), [studio])
  if (live !== undefined) return live
  // A failed load shows "No reading yet" rather than a skeleton forever.
  if (first.error) return null
  return first.loading ? undefined : (first.data ?? null)
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-control bg-surface-2 px-3 py-2">
      <p className="text-[13.5px] font-medium text-text-2">{label}</p>
      <p
        className={cx(
          'font-mono text-[16px] font-semibold tabular-nums',
          warn ? 'text-warn' : 'text-text',
        )}
      >
        {value}
      </p>
    </div>
  )
}

export function HealthPanel() {
  const h = useObsHealth()
  return (
    <Panel title="OBS health" description="Checked every 5 seconds while connected.">
      {h === undefined ? (
        <Skeleton className="h-24" />
      ) : h === null ? (
        <p className="text-[14.5px] text-text-3">
          No reading yet. Open OBS and check{' '}
          <a href="#/settings/obs" className="font-semibold text-accent-text hover:underline">
            Settings, OBS
          </a>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Dropped"
              value={`${h.dropped_pct.toFixed(1)}%`}
              warn={h.dropped_pct >= 1}
            />
            <Stat
              label="Bitrate"
              value={h.streaming ? `${Math.round(h.bitrate_kbps)} kbps` : 'Not streaming'}
            />
            <Stat label="CPU" value={`${Math.round(h.cpu)}%`} warn={h.cpu >= 90} />
            <Stat label="Disk free" value={`${Math.round(h.disk_gb)} GB`} warn={h.disk_gb < 5} />
          </div>
          <HealthWarnings h={h} />
        </div>
      )}
    </Panel>
  )
}

export function HealthWarnings({ h }: { h: ObsHealth }) {
  if (h.warnings.length === 0) return <p className="text-[14.5px] text-text-3">All good.</p>
  return (
    <ul className="flex flex-col gap-2" aria-label="OBS warnings">
      {h.warnings.map((w) => (
        <li
          key={w.id}
          className={cx(
            'rounded-control border px-3 py-2 text-[14.5px]',
            w.level === 'error' ? 'border-danger/40 bg-danger-soft' : 'border-warn/40 bg-warn-soft',
          )}
        >
          <p className="font-semibold text-text">{w.message}</p>
          <p className="text-text-2">{w.hint}</p>
        </li>
      ))}
    </ul>
  )
}

export function ScenesPanel({
  scenes,
  cfg,
}: {
  scenes: Resource<ObsScenes>
  cfg: ScenesConfig | null
}) {
  const studio = useStudio()
  const brb = useLive((s) => s.studio.brb)
  const { run, busy } = useAction()
  const [open, setOpen] = useState<string | null>(null)
  const s = scenes.data
  const sw = (name: string) =>
    void run(
      `scene:${name}`,
      async () => {
        await studio.switchScene(name)
        scenes.set((p) => (p ? { ...p, current: name } : p!))
        return true
      },
      { success: `Switched to ${name}.` },
    )
  const shown = open ?? s?.current ?? null
  return (
    <Panel
      title="Scenes"
      actions={
        <>
          <Button
            size="sm"
            icon={<Scissors size={14} />}
            busy={busy === 'clip'}
            onClick={() =>
              void run('clip', () => studio.clip(), {
                success: 'Clip saved. A marker was added too.',
              })
            }
          >
            Clip that
          </Button>
          {cfg?.brb_scene && (
            <Button
              size="sm"
              icon={<Coffee size={14} />}
              busy={busy === 'brb'}
              onClick={() =>
                void run('brb', () => studio.brb(!brb?.on), {
                  success: (r) => (r.on ? `On ${r.scene}.` : `Back on ${r.scene}.`),
                }).then((r) => r && scenes.set((p) => (p ? { ...p, current: r.scene } : p!)))
              }
            >
              {brb?.on ? 'Back from BRB' : 'BRB'}
            </Button>
          )}
        </>
      }
    >
      {scenes.error ? (
        <LoadError error={scenes.error} onRetry={scenes.reload} />
      ) : !s ? (
        <Skeleton className="h-32" />
      ) : (
        <div className="flex flex-col gap-4">
          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            role="group"
            aria-label="Switch scene"
          >
            {s.scenes.map((sc) => {
              const key = cfg?.hotkeys.indexOf(sc.name) ?? -1
              const on = sc.name === s.current
              return (
                <button
                  key={sc.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => (on ? setOpen(sc.name) : sw(sc.name))}
                  className={cx(
                    'fc-press flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-control border px-3 py-2 text-left transition-colors',
                    'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                    on
                      ? 'border-accent-line bg-accent-soft'
                      : 'border-line bg-surface-2 hover:border-line-strong',
                  )}
                >
                  <span className="w-full truncate text-sm font-semibold text-text">{sc.name}</span>
                  <span className="text-[13.5px] text-text-3">
                    {on
                      ? 'On air'
                      : `${sc.items.length} ${sc.items.length === 1 ? 'source' : 'sources'}`}
                    {key >= 0 && (
                      <>
                        {' '}
                        <Kbd>Alt+{key + 1}</Kbd>
                      </>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          {shown && (
            <div>
              <Field label="Sources in">
                {(p) => (
                  <Select {...p} value={shown} onChange={(e) => setOpen(e.target.value)}>
                    {s.scenes.map((sc) => (
                      <option key={sc.name} value={sc.name}>
                        {sc.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <ul className="mt-2 flex flex-col gap-2">
                {s.scenes
                  .find((sc) => sc.name === shown)
                  ?.items.map((it) => (
                    <li key={it.id}>
                      <Switch
                        label={it.source}
                        checked={it.enabled}
                        onChange={(visible) =>
                          void run(`src:${it.id}`, async () => {
                            await studio.setSourceVisible(shown, it.id, visible)
                            scenes.set((p) =>
                              p
                                ? {
                                    ...p,
                                    scenes: p.scenes.map((sc) =>
                                      sc.name === shown
                                        ? {
                                            ...sc,
                                            items: sc.items.map((x) =>
                                              x.id === it.id ? { ...x, enabled: visible } : x,
                                            ),
                                          }
                                        : sc,
                                    ),
                                  }
                                : p!,
                            )
                            return true
                          })
                        }
                      />
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

export function SwitcherSettings({
  scenes,
  cfg,
}: {
  scenes: ObsScenes | null
  cfg: Resource<ScenesConfig>
}) {
  const studio = useStudio()
  const inputs = useResource(() => studio.obsInputs().catch(() => []), [studio])
  const { run } = useAction()
  const c = cfg.data
  if (cfg.error) return <LoadError error={cfg.error} onRetry={cfg.reload} />
  if (!c) return <Skeleton className="h-48" />
  const save = (patch: Partial<ScenesConfig>) => {
    const prev = c
    cfg.set({ ...c, ...patch })
    void run('save', () => studio.saveSwitcher(patch)).then((r) => {
      if (r) {
        cfg.set(r)
        window.dispatchEvent(new Event('fc-studio-hotkeys'))
      } else cfg.set(prev)
    })
  }
  const names = scenes?.scenes.map((s) => s.name) ?? [...new Set([...c.chat_allowed, ...c.hotkeys])]
  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
  const audio = (inputs.data ?? []).filter((i) =>
    /input_capture|coreaudio|pulse|alsa|jack/.test(i.kind),
  )
  return (
    <Panel title="Scene switcher" description="Saved as you change it.">
      <div className="flex flex-col gap-4">
        <Switch
          label="Mods can switch scenes from chat"
          description="!scene <name>, !brb and !back, for the scenes ticked below."
          checked={c.chat_enabled}
          onChange={(v) => save({ chat_enabled: v })}
        />
        <fieldset>
          <legend className="text-[14.5px] font-medium text-text-2">
            Scenes mods may switch to
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {names.map((n) => (
              <label
                key={n}
                className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[14.5px] text-text-2"
              >
                <input
                  type="checkbox"
                  className="accent-[var(--fc-arc)]"
                  checked={c.chat_allowed.includes(n)}
                  onChange={() => save({ chat_allowed: toggle(c.chat_allowed, n) })}
                />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[14.5px] font-medium text-text-2">
            Keyboard shortcuts in the dashboard
          </legend>
          <p className="mt-0.5 text-[14.5px] text-text-3">
            Ticked scenes get Alt+1, Alt+2 and on, in tick order.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {names.map((n) => {
              const i = c.hotkeys.indexOf(n)
              return (
                <label
                  key={n}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[14.5px] text-text-2"
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--fc-arc)]"
                    checked={i >= 0}
                    disabled={i < 0 && c.hotkeys.length >= 9}
                    onChange={() => save({ hotkeys: toggle(c.hotkeys, n) })}
                  />
                  {n}
                  {i >= 0 && <Kbd>Alt+{i + 1}</Kbd>}
                </label>
              )
            })}
          </div>
        </fieldset>
        <Field label="BRB scene">
          {(p) => (
            <Select
              {...p}
              value={c.brb_scene ?? ''}
              onChange={(e) =>
                save({
                  brb_scene: e.target.value || null,
                  ...(e.target.value ? {} : { brb_on_ads: false }),
                })
              }
            >
              <option value="">None</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Switch
          label="Switch to BRB during Twitch ads"
          description="And back when the ad ends."
          disabled={!c.brb_scene}
          checked={c.brb_on_ads}
          onChange={(v) => save({ brb_on_ads: v })}
        />
        {audio.length > 0 && (
          <fieldset>
            <legend className="text-[14.5px] font-medium text-text-2">Mute on BRB</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {audio.map((i) => (
                <label
                  key={i.name}
                  className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[14.5px] text-text-2"
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--fc-arc)]"
                    checked={c.brb_mute.includes(i.name)}
                    onChange={() => save({ brb_mute: toggle(c.brb_mute, i.name) })}
                  />
                  {i.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Switch
          label="Mods can type !clip"
          description="Saves OBS’s replay buffer, at most every 20 seconds."
          checked={c.clip_command}
          onChange={(v) => save({ clip_command: v })}
        />
        <Switch
          label="Clip big moments by itself"
          description="Big tips, raids and chat spikes save the replay buffer."
          checked={c.clip_on_big_moments}
          onChange={(v) => save({ clip_on_big_moments: v })}
        />
        {!scenes && (
          <Badge tone="warn">OBS isn’t connected: scene lists are from your settings.</Badge>
        )}
      </div>
    </Panel>
  )
}

/** Shows a toast when OBS answered a scene switch from a hotkey. */
export function sceneToast(scene: string, ok: boolean, message?: string): void {
  toast(
    ok
      ? { tone: 'ok', message: `Switched to ${scene}.` }
      : { tone: 'error', message: message ?? `Couldn’t switch to ${scene}.` },
  )
}
