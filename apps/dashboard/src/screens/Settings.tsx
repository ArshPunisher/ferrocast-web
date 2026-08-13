import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import {
  PLATFORM_LABEL,
  describeError,
  type Backup,
  type ImportReport,
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
import { done, useAction, useClient, useResource } from '../lib/hooks'
import { href } from '../lib/router'
import { DiscordSettingsForm } from '../components/discord'
import { ObsAutoDetect } from '../components/obs-detect'
import { useLive } from '../lib/store'

const SECTIONS = [
  ['accounts', 'Accounts'],
  ['obs', 'OBS'],
  ['tts', 'Text-to-speech'],
  ['discord', 'Discord'],
  ['appearance', 'Appearance'],
  ['data', 'Your data'],
  ['updates', 'Updates'],
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
  const { run } = useAction()
  return (
    <Section
      id="accounts"
      title="Accounts"
      description="Sign-in tokens stay in your system keychain, never in files or exports."
    >
      <ul className="flex flex-col gap-2">
        {(['twitch', 'youtube', 'kick'] as const).map((p) => (
          <AccountRow
            key={p}
            platform={p}
            busy={busy === p}
            onConnect={() => void connect(p)}
            onDisconnect={() =>
              void run('dc', () => client.disconnect(p), {
                success: `${PLATFORM_LABEL[p]} disconnected.`,
              })
            }
          />
        ))}
      </ul>
      {dialog}
    </Section>
  )
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
  useEffect(() => {
    if (obs.data?.host) setHost(obs.data.host)
    if (obs.data?.port) setPort(obs.data.port)
  }, [obs.data])
  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await client.saveObs({ host: host.trim(), port, password })
      obs.set(r)
      setPassword('')
      toast({
        tone: 'ok',
        message: 'OBS connected.',
        hint: r.scene ? `Current scene: ${r.scene}.` : null,
      })
    } catch (e) {
      const d = describeError(e)
      const m = d.message
      const hint = d.hint
      setErr(hint ? `${m} ${hint}` : m)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section
      id="obs"
      title="OBS"
      description="Lets “Add to OBS” put overlays into your scene in one click."
    >
      <div className="mb-4 flex items-center gap-2 text-sm">
        <span className="text-text-3">Status</span>
        {conn && (
          <Badge tone={stateCopy(conn).tone === 'ok' ? 'ok' : 'warn'}>
            {stateCopy(conn).label}
          </Badge>
        )}
        {obs.data?.version && <span className="text-text-3">OBS {obs.data.version}</span>}
      </div>
      <ObsAutoDetect
        connected={conn?.state === 'connected'}
        onUsed={(o) => {
          obs.set(o)
          toast({
            tone: o.state === 'connected' ? 'ok' : 'warn',
            message: o.state === 'connected' ? 'OBS connected.' : 'Saved OBS’s settings.',
            hint:
              o.state === 'connected'
                ? o.scene
                  ? `Current scene: ${o.scene}.`
                  : null
                : 'Open OBS and Ferrocast will connect.',
          })
        }}
      />
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-[13px] text-text-3">
        <li>In OBS open Tools → WebSocket Server Settings and tick “Enable WebSocket server”.</li>
        <li>Click “Show Connect Info” and copy the password here.</li>
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
          hint="Stored in your system keychain."
          error={err}
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              value={password}
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
      description="Off by default. When on, nothing is read until it passes your rules, and you can make every message wait for your approval."
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
            description="Only messages attached to tips, Super Chats, Bits and subs, and only when the alert asks for it."
          />
          <div
            className={cx('flex flex-col gap-4', !t.enabled && 'pointer-events-none opacity-50')}
            aria-disabled={!t.enabled}
          >
            <Switch
              checked={t.hold_for_approval}
              onChange={(hold_for_approval) => save({ ...t, hold_for_approval })}
              label="Ask me first"
              description="Messages wait on Home until you press “Read it”. Deleted messages are dropped."
            />
            <Switch
              checked={t.read_names}
              onChange={(read_names) => save({ ...t, read_names })}
              label="Read the sender’s name"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Voice">
                {(p) => (
                  <Select
                    {...p}
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
                    ? `In ${currency ?? t.currency}, your main currency (Appearance).`
                    : 'In your main currency (Appearance).'
                }
              >
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    value={t.min_amount}
                    onChange={(e) =>
                      res.set({ ...t, min_amount: Math.max(0, Number(e.target.value) || 0) })
                    }
                    onBlur={() => save(t)}
                  />
                )}
              </Field>
              <Field label="Longest message" hint="Characters; the rest is cut.">
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={10}
                    max={500}
                    value={t.max_chars}
                    onChange={(e) => res.set({ ...t, max_chars: Number(e.target.value) || 10 })}
                    onBlur={() => save(t)}
                  />
                )}
              </Field>
            </div>
            <p className="flex items-center gap-2 text-[12.5px] text-text-3">
              Studio voices <ProBadge /> are optional. The free voices run on your computer.
            </p>
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
          <span className="text-[13px] font-medium text-text-2">Theme</span>
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
          description="Overlays fade instead of moving. Use it if OBS stutters, especially on Linux."
        />
        <Field
          label="Main currency"
          hint="The TTS minimum uses it. Tips in other currencies still show as sent, never converted."
        >
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

function Data() {
  const client = useClient()
  const backups = useResource((c) => c.backups())
  const { run, busy } = useAction()
  const file = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<ImportReport['source']>('streamelements')
  const [report, setReport] = useState<ImportReport | null>(null)
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
        success: 'Export saved. It has your overlays with their media, alerts, commands and goals.',
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
          <p className="text-[13px] text-text-3">
            One file with overlays and their media, alerts, commands, timers and goals, in an open
            format.
          </p>
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
          <p className="text-[13px] text-text-3">
            Import a StreamElements or Streamlabs export, or a Ferrocast file.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Select
              aria-label="Import from"
              value={source}
              onChange={(e) => setSource(e.target.value as ImportReport['source'])}
              className="w-auto"
            >
              <option value="streamelements">StreamElements</option>
              <option value="streamlabs">Streamlabs</option>
              <option value="ferropack">Ferrocast file</option>
            </Select>
            <input
              ref={file}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f)
                  void run('import', () => client.importPack(f, f.name, source)).then(
                    (r) => r && setReport(r),
                  )
              }}
            />
            <Button
              icon={<UploadSimple size={16} />}
              busy={busy === 'import'}
              onClick={() => file.current?.click()}
            >
              Choose file
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-6 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-text">Backups</h3>
        <p className="mt-0.5 text-[13px] text-text-3">
          Taken automatically every day and before every update.
        </p>
        {backups.error ? (
          <LoadError error={backups.error} onRetry={backups.reload} />
        ) : !backups.data ? (
          <Skeleton className="mt-3 h-20" />
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {backups.data.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 text-[13.5px] text-text-2">
                  {new Date(b.created_at).toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  <span className="ml-2 text-text-3">
                    {b.reason === 'before_update'
                      ? 'before an update'
                      : b.reason === 'before_migration'
                        ? 'before a data upgrade'
                        : b.reason}{' '}
                    · v{b.version}
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
              {report.imported.map((i) => (
                <li
                  key={i.kind}
                  className="flex justify-between rounded-control bg-surface-2 px-3 py-2 text-sm"
                >
                  <span className="text-text-2 capitalize">{i.kind}</span>
                  <span className="font-mono text-text">{i.count}</span>
                </li>
              ))}
            </ul>
            {report.skipped.length > 0 && (
              <div>
                <p className="text-[13px] font-semibold text-text-2">Not imported yet</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {report.skipped.map((s) => (
                    <li key={s.kind} className="text-[13px] text-text-3">
                      <span className="font-medium text-text-2 capitalize">{s.kind}:</span>{' '}
                      {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Dialog>
      <Dialog
        open={restore !== null}
        onClose={() => setRestore(null)}
        size="sm"
        title="Restore this backup?"
        description="Your current setup is saved as a backup first, so you can come back to it."
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
                void run('restore', () => done(client.restoreBackup(restore.id)), {
                  success: 'Backup restored.',
                }).then((ok) => ok && setRestore(null))
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
      description="Never forced and never while you’re live. You can always go back to the previous version."
    >
      <div className="flex flex-col gap-4">
        {u ? (
          <div className="flex flex-col gap-2 rounded-[12px] border border-line bg-surface-2 p-3.5 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-sm text-text-2">
              You have <span className="font-mono text-text">v{u.current}</span>
              {u.latest && u.latest !== u.current ? (
                <>
                  . <span className="font-mono text-text">v{u.latest}</span> is ready.
                </>
              ) : (
                ', the latest.'
              )}
              {u.blocked_while_live && (
                <span className="mt-1 block text-[13px] text-warn">
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
          <span className="text-[13px] font-medium text-text-2">Channel</span>
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
  const [link, setLink] = useState<string | null>(null)
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
        <Switch
          checked={settings.lan_access}
          onChange={(v) => save({ ...settings, lan_access: v })}
          label="Allow other devices on my network"
          description="Lets a mod’s phone or a second PC on your Wi-Fi open this dashboard with a pairing link. Off means only this computer can connect. Takes effect the next time Ferrocast starts."
        />
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-sm font-semibold text-text">Open in another browser</p>
          <p className="text-[13px] text-text-3">Makes a one-time link that works for 2 minutes.</p>
          {link ? (
            <div className="flex gap-2">
              <code className="flex h-10 min-w-0 flex-1 items-center truncate rounded-control border border-line bg-inset px-3 font-mono text-[12.5px] text-text-2">
                {link}
              </code>
              <Button
                onClick={() =>
                  void copyText(link).then(
                    (ok) => ok && toast({ tone: 'ok', message: 'Link copied. It works once.' }),
                  )
                }
              >
                Copy
              </Button>
            </div>
          ) : (
            <Button
              className="self-start"
              busy={busy === 'pair'}
              onClick={() =>
                void run('pair', () => client.pairCode()).then((r) => r && setLink(r.url))
              }
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
            description="Tell your server when you go live. The webhook stays in your system keychain and is never exported."
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
              <Updates settings={res.data} save={save} />
              <Advanced settings={res.data} save={save} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
