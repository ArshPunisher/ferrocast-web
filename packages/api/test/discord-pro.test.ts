import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CURRENCY_DIGITS_0,
  CURRENCY_DIGITS_3,
  moneyExponent,
  discordProApi,
  emptyRuleDraft,
  formatMinor,
  keepLabel,
  parseAmount,
  roleColor,
  ruleSummary,
  ruleWhat,
  validateRuleDraft,
  type DiscordRole,
  type DiscordRule,
  type DiscordRuleInput,
} from '../src/discord-pro'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { DEMO_ROLES } from '../src/demo/features/discord-pro'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

const ROLES: DiscordRole[] = [
  { id: 'r-mod', name: 'Mods', color: 0xe67e22, assignable: false },
  { id: 'r-vip', name: 'VIP', color: 0xf1c40f, assignable: true },
  { id: 'r-sub', name: 'Subscriber', color: 0, assignable: true },
]

const rule = (r: Partial<DiscordRule>): DiscordRule => ({
  id: 'dr_000000000001',
  kind: 'sub',
  platform: null,
  tier: null,
  min_minor: null,
  currency: null,
  role_id: 'r-vip',
  keep_days: 31,
  created_at: 0,
  ...r,
})

describe('Discord bot helpers', () => {
  it('says each rule in words', () => {
    expect(ruleSummary(rule({ kind: 'sub_tier', platform: 'twitch', tier: '2' }), ROLES)).toBe(
      'Twitch sub, tier 2+ → @VIP, 31 days',
    )
    expect(ruleWhat(rule({ kind: 'sub' }))).toBe('Sub on any platform')
    expect(ruleWhat(rule({ kind: 'sub', platform: 'kick' }))).toBe('Kick sub')
    expect(ruleWhat(rule({ kind: 'member', platform: 'youtube', tier: 'Gold' }))).toBe(
      'YouTube member (Gold)',
    )
    expect(ruleWhat(rule({ kind: 'tip_min', min_minor: 50_000, currency: 'INR' }))).toBe(
      'Tip of ₹500+',
    )
    expect(ruleSummary(rule({ role_id: 'gone', keep_days: 0 }), ROLES)).toBe(
      'Sub on any platform → @deleted role, Keeps it',
    )
    expect(keepLabel(1)).toBe('1 day')
  })

  it('reads and writes amounts in minor units', () => {
    expect(parseAmount('500', 'INR')).toBe(50_000)
    expect(parseAmount('12.5', 'USD')).toBe(1250)
    expect(parseAmount('1,000', 'INR')).toBe(100_000)
    expect(parseAmount('1.234', 'USD')).toBeNull()
    expect(parseAmount('0', 'INR')).toBeNull()
    expect(parseAmount('-3', 'INR')).toBeNull()
    expect(parseAmount('abc', 'INR')).toBeNull()
    expect(parseAmount('300', 'JPY')).toBe(300)
    expect(formatMinor(1250, 'USD')).toMatch(/12\.50/)
    expect(formatMinor(1, 'ZZZ')).toContain('ZZZ')
  })

  it('checks a draft the way the relay does', () => {
    const base = emptyRuleDraft(ROLES)
    expect(base.role_id).toBe('r-vip')
    const v = validateRuleDraft({ ...base, tier: '3', min_minor: 5 }, ROLES)
    expect(v).toEqual({ ok: true, rule: { ...base, tier: null, min_minor: null } })
    const bad = (d: Partial<DiscordRuleInput>) => {
      const r = validateRuleDraft({ ...base, ...d }, ROLES)
      return r.ok ? null : r.field
    }
    expect(bad({ kind: 'sub_tier', tier: null })).toBe('tier')
    expect(bad({ kind: 'sub_tier', tier: '2', platform: 'youtube' })).toBe('platform')
    expect(bad({ kind: 'sub', platform: 'youtube' })).toBe('platform')
    expect(bad({ kind: 'tip_min', currency: 'rupees', min_minor: 100 })).toBe('currency')
    expect(bad({ kind: 'tip_min', currency: 'INR', min_minor: 0 })).toBe('min_minor')
    expect(bad({ role_id: '' })).toBe('role_id')
    expect(bad({ role_id: 'r-mod' })).toBe('role_id')
    expect(bad({ keep_days: 400 })).toBe('keep_days')
    expect(bad({ keep_days: 1.5 })).toBe('keep_days')
    const m = validateRuleDraft({ ...base, kind: 'member', platform: null, tier: '  ' }, ROLES)
    expect(m.ok && m.rule).toMatchObject({ platform: 'youtube', tier: null })
    const t = validateRuleDraft(
      { ...base, kind: 'tip_min', currency: 'inr', min_minor: 100 },
      ROLES,
    )
    expect(t.ok && t.rule).toMatchObject({ currency: 'INR', min_minor: 100 })
    expect(roleColor(0)).toBeNull()
    expect(roleColor(0xf1c40f)).toBe('#f1c40f')
  })
})

describe('the Discord bot in the demo', () => {
  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const setup = (active = true) => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { salesOpen: true, active, features: true },
    })
    const c = new FerroClient({
      base: 'http://127.0.0.1:47820',
      token: DEMO_TOKEN,
      fetch: engine.fetch,
    })
    return { c, api: discordProApi(c) }
  }
  const fails = async (p: Promise<unknown>) => {
    const e = await p.then(
      () => null,
      (x: unknown) => x,
    )
    expect(e).toBeInstanceOf(ApiError)
    return e as ApiError
  }

  it('answers 402 without Pro', async () => {
    const { api } = setup(false)
    const e = await fails(api.get())
    expect([e.status, e.code]).toEqual([402, 'pro_required'])
  })

  it('connects, picks a channel, posts go-live and hands the free post over', async () => {
    const { api, c } = setup()
    const first = await api.get()
    expect(first).toMatchObject({ connected: false, guild: null, link_url: null, linked: 0 })
    expect((await fails(api.setChannel('x'))).code).toBe('not_connected')
    const inv = await api.connect()
    expect(inv.invite_url).toMatch(/^https:\/\/discord\.com\/oauth2\/authorize\?/)
    const v = await api.get()
    expect(v).toMatchObject({ connected: true, linked: 42 })
    expect(v.guild?.name).toBe('Asha’s Lounge')
    expect((await fails(api.connect())).code).toBe('already_connected')
    expect((await fails(api.setGoLive(true, null))).code).toBe('no_channel')
    expect((await fails(api.setChannel('nope'))).code).toBe('channel_not_found')
    await api.setChannel(v.channels[1]!.id)
    expect((await c.discord()).pro_go_live).toBe(false)
    const on = await api.setGoLive(true, '  Come say hi  ')
    expect(on.go_live).toEqual({ enabled: true, message: 'Come say hi' })
    expect((await c.discord()).pro_go_live).toBe(true)
    expect((await fails(api.setGoLive(true, 'x'.repeat(301)))).status).toBe(400)
    await api.disconnect()
    expect((await api.get()).connected).toBe(false)
    expect((await c.discord()).pro_go_live).toBe(false)
  })

  it('adds, edits and deletes rules within the limits', async () => {
    const { api } = setup()
    engine!.setDiscordPro({ connected: true })
    const start = await api.get()
    expect(start.rules).toHaveLength(1)
    const draft: DiscordRuleInput = {
      kind: 'tip_min',
      platform: null,
      tier: null,
      min_minor: 50_000,
      currency: 'INR',
      role_id: DEMO_ROLES[4]!.id,
      keep_days: 0,
    }
    const added = await api.addRule(draft)
    expect(added.rules).toHaveLength(2)
    const id = added.rules[1]!.id
    expect(id).toMatch(/^dr_[0-9a-f]{12}$/)
    const edited = await api.updateRule(id, { ...draft, min_minor: 100_000 })
    expect(edited.rules[1]).toMatchObject({ id, min_minor: 100_000 })
    const high = await fails(api.addRule({ ...draft, role_id: DEMO_ROLES[0]!.id }))
    expect([high.status, high.code]).toEqual([403, 'missing_permission'])
    expect(high.hint).toContain('Server Settings › Roles')
    expect((await fails(api.addRule({ ...draft, role_id: '999' }))).code).toBe('role_not_found')
    expect((await fails(api.addRule({ ...draft, currency: 'rupees' }))).code).toBe('invalid_rule')
    for (let i = 0; i < 8; i++) await api.addRule(draft)
    expect((await fails(api.addRule(draft))).code).toBe('too_many_rules')
    await api.deleteRule(id)
    expect((await api.get()).rules.some((r) => r.id === id)).toBe(false)
    expect((await fails(api.deleteRule(id))).code).toBe('rule_not_found')
  })

  it('warns when Discord can’t be reached', async () => {
    const { api } = setup()
    engine!.setDiscordPro({ connected: true, discordDown: true })
    const v = await api.get()
    expect(v.channels).toEqual([])
    expect(v.warning).toMatch(/couldn’t be reached/)
  })
})

describe('currency digits', () => {
  // The engine's table (ferrocast/crates/core/src/money.rs `exponent`), copied here.
  const ZERO = [
    'JPY',
    'KRW',
    'VND',
    'CLP',
    'ISK',
    'UGX',
    'XAF',
    'XOF',
    'PYG',
    'RWF',
    'KMF',
    'GNF',
    'VUV',
    'XPF',
    'DJF',
    'BIF',
  ]
  const THREE = ['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'IQD', 'LYD']

  it('mirrors the engine’s exponent table exactly', () => {
    expect([...CURRENCY_DIGITS_0]).toEqual(ZERO)
    expect([...CURRENCY_DIGITS_3]).toEqual(THREE)
    for (const c of ZERO) expect(moneyExponent(c)).toBe(0)
    for (const c of THREE) expect(moneyExponent(c)).toBe(3)
    // Not zero-digit in ISO 4217 (they were in the old list): HUF, TWD, IDR use 2.
    for (const c of ['INR', 'USD', 'HUF', 'TWD', 'IDR']) expect(moneyExponent(c)).toBe(2)
    expect(formatMinor(1_500, 'KWD')).toMatch(/1\.5/)
    expect(parseAmount('1.5', 'KWD')).toBe(1_500)
    expect(parseAmount('500', 'JPY')).toBe(500)
  })

  it('matches money.rs itself when the engine repo is next to this one', () => {
    const rs = fileURLToPath(
      new URL('../../../../ferrocast/crates/core/src/money.rs', import.meta.url),
    )
    if (!existsSync(rs)) return // the web repo checked out alone (CI): the copy above still guards it
    const src = readFileSync(rs, 'utf8')
    const body = /pub fn exponent[\s\S]*?\n}/.exec(src)?.[0] ?? ''
    const arm = (n: number) =>
      [
        ...(new RegExp(`((?:"[A-Z]{3}"\\s*\\|?\\s*)+)=>\\s*${n},`).exec(body)?.[1] ?? '').matchAll(
          /"([A-Z]{3})"/g,
        ),
      ].map((m) => m[1])
    expect(body).toContain('JPY')
    expect(arm(0)).toEqual(ZERO)
    expect(arm(3)).toEqual(THREE)
  })
})
