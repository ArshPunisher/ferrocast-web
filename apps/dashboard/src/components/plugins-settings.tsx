// Settings › Plugins (layout A): effects others make, added as a `.zip`. Safe by design (an
// effect only changes the picture), checked by the PC before it's added.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AppWindow, Trash, UploadSimple } from '@phosphor-icons/react'
import { describeError, pluginsApi, type Plugin } from '@ferrocast/api'
import { Button, Dialog, IconButton, InfoTip, Skeleton, Switch, cx, toast } from '@ferrocast/ui'
import { LoadError } from './Panel'
import { Group, Row } from './settings-kit'
import { useClient, useResource } from '../lib/hooks'

/** What each step a plugin may ask for is called, for "Can: …". */
const ACTION_WORDS: Record<string, string> = {
  scene: 'switch scenes',
  show: 'show sources',
  hide: 'hide sources',
  filter: 'turn filters on or off',
  save_replay: 'save the replay',
  record: 'record',
  chat: 'say in chat',
}

const KIND_WORDS: Record<string, string> = { effect: 'Effect', logic: 'Logic', panel: 'Panel' }

/** "Can switch scenes and say in chat." (nothing for an effect). */
export function canWords(actions: string[]): string | null {
  const w = actions.map((a) => ACTION_WORDS[a] ?? a)
  if (w.length === 0) return null
  const list = w.length === 1 ? w[0] : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`
  return `Can ${list}.`
}

/** The page, with nothing allowed but its own inline code: no network, no outside files. */
export function sandboxed(html: string): string {
  const csp =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'"
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><meta charset="utf-8">${html}`
}

/** Where the engine serves a panel's page (`GET /plugin-panel/{id}`), when this dashboard is
 *  the engine's own (the app, or Open in browser); else null and the page goes in `srcdoc`.
 *  A `srcdoc` frame is held to this page's policy too, which runs no inline scripts: in the
 *  app no panel's buttons worked (10 Nov). The engine's page carries its own policy. */
export function panelPageUrl(base: string, id: string, here: string): string | null {
  try {
    const engine = new URL(base || here, here)
    if (engine.origin !== new URL(here).origin) return null
    return `${engine.origin}/plugin-panel/${encodeURIComponent(id)}`
  } catch {
    return null
  }
}

/** A panel plugin's page in a sandboxed frame: its own origin-less world, no network; it asks
 *  for steps by message and hears back whether they ran. */
function PanelDialog({ p, onClose }: { p: Plugin; onClose: () => void }) {
  const client = useClient()
  const api = useMemo(() => pluginsApi(client), [client])
  const frame = useRef<HTMLIFrameElement>(null)
  const page = useResource(() => api.panel(p.id), [client, p.id])
  const src = panelPageUrl(client.baseUrl, p.id, location.href)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const win = frame.current?.contentWindow
      // Only this panel's own frame (a sandboxed frame's origin is "null").
      if (!win || e.source !== win) return
      const data = e.data as { type?: unknown; step?: unknown } | null
      if (!data || data.type !== 'act' || typeof data.step !== 'object' || data.step === null)
        return
      api.act(p.id, data.step).then(
        () => win.postMessage({ type: 'done' }, '*'),
        (err: unknown) =>
          win.postMessage({ type: 'error', message: describeError(err).message }, '*'),
      )
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [api, p.id])
  return (
    <Dialog open onClose={onClose} title={p.name} size="lg">
      {page.error ? (
        <LoadError error={page.error} onRetry={page.reload} />
      ) : !page.data ? (
        <Skeleton className="h-64" />
      ) : (
        <iframe
          ref={frame}
          title={p.name}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          {...(src ? { src } : { srcDoc: sandboxed(page.data.html) })}
          onLoad={() =>
            frame.current?.contentWindow?.postMessage(
              { type: 'hello', actions: page.data?.actions ?? [] },
              '*',
            )
          }
          className="h-[min(60vh,480px)] w-full rounded-control border border-line bg-white"
        />
      )}
    </Dialog>
  )
}

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
  const [open, setOpen] = useState(false)
  const about = [
    KIND_WORDS[p.kind] ?? p.kind,
    p.author && `By ${p.author}`,
    p.description,
    canWords(p.actions ?? []),
  ]
    .filter(Boolean)
    .join(' · ')
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
          {p.kind === 'panel' && (
            <IconButton
              size="sm"
              label={`Open ${p.name}`}
              disabled={busy || !p.on || !!p.problem}
              onClick={() => setOpen(true)}
            >
              <AppWindow size={15} />
            </IconButton>
          )}
          {open && <PanelDialog p={p} onClose={() => setOpen(false)} />}
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
        hint:
          p.kind === 'effect'
            ? 'Find it in Effects, under a source’s filters.'
            : canWords(p.actions ?? []),
      })
    })

  return (
    <>
      <Group
        title={
          <span className="flex items-center gap-1">
            Installed
            <InfoTip>
              Effects for the picture, logic that answers events, and panels with buttons. They
              can’t read your files, keys or accounts, and do only what they list.
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
                For plugin makers: a .zip with a plugin.json and an effect (.wgsl), a module (.wasm)
                or a panel (.html). Up to 2 MB.
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
