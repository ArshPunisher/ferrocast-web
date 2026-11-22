import { describe, expect, it, vi } from 'vitest'
import {
  WIDGET_KINDS,
  isTrustedEmoteUrl,
  parseLiveFrame,
  validateLayout,
  validateWidgetConfig,
} from '../src'
import { FerroClient } from '../src/client'
import { DEMO_TOKEN, DemoEngine } from '../src/demo'
import type { OverlayServerFrame } from '../src'

describe('interactive widgets API contract', () => {
  it('exposes all widget kinds including end_credits, emote_wall, and chat_highlight', () => {
    expect(WIDGET_KINDS).toContain('end_credits')
    expect(WIDGET_KINDS).toContain('emote_wall')
    expect(WIDGET_KINDS).toContain('chat_highlight')
  })

  it('validates trusted emote CDN URLs strictly', () => {
    for (const ok of [
      'https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0',
      'https://files.kick.com/emotes/4148074/fullsize',
      'https://images.kick.com/emotes/1/fullsize',
      'https://cdn.7tv.app/emote/01F6N/2x.webp',
      'https://cdn.betterttv.net/emote/abc/2x',
      'https://cdn.frankerfacez.com/emote/123/2',
      'https://yt3.ggpht.com/abc=w48-h48-c-k-nd',
    ]) {
      expect(isTrustedEmoteUrl(ok), ok).toBe(true)
    }
    for (const bad of [
      'http://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0',
      'https://static-cdn.jtvnw.net.evil.com/x.png',
      'https://evil.com/@static-cdn.jtvnw.net/x.png',
      'https://user@static-cdn.jtvnw.net/x.png',
      'https://static-cdn.jtvnw.net:8443/x.png',
      'https://evil.com\\@static-cdn.jtvnw.net/x.png',
      'https://static\u00ad-cdn.jtvnw.net/x.png',
      'https://static-cdn.jtvnw.net',
      'https://static-cdn.jtvnw.net/',
      'https://yt3.ggpht.com?a=1',
      'https://static-cdn.jtvnw.net#x',
      'javascript:alert(1)',
      'data:image/svg+xml,<svg onload=alert(1)>',
      '',
    ]) {
      expect(isTrustedEmoteUrl(bad), bad).toBe(false)
    }
  })

  it('validates config limits for end_credits, emote_wall, and chat_highlight', () => {
    expect(
      validateWidgetConfig('end_credits', {
        theme: 'molten',
        title: 'Thanks for watching',
        sections: ['followers', 'subs', 'gifters', 'tippers', 'raiders', 'mods'],
        speed: 60,
        font: 'system',
        text_color: '#eef0f5',
        accent_color: null,
        background: null,
        loop: true,
      }),
    ).toBeNull()
    expect(validateWidgetConfig('end_credits', { sections: [] })).toContain('config.sections:')
    expect(validateWidgetConfig('end_credits', { speed: 500 })).toContain('config.speed:')
    expect(validateWidgetConfig('end_credits', { font: 'Bad; url(x)' })).toContain('config.font:')
    expect(validateWidgetConfig('end_credits', { text_color: 'red;x' })).toContain(
      'config.text_color:',
    )

    expect(
      validateWidgetConfig('emote_wall', {
        theme: 'molten',
        platforms: ['twitch', 'kick'],
        max_emotes: 40,
        size: 56,
        lifetime_s: 6,
        physics: 'fountain',
      }),
    ).toBeNull()
    expect(validateWidgetConfig('emote_wall', { max_emotes: 500 })).toContain('config.max_emotes:')
    expect(validateWidgetConfig('emote_wall', { physics: 'explode' })).toContain('config.physics:')

    expect(
      validateWidgetConfig('chat_highlight', {
        theme: 'arcade',
        duration_s: 30,
        font_size: 24,
        show_badges: true,
        show_platform: true,
      }),
    ).toBeNull()
    expect(validateWidgetConfig('chat_highlight', { duration_s: 2 })).toContain(
      'config.duration_s:',
    )
    expect(
      validateLayout('Test', 1920, 1080, [
        {
          id: 'w1',
          kind: 'emote_wall',
          x: 0,
          y: 0,
          w: 1920,
          h: 1080,
          config: {
            theme: 'molten',
            platforms: [],
            max_emotes: 40,
            size: 56,
            lifetime_s: 6,
            physics: 'bounce',
          },
        },
      ]),
    ).toBeNull()
  })

  it('parses chat_highlight live frames and filters bad shapes', () => {
    expect(
      parseLiveFrame(JSON.stringify({ v: 1, type: 'chat_highlight', data: { highlight: null } })),
    ).not.toBeNull()
    expect(
      parseLiveFrame(
        JSON.stringify({
          v: 1,
          type: 'chat_highlight',
          data: { highlight: { id: 123 } },
        }),
      ),
    ).toBeNull()
  })

  it('supports demo credits, chat highlight pin/dismiss/timeout, and moderation cleanup', async () => {
    vi.useFakeTimers()
    try {
      const demo = new DemoEngine({ autoplay: false, latencyMs: 0 })
      const client = new FerroClient({
        base: demo.base,
        token: DEMO_TOKEN,
        fetch: demo.fetch,
      })

      const credits = await client.credits()
      expect(credits.followers.length).toBeGreaterThan(0)
      expect(credits.subs.length).toBeGreaterThan(0)
      expect(credits.gifters.length).toBeGreaterThan(0)
      expect(credits.tippers.length).toBeGreaterThan(0)
      expect(credits.raiders.length).toBeGreaterThan(0)
      expect(credits.mods.length).toBeGreaterThan(0)

      const overlays = await client.overlays()
      const baseOverlay = overlays[0]!
      const saved = await client.saveOverlay({
        ...baseOverlay,
        width: 1920,
        height: 1080,
        widgets: [
          {
            id: 'hl-w',
            kind: 'chat_highlight',
            x: 40,
            y: 800,
            w: 620,
            h: 220,
            config: {
              theme: 'molten',
              duration_s: null,
              font_size: 24,
              show_badges: true,
              show_platform: true,
            },
          },
          {
            id: 'ec-w',
            kind: 'end_credits',
            x: 100,
            y: 100,
            w: 800,
            h: 700,
            config: {
              theme: 'molten',
              title: 'Thanks',
              sections: ['followers', 'subs', 'gifters', 'tippers', 'raiders', 'mods'],
              speed: 60,
              font: 'system',
              text_color: null,
              accent_color: null,
              background: null,
              loop: true,
            },
          },
        ],
      })
      const token = new URL(saved.url).pathname.split('/').filter(Boolean)[1]!
      const frames: OverlayServerFrame[] = []
      const sock = demo.socket(`ws://127.0.0.1:47820/o/${token}/ws`)
      sock.onmessage = (ev) => {
        frames.push(JSON.parse(String(ev.data)) as OverlayServerFrame)
      }
      await vi.advanceTimersByTimeAsync(1)
      expect(frames[0]?.type).toBe('snapshot')
      if (frames[0]?.type === 'snapshot') {
        expect(frames[0].data.state.credits?.mods.length).toBeGreaterThan(0)
        expect(frames[0].data.state.chat_highlight).toBeNull()
      }

      const chat = await client.chat(50)
      const firstChat = chat.find((e) => e.kind.type === 'chat_message')!
      const hl = await client.pinChatHighlight(firstChat.id, 10)
      expect(hl.event_id).toBe(firstChat.id)
      expect(await client.chatHighlight()).not.toBeNull()
      expect(
        frames.some((f) => f.type === 'state' && f.data.chat_highlight?.event_id === firstChat.id),
      ).toBe(true)

      // Expires after duration_s = 10s
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await client.chatHighlight()).toBeNull()
      expect(frames.some((f) => f.type === 'state' && f.data.chat_highlight === null)).toBe(true)

      // Deleting a pinned message dismisses it too
      const secondChat = chat.find((e) => e.id !== firstChat.id && e.kind.type === 'chat_message')!
      await client.pinChatHighlight(secondChat.id, null)
      expect((await client.chatHighlight())?.event_id).toBe(secondChat.id)
      await client.deleteMessage(secondChat.platform, secondChat.source_id!)
      expect(await client.chatHighlight()).toBeNull()

      sock.close()
      demo.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  describe('demo engine follow-ups', () => {
    const make = () => {
      const demo = new DemoEngine({ autoplay: false, latencyMs: 0 })
      const client = new FerroClient({ base: demo.base, token: DEMO_TOKEN, fetch: demo.fetch })
      const ingest = (kind: unknown, platform: string, origin = 'live') =>
        (demo as unknown as { ingest: (k: unknown, p: string, o: string) => unknown }).ingest(
          kind,
          platform,
          origin,
        )
      return { demo, client, ingest }
    }
    const chatKind = (n: number) => ({
      type: 'chat_message',
      actor: {
        platform: 'twitch',
        id: `u${n}`,
        login: `u${n}`,
        display_name: `User${n}`,
        avatar_url: null,
        color: null,
        roles: 0,
        badges: [],
        anonymous: false,
      },
      content: { text: `hello ${n}`, fragments: [{ type: 'text', text: `hello ${n}` }] },
      reply_to: null,
      is_action: false,
    })

    it('an emote wall saved without platforms does not break chat delivery', async () => {
      const { demo, client, ingest } = make()
      const o = (await client.overlays())[0]!
      const saved = await client.saveOverlay({
        ...o,
        widgets: [
          { id: 'ew', kind: 'emote_wall', x: 0, y: 0, w: 800, h: 600, config: {} } as never,
        ],
      })
      const token = new URL(saved.url).pathname.split('/').filter(Boolean)[1]!
      const sock = demo.socket(`ws://127.0.0.1:47820/o/${token}/ws`)
      sock.onmessage = () => {}
      await new Promise((r) => setTimeout(r, 20))
      expect(() => ingest(chatKind(1), 'twitch')).not.toThrow()
    })

    it('credits keep supporters after the event log evicts old events', async () => {
      const { client, ingest } = make()
      const before = (await client.credits()).followers.length
      expect(before).toBeGreaterThan(0)
      for (let i = 0; i < 2100; i++) ingest(chatKind(i), 'twitch')
      expect((await client.credits()).followers.length).toBe(before)
    })

    it('a deleted message cannot be pinned any more', async () => {
      const { client } = make()
      const chat = await client.chat(50)
      const m = chat.find((e) => e.kind.type === 'chat_message' && e.source_id)!
      await client.deleteMessage(m.platform, m.source_id!)
      await expect(client.pinChatHighlight(m.id, null)).rejects.toMatchObject({
        code: 'highlight_not_found',
      })
    })

    it('demo chat emotes use trusted, non-dead emote URLs across platforms', async () => {
      const { demo, client } = make()
      const tick = (demo as unknown as { randomChat: () => void }).randomChat.bind(demo)
      for (let i = 0; i < 150; i++) tick()
      const msgs = await client.chat(150)
      const emoteUrls: string[] = []
      for (const m of msgs) {
        if (m.kind.type !== 'chat_message') continue
        for (const f of m.kind.content.fragments) {
          if (f.type === 'emote') emoteUrls.push(f.url)
        }
      }
      expect(emoteUrls.length).toBeGreaterThan(0)
      for (const url of emoteUrls) {
        expect(url).not.toContain('01F6N8W4M0000083K2R1V9H8Z3')
        expect(isTrustedEmoteUrl(url), url).toBe(true)
      }
    })
  })
})
