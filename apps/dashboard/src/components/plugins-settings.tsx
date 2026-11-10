// Settings › Plugins (layout A): effects others make, added as a `.zip`. Safe by design (an
// effect only changes the picture), checked by the PC before it's added.

import { useRef, useState } from 'react'
import { Trash, UploadSimple } from '@phosphor-icons/react'
import { describeError, pluginsApi, type Plugin } from '@ferrocast/api'
import { Button, InfoTip, Skeleton, Switch, cx, toast } from '@ferrocast/ui'
import { LoadError } from './Panel'
import { Group, Row } from './settings-kit'
import { useClient, useResource } from '../lib/hooks'

/** One plugin: its name and version, who made it and what it does, its switch and Remove. */
function PluginRow({
  p,
  busy,
  onOn,
  onRemove,
}: {
  p: Plugin
  busy: boolean
  onOn: (on: boolean) => void
  onRemove: () => void
}) {
  const [sure, setSure] = useState(false)
  const about = [p.author && `By ${p.author}`, p.description].filter(Boolean).join(' · ')
  return (
    <Row
      label={
        <span className="flex items-baseline gap-2">
          <span className="truncate">{p.name}</span>
          <span className="shrink-0 font-mono text-[12.5px] font-medium text-text-3">
            {p.version}
          </span>
        </span>
      }
      description={
        p.problem ? <span className="font-medium text-warn">{p.problem}</span> : about || null
      }
      control={
        <>
          {/* Asks once: the bin, then a red "Remove" (as a filter's). */}
          <button
            type="button"
            aria-label={sure ? `Sure? Remove ${p.name}` : `Remove ${p.name}`}
            title={sure ? undefined : `Remove ${p.name}`}
            disabled={busy}
            onBlur={() => setSure(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && sure) {
                e.stopPropagation()
                setSure(false)
              }
            }}
            onClick={() => (sure ? onRemove() : setSure(true))}
            className={cx(
              'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-bold outline-none transition-colors duration-150 focus-visible:shadow-[var(--fc-focus)] disabled:opacity-60',
              sure
                ? 'bg-danger-fill px-2.5 text-white'
                : 'w-8 text-text-3 hover:bg-danger-soft hover:text-danger',
            )}
          >
            <Trash size={15} weight={sure ? 'bold' : 'regular'} aria-hidden />
            {sure && 'Remove'}
          </button>
          <Switch label={`${p.name} on`} hideLabel checked={p.on} disabled={busy} onChange={onOn} />
        </>
      }
    />
  )
}

export function PluginsSettings() {
  const client = useClient()
  const api = pluginsApi(client)
  const list = useResource(() => api.list(), [client])
  const [busy, setBusy] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const run = async (key: string, f: () => Promise<unknown>, ok?: string, hint?: string) => {
    setBusy(key)
    try {
      await f()
      if (ok) toast({ tone: 'ok', message: ok, hint: hint ?? null })
      list.reload()
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusy(null)
    }
  }

  const add = (f: File) =>
    void run('add', async () => {
      const p = await api.install(f, f.name)
      toast({
        tone: 'ok',
        message: `${p.name} added.`,
        hint: 'Find it in Effects, under a source’s filters.',
      })
    })

  return (
    <>
      <Group
        title={
          <span className="flex items-center gap-1">
            Installed
            <InfoTip>
              Plugins add effects to the picture. They can’t read your files, keys or accounts.
            </InfoTip>
          </span>
        }
      >
        {list.error && !list.data ? (
          <Row>
            <LoadError error={list.error} onRetry={list.reload} />
          </Row>
        ) : !list.data ? (
          <Row>
            <Skeleton className="h-12" />
          </Row>
        ) : list.data.length === 0 ? (
          <Row description="No plugins yet." />
        ) : (
          list.data.map((p) => (
            <PluginRow
              key={p.id}
              p={p}
              busy={busy !== null}
              onOn={(on) => void run(`on:${p.id}`, () => api.setOn(p.id, on))}
              onRemove={() => void run(`rm:${p.id}`, () => api.remove(p.id), `${p.name} removed.`)}
            />
          ))
        )}
      </Group>
      <Group>
        <Row
          label={
            <span className="flex items-center gap-1">
              Add a plugin
              <InfoTip>
                For plugin makers: a .zip with a plugin.json and an effect.wgsl. Up to 2 MB.
              </InfoTip>
            </span>
          }
          description="A .zip from its maker. It’s checked before it’s added."
          control={
            <>
              <input
                ref={file}
                type="file"
                accept=".zip,application/zip"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) add(f)
                }}
              />
              <Button
                variant="outline"
                icon={<UploadSimple size={16} />}
                busy={busy === 'add'}
                onClick={() => file.current?.click()}
              >
                Choose file
              </Button>
            </>
          }
        />
      </Group>
    </>
  )
}
