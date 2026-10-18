// Auto-replies: the TypeScript matching port behaves like core::autoreply (cases mirror the
// Rust unit tests), the error helper finds the field, and the demo engine answers like the
// real one (statuses, first match, cooldowns, loop guard, commands win, panic).

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import {
  BLANK_AUTOREPLY,
  autoRepliesApi,
  autoReplyError,
  autoReplyMatches,
  autoReplyProblem,
  autoReplyStarters,
  foldText,
  renderAutoReply,
  roleAllows,
  type AutoReply,
  type AutoReplyMatchKind,
} from '../src/autoreplies'
import type { Actor, FerroEvent } from '../src/types'

const m = (kind: AutoReplyMatchKind, text: string, case_sensitive = false) => ({
  kind,
  text,
  case_sensitive,
})
const rule = (over: Partial<Omit<AutoReply, 'id'>> = {}): Omit<AutoReply, 'id'> => ({
  ...BLANK_AUTOREPLY,
  name: 'Discord',
  match: m('word', 'discord'),
  reply: 'Join us, {user}: discord.gg/x',
  ...over,
})

describe('matching (core::autoreply port)', () => {
  it('folds case, width and spacing', () => {
    expect(foldText('  What\t  GAME ', false)).toBe('what game')
    expect(autoReplyMatches(m('contains', 'what   Game'), 'hey WHAT game is this')).toBe(true)
    expect(autoReplyMatches(m('contains', 'what game'), 'whatgame')).toBe(false)
    expect(autoReplyMatches(m('contains', 'discord'), 'ＤＩＳＣＯＲＤ?')).toBe(true)
    expect(autoReplyMatches(m('word', 'café'), 'le café est ouvert')).toBe(true)
    expect(autoReplyMatches(m('contains', 'ΣΟΦΊΑ'), 'η σοφία')).toBe(true)
    expect(autoReplyMatches(m('contains', 'ゲーム'), '何のゲームですか')).toBe(true)
    expect(autoReplyMatches(m('contains', 'VOD', true), 'the vod')).toBe(false)
    expect(autoReplyMatches(m('contains', 'VOD', true), 'the VOD')).toBe(true)
  })
  it('respects word boundaries', () => {
    const w = m('word', 'game')
    for (const t of ['what game is this', 'game?', 'GAME', 'new-game', 'gameplay or game'])
      expect(autoReplyMatches(w, t), t).toBe(true)
    for (const t of ['gameplay', 'endgame', 'game_over', 'gameé'])
      expect(autoReplyMatches(w, t), t).toBe(false)
    expect(autoReplyMatches(m('word', 'what game'), 'somewhat game')).toBe(false)
    expect(autoReplyMatches(m('word', '!discord'), 'type!discord')).toBe(true)
    expect(autoReplyMatches(m('word', 'über'), 'Überall')).toBe(false)
    expect(autoReplyMatches(m('word', '🎮'), 'what 🎮 tonight')).toBe(true)
  })
  it('starts with and patterns', () => {
    expect(autoReplyMatches(m('starts_with', 'hello'), '   Hello chat')).toBe(true)
    expect(autoReplyMatches(m('starts_with', 'hello'), 'oh hello')).toBe(false)
    expect(autoReplyMatches(m('regex', '\\b(what|which) (game|category)\\b'), 'Which GAME')).toBe(
      true,
    )
    expect(autoReplyMatches(m('regex', '^VOD$', true), 'vod')).toBe(false)
    expect(autoReplyMatches(m('regex', '('), 'x'), 'a broken pattern never matches').toBe(false)
  })
  it('checks rules like the engine', () => {
    expect(autoReplyProblem(rule())).toBeNull()
    expect(autoReplyProblem(rule({ name: ' ' }))).toMatch(/^name:/)
    expect(autoReplyProblem(rule({ match: m('word', '') }))).toMatch(/^match\.text:/)
    expect(autoReplyProblem(rule({ reply: 'é'.repeat(501) }))).toMatch(
      /^reply: 501 characters is too long/,
    )
    expect(autoReplyProblem(rule({ reply: 'é'.repeat(500) }))).toBeNull()
    expect(autoReplyProblem(rule({ reply: '{oops' }))).toMatch(/^reply:/)
    expect(autoReplyProblem(rule({ match: m('regex', '(discord') }))).toMatch(
      /^match\.text: the pattern/,
    )
    expect(autoReplyProblem(rule({ match: m('regex', 'a*') }))).toMatch(/matches every message/)
    for (const s of autoReplyStarters()) expect(autoReplyProblem(s), s.name).toBeNull()
  })
  it('renders safely and checks roles', () => {
    const a: Actor = {
      platform: 'kick',
      id: '1',
      login: 'x',
      display_name: 'Evil\nName',
      avatar_url: null,
      color: null,
      roles: 0,
      badges: [],
      anonymous: false,
    }
    expect(
      renderAutoReply('/ban {user} on {platform}, {game}', 'kick', a, { game: 'Hades II' }),
    ).toBe('ban Evil Name on Kick, Hades II')
    expect(roleAllows('subs', 16)).toBe(true)
    expect(roleAllows('subs', 0)).toBe(false)
    expect(roleAllows('vips', 1)).toBe(true)
    expect(roleAllows('mods', 4)).toBe(false)
  })
  it('finds the field in an error', () => {
    expect(
      autoReplyError(
        new ApiError(
          422,
          'bad_pattern',
          'match.text: the pattern has a problem at character 1: unclosed group.',
          'Check brackets.',
        ),
      ),
    ).toEqual({
      field: 'match.text',
      message: 'The pattern has a problem at character 1: unclosed group. Check brackets.',
    })
    expect(
      autoReplyError(
        new ApiError(
          413,
          'reply_too_long',
          'reply: 600 characters is too long; replies can be up to 500.',
        ),
      ),
    ).toEqual({
      field: 'reply',
      message: '600 characters is too long; replies can be up to 500.',
    })
    expect(
      autoReplyError(
        new ApiError(422, 'too_many_autoreplies', 'You have 100 auto-replies.', 'Delete some.'),
      ).field,
    ).toBeNull()
  })
})

let engine: DemoEngine
let client: FerroClient
let api: ReturnType<typeof autoRepliesApi>

beforeEach(() => {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  api = autoRepliesApi(client)
})
afterEach(() => engine.dispose())

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as ApiError,
  )
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function chat(name: string, text: string, roles = 0): FerroEvent {
  return engine.inject(
    {
      type: 'chat_message',
      actor: {
        platform: 'twitch',
        id: `${name}-id`,
        login: name.toLowerCase(),
        display_name: name,
        avatar_url: null,
        color: null,
        roles,
        badges: [],
        anonymous: false,
      },
      content: { text, fragments: [{ type: 'text', text }] },
      reply_to: null,
      is_action: false,
    },
    'twitch',
  )
}

/** What the streamer's account (the bot) said in chat. */
async function said(): Promise<string[]> {
  const events = await client.chat(500)
  return events.flatMap((e) =>
    e.kind.type === 'chat_message' && e.kind.actor.id === 'me' ? [e.kind.content.text] : [],
  )
}

describe('demo auto-replies', () => {
  it('CRUD, order and the statuses the engine uses', async () => {
    expect(await api.list()).toEqual([])
    const a = await api.create(rule())
    expect(a.id).toBeTruthy()
    expect(a.cooldown_s).toBe(30)
    const b = await api.create(
      rule({ name: 'Game', match: m('contains', 'what game'), reply: '{game}' }),
    )
    expect((await api.reorder([b.id, a.id])).map((r) => r.id)).toEqual([b.id, a.id])
    expect((await fail(api.reorder([b.id])))?.status).toBe(409)
    expect((await api.save({ ...a, enabled: false })).enabled).toBe(false)
    let e = await fail(api.create(rule({ match: m('regex', 'what (game') })))
    expect([e?.status, e?.code]).toEqual([422, 'bad_pattern'])
    e = await fail(api.create(rule({ reply: 'x'.repeat(501) })))
    expect([e?.status, e?.code]).toEqual([413, 'reply_too_long'])
    e = await fail(api.create(rule({ name: '' })))
    expect(e?.status).toBe(400)
    expect(e?.message).toMatch(/^name:/)
    e = await fail(api.remove('nope'))
    expect([e?.status, e?.code]).toEqual([404, 'autoreply_not_found'])
    await api.remove(a.id)
    expect((await api.list()).length).toBe(1)
    for (let i = 0; i < 99; i++)
      await api.create(rule({ name: `r${i}`, match: m('word', `w${i}`) }))
    e = await fail(api.create(rule()))
    expect([e?.status, e?.code]).toEqual([422, 'too_many_autoreplies'])
  })

  it('try it: saved rules or a draft', async () => {
    await api.create(rule())
    const t = await api.try('any DISCORD?')
    expect(t).toMatchObject({
      matched: true,
      rule_name: 'Discord',
      reply: 'Join us, viewer: discord.gg/x',
    })
    expect((await api.try('discordant')).matched).toBe(false)
    const draft = rule({ name: '', match: m('starts_with', 'hi'), reply: '' })
    expect(await api.try('hi chat', draft)).toMatchObject({ matched: true, reply: null })
    expect((await fail(api.try('x', rule({ match: m('regex', '[a') }))))?.status).toBe(422)
  })

  it('answers chat once, then cools down; never itself, bots or commands', async () => {
    await api.create(rule({ only_when_live: false }))
    chat('Fan', 'is there a discord?')
    await wait(600)
    expect(await said()).toContain('Join us, Fan: discord.gg/x')
    const n = (await said()).length
    chat('Other', 'discord pls')
    chat('Nightbot', 'discord')
    chat('Helper', 'discord', 256)
    chat('Fan', 'Join us, Fan: discord.gg/x')
    await wait(600)
    expect((await said()).length, 'cooldown, bots and echoes stay quiet').toBe(n)
  })

  it('stays quiet in panic mode', async () => {
    await api.create(rule({ only_when_live: false, cooldown_s: 0, user_cooldown_s: 0 }))
    await client.request('POST', '/api/v1/mod/panic', { on: true })
    chat('Fan', 'discord')
    await wait(600)
    expect((await said()).some((s) => s.startsWith('Join us'))).toBe(false)
    await client.request('POST', '/api/v1/mod/panic', { on: false })
    chat('Fan', 'discord')
    await wait(600)
    expect((await said()).some((s) => s.startsWith('Join us'))).toBe(true)
  })
})
