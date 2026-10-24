import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowClockwise, ArrowSquareIn, DownloadSimple, UploadSimple } from '@phosphor-icons/react'
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
  InfoTip,
  Field,
  Input,
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
import { done, useAction, useClient, useNow, useResource } from '../lib/hooks'
import { DOWNLOAD_PAGE, checkedLine, refreshUpdate, summarize } from '../lib/update'
import { openUpdateDialog } from '../components/update'
import { href } from '../lib/router'
import { externalLink } from '../lib/external'
import { DiscordSettingsForm } from '../components/discord'
import { DiscordPro } from '../components/discord-pro'
import { ObsAutoDetect } from '../components/obs-detect'
import { ProSettings } from '../components/pro'
import { CloudBackups } from '../components/cloud-backups'
import { CloudSyncSettings } from '../components/cloud-sync'
import { TtsVoicePicker } from '../components/tts-voices'
import { RemoteDevices } from '../components/remote'
import { MusicSettings } from '../components/music-settings'
import { useLive } from '../lib/store'
import { OWNER_HIDDEN_SETTINGS } from '@ferrocast/api'

const SECTIONS = [
  ['accounts', 'Accounts'],
  ['obs', 'OBS'],
  ['music', 'Music'],
  ['cloud', 'Cloud mode'],
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
    <Section
      id="obs"
      title="OBS"
      description={
        <>
          Lets Ferrocast put overlays and themes into OBS. In OBS: Tools, WebSocket Server Settings,
          tick “Enable WebSocket server”. OBS on another PC? Copy its “Show Connect Info” address
          and password here.
        </>
      }
    >
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
            <TtsVoicePicker
              systemVoice={t.voice}
              voices={voices.data ?? []}
              disabled={!t.enabled}
              onSystemVoice={(voice) => save({ ...t, voice })}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold text-text">Export everything</h3>
            <InfoTip>One file with your {EXPORT_CONTENTS}.</InfoTip>
          </div>
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
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold text-text">Bring your setup</h3>
            <InfoTip>Commands, timers, points and tips. You review it first.</InfoTip>
          </div>
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
            <div className="flex items-center gap-1">
              <h3 className="text-sm font-semibold text-text">Backups</h3>
              <InfoTip>
                Daily, and before every update or import. Keeps the last 7 daily backups and the
                last 10 others.
              </InfoTip>
            </div>
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
  const u = useLive((s) => s.update)
  const loadError = useLive((s) => s.updateLoadError)
  const setUpdate = useLive((s) => s.setUpdate)
  const client = useClient()
  const { run, busy } = useAction()
  const now = useNow(30_000)
  const s = summarize(u)
  // A phone can't check or install on the PC (the same rule the relay checks).
  const mayCheck = client.may('POST', '/api/v1/updates/check')
  const newer = !!u?.latest && u.latest !== u.current
  const check = () =>
    void run('check', () => client.checkUpdates(), {
      success: (r) => {
        setUpdate(r)
        if (r.error || r.checking) return null
        return r.latest && r.latest !== r.current
          ? `Version ${r.latest} is out.`
          : 'You’re on the newest version.'
      },
    })
  return (
    <Section
      id="updates"
      title="Updates"
      description="Never forced, never while you’re live. You can always roll back."
    >
      <div className="flex flex-col gap-4">
        {u ? (
          <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface-2 p-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 text-sm text-text-2">
                <p data-testid="update-status" aria-live="polite">
                  {newer || s.phase !== 'idle' ? (
                    <>
                      Version <span className="font-mono text-text">{s.version}</span>{' '}
                      {s.phase === 'ready' ? 'is ready' : 'is out'} (you have{' '}
                      <span className="font-mono text-text">{u.current}</span>).
                    </>
                  ) : u.checked_at && !u.error ? (
                    <>
                      You’re on the newest version,{' '}
                      <span className="font-mono text-text">{u.current}</span>.
                    </>
                  ) : (
                    <>
                      You have <span className="font-mono text-text">{u.current}</span>.
                    </>
                  )}
                </p>
                <p
                  className="mt-0.5 text-[13px] text-text-3"
                  title={u.checked_at ? new Date(u.checked_at).toLocaleString() : undefined}
                >
                  {u.checking ? 'Checking now…' : checkedLine(u.checked_at, now)}
                </p>
                {s.blocked && (newer || s.phase === 'ready') && (
                  <p className="mt-1 text-[13.5px] font-medium text-warn">
                    You’re live, so it waits until your stream ends.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {(newer || s.phase !== 'idle') && (
                  <Button size="sm" variant="primary" onClick={openUpdateDialog}>
                    {s.phase === 'ready' && mayCheck ? 'Restart to finish' : 'See what’s new'}
                  </Button>
                )}
                {/* An engine before 1.1 has no check route (no `checking` field either). */}
                {mayCheck && u.can_install !== false && u.checking !== undefined && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ArrowClockwise size={15} />}
                    busy={busy === 'check' || !!u.checking}
                    onClick={check}
                  >
                    Check for updates
                  </Button>
                )}
              </div>
            </div>
            {u.error && (
              <div
                role="alert"
                className="rounded-[10px] border border-warn/30 bg-warn-soft p-3 text-sm"
              >
                <p className="font-semibold text-text">{u.error.message}</p>
                <p className="mt-0.5 text-text-2">{u.error.hint}</p>
              </div>
            )}
            {u.can_install === false && (
              <p className="text-[13.5px] text-text-2">
                This copy of Ferrocast doesn’t update itself. Get new versions from{' '}
                <a
                  {...externalLink(DOWNLOAD_PAGE)}
                  className="font-semibold text-accent-text hover:underline"
                >
                  the download page
                </a>
                .
              </p>
            )}
            {!mayCheck && (
              <p className="text-[13.5px] text-text-2">
                Updates are installed on the streaming PC.
              </p>
            )}
          </div>
        ) : loadError ? (
          <LoadError error={loadError} onRetry={() => void refreshUpdate(client)} />
        ) : (
          <Skeleton className="h-16" />
        )}
        <Switch
          checked={settings.never_update_while_live}
          onChange={(v) => {
            save({ ...settings, never_update_while_live: v })
            // Whether it's blocked follows the saved setting: read it again after the save.
            window.setTimeout(() => void refreshUpdate(client), 600)
          }}
          label="Never update while I’m live"
        />
        {u && (
          // The channel follows the installed build: no switch (a beta build also gets stable).
          <p className="text-[13.5px] text-text-2">
            {u.channel === 'beta' ? (
              <>
                <span className="font-semibold text-text">Beta version:</span> updates include betas
                and stable releases.
              </>
            ) : (
              <>
                <span className="font-semibold text-text">Stable version:</span> you get stable
                updates only.
              </>
            )}
          </p>
        )}
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
          <p className="text-[13.5px] text-text-3">One-time link, 2 minutes.</p>
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
  // On a phone through Ferrocast's servers, the sections that need the PC itself are hidden.
  const remote = useLive((s) => s.remote)
  const current = useLive((s) => s.update?.current)
  const show = (id: string) => !remote || !OWNER_HIDDEN_SETTINGS.includes(id)
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0"
        >
          {SECTIONS.filter(([id]) => show(id) && (id !== 'cloud' || !remote)).map(([id, label]) => (
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
          {current && (
            <a
              href={href({ name: 'settings', section: 'updates' })}
              data-testid="app-version"
              className="mt-3 hidden rounded-control px-3 py-1 text-[12.5px] text-text-3 hover:text-text lg:block"
            >
              Version <span className="font-mono tabular-nums">{current}</span>
            </a>
          )}
        </nav>
        <div className="flex min-w-0 flex-col gap-5">
          {show('accounts') && <Accounts />}
          {show('obs') && <Obs />}
          {show('music') && (
            <Section
              id="music"
              title="Music"
              description="Where the beat and the song come from, for music pieces and motion backgrounds on your screens."
            >
              <MusicSettings />
            </Section>
          )}
          {/* A phone never changes the PC's sync (it's under /pro). */}
          {!remote && <CloudSyncSettings />}
          <Tts currency={res.data?.currency} />
          {show('discord') && (
            <Section
              id="discord"
              title="Discord"
              description="Tell your server when you go live. The webhook stays on this computer."
            >
              <DiscordSettingsForm />
            </Section>
          )}
          {show('discord') && <DiscordPro />}
          {res.error ? (
            <LoadError error={res.error} onRetry={res.reload} />
          ) : !res.data ? (
            <Skeleton className="h-48" />
          ) : (
            <>
              <Appearance settings={res.data} save={save} />
              {show('data') && <Data />}
              {show('data') && <CloudBackups />}
              <Updates settings={res.data} save={save} />
              {show('remote') && <RemoteDevices />}
              {show('pro') && (
                <Section
                  id="pro"
                  title="Ferrocast Pro"
                  description="Optional hosted extras. Everything free stays free."
                >
                  <ProSettings />
                </Section>
              )}
              {show('advanced') && <Advanced settings={res.data} save={save} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
