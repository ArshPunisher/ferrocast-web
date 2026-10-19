import { describe, expect, it } from 'vitest'
import {
  REMOTE_OFFLINE_MESSAGE,
  auditLabel,
  cloudCanModerate,
  remoteOfflineMessage,
  auditSource,
  pcOfflineError,
  remoteAllowed,
  remoteHome,
  remoteMode,
  remoteOfflineAllowed,
  remoteOfflineGuard,
  remoteScreenAllowed,
} from '../src/remote'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { parseLiveFrame } from '../src/live'
import { cloudBotApi } from '../src/cloud-bot'
import { historyApi } from '../src/history'

// Offline remote mode (M10, API.md §9.5): what the relay answers itself while the PC is off.
describe('the PC is off: what still works', () => {
  it('chat and bans only with the cloud bot on; history and the switch always', () => {
    for (const [m, p] of [
      ['GET', '/chat'],
      ['POST', '/mod/delete'],
      ['POST', '/mod/timeout'],
      ['POST', '/mod/ban'],
    ] as const) {
      expect(remoteOfflineAllowed(m, p, true), `${m} ${p}`).toBe(true)
      expect(remoteOfflineAllowed(m, p, false), `${m} ${p}`).toBe(false)
    }
    for (const [m, p] of [
      ['GET', '/pro/history'],
      ['PUT', '/pro/bot/enabled'],
    ] as const) {
      expect(remoteOfflineAllowed(m, p, true)).toBe(true)
      expect(remoteOfflineAllowed(m, p, false)).toBe(true)
    }
    for (const [m, p] of [
      ['GET', '/status'],
      ['POST', '/mod/unban'],
      ['GET', '/mod/bans'],
      ['GET', '/mod/held'],
      ['POST', '/chat/send'],
      ['GET', '/settings'],
      ['GET', '/pro/bot'],
      ['GET', '/pro/history/export.csv'],
    ] as const)
      expect(remoteOfflineAllowed(m, p, true), `${m} ${p}`).toBe(false)
  })

  it('refuses the rest here with the relay’s own words', () => {
    const g = remoteOfflineGuard(true)
    expect(g('GET', '/chat')).toBeNull()
    const e = g('GET', '/status')
    expect(e).toBeInstanceOf(ApiError)
    expect([e?.status, e?.code, e?.message]).toEqual([503, 'pc_offline', REMOTE_OFFLINE_MESSAGE])
    expect(pcOfflineError(false).message).toBe('Your streaming PC is off.')
    expect(remoteOfflineGuard(false)('GET', '/chat')?.message).toBe('Your streaming PC is off.')
  })

  it('says what still works for the role and the moderation opt-in (the relay’s words)', () => {
    expect(remoteOfflineMessage('owner', true)).toBe(
      'Your PC is off. Chat, bans and history still work.',
    )
    expect(remoteOfflineMessage('owner', false)).toBe(
      'Your PC is off. Chat and history still work.',
    )
    expect(remoteOfflineMessage('mod', true)).toBe('Your PC is off. Chat and bans still work.')
    expect(remoteOfflineMessage('mod', false)).toBe('Your PC is off. Chat still works.')
    expect(remoteOfflineGuard(true, 'mod', false)('GET', '/status')?.message).toBe(
      'Your PC is off. Chat still works.',
    )
    expect(cloudCanModerate({ kick: true })).toBe(true)
    expect(cloudCanModerate({ twitch: false })).toBe(false)
    expect(cloudCanModerate(undefined)).toBe(false)
  })

  it('an owner’s phone may read history; a mod may not', () => {
    expect(remoteAllowed('owner', 'GET', '/pro/history')).toBe(true)
    expect(remoteAllowed('mod', 'GET', '/pro/history')).toBe(false)
    expect(remoteAllowed('owner', 'GET', '/pro/history/export.csv')).toBe(false)
  })

  it('limited screens, home and mode', () => {
    expect(remoteScreenAllowed('owner', 'history', true)).toBe(true)
    expect(remoteScreenAllowed('owner', 'settings', true)).toBe(false)
    expect(remoteScreenAllowed('owner', 'home', true)).toBe(false)
    expect(remoteScreenAllowed('mod', 'history', true)).toBe(false)
    expect(remoteScreenAllowed('mod', 'moderation', true)).toBe(true)
    expect(remoteHome('owner', true)).toBe('chat')
    expect(remoteHome('owner')).toBe('home')
    expect(remoteMode({ pcOnline: true, cloud: true })).toBe('full')
    expect(remoteMode({ pcOnline: false, cloud: true })).toBe('limited')
    expect(remoteMode({ pcOnline: false })).toBe('off')
  })

  it('audit lines say when the cloud answered', () => {
    expect(auditSource({ source: 'cloud' })).toBe('while the PC was off')
    expect(auditSource({ source: 'pc' })).toBeNull()
    expect(auditSource({})).toBeNull()
    expect(auditLabel({ action: 'PUT /pro/bot/enabled', status: 200 })).toBe(
      'Switched the cloud bot',
    )
  })

  it('parses the remote frame with the cloud fields', () => {
    const f = parseLiveFrame(
      JSON.stringify({
        v: 1,
        type: 'remote',
        data: {
          pc_online: false,
          role: 'mod',
          cloud: true,
          cloud_paused: false,
          cloud_moderation: { twitch: true, kick: true },
          history: false,
        },
      }),
    )
    expect(f?.type === 'remote' && f.data.cloud).toBe(true)
  })
})

function phone(role: 'owner' | 'mod', cloud: 'on' | 'paused' | 'off') {
  const engine = new DemoEngine({
    autoplay: false,
    latencyMs: 0,
    pro: { active: true, features: true },
    remote: { role, pcOnline: false, cloud },
  })
  const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  return { engine, client }
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof ApiError ? `${e.status} ${e.code}` : String(e)
  }
}

describe('demo: a phone whose PC is off', () => {
  it('answers chat, bans and history with the cloud bot on, the rest 503', async () => {
    const { client } = phone('owner', 'on')
    const chat = await client.chat(50)
    expect(chat.length).toBeGreaterThan(0)
    const line = chat.find((e) => e.kind.type === 'chat_message')!
    const actor = line.kind.type === 'chat_message' ? line.kind.actor : null
    expect(await code(client.timeout(line.platform, actor?.id ?? 'x', 600))).toBe('ok')
    expect(await code(client.deleteMessage(line.platform, line.source_id ?? line.id))).toBe('ok')
    expect(await code(historyApi(client).list())).toBe('ok')
    expect(await code(client.status())).toBe('503 pc_offline')
    try {
      await client.settings()
    } catch (e) {
      expect((e as ApiError).message).toBe(REMOTE_OFFLINE_MESSAGE)
    }
  })

  it('a mod: chat and bans, never history or the switch', async () => {
    const { client } = phone('mod', 'on')
    expect(await code(client.chat(10))).toBe('ok')
    expect(await code(historyApi(client).list())).toBe('403 not_allowed_for_role')
    expect(await code(cloudBotApi(client).setEnabled(false))).toBe('403 not_allowed_for_role')
  })

  it('without the cloud bot: only history and the switch', async () => {
    const { client } = phone('owner', 'paused')
    expect(await code(client.chat(10))).toBe('503 pc_offline')
    expect(await code(historyApi(client).list())).toBe('ok')
    expect(await code(cloudBotApi(client).setEnabled(true))).toBe('ok')
    await new Promise((r) => setTimeout(r, 5))
    expect(await code(client.chat(10))).toBe('ok')
  })

  it('the socket says the cloud stands in and streams only chat', async () => {
    const { engine, client } = phone('mod', 'on')
    const got: { type: string; data: Record<string, unknown> }[] = []
    const sock = engine.socket(client.liveUrl())
    sock.onmessage = (ev) => got.push(JSON.parse(String(ev.data)))
    await new Promise((r) => setTimeout(r, 5))
    expect(got[0]).toEqual({
      v: 1,
      type: 'remote',
      data: {
        pc_online: false,
        role: 'mod',
        cloud: true,
        cloud_paused: false,
        cloud_moderation: { twitch: true, kick: true },
        history: false,
      },
    })
    expect(got[1]?.type).toBe('resync')
    expect(got.map((f) => f.type)).not.toContain('status')
    expect(got.map((f) => f.type)).not.toContain('hello')
    engine.setRemoteCloud('paused')
    expect(got.at(-1)?.data).toMatchObject({ cloud: false, cloud_paused: true })
    engine.setRemotePc(true)
    expect(got.at(-1)?.data).toMatchObject({ pc_online: true })
    sock.close()
  })
})
