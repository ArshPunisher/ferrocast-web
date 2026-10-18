// Pro cloud backups in the demo, like the engine and relay (`crates/engine/src/cloud_backup.rs`,
// `crates/relay/src/backups`): 402 without Pro, the recovery key saved before the first
// upload, the 7-backup / 250 MB limits with the oldest automatic one pruned, restore with
// this PC's key, a pasted key or a passphrase, and the same error codes.
// `mode` starts as this PC with a few backups (default), nothing yet, or a fresh install
// whose only backups came from another PC (the "Use your newest backup" flow).

import {
  CLOUD_BACKUP_LIMITS,
  looksLikeRecoveryKey,
  passphraseProblem,
  type CloudBackup,
  type CloudBackupsView,
} from '../../cloud-backups'
import type { ProView } from '../../pro'
import type { PackImportReport } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type Routed } from './host'

export type DemoCloudMode = 'demo' | 'empty' | 'new-pc'

/** The demo's recovery key (not a real key: it opens nothing outside the demo). */
export const DEMO_RECOVERY_KEY =
  'AGE-SECRET-KEY-1QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7LQPZRY9X8GF2TVDW0S3JN54KHC'
/** The passphrase the "other PC" in `new-pc` mode used. */
export const DEMO_OTHER_PC_PASSPHRASE = 'river stone lantern'

const DAY = 86_400_000
const HERE = 'demo-install-here'
const OTHER = 'demo-install-other'

function hex(n: number, r: () => number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += Math.floor(r() * 16).toString(16)
  return s
}

export class DemoCloudBackups {
  private backups: CloudBackup[] = []
  private key = { exists: false, saved: false, passphrase: null as string | null }
  private auto = true
  private last: CloudBackupsView['last'] = null
  private lastUploadAt: number | null = null
  private n = 0

  constructor(
    private readonly pro: () => ProView,
    private readonly takeBackup: (label: string) => string,
    mode: DemoCloudMode = 'demo',
    private readonly random: () => number = Math.random,
  ) {
    this.setMode(mode)
  }

  /** Tests and `?cloud=` in the dashboard. */
  setMode(mode: DemoCloudMode): void {
    const now = Date.now()
    this.backups = []
    this.last = null
    this.lastUploadAt = null
    this.key = { exists: false, saved: false, passphrase: null }
    if (mode === 'demo') {
      this.key = { exists: true, saved: true, passphrase: null }
      this.add('automatic', now - 3 * DAY + 4 * 3_600_000, 18_400_000, HERE)
      this.add('manual', now - 2 * DAY + 2 * 3_600_000, 18_900_000, HERE)
      this.add('automatic', now - DAY + 3 * 3_600_000, 19_300_000, HERE)
      this.lastUploadAt = now - DAY + 3 * 3_600_000
      this.last = { at: this.lastUploadAt, ok: true, what: 'upload', message: null }
    } else if (mode === 'new-pc') {
      this.add('automatic', now - 5 * DAY, 21_200_000, OTHER)
      this.add('automatic', now - DAY - 7 * 3_600_000, 21_700_000, OTHER)
    }
  }

  private add(
    reason: CloudBackup['reason'],
    at: number,
    bytes: number,
    install: string,
  ): CloudBackup {
    const b: CloudBackup = {
      id: `bk_${hex(24, this.random)}`,
      bytes,
      sha256: hex(64, this.random),
      created_at: at,
      app_version: '0.1.0-beta.9',
      from_install: install,
      this_install: install === HERE,
      reason,
    }
    this.backups.push(b)
    return b
  }

  private gate(): void {
    const p = this.pro()
    if (!p.features.backups || !p.active)
      throw new HttpError(
        402,
        'pro_required',
        'This runs on Ferrocast’s servers and is part of Pro.',
        'See Settings › Pro. Everything free in Ferrocast stays free.',
      )
  }

  private view(): CloudBackupsView {
    return clone({
      key: {
        exists: this.key.exists,
        saved: this.key.saved,
        passphrase: this.key.passphrase !== null,
      },
      auto: this.auto,
      busy: null,
      last: this.last,
      last_upload_at: this.lastUploadAt,
      uploading: null,
      limits: { ...CLOUD_BACKUP_LIMITS },
      backups: [...this.backups].sort((a, b) => b.created_at - a.created_at),
    })
  }

  /** Like the engine: key, passphrase and settings changes don't ask the relay for the list. */
  private local(): Omit<CloudBackupsView, 'backups'> {
    const { backups: _, ...rest } = this.view()
    return rest
  }

  private backupNow(): CloudBackupsView {
    if (!this.key.exists || !this.key.saved)
      throw new HttpError(
        409,
        'key_not_saved',
        'Save your recovery key first.',
        'Without it nobody can open your cloud backups, so Ferrocast asks before the first one.',
      )
    const now = Date.now()
    const today = this.backups.filter(
      (b) => b.this_install && now - b.created_at < DAY && b.reason === 'manual',
    )
    if (today.length >= CLOUD_BACKUP_LIMITS.uploads_per_day)
      throw new HttpError(
        429,
        'backup_upload_quota',
        `That's ${CLOUD_BACKUP_LIMITS.uploads_per_day} cloud backups today.`,
        'It starts again tomorrow (UTC).',
        3600,
      )
    const bytes = 19_300_000 + Math.floor(this.random() * 400_000)
    // Room: the oldest automatic ones go first; only hand-made ones left means it can't fit.
    const kept = [...this.backups].sort((a, b) => a.created_at - b.created_at)
    let total = kept.reduce((s, b) => s + b.bytes, 0) + bytes
    let count = kept.length + 1
    const gone: string[] = []
    for (const b of kept.filter((x) => x.reason === 'automatic')) {
      if (total <= CLOUD_BACKUP_LIMITS.bytes && count <= CLOUD_BACKUP_LIMITS.backups) break
      total -= b.bytes
      count -= 1
      gone.push(b.id)
    }
    if (total > CLOUD_BACKUP_LIMITS.bytes || count > CLOUD_BACKUP_LIMITS.backups)
      throw new HttpError(
        413,
        'backup_quota',
        'Cloud backups can use 250 MB and 7 backups in all, and this one doesn’t fit.',
        'Delete an older backup you made yourself in Settings › Your data, then try again.',
      )
    this.backups = this.backups.filter((b) => !gone.includes(b.id))
    this.add('manual', Math.max(now, (this.backups.at(-1)?.created_at ?? 0) + 1), bytes, HERE)
    this.lastUploadAt = now
    this.last = { at: now, ok: true, what: 'upload', message: null }
    return this.view()
  }

  private restore(id: string, body: unknown): PackImportReport {
    const b = this.backups.find((x) => x.id === id)
    if (!b)
      throw new HttpError(
        404,
        'not_found',
        'There’s no cloud backup with that id.',
        'Reload the list.',
      )
    const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const key = typeof o.key === 'string' && o.key.trim() ? o.key : null
    const pass = typeof o.passphrase === 'string' && o.passphrase ? o.passphrase : null
    const fail = (status: number, code: string, message: string, hint: string): never => {
      this.last = { at: Date.now(), ok: false, what: 'restore', message }
      throw new HttpError(status, code, message, hint)
    }
    if (key !== null && !looksLikeRecoveryKey(key))
      throw new HttpError(400, 'invalid', 'key: paste the line that starts with AGE-SECRET-KEY-1.')
    const mine = b.this_install && this.key.exists
    const keyOk = key !== null && key.trim().toUpperCase() === DEMO_RECOVERY_KEY
    if (!mine) {
      if (pass !== null) {
        if (b.this_install)
          fail(
            422,
            'no_passphrase',
            'This backup was saved without a passphrase.',
            'Use the recovery key file from the PC that made it.',
          )
        if (pass !== DEMO_OTHER_PC_PASSPHRASE)
          fail(
            422,
            'wrong_passphrase',
            'That passphrase doesn’t open this backup.',
            'Check it and try again.',
          )
      } else if (key !== null) {
        if (!keyOk)
          fail(
            422,
            'wrong_key',
            'That recovery key doesn’t open this backup.',
            'Use the key file from the PC that made it, or its passphrase.',
          )
      } else {
        fail(
          422,
          'key_needed',
          'This backup needs its recovery key or passphrase.',
          'Paste the key from ferrocast-recovery-key.txt, or type your passphrase.',
        )
      }
      // A PC without its own key in use takes the one that worked.
      if (!this.key.exists || !this.backups.some((x) => x.this_install)) {
        this.key = { exists: true, saved: true, passphrase: pass }
      }
    }
    const backup = this.takeBackup('before-import')
    this.last = { at: Date.now(), ok: true, what: 'restore', message: null }
    return {
      imported: {
        overlays: 4,
        alert_rules: 12,
        commands: 23,
        timers: 3,
        viewers: 412,
        loyalty_balances: 388,
      },
      media_files: 9,
      backup,
    }
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'pro' || seg[1] !== 'backups') return NOT_MINE
    const [, , a, b] = seg
    const is = (m: string, ...parts: (string | null)[]) =>
      method === m &&
      seg.length === parts.length + 2 &&
      parts.every((x, i) => x === null || x === seg[i + 2])
    this.gate()
    if (is('GET')) return this.view()
    if (is('POST')) return this.backupNow()
    if (is('GET', 'key')) {
      this.key.exists = true
      const text =
        '# Ferrocast recovery key for cloud backups (demo).\n' +
        '# Keep it somewhere safe and private: a password manager or a USB stick.\n' +
        '# If you lose it, nobody can open your backups, Ferrocast included.\n' +
        `${DEMO_RECOVERY_KEY}\n`
      return new Response(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="ferrocast-recovery-key.txt"',
        },
      })
    }
    if (is('POST', 'key', 'saved')) {
      if (!this.key.exists)
        throw new HttpError(
          409,
          'no_key',
          'There’s no recovery key yet.',
          'Download or copy the key first.',
        )
      this.key.saved = true
      return this.local()
    }
    if (is('PUT', 'passphrase')) {
      const o = requireObj(body)
      const p = typeof o.passphrase === 'string' ? o.passphrase : ''
      const problem = passphraseProblem(p)
      if (problem) throw new HttpError(400, 'invalid', `passphrase: ${problem}`)
      this.key.exists = true
      this.key.passphrase = p
      return this.local()
    }
    if (is('DELETE', 'passphrase')) {
      this.key.passphrase = null
      return this.local()
    }
    if (is('PUT', 'settings')) {
      const o = requireObj(body)
      if (typeof o.auto !== 'boolean')
        throw new HttpError(400, 'invalid', 'auto: must be true or false.')
      this.auto = o.auto
      return this.local()
    }
    if (a && is('POST', null, 'restore')) return this.restore(a, body)
    if (a && b === undefined && is('DELETE', null)) {
      const before = this.backups.length
      this.backups = this.backups.filter((x) => x.id !== a)
      if (this.backups.length === before)
        throw new HttpError(
          404,
          'not_found',
          'There’s no cloud backup with that id.',
          'Reload the list.',
        )
      return undefined
    }
    return NOT_MINE
  }
}
