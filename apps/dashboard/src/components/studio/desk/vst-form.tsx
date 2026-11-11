// A VST plugin filter: pick one of the plugins on this computer, open its own window, and its
// settings are saved into the filter whenever its window changes them. The plugin runs in its
// own locked-down helper (engine docs/plan/VST.md).

import { useEffect, useState } from 'react'
import { AppWindow, ArrowClockwise } from '@phosphor-icons/react'
import { type EngineSettings, type EngineVstPlugin, type EngineVstStatus } from '@ferrocast/api'
import { Button, IconButton, InfoTip, Select, Skeleton, cx } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, useResource } from '../../../lib/hooks'
import { useDesk } from './common'
import { Prop } from './drawer-kit'

/** A plugin's key in the picker: its bundle and class. */
export function vstKey(p: { path: string; cid: string }): string {
  return `${p.path}|${p.cid}`
}

/** What a plugin is called in the picker: its name, and its maker when there's one. */
export function vstLabel(p: EngineVstPlugin): string {
  return p.vendor ? `${p.name} · ${p.vendor}` : p.name
}

/** How it's doing, in a word or two (null: say nothing). */
export function vstState(s: EngineVstStatus | null, picked: boolean): string | null {
  if (!picked) return null
  if (!s) return 'Starting…'
  if (s.running) return 'Running'
  return s.problem ? null : 'Starting…'
}

/** A slim red strip under the rows: what went wrong, in words. */
function Strip({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="m-0 border-b border-line bg-danger-soft px-3 py-1.5 text-[12px] font-medium text-danger"
    >
      {children}
    </p>
  )
}

export function VstForm({
  source,
  filter,
  values,
  onChange,
}: {
  source: string
  filter: string
  values: EngineSettings
  onChange: (key: string, value: unknown) => void
}) {
  const { api } = useDesk()
  const { run, busy } = useAction()
  const found = useResource(() => api.vstPlugins(), [api])
  const path = typeof values.path === 'string' ? values.path : ''
  const cid = typeof values.cid === 'string' ? values.cid : ''
  const picked = path && cid ? vstKey({ path, cid }) : ''
  const [status, setStatus] = useState<EngineVstStatus | null>(null)

  // How it's doing, every 2 s while this is open; its settings saved when its window changed them.
  useEffect(() => {
    if (!picked) return
    let gone = false
    const look = async () => {
      try {
        const s = await api.vstStatus(source, filter)
        if (gone) return
        setStatus(s)
        if (s.changed) await api.vstAct(source, filter, 'save')
      } catch {
        // Said on the next look, or by the form's own errors.
      }
    }
    void look()
    const t = setInterval(() => void look(), 2000)
    return () => {
      gone = true
      clearInterval(t)
      // Once more as the drawer closes: nothing changed in its window is lost.
      void api.vstAct(source, filter, 'save').catch(() => undefined)
    }
  }, [api, source, filter, picked])

  if (found.error && !found.data) return <LoadError error={found.error} onRetry={found.reload} />
  if (!found.data) return <Skeleton className="h-9" />
  const { available, why, plugins } = found.data
  if (!available) return <Strip>{why ?? 'VST plugins don’t run here.'}</Strip>

  const rescan = async () => {
    const ok = await run('rescan', () => api.vstPlugins(true))
    if (ok) found.reload()
  }
  const pick = (key: string) => {
    const p = plugins.find((x) => vstKey(x) === key)
    if (!p) return
    setStatus(null)
    // A new plugin starts with its own defaults.
    onChange('path', p.path)
    onChange('cid', p.cid)
    onChange('name', p.name)
    onChange('state', '')
  }
  const open = () => void run('open', () => api.vstAct(source, filter, 'open'))
  const missing = picked && !plugins.some((p) => vstKey(p) === picked)
  const word = vstState(status, Boolean(picked))
  const name = typeof values.name === 'string' && values.name ? values.name : 'its plugin'
  return (
    <div className="flex flex-col">
      <Prop
        label="Plugin"
        hint="VST3 sound plugins on this computer. Each runs on its own, kept away from your files and the internet, so one that crashes can't stop your stream."
      >
        {(id) => (
          <>
            <Select
              id={id}
              value={picked}
              disabled={plugins.length === 0}
              className="h-7! min-w-0 flex-1 rounded-[5px]! py-0! pl-2! text-[12.5px]!"
              onChange={(e) => pick(e.target.value)}
            >
              <option value="">{plugins.length ? 'Pick a plugin' : 'None found'}</option>
              {missing && <option value={picked}>{name} (not found)</option>}
              {plugins.map((p) => (
                <option key={vstKey(p)} value={vstKey(p)}>
                  {vstLabel(p)}
                </option>
              ))}
            </Select>
            <IconButton
              size="xs"
              variant="ghost"
              label="Look for plugins again"
              disabled={busy !== null}
              onClick={() => void rescan()}
            >
              <ArrowClockwise
                size={13}
                weight="bold"
                className={cx(busy === 'rescan' && 'animate-spin motion-reduce:animate-none')}
              />
            </IconButton>
          </>
        )}
      </Prop>
      {plugins.length === 0 && (
        <Prop label="Where">
          <span className="min-w-0 truncate text-[12.5px] text-text-2">
            Put .vst3 plugins in Audio › Plug-Ins › VST3
          </span>
          <InfoTip label="About where plugins go">
            In /Library/Audio/Plug-Ins/VST3 (for everyone on this Mac) or the same folder in your
            own Library. Then look again.
          </InfoTip>
        </Prop>
      )}
      {picked && (
        <Prop label="Its window">
          <Button
            size="xs"
            variant="outline"
            disabled={!status?.running || busy !== null}
            onClick={open}
          >
            <AppWindow size={13} weight="bold" /> Open
          </Button>
          {word && (
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-2">
              <span
                aria-hidden
                className={cx('size-1.5 rounded-full', status?.running ? 'bg-ok' : 'bg-text-3')}
              />
              {word}
            </span>
          )}
        </Prop>
      )}
      {missing && <Strip>{`${name} isn’t on this computer any more: pick another.`}</Strip>}
      {picked && status && !status.running && status.problem && <Strip>{status.problem}</Strip>}
    </div>
  )
}
