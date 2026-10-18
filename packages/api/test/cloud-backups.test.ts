import { afterEach, describe, expect, it } from 'vitest'
import {
  backupSize,
  cloudBackupUsage,
  cloudBackupsApi,
  looksLikeRecoveryKey,
  newestFromOtherPc,
  passphraseProblem,
  type CloudBackup,
} from '../src/cloud-backups'
import {
  DemoEngine,
  DEMO_TOKEN,
  DEMO_RECOVERY_KEY,
  DEMO_OTHER_PC_PASSPHRASE,
  type DemoCloudMode,
} from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

const b = (over: Partial<CloudBackup> = {}): CloudBackup => ({
  id: 'bk_1',
  bytes: 1_000_000,
  sha256: '0'.repeat(64),
  created_at: 1,
  app_version: '0.1.0',
  from_install: 'i',
  this_install: true,
  reason: 'automatic',
  ...over,
})

describe('cloud backup helpers', () => {
  it('finds the newest backup another PC made', () => {
    expect(newestFromOtherPc([b()])).toBeNull()
    const list = [
      b({ id: 'a', this_install: false, created_at: 5 }),
      b({ id: 'c', this_install: false, created_at: 9 }),
      b({ id: 'd', created_at: 20 }),
    ]
    expect(newestFromOtherPc(list)?.id).toBe('c')
  })

  it('adds up the space used against 250 MB', () => {
    const u = cloudBackupUsage([b({ bytes: 100_000_000 }), b({ bytes: 25_000_000 })])
    expect(u.used).toBe(125_000_000)
    expect(u.share).toBe(0.5)
    expect(backupSize(19_300_000)).toBe('19.3 MB')
    expect(backupSize(900)).toBe('900 B')
    expect(backupSize(250_000_000)).toBe('250 MB')
  })

  it('checks passphrases and recovery keys', () => {
    expect(passphraseProblem('short')).toContain('12')
    expect(passphraseProblem('river stone lantern')).toBeNull()
    expect(looksLikeRecoveryKey(`# comment\n${DEMO_RECOVERY_KEY}\n`)).toBe(true)
    expect(looksLikeRecoveryKey('hello')).toBe(false)
  })
})

describe('cloud backups in the demo', () => {
  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const setup = (pro: boolean, cloudBackups: DemoCloudMode = 'demo') => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { salesOpen: true, active: pro, features: true },
      cloudBackups,
    })
    const c = new FerroClient({
      base: 'http://127.0.0.1:47820',
      token: DEMO_TOKEN,
      fetch: engine.fetch,
    })
    return cloudBackupsApi(c)
  }
  const fails = async (p: Promise<unknown>) => {
    const e = await p.then(
      () => null,
      (x: unknown) => x,
    )
    expect(e).toBeInstanceOf(ApiError)
    return e as ApiError
  }

  it('needs Pro (402, like the relay)', async () => {
    const api = setup(false)
    const e = await fails(api.list())
    expect([e.status, e.code]).toEqual([402, 'pro_required'])
    expect((await fails(api.backupNow())).status).toBe(402)
  })

  it('asks for the recovery key before the first upload', async () => {
    const api = setup(true, 'empty')
    const v = await api.list()
    expect(v.backups).toEqual([])
    expect(v.key).toEqual({ exists: false, saved: false, passphrase: false })
    expect((await fails(api.backupNow())).code).toBe('key_not_saved')
    expect((await fails(api.keySaved())).code).toBe('no_key')
    expect(await api.key()).toContain('AGE-SECRET-KEY-1')
    expect((await api.keySaved()).key.saved).toBe(true)
    const after = await api.backupNow()
    expect(after.backups).toHaveLength(1)
    expect(after.backups[0]).toMatchObject({ reason: 'manual', this_install: true })
  })

  it('keeps 7 and lets the oldest automatic one go', async () => {
    const api = setup(true)
    let v = await api.list()
    expect(v.backups).toHaveLength(3)
    const oldestAuto = [...v.backups].reverse().find((x) => x.reason === 'automatic')!
    for (let i = 0; i < 4; i++) v = await api.backupNow()
    expect(v.backups).toHaveLength(7)
    v = await api.backupNow()
    expect(v.backups).toHaveLength(7)
    expect(v.backups.some((x) => x.id === oldestAuto.id)).toBe(false)
    expect(v.backups[0]!.created_at).toBeGreaterThanOrEqual(v.backups[1]!.created_at)
  })

  it('restores, deletes and sets a passphrase', async () => {
    const api = setup(true)
    const { backups } = await api.list()
    const report = await api.restore(backups[0]!.id)
    expect(report.backup).toBeTruthy()
    expect(report.media_files).toBeGreaterThan(0)
    expect((await fails(api.setPassphrase('short'))).status).toBe(400)
    expect((await api.setPassphrase('river stone lantern')).key.passphrase).toBe(true)
    expect((await api.clearPassphrase()).key.passphrase).toBe(false)
    expect((await api.setAuto(false)).auto).toBe(false)
    await api.remove(backups[0]!.id)
    expect((await api.list()).backups).toHaveLength(2)
    expect((await fails(api.remove(backups[0]!.id))).status).toBe(404)
  })

  it('on a new PC, another PC’s backup needs its key or passphrase', async () => {
    const api = setup(true, 'new-pc')
    const v = await api.list()
    const newest = newestFromOtherPc(v.backups)!
    expect(newest).toBeTruthy()
    expect((await fails(api.restore(newest.id))).code).toBe('key_needed')
    expect((await fails(api.restore(newest.id, { passphrase: 'not it at all' }))).code).toBe(
      'wrong_passphrase',
    )
    const wrong = DEMO_RECOVERY_KEY.slice(0, -4) + 'QQQQ'
    expect((await fails(api.restore(newest.id, { key: wrong }))).code).toBe('wrong_key')
    expect((await fails(api.restore(newest.id, { key: 'nope' }))).status).toBe(400)
    await api.restore(newest.id, { passphrase: DEMO_OTHER_PC_PASSPHRASE })
    expect((await api.list()).key).toMatchObject({ exists: true, saved: true, passphrase: true })
  })
})
