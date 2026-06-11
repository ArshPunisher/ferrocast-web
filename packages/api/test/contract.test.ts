/**
 * Contract check against a real engine: every read the dashboard makes must come back in
 * the shape the demo engine (and so the dashboard) uses, and every settings shape the
 * dashboard saves must be accepted. Skipped unless an engine is given:
 *
 *   FERROCAST_ENGINE=http://127.0.0.1:47820 FERROCAST_PAIR=<code> pnpm --filter @ferrocast/api test contract
 */
import { describe, expect, it } from 'vitest'
import { DEMO_TOKEN, DemoEngine } from '../src/demo'

const base = process.env.FERROCAST_ENGINE
const pair = process.env.FERROCAST_PAIR

type Shape = string | { [k: string]: Shape } | Shape[]

/** A value's shape: object keys, element shape, or a type name. Null fits anything. */
function shape(v: unknown): Shape {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return v.length ? [shape(v[0])] : []
  if (typeof v === 'object')
    return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, shape(x)]))
  return typeof v
}

/** Differences where `want` (demo) has something `got` (engine) lacks or types differently. */
function diff(want: Shape, got: Shape, path: string, out: string[]): void {
  if (want === 'null' || got === 'null') return
  if (Array.isArray(want)) {
    if (!Array.isArray(got)) return void out.push(`${path}: want array, got ${JSON.stringify(got)}`)
    const [w, g] = [want[0], got[0]]
    if (w !== undefined && g !== undefined) diff(w, g, `${path}[]`, out)
    return
  }
  if (typeof want === 'object') {
    if (typeof got !== 'object' || Array.isArray(got))
      return void out.push(`${path}: want object, got ${JSON.stringify(got)}`)
    for (const [k, w] of Object.entries(want)) {
      const g = got[k]
      if (g === undefined) out.push(`${path}.${k}: missing`)
      else diff(w, g, `${path}.${k}`, out)
    }
    return
  }
  if (want !== got) out.push(`${path}: want ${want}, got ${JSON.stringify(got)}`)
}

const READS = [
  '/status',
  '/accounts',
  '/overlays',
  '/themes',
  '/alert-rules',
  '/queue',
  '/events?limit=5',
  '/goals',
  '/chat?limit=5',
  '/mod/bans',
  '/mod/panic/config',
  '/mod/filters',
  '/commands',
  '/timers',
  '/tts',
  '/tts/voices',
  '/tts/pending',
  '/tips',
  '/media',
  '/obs',
  '/settings',
  '/backups',
  '/stats/session',
  '/updates',
  '/loyalty',
  '/loyalty/leaderboard',
]

/** Keys the types mark optional (`Partial<…>`): absent is fine. */
const OPTIONAL = [/^\/stats\/session\.viewers\./]

/** Settings the dashboard saves whole: the demo's value must be accepted as-is. */
const WRITES = ['/mod/panic/config', '/mod/filters', '/tts', '/settings', '/loyalty']

describe.skipIf(!base || !pair)('engine contract', () => {
  const demo = new DemoEngine({ latencyMs: 0 })
  let token = ''
  const real = async (path: string, init: RequestInit = {}) => {
    if (!token) {
      const r = await fetch(`${base}/api/v1/session/pair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: pair }),
      })
      token = ((await r.json()) as { token: string }).token
    }
    return fetch(`${base}/api/v1${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    })
  }
  const fake = async (path: string) =>
    (
      await demo.fetch(`/api/v1${path}`, { headers: { authorization: `Bearer ${DEMO_TOKEN}` } })
    ).json()

  it('reads come back in the dashboard shape', async () => {
    // Give the engine something in every list, so element shapes get compared too.
    const seed: [string, unknown][] = [
      ['/overlays', { name: 'Contract' }],
      [
        '/commands',
        {
          name: '!contract',
          aliases: [],
          response: 'hi {user}',
          roles: 'everyone',
          cooldown_s: 5,
          user_cooldown_s: 0,
          platforms: [],
          enabled: true,
        },
      ],
      [
        '/timers',
        {
          name: 'Contract',
          message: 'hello',
          every_min: 15,
          min_chat_lines: 5,
          platforms: [],
          enabled: true,
        },
      ],
      [
        '/goals',
        { title: 'Mic', kind: 'tips', target: 5000, currency: 'INR', starts_at: 0, ends_at: null },
      ],
      ['/test', { kind: 'follow' }],
      ['/test', { kind: 'tip' }],
    ]
    for (const [path, body] of seed) {
      const r = await real(path, { method: 'POST', body: JSON.stringify(body) })
      expect(r.ok, `seed ${path}: ${r.status} ${await r.clone().text()}`).toBe(true)
    }
    const problems: string[] = []
    for (const path of READS) {
      const r = await real(path)
      if (!r.ok) {
        problems.push(`${path}: HTTP ${r.status} ${await r.text()}`)
        continue
      }
      diff(shape(await fake(path)), shape(await r.json()), path, problems)
    }
    expect(problems.filter((p) => !OPTIONAL.some((re) => re.test(p)))).toEqual([])
  }, 60_000)

  it('saved settings are accepted', async () => {
    const problems: string[] = []
    for (const path of WRITES) {
      const r = await real(path, { method: 'PUT', body: JSON.stringify(await fake(path)) })
      if (!r.ok) problems.push(`PUT ${path}: HTTP ${r.status} ${await r.text()}`)
    }
    expect(problems).toEqual([])
  }, 60_000)
})
