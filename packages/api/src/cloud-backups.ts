// Pro cloud backups (API.md §9.3). The engine packs the same .ferropack as Export, encrypts
// it on this PC with age and uploads the ciphertext; the relay keeps opaque files. These are
// the types, the dashboard's calls and the small pure helpers the panel and demo share.

import type { FerroClient } from './client'
import type { PackImportReport } from './types'

/** One backup on the relay, newest first in the list. */
export interface CloudBackup {
  id: string
  /** Encrypted size. */
  bytes: number
  sha256: string
  created_at: number
  app_version: string
  /** The relay install that made it. */
  from_install: string
  /** Made by this PC. */
  this_install: boolean
  reason: 'automatic' | 'manual'
}

export interface CloudBackupKey {
  /** A recovery key exists on this PC. */
  exists: boolean
  /** The streamer confirmed they saved it (needed before the first upload). */
  saved: boolean
  /** New backups can also be opened with a passphrase. */
  passphrase: boolean
}

export interface CloudBackupProgress {
  phase: 'packing' | 'encrypting' | 'uploading' | 'downloading' | 'decrypting' | 'restoring'
  done: number
  total: number
}

/** `GET /api/v1/pro/backups`. */
export interface CloudBackupsView {
  key: CloudBackupKey
  /** Automatic upload after the daily local backup, when something changed. */
  auto: boolean
  busy: CloudBackupProgress | null
  last: { at: number; ok: boolean; what: 'upload' | 'restore'; message: string | null } | null
  last_upload_at: number | null
  /** An upload that will carry on (after a restart). */
  uploading: { parts_done: number; parts: number } | null
  limits: { bytes: number; backups: number; uploads_per_day: number }
  /** Missing from the answers to key, passphrase and settings changes (no relay call). */
  backups: CloudBackup[]
}

/** The relay's limits per subscription. */
export const CLOUD_BACKUP_LIMITS = { bytes: 250_000_000, backups: 7, uploads_per_day: 6 } as const
export const CLOUD_BACKUP_MIN_PASSPHRASE = 12
export const RECOVERY_KEY_FILE = 'ferrocast-recovery-key.txt'

/** Cloud backups' routes on a dashboard client. */
export function cloudBackupsApi(c: FerroClient) {
  return {
    list: () => c.request<CloudBackupsView>('GET', '/api/v1/pro/backups'),
    /** Back up now: waits for the upload, then the new view. */
    backupNow: () => c.request<CloudBackupsView>('POST', '/api/v1/pro/backups', {}),
    /** The recovery key file's text (made on first use). */
    key: async (): Promise<string> => (await c.downloadFile('/api/v1/pro/backups/key')).text(),
    keySaved: () => c.request<CloudBackupsView>('POST', '/api/v1/pro/backups/key/saved', {}),
    setPassphrase: (passphrase: string) =>
      c.request<CloudBackupsView>('PUT', '/api/v1/pro/backups/passphrase', { passphrase }),
    clearPassphrase: () => c.request<CloudBackupsView>('DELETE', '/api/v1/pro/backups/passphrase'),
    setAuto: (auto: boolean) =>
      c.request<CloudBackupsView>('PUT', '/api/v1/pro/backups/settings', { auto }),
    restore: (id: string, unlock: { key?: string; passphrase?: string } = {}) =>
      c.request<PackImportReport>(
        'POST',
        `/api/v1/pro/backups/${encodeURIComponent(id)}/restore`,
        unlock,
      ),
    remove: (id: string) =>
      c.request<void>('DELETE', `/api/v1/pro/backups/${encodeURIComponent(id)}`),
  }
}

/** The newest backup another PC made (for "Use your newest backup" on a new install). */
export function newestFromOtherPc(list: CloudBackup[]): CloudBackup | null {
  return list.filter((b) => !b.this_install).sort((a, b) => b.created_at - a.created_at)[0] ?? null
}

/** Bytes used of the subscription's space. */
export function cloudBackupUsage(list: CloudBackup[]): { used: number; share: number } {
  const used = list.reduce((n, b) => n + b.bytes, 0)
  return { used, share: Math.min(1, used / CLOUD_BACKUP_LIMITS.bytes) }
}

/** What's wrong with a passphrase, or null. */
export function passphraseProblem(p: string): string | null {
  if ([...p].length < CLOUD_BACKUP_MIN_PASSPHRASE)
    return `Use at least ${CLOUD_BACKUP_MIN_PASSPHRASE} characters. A few words work well.`
  return null
}

/** Whether pasted text holds a recovery key (the AGE-SECRET-KEY-1 line). */
export function looksLikeRecoveryKey(text: string): boolean {
  return text.split(/\r?\n/).some((l) => /^AGE-SECRET-KEY-1[0-9A-Z]{50,}$/i.test(l.trim()))
}

/** "12.4 MB" (decimal, like the relay's limits). */
export function backupSize(n: number): string {
  if (n < 1_000) return `${n} B`
  if (n < 1_000_000) return `${Math.round(n / 1_000)} KB`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} MB`
}
