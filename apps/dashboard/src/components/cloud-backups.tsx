// Settings › Your data › Cloud backups (Pro, API.md §9.3). The engine encrypts the export on
// this PC before upload; the recovery key never leaves it unless the streamer saves it.
// Before the first upload the streamer saves the key and says so, because a lost key means
// lost backups. On a fresh install the newest backup from another PC is offered first.

import { useState } from 'react'
import {
  ArrowCounterClockwise,
  CheckCircle,
  CloudArrowUp,
  Copy,
  DownloadSimple,
  Key,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  ApiError,
  CLOUD_BACKUP_LIMITS,
  RECOVERY_KEY_FILE,
  backupSize,
  cloudBackupUsage,
  cloudBackupsApi,
  describeError,
  newestFromOtherPc,
  passphraseProblem,
  type CloudBackup,
  type CloudBackupsView,
} from '@ferrocast/api'
import {
  Button,
  Dialog,
  Field,
  Input,
  Segmented,
  Skeleton,
  Switch,
  Textarea,
  copyText,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError } from './Panel'
import { ProPanel } from './pro/ProPanel'
import { saveBlob } from './studio/common'
import { useAction, useClient, useResource } from '../lib/hooks'

const UNLOCK_CODES = new Set([
  'key_needed',
  'wrong_key',
  'wrong_passphrase',
  'no_passphrase',
  'invalid',
])

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** The Cloud backups panel (hidden without the feature; one calm line without Pro). */
export function CloudBackups() {
  return (
    <div id="settings-cloud-backups" className="scroll-mt-20">
      <ProPanel feature="backups" id="cloud-backups" title="Cloud backups">
        <CloudBackupsBody />
      </ProPanel>
    </div>
  )
}

function CloudBackupsBody() {
  const client = useClient()
  const api = cloudBackupsApi(client)
  const res = useResource((c) => cloudBackupsApi(c).list())
  const { run, busy } = useAction()
  const [restore, setRestore] = useState<CloudBackup | null>(null)
  const [remove, setRemove] = useState<CloudBackup | null>(null)
  const [passOpen, setPassOpen] = useState(false)

  if (res.error) return <LoadError error={res.error} onRetry={res.reload} />
  const v = res.data
  if (!v) return <Skeleton className="h-40" />

  // Settings changes answer without `backups` (no relay call): keep the list we have.
  const set = (next: CloudBackupsView | undefined) =>
    next && res.set((prev) => ({ ...next, backups: next.backups ?? prev?.backups ?? [] }))
  const other = newestFromOtherPc(v.backups)
  const freshPc = !v.key.exists && other !== null
  const usage = cloudBackupUsage(v.backups)

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-[62ch] text-[16px] leading-relaxed text-text-2">
        Your setup, encrypted on this PC before it goes up. Only your recovery key can open it.
      </p>

      {freshPc && other && <NewPcOffer backup={other} onUse={() => setRestore(other)} />}

      {!v.key.saved ? (
        <SaveKey view={v} onSaved={set} freshPc={freshPc} />
      ) : (
        <KeyStatus view={v} onPassphrase={() => setPassOpen(true)} onChange={set} />
      )}

      {v.key.saved && (
        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <Switch
            label="Back up automatically"
            description="After the daily backup, when something changed."
            checked={v.auto}
            onChange={(on) => void run('auto', () => api.setAuto(on)).then(set)}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              variant="primary"
              icon={<CloudArrowUp size={18} weight="bold" />}
              busy={busy === 'now'}
              onClick={() =>
                void run('now', () => api.backupNow(), { success: 'Backed up to the cloud.' }).then(
                  set,
                )
              }
            >
              {busy === 'now' ? 'Backing up…' : 'Back up now'}
            </Button>
            <p className="text-[15px] text-text-3" data-testid="cloud-usage">
              {v.backups.length} of {CLOUD_BACKUP_LIMITS.backups} backups · {backupSize(usage.used)}{' '}
              of {backupSize(CLOUD_BACKUP_LIMITS.bytes)}
            </p>
          </div>
          {v.last && !v.last.ok && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-control bg-warn-soft px-3 py-2 text-[15px] text-warn"
            >
              <WarningCircle
                size={18}
                weight="bold"
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span>
                The last {v.last.what === 'restore' ? 'restore' : 'upload'} didn’t work
                {v.last.message ? `: ${v.last.message}` : '.'}
              </span>
            </p>
          )}
        </div>
      )}

      <BackupList view={v} onRestore={setRestore} onDelete={setRemove} />

      <RestoreDialog
        backup={restore}
        view={v}
        onClose={() => setRestore(null)}
        onDone={() => {
          setRestore(null)
          res.reload()
        }}
      />
      <Dialog
        open={remove !== null}
        onClose={() => setRemove(null)}
        size="sm"
        title="Delete this cloud backup?"
        description="It’s removed from Ferrocast’s servers for good. Your data on this PC stays."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={busy === 'delete'}
              onClick={() =>
                remove &&
                void run('delete', () => api.remove(remove.id).then(() => true), {
                  success: 'Cloud backup deleted.',
                }).then((ok) => {
                  if (!ok) return
                  setRemove(null)
                  res.set({ ...v, backups: v.backups.filter((b) => b.id !== remove.id) })
                })
              }
            >
              Delete
            </Button>
          </>
        }
      />
      <PassphraseDialog
        open={passOpen}
        hasOne={v.key.passphrase}
        onClose={() => setPassOpen(false)}
        onSaved={(next) => {
          setPassOpen(false)
          set(next)
        }}
      />
    </div>
  )
}

function NewPcOffer({ backup, onUse }: { backup: CloudBackup; onUse: () => void }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-panel border border-accent-line bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      data-testid="cloud-new-pc"
    >
      <div className="min-w-0">
        <h3 className="font-display text-[18px] font-extrabold tracking-tight text-text">
          Use your newest backup from another PC
        </h3>
        <p className="mt-1 text-[15.5px] text-text-2">
          {when(backup.created_at)} · {backupSize(backup.bytes)}. You’ll need its recovery key or
          passphrase.
        </p>
      </div>
      <Button
        variant="primary"
        icon={<ArrowCounterClockwise size={18} weight="bold" />}
        onClick={onUse}
      >
        Use this backup
      </Button>
    </div>
  )
}

function SaveKey({
  view,
  onSaved,
  freshPc,
}: {
  view: CloudBackupsView
  onSaved: (v: CloudBackupsView | undefined) => void
  freshPc: boolean
}) {
  const client = useClient()
  const api = cloudBackupsApi(client)
  const { run, busy } = useAction()
  const [got, setGot] = useState(view.key.exists)
  const [sure, setSure] = useState(false)
  const download = () =>
    void run('download', async () => {
      const text = await api.key()
      saveBlob(new Blob([text], { type: 'text/plain' }), RECOVERY_KEY_FILE)
      setGot(true)
      return true
    })
  const copy = () =>
    void run(
      'copy',
      async () => {
        const text = await api.key()
        if (!(await copyText(text)))
          throw new ApiError(0, 'copy_failed', 'Couldn’t copy here.', 'Use Download instead.')
        // Only a real copy counts as saved.
        setGot(true)
        return true
      },
      { success: 'Recovery key copied. Paste it somewhere safe.' },
    )
  return (
    <section
      aria-labelledby="cloud-key-title"
      className="flex flex-col gap-4 rounded-panel border border-line-strong bg-surface-2 p-4 sm:p-5"
      data-testid="cloud-save-key"
    >
      <div className="flex items-start gap-3">
        <Key
          size={24}
          weight="bold"
          className="mt-0.5 shrink-0 text-molten-text"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3
            id="cloud-key-title"
            className="font-display text-[18px] font-extrabold tracking-tight text-text"
          >
            {freshPc ? 'Or start fresh: save a new recovery key' : 'Save your recovery key'}
          </h3>
          <p className="mt-1 max-w-[60ch] text-[16px] leading-relaxed text-text-2">
            Your backups open only with this key.{' '}
            <strong className="font-semibold text-text">
              If you lose it, your backups are lost. Nobody can open them, Ferrocast included.
            </strong>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={<DownloadSimple size={18} />}
          busy={busy === 'download'}
          onClick={download}
        >
          Download key
        </Button>
        <Button variant="ghost" icon={<Copy size={18} />} busy={busy === 'copy'} onClick={copy}>
          Copy key
        </Button>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-[16px] text-text">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-[var(--fc-arc)]"
          checked={sure}
          disabled={!got}
          onChange={(e) => setSure(e.target.checked)}
        />
        <span className={cx(!got && 'text-text-3')}>I saved my recovery key somewhere safe.</span>
      </label>
      <Button
        variant="primary"
        className="self-start"
        disabled={!sure}
        busy={busy === 'saved'}
        onClick={() =>
          void run('saved', () => api.keySaved(), { success: 'Cloud backups are on.' }).then(
            onSaved,
          )
        }
      >
        Turn on cloud backups
      </Button>
    </section>
  )
}

function KeyStatus({
  view,
  onPassphrase,
  onChange,
}: {
  view: CloudBackupsView
  onPassphrase: () => void
  onChange: (v: CloudBackupsView | undefined) => void
}) {
  const client = useClient()
  const api = cloudBackupsApi(client)
  const { run, busy } = useAction()
  return (
    <div
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="cloud-key-status"
    >
      <div className="flex min-w-0 items-start gap-3">
        <CheckCircle
          size={22}
          weight="fill"
          className="mt-0.5 shrink-0 text-ok"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-[16.5px] font-semibold text-text">Recovery key saved</p>
          <p className="text-[15px] text-text-3">
            {view.key.passphrase
              ? 'A passphrase opens new backups too.'
              : 'No passphrase. Only the key file opens them.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<DownloadSimple size={16} />}
          busy={busy === 'download'}
          onClick={() =>
            void run('download', async () => {
              saveBlob(new Blob([await api.key()], { type: 'text/plain' }), RECOVERY_KEY_FILE)
              return true
            })
          }
        >
          Download key
        </Button>
        <Button size="sm" variant="secondary" onClick={onPassphrase}>
          {view.key.passphrase ? 'Change passphrase' : 'Add passphrase'}
        </Button>
        {view.key.passphrase && (
          <Button
            size="sm"
            variant="danger-ghost"
            busy={busy === 'clear'}
            onClick={() =>
              void run('clear', () => api.clearPassphrase(), {
                success: 'Passphrase removed for new backups.',
              }).then(onChange)
            }
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

function BackupList({
  view,
  onRestore,
  onDelete,
}: {
  view: CloudBackupsView
  onRestore: (b: CloudBackup) => void
  onDelete: (b: CloudBackup) => void
}) {
  if (view.backups.length === 0)
    return (
      <p
        className="rounded-panel border border-dashed border-line-strong px-4 py-6 text-center text-[16px] text-text-2"
        data-testid="cloud-empty"
      >
        No cloud backups yet. They’re encrypted on this PC before upload.
      </p>
    )
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-display text-[17px] font-extrabold tracking-tight text-text">
        In the cloud
      </h3>
      <ul className="flex flex-col gap-1" data-testid="cloud-list">
        {view.backups.map((b) => (
          <li
            key={b.id}
            className="flex items-center gap-3 rounded-control px-2 py-2.5 hover:bg-surface-2"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="font-mono text-[15.5px] text-text tabular-nums">
                {when(b.created_at)}
              </span>
              <span className="text-[15px] text-text-3">
                {b.this_install ? 'This PC' : 'Another PC'} ·{' '}
                {b.reason === 'manual' ? 'By you' : 'Automatic'} · {backupSize(b.bytes)}
              </span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => onRestore(b)}>
              Restore
            </Button>
            <Button
              size="sm"
              variant="danger-ghost"
              aria-label={`Delete the backup from ${when(b.created_at)}`}
              onClick={() => onDelete(b)}
              icon={<Trash size={16} />}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function RestoreDialog({
  backup,
  view,
  onClose,
  onDone,
}: {
  backup: CloudBackup | null
  view: CloudBackupsView
  onClose: () => void
  onDone: () => void
}) {
  const client = useClient()
  const api = cloudBackupsApi(client)
  const [how, setHow] = useState<'key' | 'passphrase'>('key')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Another PC's backup may need its key or passphrase; this PC's opens with its own key.
  const needsUnlock = backup !== null && (!backup.this_install || !view.key.exists)
  const close = () => {
    setSecret('')
    setError(null)
    onClose()
  }
  const go = async () => {
    if (!backup) return
    setBusy(true)
    setError(null)
    try {
      const unlock =
        !needsUnlock || !secret.trim()
          ? {}
          : how === 'key'
            ? { key: secret }
            : { passphrase: secret }
      await api.restore(backup.id, unlock)
      toast({
        tone: 'ok',
        message: 'Backup restored.',
        hint: 'Your previous setup is in Backups as “Before an import”.',
      })
      setSecret('')
      onDone()
    } catch (e) {
      if (e instanceof ApiError && UNLOCK_CODES.has(e.code) && needsUnlock) setError(e.message)
      else {
        const d = describeError(e)
        toast({ tone: 'error', message: d.message, hint: d.hint })
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={backup !== null}
      onClose={close}
      size="sm"
      title="Restore this backup?"
      description="Your current setup is backed up on this PC first, then this one replaces it."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void go()}>
            Restore
          </Button>
        </>
      }
    >
      {backup && (
        <div className="flex flex-col gap-4">
          <p className="text-[16px] text-text-2">
            {when(backup.created_at)} · {backup.this_install ? 'This PC' : 'Another PC'} ·{' '}
            {backupSize(backup.bytes)}
          </p>
          {needsUnlock && (
            <div className="flex flex-col gap-3">
              <Segmented
                label="Unlock with"
                value={how}
                onChange={(h) => {
                  setHow(h)
                  setSecret('')
                  setError(null)
                }}
                options={[
                  { value: 'key', label: 'Recovery key' },
                  { value: 'passphrase', label: 'Passphrase' },
                ]}
              />
              {how === 'key' ? (
                <Field
                  label="Recovery key"
                  hint={`Paste the line starting AGE-SECRET-KEY-1 from ${RECOVERY_KEY_FILE}.`}
                  error={error}
                >
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={3}
                      spellCheck={false}
                      autoComplete="off"
                      className="font-mono text-[14px]"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                    />
                  )}
                </Field>
              ) : (
                <Field
                  label="Passphrase"
                  hint="The one set on the PC that made this backup."
                  error={error}
                >
                  {(p) => (
                    <Input
                      {...p}
                      type="password"
                      autoComplete="off"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                    />
                  )}
                </Field>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

function PassphraseDialog({
  open,
  hasOne,
  onClose,
  onSaved,
}: {
  open: boolean
  hasOne: boolean
  onClose: () => void
  onSaved: (v: CloudBackupsView) => void
}) {
  const client = useClient()
  const api = cloudBackupsApi(client)
  const [value, setValue] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const problem = passphraseProblem(value)
  const close = () => {
    setValue('')
    setTried(false)
    onClose()
  }
  const save = async () => {
    setTried(true)
    if (problem) return
    setBusy(true)
    try {
      const v = await api.setPassphrase(value)
      toast({ tone: 'ok', message: 'Passphrase set for new backups.' })
      setValue('')
      setTried(false)
      onSaved(v)
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      title={hasOne ? 'Change your passphrase' : 'Add a passphrase'}
      description="New backups can then be opened on another PC with this passphrase alone. Older backups keep the one they had."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            Save passphrase
          </Button>
        </>
      }
    >
      <Field
        label="Passphrase"
        hint="At least 12 characters. A few unrelated words work well."
        error={tried ? problem : null}
      >
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="new-password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
        )}
      </Field>
    </Dialog>
  )
}
