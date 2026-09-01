// The TypeScript ports must behave exactly like ferrocast-core. These cases mirror the Rust
// unit tests in crates/core/src/{template,money,alert,queue}.rs.

import { describe, expect, it } from 'vitest'
import { Template, eventVars, checkTemplate, KNOWN_VARS, withPlurals } from '../src/template'
import { formatMoney, formatValue, tameText, describeEvent, relativeTime } from '../src/format'
import { defaultRules, matches, newVariation, render, select, validateRule } from '../src/alert'
import { AlertQueue, type QueueAction } from '../src/queue'
import { anySample, sample, TESTABLE, platformsFor } from '../src/samples'
import type { AlertRule, FerroEvent, RenderedAlert } from '../src/types'

const vars = (o: Record<string, string>) => o

describe('template', () => {
  it('renders variables and filters', () => {
    const t = Template.parse('{name|upper} gave {amount}! {message|default:"no message"}')
    expect(t.render(vars({ name: 'asha', amount: '₹500' }))).toBe('ASHA gave ₹500! no message')
    expect(Template.parse('{name|title}').render({ name: 'pixel panda' })).toBe('Pixel Panda')
  })
  it('reads counts right for one, with old and new templates (core::template::with_plurals)', () => {
    const one = { months: '1', months_text: '1 month', count: '1', count_text: '1 sub' }
    const t = Template.parse(
      withPlurals('{name} subscribed for {months} months! Gifted {count} subs'),
    )
    expect(t.render(one)).toBe(' subscribed for 1 month! Gifted 1 sub')
    expect(withPlurals('{months} mo')).toBe('{months} mo')
    const sub = anySample('subscription', 0)
    if (sub?.kind.type !== 'subscription') throw new Error('no sample')
    sub.kind.months = 1
    const rule = defaultRules().find((r) => r.id === 'sub')
    if (!rule?.variations[0]) throw new Error('no sub rule')
    expect(render('a', rule, rule.variations[0], sub).title).toMatch(/subscribed for 1 month!$/)
    const old = newVariation('old', '{name} subscribed for {months} months!')
    expect(render('a', rule, old, sub).title).toMatch(/subscribed for 1 month!$/)
    sub.kind.months = 12
    expect(render('a', rule, rule.variations[0], sub).title).toMatch(/subscribed for 12 months!$/)
  })
  it('handles literal braces', () => {
    expect(Template.parse('{{not a var}} {name}').render({ name: 'x' })).toBe('{not a var} x')
  })
  it('renders missing variables empty', () => {
    const t = Template.parse('hi {nobody}!')
    expect(t.render({})).toBe('hi !')
    expect(t.variables()).toEqual(['nobody'])
  })
  it('rejects broken templates with readable messages', () => {
    expect(() => Template.parse('hello {name')).toThrow("a '{' at character 6 is never closed")
    expect(() => Template.parse('{}')).toThrow(/valid variable name/)
    expect(() => Template.parse('{na me}')).toThrow(/valid variable name/)
    expect(() => Template.parse('{name|explode}')).toThrow(/known filter/)
    expect(() => Template.parse('{name|truncate:abc}')).toThrow(/known filter/)
    expect(() => Template.parse('a'.repeat(2001))).toThrow(/longer than 2000/)
    expect(checkTemplate('{name').ok).toBe(false)
    expect(checkTemplate('{name} {amount}')).toEqual({ ok: true, vars: ['name', 'amount'] })
  })
  it('never expands viewer text twice', () => {
    const evil = '<img src=x onerror=alert(1)>{message}'
    expect(Template.parse('{name}').render({ name: evil, message: 'boom' })).toBe(evil)
  })
  it('caps output', () => {
    const huge = 'x'.repeat(4000)
    expect(Array.from(Template.parse('{name}{name}').render({ name: huge })).length).toBe(4000)
  })
  it('truncates by characters, not bytes', () => {
    const t = Template.parse('{name|truncate:4}')
    expect(t.render({ name: 'नमस्ते दुनिया' })).toBe('नमस…')
    expect(t.render({ name: 'abc' })).toBe('abc')
    expect(Template.parse('{name|truncate:3}').render({ name: '🎮🎮🎮🎮' })).toBe('🎮🎮…')
  })
  it('does not read inherited keys like __proto__ or constructor', () => {
    expect(Template.parse('{constructor}{toString}').render({})).toBe('')
  })
  it('every sample has name and platform and only known vars', () => {
    for (const kind of TESTABLE) {
      const e = anySample(kind, 0)
      expect(e, kind).not.toBeNull()
      const v = eventVars(e as FerroEvent)
      expect(v.name, kind).toBeTruthy()
      expect(v.platform, kind).toBeTruthy()
      for (const k of Object.keys(v)) expect(KNOWN_VARS as readonly string[]).toContain(k)
    }
    expect(eventVars(anySample('tip') as FerroEvent).amount).toBe('₹500')
  })
})

describe('money', () => {
  it('matches Money::display', () => {
    expect(formatMoney({ minor: 50_000, currency: 'INR' })).toBe('₹500')
    expect(formatMoney({ minor: 499, currency: 'USD' })).toBe('$4.99')
    expect(formatMoney({ minor: 123_456_789, currency: 'USD' })).toBe('$1,234,567.89')
    expect(formatMoney({ minor: 1000, currency: 'JPY' })).toBe('¥1,000')
    expect(formatMoney({ minor: 1050, currency: 'SEK' })).toBe('10.50 SEK')
    expect(formatMoney({ minor: -250, currency: 'EUR' })).toBe('-€2.50')
    expect(formatMoney({ minor: 1234, currency: 'kwd' })).toBe('1.234 KWD')
  })
  it('survives hostile numbers', () => {
    expect(formatMoney({ minor: Number.NaN, currency: 'USD' })).toBe('$0')
    expect(formatMoney({ minor: 1e300, currency: 'USD' })).toMatch(/^\$[\d,]+/)
    expect(formatMoney({ minor: 1.5, currency: 'USD' })).toBe('$0.01')
  })
  it('labels platform value', () => {
    expect(formatValue({ unit: 'bits', amount: 1 })).toBe('1 bit')
    expect(formatValue({ unit: 'bits', amount: 1500 })).toBe('1,500 bits')
    expect(formatValue({ unit: 'kicks', amount: 100 })).toBe('100 KICKs')
    expect(formatValue({ unit: { other: 'hearts' }, amount: 3 })).toBe('3 hearts')
  })
})

describe('text taming', () => {
  it('strips bidi overrides and caps combining marks', () => {
    expect(tameText('abc‮def')).toBe('abcdef')
    const zalgo = 'Z' + '́'.repeat(40) + 'a'
    expect(Array.from(tameText(zalgo)).length).toBe(4)
    expect(tameText('नमस्ते')).toBe('नमस्ते')
    expect(tameText('مرحبا')).toBe('مرحبا')
  })
})

describe('alert rules', () => {
  const subRule = (): AlertRule => {
    const gold = {
      ...newVariation('gold', '{name} is a legend: {months} months!'),
      name: 'Gold',
      priority: 10,
      condition: { type: 'months_at_least' as const, months: 12 },
    }
    const silver = {
      ...newVariation('silver', '{name}: {months} months'),
      name: 'Silver',
      priority: 5,
      condition: { type: 'months_at_least' as const, months: 3 },
    }
    return {
      id: 'sub',
      name: 'Subs',
      enabled: true,
      kinds: ['subscription'],
      platforms: [],
      variations: [newVariation('default', '{name} subscribed'), silver, gold],
    }
  }
  const subWith = (m: number): FerroEvent => {
    const e = sample('subscription', 'twitch', 0) as FerroEvent
    e.origin = 'live'
    if (e.kind.type === 'subscription') e.kind.months = m
    return e
  }
  it('picks the highest-priority matching variation', () => {
    const rules = [subRule()]
    expect(select(rules, subWith(1))?.variation.id).toBe('default')
    expect(select(rules, subWith(6))?.variation.id).toBe('silver')
    expect(select(rules, subWith(24))?.variation.id).toBe('gold')
  })
  it('skips disabled rules, other platforms and backfill', () => {
    const rules = [subRule()]
    rules[0]!.platforms = ['kick']
    expect(select(rules, subWith(1))).toBeNull()
    rules[0]!.platforms = []
    rules[0]!.enabled = false
    expect(select(rules, subWith(1))).toBeNull()
    rules[0]!.enabled = true
    const e = subWith(1)
    e.origin = 'backfill'
    expect(select(rules, e)).toBeNull()
  })
  it('never crosses currencies', () => {
    const tip = anySample('tip') as FerroEvent
    expect(matches({ type: 'amount_at_least', value: 500, currency: 'INR' }, tip)).toBe(true)
    expect(matches({ type: 'amount_at_least', value: 5, currency: 'USD' }, tip)).toBe(false)
    expect(matches({ type: 'amount_below', value: 501, currency: null }, tip)).toBe(true)
    const bits = sample('platform_gift', 'twitch') as FerroEvent
    expect(matches({ type: 'amount_at_least', value: 1, currency: 'USD' }, bits)).toBe(false)
    expect(matches({ type: 'amount_at_least', value: 500, currency: null }, bits)).toBe(true)
  })
  it('an empty needle never matches', () => {
    const tip = anySample('tip') as FerroEvent
    expect(matches({ type: 'message_contains', text: '' }, tip)).toBe(false)
    expect(matches({ type: 'message_contains', text: 'KEEP' }, tip)).toBe(true)
  })
  it('validation catches editor mistakes', () => {
    expect(validateRule(subRule())).toBeNull()
    const noDefault = subRule()
    noDefault.variations = noDefault.variations.filter((v) => v.condition !== null)
    expect(validateRule(noDefault)).toMatch(/default look/)
    expect(validateRule({ ...subRule(), kinds: ['chat_message'] })).toMatch(/isn't an event type/)
    const badT = subRule()
    badT.variations[0]!.title = '{name'
    expect(validateRule(badT)).toMatch(/never closed/)
    const badD = subRule()
    badD.variations[0]!.duration_ms = 0
    expect(validateRule(badD)).toMatch(/1 to 60 seconds/)
    const badV = subRule()
    badV.variations[0]!.volume = 101
    expect(validateRule(badV)).toMatch(/volume/)
    expect(validateRule({ ...subRule(), kinds: [] })).toMatch(/at least one/)
  })
  it('default rules cover every sample and render fully', () => {
    const rules = defaultRules()
    for (const r of rules) expect(validateRule(r)).toBeNull()
    for (const kind of TESTABLE) {
      const e = anySample(kind) as FerroEvent
      const sel = select(rules, e)
      expect(sel, kind).not.toBeNull()
      const a = render('a1', sel!.rule, sel!.variation, e)
      expect(a.title).not.toContain('{')
      expect(a.test).toBe(true)
    }
  })
  it('clamps and reads TTS only with text', () => {
    const e = anySample('tip') as FerroEvent
    const v = { ...newVariation('v', '{name}'), duration_ms: 999_999, volume: 250, tts: true }
    const rule: AlertRule = {
      id: 'r',
      name: 'r',
      enabled: true,
      kinds: ['tip'],
      platforms: [],
      variations: [v],
    }
    const a = render('a', rule, v, e)
    expect(a.duration_ms).toBe(60_000)
    expect(a.volume).toBe(100)
    expect(a.tts_text).toBe('Keep it up!')
    expect(render('a', rule, v, anySample('follow') as FerroEvent).tts_text).toBeNull()
  })
  it('pending tips never alert', () => {
    const e = anySample('tip') as FerroEvent
    if (e.kind.type === 'tip') e.kind.status = 'pending'
    expect(select(defaultRules(), e)).toBeNull()
  })
  it('knows which platforms have which kinds', () => {
    expect(platformsFor('follow')).toEqual(['twitch', 'kick'])
    expect(platformsFor('paid_message')).toEqual(['youtube'])
    expect(sample('nonsense', 'twitch')).toBeNull()
    expect(sample('tip', 'kick')?.platform).toBe('tips')
  })
})

describe('event descriptions', () => {
  it('describes every sample', () => {
    for (const kind of TESTABLE)
      expect(describeEvent(anySample(kind) as FerroEvent).title.length).toBeGreaterThan(3)
  })
  it('formats relative time', () => {
    expect(relativeTime(1000, 2000)).toBe('now')
    expect(relativeTime(0, 30_000)).toBe('30s')
    expect(relativeTime(0, 5 * 60_000)).toBe('5m')
    expect(relativeTime(0, 3 * 3_600_000)).toBe('3h')
    expect(relativeTime(0, 3 * 86_400_000)).toBe('3d')
    expect(relativeTime(5000, 0)).toBe('now')
  })
})

describe('alert queue', () => {
  const alert = (id: string, ms: number): RenderedAlert => {
    const e = anySample('follow') as FerroEvent
    const sel = select(defaultRules(), e)!
    return { ...render(id, sel.rule, sel.variation, e), duration_ms: ms }
  }
  const shown = (a: QueueAction[]) =>
    a.flatMap((x) => (x.type === 'show' ? [x.alert.alert_id] : []))
  const q = () =>
    new AlertQueue({ ack_grace_ms: 1000, gap_ms: 100, stale_after_ms: 60_000, max_waiting: 10 })

  it('plays one at a time in order', () => {
    const queue = q()
    expect(shown(queue.enqueue(alert('a', 2000), 0, 0))).toEqual(['a'])
    expect(shown(queue.enqueue(alert('b', 2000), 0, 10))).toEqual([])
    expect(shown(queue.ack('a', 'finished', 2000))).toEqual([])
    expect(shown(queue.tick(2100))).toEqual(['b'])
  })
  it('priority jumps the line but never interrupts', () => {
    const queue = q()
    queue.enqueue(alert('playing', 1000), 0, 0)
    queue.enqueue(alert('low', 1000), 0, 1)
    queue.enqueue(alert('high', 1000), 5, 2)
    expect(queue.current?.alert.alert_id).toBe('playing')
    expect(queue.snapshot().waiting.map((w) => w.alert.alert_id)).toEqual(['high', 'low'])
  })
  it('times out a silent overlay', () => {
    const queue = q()
    queue.enqueue(alert('a', 2000), 0, 0)
    queue.enqueue(alert('b', 2000), 0, 0)
    expect(queue.tick(2999)).toEqual([])
    const acts = queue.tick(3000)
    expect(acts[0]).toEqual({ type: 'hide', alert_id: 'a' })
    expect(shown(queue.tick(3100))).toEqual(['b'])
  })
  it('restarts the clock on started', () => {
    const queue = q()
    queue.enqueue(alert('a', 2000), 0, 0)
    queue.ack('a', 'started', 2500)
    expect(queue.tick(3500)).toEqual([])
    expect(queue.tick(5500).length).toBeGreaterThan(0)
  })
  it('ignores forged or stale acks', () => {
    const queue = q()
    queue.enqueue(alert('a', 2000), 0, 0)
    queue.enqueue(alert('b', 2000), 0, 0)
    expect(queue.ack('b', 'finished', 10)).toEqual([])
    expect(queue.ack('zzz', 'failed', 10)).toEqual([])
    expect(queue.current?.alert.alert_id).toBe('a')
  })
  it('does not queue duplicates', () => {
    const queue = q()
    queue.enqueue(alert('a', 1000), 0, 0)
    queue.enqueue(alert('a', 1000), 0, 0)
    queue.enqueue(alert('b', 1000), 0, 0)
    queue.enqueue(alert('b', 1000), 0, 0)
    expect(queue.length).toBe(2)
  })
  it('folds stale alerts after an outage', () => {
    const queue = q()
    queue.pause()
    for (let i = 0; i < 5; i++) queue.enqueue(alert(`old${i}`, 1000), 0, 0)
    queue.enqueue(alert('fresh', 1000), 0, 100_000)
    const acts = queue.resume(100_000)
    expect(acts[0]).toMatchObject({ type: 'folded' })
    expect(acts[0]?.type === 'folded' && acts[0].alert_ids.length).toBe(5)
    expect(shown(acts)).toEqual(['fresh'])
  })
  it('caps a flood', () => {
    const queue = q()
    queue.pause()
    let folded = 0
    for (let i = 0; i < 50; i++)
      for (const a of queue.enqueue(alert(`x${i}`, 1000), 0, i))
        if (a.type === 'folded') folded += a.alert_ids.length
    expect(queue.snapshot().waiting.length).toBe(10)
    expect(folded).toBe(40)
  })
  it('pause, skip and remove', () => {
    const queue = q()
    queue.enqueue(alert('a', 5000), 0, 0)
    queue.enqueue(alert('b', 5000), 0, 0)
    queue.enqueue(alert('c', 5000), 0, 0)
    expect(queue.remove('c')).toBe(true)
    expect(queue.remove('c')).toBe(false)
    queue.pause()
    const acts = queue.skip(10)
    expect(acts[0]?.type).toBe('hide')
    expect(shown(acts)).toEqual([])
    expect(shown(queue.resume(200))).toEqual(['b'])
    expect(queue.nextWake()).toBe(200 + 5000 + 1000)
  })
})
