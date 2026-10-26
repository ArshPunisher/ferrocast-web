// Web panels (OBS's Custom Browser Docks): any page as a panel in the Studio, beside the
// preview. Many sites refuse to be shown inside another page; those open in a window of their
// own in the app (OBS's docks are whole browsers, so they never meet that).

import { useEffect, useState } from 'react'
import { AppWindow, ArrowClockwise, PencilSimple } from '@phosphor-icons/react'
import { describeError } from '@ferrocast/api'
import { Button, Dialog, Field, IconButton, Input, InfoTip, toast } from '@ferrocast/ui'
import { inDesktopApp } from '../../../lib/external'
import { useDesk } from './common'
import { DockHeader, putWeb, useLayout, type WebDock } from './layout'

/** The address as typed, made whole: "twitch.tv/x" → https://, "localhost:8080" → http://. */
export function wholeUrl(text: string): string {
  const t = text.trim()
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(t)) return `http://${t}`
  // No scheme yet, and it looks like a site: the web's default.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t) && /^[^\s/]+\.[^\s/]+/.test(t)) return `https://${t}`
  return t
}

/** What's wrong with an address for a web panel, or null when it's fine. */
export function webUrlProblem(text: string, here: string): string | null {
  let u: URL
  try {
    u = new URL(wholeUrl(text))
  } catch {
    return 'Paste the whole address, starting with https://'
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:')
    return 'Only web pages (https://) can be a panel.'
  // The dashboard itself would get its own key: never inside a panel.
  if (u.origin === here) return 'That’s Ferrocast itself: its pages are panels already.'
  return null
}

/** A name from the address when none is given: "dashboard.twitch.tv" → "dashboard.twitch.tv". */
export function nameFrom(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Web page'
  }
}

/** A new panel's id. `crypto.randomUUID` is missing on a plain-http LAN address. */
export function newWebId(): `web:${string}` {
  const r =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('')
  return `web:${r.replace(/-/g, '').slice(0, 10)}`
}

/** Opens a web panel's page in a window of its own (in the app), else a browser tab. */
export function useOpenWindow() {
  const { api } = useDesk()
  return async (d: Pick<WebDock, 'name' | 'url'>) => {
    if (!inDesktopApp()) {
      window.open(d.url, '_blank', 'noopener,noreferrer')
      return
    }
    try {
      await api.webWindow(d.name, d.url)
    } catch (e) {
      const x = describeError(e)
      toast({ tone: 'error', message: x.message, ...(x.hint ? { hint: x.hint } : {}) })
    }
  }
}

/** Add a web panel, or change one (`dock`). */
export function WebDockDialog({
  open,
  dock,
  onClose,
}: {
  open: boolean
  dock?: WebDock | null
  onClose: () => void
}) {
  const { setLayout } = useLayout()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (!open) return
    setName(dock?.name ?? '')
    setUrl(dock?.url ?? '')
    setTried(false)
  }, [open, dock])
  const problem = webUrlProblem(url, window.location.origin)
  const save = () => {
    setTried(true)
    if (problem) return
    const clean = new URL(wholeUrl(url)).href
    setLayout((l) =>
      putWeb(l, {
        id: dock?.id ?? newWebId(),
        name: name.trim() || nameFrom(clean),
        url: clean,
      }),
    )
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={dock ? 'Web panel' : 'Add a web panel'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {dock ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field
          label="Address"
          hint="A chat pop-out, an alerts page, a music player… Pages that don’t allow being shown inside another page open in a window of their own instead."
          error={tried ? problem : null}
        >
          {(p) => (
            <Input
              {...p}
              type="url"
              inputMode="url"
              spellCheck={false}
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          )}
        </Field>
        <Field label="Name" optional>
          {(p) => (
            <Input
              {...p}
              maxLength={40}
              placeholder={url && !problem ? nameFrom(wholeUrl(url)) : undefined}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        {/* Enter in either field adds it. */}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

/** The panel: the page, with reload, its own window and edit on the title bar. */
export function WebDockPanel({ dock }: { dock: WebDock }) {
  const [reloads, setReloads] = useState(0)
  const [editing, setEditing] = useState(false)
  const openWindow = useOpenWindow()
  const problem = webUrlProblem(dock.url, window.location.origin)
  return (
    <section aria-label={dock.name} className="flex min-h-0 flex-1 flex-col">
      <DockHeader
        id={dock.id}
        info={
          <InfoTip label="About web panels">
            Blank? Some sites don’t allow being shown inside another page. Open it in its own window
            instead.
          </InfoTip>
        }
        actions={
          <>
            <IconButton size="sm" label="Reload" onClick={() => setReloads((n) => n + 1)}>
              <ArrowClockwise size={15} />
            </IconButton>
            <IconButton
              size="sm"
              label={inDesktopApp() ? 'Open in its own window' : 'Open in a new tab'}
              onClick={() => void openWindow(dock)}
            >
              <AppWindow size={15} />
            </IconButton>
            <IconButton size="sm" label="Change name or address" onClick={() => setEditing(true)}>
              <PencilSimple size={15} />
            </IconButton>
          </>
        }
      />
      {problem ? (
        // Only reachable through a hand-edited saved layout: never framed.
        <p role="alert" className="m-0 p-3 text-[14.5px] text-danger">
          {problem}
        </p>
      ) : (
        <iframe
          key={`${dock.url}#${reloads}`}
          src={dock.url}
          title={dock.name}
          // Its own origin, never the dashboard's (refused when adding), so it can't reach Ferrocast.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          allow="autoplay; clipboard-write; fullscreen"
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />
      )}
      <WebDockDialog open={editing} dock={dock} onClose={() => setEditing(false)} />
    </section>
  )
}

/** The web panel with this id (the layout knows its name and address). */
export function WebDockSlot({ id }: { id: string }) {
  const { layout } = useLayout()
  const dock = layout.webs.find((d) => d.id === id)
  return dock ? <WebDockPanel dock={dock} /> : null
}
