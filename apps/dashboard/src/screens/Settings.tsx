import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowSquareIn, DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import {
  PLATFORM_LABEL,
  describeError,
  type Backup,
  type ChatPlatform,
  type ObsState,
  type PairLink,
  type PackImportReport,
  type Settings as SettingsData,
  type TtsSettings,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  ProBadge,
  Segmented,
  Select,
  Skeleton,
  Switch,
  copyText,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError, PageHeader, Panel } from '../components/Panel'
import { AccountRow, useConnect } from '../components/accounts'
import { stateCopy } from '../components/StatusStrip'
import { THEME_EVENT } from '../components/Shell'
import { done, useAction, useClient, useResource } from '../lib/hooks'
import { href } from '../lib/router'
import { DiscordSettingsForm } from '../components/discord'
import { ObsAutoDetect } from '../components/obs-detect'
import { ProSettings } from '../components/pro'
import { CloudBackups } from '../components/cloud-backups'
import { useLive } from '../lib/store'

const SECTIONS = [
  ['accounts', 'Accounts'],
  ['obs', 'OBS'],
  ['tts', 'Text-to-speech'],
  ['discord', 'Discord'],
  ['appearance', 'Appearance'],
  ['data', 'Your data'],
  ['updates', 'Updates'],
  ['pro', 'Pro'],
  ['advanced', 'Advanced'],
] as const

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <div id={`settings-${id}`} className="scroll-mt-20">
      <Panel title={title} description={description} id={`s-${id}`}>
        {children}
      </Panel>
    </div>
  )
}

function Accounts() {
  const client = useClient()
  const { connect, busy, dialog } = useConnect()
  const { run, busy: acting } = useAction()
  const [leaving, setLeaving] = useState<ChatPlatform | null>(null)
  const name = leaving ? PLATFORM_LABEL[leaving] : ''
  return (
    <Section
      id="accounts"
      title="Accounts"
      description="Sign-ins stay on this computer, never in exports or logs."
    >
      <ul className="flex flex-col gap-2">
        {(['twitch', 'youtube', 'kick'] as const).map((p) => (
          <AccountRow
            key={p}
            platform={p}
            busy={busy === p}
            onConnect={() => void connect(p)}
            onDisconnect={() => setLeaving(p)}
          />
        ))}
      </ul>
      {dialog}
      <Dialog
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        size="sm"
        title={`Disconnect ${name}?`}
        description={`${name} chat and alerts stop. Your overlays and settings stay.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={acting === 'dc'}
              onClick={() => {
                const p = leaving
                if (!p) return
                void run('dc', () => done(client.disconnect(p)), {
                  success: `${PLATFORM_LABEL[p]} disconnected.`,
                }).then((ok) => ok && setLeaving(null))
              }}
            >
              Disconnect {name}
            </Button>
          </>
        }
      />
    </Section>
  )
}

/** One toast about OBS at a time, saying what really happened. */
function obsToast(o: ObsState): void {
  if (o.state === 'connected')
    toast({
      key: 'obs',
      tone: 'ok',
      message: 'OBS connected.',
      hint: o.scene ? `Current scene: ${o.scene}.` : null,
    })
  else
    toast({
      key: 'obs',
      tone: 'warn',
      message: 'Saved, but OBS isn’t connected yet.',
      hint: o.detail ?? 'Open OBS and Ferrocast will connect by itself.',
    })
}

function Obs() {
  const client = useClient()
  const obs = useResource((c) => c.obs())
  const conn = useLive((s) => s.connectors?.obs)
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState(4455)
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [detectKey, setDetectKey] = useState(0)
  useEffect(() => {
    if (obs.data?.host) setHost(obs.data.host)
    if (obs.data?.port) setPort(obs.data.port)
  }, [obs.data])
  // The engine connects by itself: when the live state changes, refresh the version and
  // scene shown here.
  const live = conn?.state
  const reload = obs.reload
  const seen = useRef(live)
  useEffect(() => {
    if (seen.current !== undefined && live !== seen.current) reload()
    seen.current = live
  }, [live, reload])
  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      // A blank field keeps the saved password.
      const r = await client.saveObs({
        host: host.trim(),
        port,
        ...(password ? { password } : {}),
      })
      obs.set(r)
      setPassword('')
      setDetectKey((k) => k + 1)
      obsToast(r)
    } catch (e) {
      const d = describeError(e)
      const m = d.message
      const hint = d.hint
      setErr(hint ? `${m} ${hint}` : m)
    } finally {
      setBusy(false)
    }
  }
  const auto = obs.data?.auto === true
  const saved = obs.data?.has_password === true
  return (
    <Section id="obs" title="OBS" description="Lets “Add to OBS” drop overlays into your scene.">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-text-2">Status</span>
        {conn && (
          <Badge tone={stateCopy(conn).tone === 'ok' ? 'ok' : 'warn'}>
            {stateCopy(conn).label}
          </Badge>
        )}
        {conn?.state === 'connected' && obs.data?.version && (
          <span className="text-text-3">OBS {obs.data.version}</span>
        )}
        {auto && <span className="text-text-3">Using OBS’s own settings</span>}
      </div>
      {conn && conn.state !== 'connected' && conn.detail && (
        <p className="mb-4 text-[13.5px] text-text-2">{conn.detail}</p>
      )}
      <ObsAutoDetect
        key={detectKey}
        connected={conn?.state === 'connected'}
        onUsed={(o) => {
          obs.set(o)
          obsToast(o)
        }}
      />
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-[13.5px] text-text-2">
        <li>In OBS: Tools → WebSocket Server Settings → tick “Enable WebSocket server”.</li>
        <li>OBS on another PC? Copy its “Show Connect Info” address and password here.</li>
      </ol>
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Address">
          {(p) => (
            <Input
              {...p}
              value={host}
              onChange={(e) => setHost(e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Port">
          {(p) => (
            <Input
              {...p}
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || 0)}
            />
          )}
        </Field>
        <Field
          label="Password"
          className="sm:col-span-2"
          hint={
            auto && saved
              ? 'Read from OBS. Type one only to use a different password.'
              : 'Stays on this computer, never shown or exported.'
          }
          error={err}
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              value={password}
              placeholder={
                saved ? (auto ? 'From OBS. Type to replace' : 'Saved. Type to replace') : ''
              }
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" busy={busy}>
            Connect OBS
          </Button>
        </div>
      </form>
    </Section>
  )
}

/** `currency`: the main currency from Settings, so the hint follows a change at once. */
function Tts({ currency }: { currency?: string | undefined }) {
  const client = useClient()
  const res = useResource((c) => c.tts())
  const voices = useResource((c) => c.ttsVoices())
  const { run } = useAction()
  const t = res.data
  const save = (next: TtsSettings) => {
    res.set(next)
    void run('tts', () => client.saveTts(next))
  }
  return (
    <Section
      id="tts"
      title="Text-to-speech"
      description="Off by default. Only messages that pass your rules are read."
    >
      {res.error ? (
        <LoadError error={res.error} onRetry={res.reload} />
      ) : !t ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="flex flex-col gap-4">
          <Switch
            checked={t.enabled}
            onChange={(enabled) => save({ ...t, enabled })}
            label="Read messages aloud"
            description="Messages on tips, Super Chats, Bits and subs, when the alert asks."
          />
          <div className="flex flex-col gap-4">
            {!t.enabled && (
              <p className="text-[13.5px] font-medium text-text-2">
                Turn on “Read messages aloud” to change these.
              </p>
            )}
            <Switch
              checked={t.hold_for_approval}
              disabled={!t.enabled}
              onChange={(hold_for_approval) => save({ ...t, hold_for_approval })}
              label="Ask me first"
              description="Messages wait on Home until you press “Read it”."
            />
            <Switch
              checked={t.read_names}
              disabled={!t.enabled}
              onChange={(read_names) => save({ ...t, read_names })}
              label="Read the sender’s name"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Voice">
                {(p) => (
                  <Select
                    {...p}
                    disabled={!t.enabled}
                    value={t.voice}
                    onChange={(e) => save({ ...t, voice: e.target.value })}
                  >
                    {(voices.data ?? []).map((v) => (
                      <option key={v.id} value={v.id} disabled={v.pro}>
                        {v.name}, {v.language}
                        {v.pro ? ' (Pro)' : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                label="Minimum amount"
                hint={
                  (currency ?? t.currency)
                    ? `In ${currency ?? t.currency} (set in Appearance).`
                    : 'In your main currency (Appearance).'
                }
              >
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    disabled={!t.enabled}
                    value={t.min_amount}
                    onChange={(e) =>
                      res.set({ ...t, min_amount: Math.max(0, Number(e.target.value) || 0) })
                    }
                    onBlur={() => save(t)}
                  />
                )}
              </Field>
              <Field label="Longest message" hint="10 to 500 characters.">
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={10}
                    max={500}
                    disabled={!t.enabled}
                    value={t.max_chars}
                    onChange={(e) => res.set({ ...t, max_chars: Number(e.target.value) || 10 })}
                    onBlur={() => save(t)}
                  />
                )}
              </Field>
            </div>
            <div className="flex items-start gap-2 text-[13.5px] text-text-2">
              <span className="shrink-0">
                <ProBadge />
              </span>
              <span>Studio voices are optional. Free voices run on this computer.</span>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}

/** Currencies streamers on Twitch, YouTube and Kick tip in most; INR first. */
const CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'BRL',
  'CAD',
  'AUD',
  'NZD',
  'JPY',
  'KRW',
  'MXN',
  'IDR',
  'PHP',
  'TRY',
  'PLN',
  'SEK',
  'NOK',
  'DKK',
  'CHF',
  'SGD',
  'AED',
  'ZAR',
  'PKR',
  'BDT',
]

function Appearance({
  settings,
  save,
}: {
  settings: SettingsData
  save: (s: SettingsData) => void
}) {
  const apply = (theme: SettingsData['theme']) => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    try {
      if (theme === 'system') localStorage.removeItem('fc-theme')
      else localStorage.setItem('fc-theme', theme)
    } catch {
      // ignore
    }
  }
  return (
    <Section id="appearance" title="Appearance">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-semibold text-text">Theme</span>
          <Segmented
            label="Theme"
            value={settings.theme}
            onChange={(theme) => {
              apply(theme)
              save({ ...settings, theme })
            }}
            options={[
              { value: 'system', label: 'Match system' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </div>
        <Switch
          checked={settings.low_motion_overlays}
          onChange={(low_motion_overlays) => save({ ...settings, low_motion_overlays })}
          label="Light overlays"
          description="Overlays fade instead of move. Helps if OBS stutters."
        />
        <Field label="Main currency" hint="Tips in other currencies show as sent, never converted.">
          {(p) => (
            <Select
              {...p}
              className="sm:max-w-[16rem]"
              value={settings.currency}
              onChange={(e) => save({ ...settings, currency: e.target.value })}
            >
              {(CURRENCIES.includes(settings.currency)
                ? CURRENCIES
                : [settings.currency, ...CURRENCIES]
              ).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Section>
  )
}

/** What a `.ferropack` holds (the engine's export tables), said the same way everywhere. */
const EXPORT_CONTENTS =
  'overlays with their media, alerts, commands, timers, goals, points and viewers'

const BACKUP_REASON: Record<Backup['reason'], string> = {
  daily: 'Daily',
  update: 'Before an update',
  migration: 'Before a data upgrade',
  import: 'Before an import',
  restore: 'Before a restore',
  manual: 'Taken by you',
  other: 'Backup',
}

/** "2.4 MB". */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function Data() {
  const client = useClient()
  const backups = useResource((c) => c.backups())
  const { run, busy } = useAction()
  const file = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState<PackImportReport | null>(null)
  const [restore, setRestore] = useState<Backup | null>(null)
  const exportAll = () =>
    void run(
      'export',
      async () => {
        const blob = await client.exportPack()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ferrocast-${new Date().toISOString().slice(0, 10)}.ferropack`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        return blob
      },
      {
        success: `Export saved. It has your ${EXPORT_CONTENTS}.`,
      },
    )
  return (
    <Section
      id="data"
      title="Your data"
      description="Everything is stored on this computer. Take it with you any time."
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text">Export everything</h3>
          <p className="text-[13.5px] text-text-2">One file with your {EXPORT_CONTENTS}.</p>
          <Button
            className="mt-1 self-start"
            icon={<DownloadSimple size={16} />}
            busy={busy === 'export'}
            onClick={exportAll}
          >
            Export
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text">Bring your setup</h3>
          <p className="text-[13.5px] text-text-2">
            Commands, timers, points and tips. You review it first.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <a
              href={href({ name: 'import' })}
              className="fc-press inline-flex h-10 items-center justify-center gap-2 rounded-control bg-surface-3 px-4 text-sm font-semibold whitespace-nowrap text-text border border-line-strong hover:border-text-3 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            >
              <ArrowSquareIn size={16} aria-hidden="true" />
              From StreamElements or Streamlabs
            </a>
            <input
              ref={file}
              type="file"
              accept=".ferropack,application/zip"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f)
                  void run('import', () => client.importPack(f, f.name)).then((r) => {
                    if (!r) return
                    setReport(r)
                    backups.reload()
                  })
              }}
            />
            <Button
              icon={<UploadSimple size={16} />}
              busy={busy === 'import'}
              onClick={() => file.current?.click()}
            >
              Ferrocast file
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-6 border-t border-line pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text">Backups</h3>
            <p
              className="mt-0.5 text-[13.5px] text-text-2"
              title="Keeps the last 7 daily backups and the last 10 others."
            >
              Daily, and before every update or import.
            </p>
          </div>
          <Button
            size="sm"
            busy={busy === 'backup'}
            onClick={() =>
              void run('backup', () => client.backupNow(), { success: 'Backup taken.' }).then(
                (list) => list && backups.set(list),
              )
            }
          >
            Back up now
          </Button>
        </div>
        {backups.error ? (
          <LoadError error={backups.error} onRetry={backups.reload} />
        ) : !backups.data ? (
          <Skeleton className="mt-3 h-20" />
        ) : backups.data.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-text-2">
            No backups yet. The first one comes soon after start.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {backups.data.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-surface-2"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="text-[13.5px] text-text-2">
                    {new Date(b.created_at).toLocaleString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="text-[13.5px] text-text-3">
                    {BACKUP_REASON[b.reason] ?? BACKUP_REASON.other}
                    {b.version ? ` · v${b.version}` : ''} · {formatBytes(b.bytes)}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setRestore(b)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Dialog
        open={report !== null}
        onClose={() => setReport(null)}
        title="Import finished"
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setReport(null)}>
            Done
          </Button>
        }
      >
        {report && (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1">
              {Object.entries(report.imported)
                .filter(([, count]) => count > 0)
                .map(([table, count]) => (
                  <li
                    key={table}
                    className="flex justify-between rounded-control bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span className="text-text-2 capitalize">{table.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-text">{count}</span>
                  </li>
                ))}
              <li className="flex justify-between rounded-control bg-surface-2 px-3 py-2 text-sm">
                <span className="text-text-2">Media files</span>
                <span className="font-mono text-text">{report.media_files}</span>
              </li>
            </ul>
            <p className="text-[13.5px] text-text-2">
              To undo, restore the “Before an import” backup.
            </p>
          </div>
        )}
      </Dialog>
      <Dialog
        open={restore !== null}
        onClose={() => setRestore(null)}
        size="sm"
        title="Restore this backup?"
        description="It applies at the next start. Your current setup is backed up first."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestore(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy === 'restore'}
              onClick={() =>
                restore &&
                void run(
                  'restore',
                  // An older engine answers 204 with no body: that's a success too.
                  async () =>
                    (await client.restoreBackup(restore.id)) ?? {
                      restart_needed: true,
                      message: '',
                    },
                  { success: (r) => r.message || 'Restart Ferrocast to finish restoring.' },
                ).then((r) => r && setRestore(null))
              }
            >
              Restore
            </Button>
          </>
        }
      />
    </Section>
  )
}

function Updates({ settings, save }: { settings: SettingsData; save: (s: SettingsData) => void }) {
  const info = useResource((c) => c.updates())
  const u = info.data
  const client = useClient()
  const { run, busy } = useAction()
  return (
    <Section
      id="updates"
      title="Updates"
      description="Never forced, never while you’re live. You can always roll back."
    >
      <div className="flex flex-col gap-4">
        {u ? (
          <div className="flex flex-col gap-2 rounded-[12px] border border-line bg-surface-2 p-3.5 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-sm text-text-2">
              {u.latest && u.latest !== u.current ? (
                <>
                  Version <span className="font-mono text-text">{u.latest}</span> is ready (you have{' '}
                  <span className="font-mono text-text">{u.current}</span>).
                </>
              ) : (
                <>
                  Version <span className="font-mono text-text">{u.current}</span> is the latest.
                </>
              )}
              {u.blocked_while_live && (
                <span className="mt-1 block text-[13.5px] font-medium text-warn">
                  You’re live, so it will wait until your stream ends.
                </span>
              )}
            </p>
            {u.latest && u.latest !== u.current && (
              <Button
                size="sm"
                variant="primary"
                disabled={u.blocked_while_live || busy === 'update'}
                title={u.blocked_while_live ? 'Available after your stream' : undefined}
                onClick={() =>
                  void run('update', () => client.installUpdate(), {
                    success: (r) =>
                      `Installing v${r.installing}. Ferrocast restarts by itself in a moment.`,
                  })
                }
              >
                {u.blocked_while_live ? 'After stream' : 'Update'}
              </Button>
            )}
          </div>
        ) : (
          <Skeleton className="h-16" />
        )}
        <Switch
          checked={settings.never_update_while_live}
          onChange={(v) => save({ ...settings, never_update_while_live: v })}
          label="Never update while I’m live"
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13.5px] font-semibold text-text">Channel</span>
          <Segmented
            label="Update channel"
            value={settings.update_channel}
            onChange={(update_channel) => save({ ...settings, update_channel })}
            options={[
              { value: 'stable', label: 'Stable' },
              { value: 'beta', label: 'Beta' },
            ]}
          />
        </div>
      </div>
    </Section>
  )
}

function Advanced({ settings, save }: { settings: SettingsData; save: (s: SettingsData) => void }) {
  const client = useClient()
  const { run, busy } = useAction()
  const [link, setLink] = useState<PairLink | null>(null)
  // What the switch was when this screen opened: the server applies it at the next start.
  const [startedWith] = useState(settings.lan_access)
  const lanPending = settings.lan_access !== startedWith
  const lanNote = link?.lan
    ? link.lan.active
      ? 'Open it on a device on the same Wi-Fi. It works once.'
      : link.lan.restart_needed
        ? 'Works on this computer only until you restart Ferrocast.'
        : 'Works on this computer only. For a phone, allow other devices and restart.'
    : null
  return (
    <Section id="advanced" title="Advanced">
      <div className="flex flex-col gap-4">
        <Switch
          checked={settings.launch_at_login}
          onChange={(v) => save({ ...settings, launch_at_login: v })}
          label="Start Ferrocast when I log in"
        />
        <Switch
          checked={settings.close_to_tray}
          onChange={(v) => save({ ...settings, close_to_tray: v })}
          label="Keep running in the tray when the window closes"
        />
        <div className="flex flex-col gap-2">
          <Switch
            checked={settings.lan_access}
            onChange={(v) => {
              save({ ...settings, lan_access: v })
              setLink(null)
              toast({
                key: 'lan',
                tone: 'info',
                message: v
                  ? 'Other devices can connect after you restart Ferrocast.'
                  : 'Only this computer can connect after you restart Ferrocast.',
                hint: v ? 'Then make a link below and open it on the other device.' : null,
              })
            }}
            label="Allow other devices on my network"
            description="A mod’s phone or second PC on your Wi-Fi can open this with a link. Applies after restart."
          />
          {lanPending && (
            <p role="status" className="text-[13.5px] font-medium text-warn">
              Restart Ferrocast to{' '}
              {settings.lan_access ? 'let other devices in' : 'close it to other devices'}.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-sm font-semibold text-text">Open in another browser</p>
          <p className="text-[13.5px] text-text-2">A one-time link, good for 2 minutes.</p>
          {link ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <code className="flex h-10 min-w-0 flex-1 items-center truncate rounded-control border border-line bg-inset px-3 font-mono text-[13.5px] text-text-2">
                  {link.url}
                </code>
                <Button
                  onClick={() =>
                    void copyText(link.url).then(
                      (ok) => ok && toast({ tone: 'ok', message: 'Link copied. It works once.' }),
                    )
                  }
                >
                  Copy
                </Button>
              </div>
              {lanNote && (
                <p
                  className={cx(
                    'text-[13.5px]',
                    link.lan?.active ? 'text-text-2' : 'font-medium text-warn',
                  )}
                >
                  {lanNote}
                </p>
              )}
            </div>
          ) : (
            <Button
              className="self-start"
              busy={busy === 'pair'}
              onClick={() => void run('pair', () => client.pairCode()).then((r) => r && setLink(r))}
            >
              Make a link
            </Button>
          )}
        </div>
      </div>
    </Section>
  )
}

export function Settings({ section }: { section?: string | undefined }) {
  const client = useClient()
  const res = useResource((c) => c.settings())
  const { run } = useAction()
  useEffect(() => {
    if (section && res.data)
      document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start' })
  }, [section, res.data])
  const save = (s: SettingsData) => {
    res.set(s)
    void run('settings', () => client.saveSettings(s))
  }
  // The sidebar theme toggle saves the theme itself; reload so Appearance isn't stale.
  const reload = res.reload
  useEffect(() => {
    window.addEventListener(THEME_EVENT, reload)
    return () => window.removeEventListener(THEME_EVENT, reload)
  }, [reload])
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0"
        >
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={href({ name: 'settings', section: id })}
              aria-current={section === id ? 'location' : undefined}
              className={cx(
                'shrink-0 rounded-control px-3 py-2 text-[13.5px] font-medium whitespace-nowrap',
                section === id
                  ? 'bg-surface-3 text-text'
                  : 'text-text-3 hover:bg-surface-2 hover:text-text',
              )}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-5">
          <Accounts />
          <Obs />
          <Tts currency={res.data?.currency} />
          <Section
            id="discord"
            title="Discord"
            description="Tell your server when you go live. The webhook stays on this computer."
          >
            <DiscordSettingsForm />
          </Section>
          {res.error ? (
            <LoadError error={res.error} onRetry={res.reload} />
          ) : !res.data ? (
            <Skeleton className="h-48" />
          ) : (
            <>
              <Appearance settings={res.data} save={save} />
              <Data />
              <CloudBackups />
              <Updates settings={res.data} save={save} />
              <Section
                id="pro"
                title="Ferrocast Pro"
                description="Optional hosted extras. Everything free stays free."
              >
                <ProSettings />
              </Section>
              <Advanced settings={res.data} save={save} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
