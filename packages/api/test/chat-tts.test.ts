import { afterEach, describe, expect, it, vi } from 'vitest'
import { Roles } from '../src'
import { FerroClient } from '../src/client'
import { DEMO_TOKEN, DemoEngine } from '../src/demo'

let demo: DemoEngine | null = null

function setup() {
  demo = new DemoEngine({ autoplay: false, latencyMs: 0 })
  const client = new FerroClient({ base: demo.base, token: DEMO_TOKEN, fetch: demo.fetch })
  const ingest = (kind: unknown, platform = 'twitch', origin = 'live') =>
    (demo as unknown as { ingest: (k: unknown, p: string, o: string) => unknown }).ingest(
      kind,
      platform,
      origin,
    )
  return { demo, client, ingest }
}

function chatMsg(uid: string, text: string, opts?: { roles?: number; emotes?: number }) {
  const fragments: unknown[] = [{ type: 'text', text }]
  for (let i = 0; i < (opts?.emotes ?? 0); i++) {
    fragments.push({ type: 'emote', id: `e${i}`, name: `Emote${i}`, url: '' })
  }
  return {
    type: 'chat_message',
    actor: {
      platform: 'twitch',
      id: uid,
      login: uid,
      display_name: uid.toUpperCase(),
      avatar_url: null,
      color: null,
      roles: opts?.roles ?? 0,
      badges: [],
      anonymous: false,
    },
    content: { text, fragments },
    reply_to: null,
    is_action: false,
  }
}

afterEach(() => {
  vi.useRealTimers()
  demo?.dispose()
  demo = null
})

describe('DemoEngine Chat TTS', () => {
  it('merges and validates TtsSettings.chat on PUT /api/v1/tts', async () => {
    const { client } = setup()
    const initial = await client.tts()
    expect(initial.chat).toMatchObject({
      enabled: false,
      mode: 'subs_mods',
      command: '!tts',
      cooldown_s: 15,
      global_cooldown_s: 3,
      queue_limit: 5,
      max_chars: 160,
      skip_links: true,
      skip_emote_spam: true,
    })

    const saved = await client.saveTts({
      ...initial,
      enabled: true,
      chat: { ...initial.chat!, enabled: true, mode: 'command', command: '  !say  ' },
    })
    expect(saved.chat).toMatchObject({
      enabled: true,
      mode: 'command',
      command: '!say',
      cooldown_s: 15,
    })

    await expect(
      client.saveTts({
        ...saved,
        chat: { ...saved.chat!, command: 'say' },
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('dispatches eligible chat messages, skips links/emotes/bots, and emits tts_stop on panic or delete', async () => {
    const { demo: d, client, ingest } = setup()
    const overlays = await client.overlays()
    const alertsOverlay = overlays.find((o) => o.widgets.some((w) => w.kind === 'alerts'))!
    const token = /\/o\/([^/]+)\//.exec(alertsOverlay.url)![1]!
    const frames: { type: string; data: Record<string, unknown> }[] = []
    const sock = d.socket(`ws://127.0.0.1:47820/o/${token}/ws`)
    sock.onmessage = (ev: { data: unknown }) => {
      frames.push(JSON.parse(String(ev.data)) as { type: string; data: Record<string, unknown> })
    }
    await new Promise((r) => setTimeout(r, 10))

    const base = await client.tts()
    await client.saveTts({
      ...base,
      enabled: true,
      hold_for_approval: false,
      chat: {
        ...base.chat!,
        enabled: true,
        mode: 'command',
        command: '!tts',
        cooldown_s: 0,
        global_cooldown_s: 0,
      },
    })

    // Non-command, links, emote spam, and bots are ignored.
    ingest(chatMsg('u1', 'plain hello'))
    ingest(chatMsg('u2', '!tts visit https://example.com'))
    ingest(chatMsg('u3', '!tts', { emotes: 6 }))
    ingest(chatMsg('bot1', '!tts hi from bot', { roles: Roles.BOT }))
    expect(frames.filter((f) => f.type === 'tts')).toHaveLength(0)

    // Matching command strips !tts prefix and speaks.
    ingest(chatMsg('u4', '!tts hello chat'))
    const spoken = frames.filter((f) => f.type === 'tts')
    expect(spoken).toHaveLength(1)
    expect(spoken[0]!.data.text).toBe('U4 says: hello chat')

    // Panic mode with pause_tts pauses speech and emits tts_stop.
    const cfg = await client.panicConfig()
    await client.savePanicConfig({ ...cfg, pause_tts: true })
    await client.panic(true)
    expect(frames.some((f) => f.type === 'tts_stop')).toBe(true)

    ingest(chatMsg('u5', '!tts during panic'))
    expect(frames.filter((f) => f.type === 'tts')).toHaveLength(1)

    await client.panic(false)
    const beforeStops = frames.filter((f) => f.type === 'tts_stop').length
    ingest({ type: 'message_deleted', message_id: 'src-x' })
    expect(frames.filter((f) => f.type === 'tts_stop').length).toBe(beforeStops + 1)

    sock.close()
  })

  it('matches engine rules on STAFF under subs_mods, disabled word filters, @ URLs, slur splits, and global queue', async () => {
    const { demo: d, client, ingest } = setup()
    const overlays = await client.overlays()
    const alertsOverlay = overlays.find((o) => o.widgets.some((w) => w.kind === 'alerts'))!
    const token = /\/o\/([^/]+)\//.exec(alertsOverlay.url)![1]!
    const frames: { type: string; data: Record<string, unknown> }[] = []
    const sock = d.socket(`ws://127.0.0.1:47820/o/${token}/ws`)
    sock.onmessage = (ev: { data: unknown }) => {
      frames.push(JSON.parse(String(ev.data)) as { type: string; data: Record<string, unknown> })
    }
    await new Promise((r) => setTimeout(r, 10))

    // Enable filters with a blocked word, then disable word filter toggling.
    const filter = await client.filters()
    await client.saveFilters({
      ...filter,
      words: { ...filter.words, enabled: false, list: ['spoiler'] },
    })
    const base = await client.tts()
    await client.saveTts({
      ...base,
      enabled: true,
      hold_for_approval: false,
      chat: {
        ...base.chat!,
        enabled: true,
        mode: 'subs_mods',
        cooldown_s: 0,
        global_cooldown_s: 1,
        queue_limit: 5,
      },
    })

    // STAFF is not admitted under subs_mods.
    ingest(chatMsg('staff1', 'hello from staff', { roles: Roles.STAFF }))
    expect(frames.filter((f) => f.type === 'tts')).toHaveLength(0)

    // @ inside URL and split severe slurs are skipped.
    ingest(chatMsg('sub1', 'check evil.com/@promo now', { roles: Roles.SUBSCRIBER }))
    ingest(
      chatMsg('sub1b', ['n', 'i', 'g', ' ', 'g', 'e', 'r'].join(''), { roles: Roles.SUBSCRIBER }),
    )
    expect(frames.filter((f) => f.type === 'tts')).toHaveLength(0)

    // Disabled word filter does NOT block the word.
    ingest(chatMsg('sub2', 'minor spoiler here', { roles: Roles.SUBSCRIBER }))
    expect(frames.filter((f) => f.type === 'tts')).toHaveLength(1)

    // Queues next eligible line while global_cooldown_s is active rather than dropping it.
    vi.useFakeTimers()
    try {
      ingest(chatMsg('sub3', 'queued second line', { roles: Roles.SUBSCRIBER }))
      expect(frames.filter((f) => f.type === 'tts')).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1100)
      expect(frames.filter((f) => f.type === 'tts')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }

    sock.close()
  })

  it('blocks adversarial BiDi/zero-width/post-clean slurs, spaced-dot links, display_name links, and strips synth markup', async () => {
    const { demo: d, client, ingest } = setup()
    const overlays = await client.overlays()
    const alertsOverlay = overlays.find((o) => o.widgets.some((w) => w.kind === 'alerts'))!
    const token = /\/o\/([^/]+)\//.exec(alertsOverlay.url)![1]!
    const frames: { type: string; data: Record<string, unknown> }[] = []
    const sock = d.socket(`ws://127.0.0.1:47820/o/${token}/ws`)
    sock.onmessage = (ev: { data: unknown }) => {
      frames.push(JSON.parse(String(ev.data)) as { type: string; data: Record<string, unknown> })
    }
    await new Promise((r) => setTimeout(r, 10))

    const filter = await client.filters()
    await client.saveFilters({
      ...filter,
      words: { ...filter.words, enabled: true, lookalikes: true, list: ['scam', 'bad phrase'] },
    })
    const base = await client.tts()
    await client.saveTts({
      ...base,
      enabled: true,
      hold_for_approval: false,
      read_names: true,
      chat: {
        ...base.chat!,
        enabled: true,
        mode: 'everyone',
        cooldown_s: 0,
        global_cooldown_s: 0,
        skip_links: true,
      },
    })

    const split1 = `${'re'}t-${'t'}ard`
    const split2 = `${'nig'}g-${'g'}er`
    const split3 = `${'fag'}g-${'g'}ot`
    const wrapped = `x${'fa'}-${'ggot'}y`
    const bidiSlur = `${'nig'}g\u{2066}${'g'}er`
    const wholeSplit = `${'sp'}-${'ic'}`
    const emailSplit = `${'nig'} ab@cd.ef ${'ger'}`

    for (const hostile of [
      'bad ab@cd.ef phrase',
      'sc\u{2066}am',
      'sc\u{202e}am',
      'sc\u{fe0f}am',
      split1,
      split2,
      split3,
      wrapped,
      bidiSlur,
      wholeSplit,
      emailSplit,
      'check https:\u{200b}//evil.\u{200b}com',
      'visit evil.\u{2066}com',
      'visit evil .com',
      'visit evil. com',
      'visit \u{ff45}\u{ff56}\u{ff49}\u{ff4c}.\u{ff43}\u{ff4f}\u{ff4d}',
    ]) {
      ingest(chatMsg('u_hostile', hostile))
    }

    // Link or slur in display_name must also be blocked.
    for (const badName of [
      'scam.\u{200b}com',
      'evil .com',
      'evil. com',
      bidiSlur,
      'bad ab@cd.ef phrase',
    ]) {
      const msg = chatMsg('u_name', 'hello chat')
      msg.actor.display_name = badName
      ingest(msg)
    }

    expect(frames.filter((f) => f.type === 'tts')).toHaveLength(0)

    // Embedded synth commands and SSML markup are stripped before emitting tts frame.
    ingest(chatMsg('u_ok', '[[inpt PHON]] [[slnc 99999]] <speak>hello</speak>'))
    const ttsFrames = frames.filter((f) => f.type === 'tts')
    expect(ttsFrames).toHaveLength(1)
    const spoken = String(ttsFrames[0]!.data.text)
    expect(spoken).not.toContain('[')
    expect(spoken).not.toContain(']')
    expect(spoken).not.toContain('<')
    expect(spoken).not.toContain('>')
    expect(spoken).toContain('number')

    sock.close()
  })
})
