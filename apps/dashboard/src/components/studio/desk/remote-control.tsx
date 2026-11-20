// Settings > Advanced > Remote control: the obs-websocket server, for Stream Deck, Touch Portal,
// Bitfocus Companion and the rest that speak OBS's remote protocol. Off until switched on; the
// password is made then, shown once and kept only as a hash.

import { useCallback, useEffect, useState } from 'react'
import { describeError, type RemoteControl } from '@ferrocast/api'
import { Button, InfoTip, Input, Switch, copyText, toast } from '@ferrocast/ui'
import { useDesk } from './common'

const POLL_MS = 5000

export function RemoteControlSection() {
  const { api } = useDesk()
  const [view, setView] = useState<RemoteControl | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** The password, from the answer that made it: gone when this closes. */
  const [shown, setShown] = useState<string | null>(null)
  const [port, setPort] = useState('')

  const load = useCallback(async () => {
    try {
      const v = await api.remoteControl()
      setView(v)
      setPort((p) => (p === '' ? String(v.port) : p))
      setFailed(null)
    } catch (e) {
      setFailed(describeError(e).message)
    }
  }, [api])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const change = async (patch: { enabled?: boolean; port?: number; lan?: boolean }) => {
    setBusy(true)
    try {
      const v = await api.setRemoteControl(patch)
      if (v.password) setShown(v.password)
      if (patch.enabled === false) setShown(null)
      const { password: _once, ...rest } = v
      setView(rest)
      setPort(String(v.port))
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
      void load()
    } finally {
      setBusy(false)
    }
  }

  const renew = async () => {
    setBusy(true)
    try {
      const r = await api.newRemoteControlPassword()
      setShown(r.password)
      void load()
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string) => {
    const ok = await copyText(text)
    toast(ok ? { tone: 'ok', message: 'Copied.' } : { tone: 'error', message: 'Couldn’t copy.' })
  }

  const commitPort = () => {
    if (!view) return
    const n = Number(port)
    if (!Number.isInteger(n) || n < 1024 || n > 65535) {
      setPort(String(view.port))
      toast({ tone: 'error', message: 'Use a port from 1024 to 65535.' })
      return
    }
    if (n !== view.port) void change({ port: n })
  }

  return (
    <>
      <h3 className="m-0 flex items-center gap-1 text-[11px] font-bold tracking-[0.07em] text-text-2 uppercase">
        Remote control
        <InfoTip label="About remote control">
          Lets Stream Deck, Touch Portal, Bitfocus Companion and other apps that work with OBS drive
          Ferrocast: scenes, mute, record, stream. Use the address below and the password in their
          OBS WebSocket settings. Only this computer can connect unless you allow other devices.
        </InfoTip>
      </h3>
      {failed && (
        <p role="alert" className="m-0 py-1 text-[13px] text-danger">
          {failed}
        </p>
      )}
      {!view && !failed && <p className="m-0 py-1 text-[13px] text-text-3">Loading…</p>}
      {view && (
        <div className="flex flex-col">
          <Line label="Let other apps control Ferrocast">
            <Switch
              label="Let other apps control Ferrocast"
              hideLabel
              checked={view.enabled}
              disabled={busy}
              onChange={(enabled) => void change({ enabled })}
            />
          </Line>
          {view.enabled && (
            <>
              <Line label="Port">
                <Input
                  aria-label="Port"
                  inputMode="numeric"
                  className="w-24 font-mono"
                  value={port}
                  disabled={busy}
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  onBlur={commitPort}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </Line>
              <Line
                label="Other devices on my network"
                sub={
                  view.lan
                    ? "Anyone on your network with the password. Use it only on a network you trust: the link isn't encrypted."
                    : 'Only this computer'
                }
              >
                <Switch
                  label="Other devices on my network"
                  hideLabel
                  checked={view.lan}
                  disabled={busy}
                  onChange={(lan) => void change({ lan })}
                />
              </Line>
              <Line label="Password" sub={shown ? 'Shown once: copy it now' : 'Kept hidden'}>
                {shown && (
                  <>
                    <code
                      data-testid="remote-password"
                      className="rounded bg-surface-2 px-2 py-1 font-mono text-[13px] select-all"
                    >
                      {shown}
                    </code>
                    <Button size="sm" onClick={() => void copy(shown)}>
                      Copy
                    </Button>
                  </>
                )}
                <Button size="sm" disabled={busy} onClick={() => void renew()}>
                  New password
                </Button>
              </Line>
              <Line label="Status">
                <span
                  className={`text-[13px] ${view.error ? 'text-danger' : view.listening ? 'text-ok' : 'text-text-3'}`}
                >
                  {view.error
                    ? view.error
                    : view.listening
                      ? `Listening on port ${view.port} · ${view.clients} connected`
                      : 'Starting…'}
                </span>
              </Line>
              {view.listening && (
                <Line label="Address">
                  <code className="font-mono text-[13px] select-all">
                    {`ws://${view.lan ? '<this computer>' : '127.0.0.1'}:${view.port}`}
                  </code>
                </Line>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

function Line({
  label,
  sub,
  children,
}: {
  label: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-9 grid-cols-1 items-center gap-2 border-t border-line py-1 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)] sm:gap-4">
      <span className="text-[13px]">
        {label}
        {sub && <span className="block text-[11.5px] text-text-3">{sub}</span>}
      </span>
      <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
        {children}
      </div>
    </div>
  )
}
