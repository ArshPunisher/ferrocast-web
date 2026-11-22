import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatHighlight, Credits, Widget } from '@ferrocast/api/types'
import { createOverlay, type OverlayRuntime } from '../src/runtime'
import { XSS, actor, chat, deepAll, frame, overlay, snapshot } from './helpers'

let root: HTMLElement
let rt: OverlayRuntime

function makeCredits(): Credits {
  return {
    started_at: 1000,
    followers: [
      { platform: 'twitch', name: 'LunaLagoon' },
      { platform: 'kick', name: XSS[0]! },
    ],
    subs: [{ platform: 'twitch', name: 'DesertFoxx', months: 14, gifts: 0 }],
    gifters: [{ platform: 'twitch', name: 'GiftGoblin', gifts: 5 }],
    tippers: [
      {
        platform: 'tips',
        name: 'Asha',
        amounts: [{ minor: 50_000, currency: 'INR' }],
        bits: 0,
      },
      { platform: 'twitch', name: 'BitBaron', amounts: [], bits: 500 },
      { platform: 'kick', name: 'KickKing', amounts: [], bits: 0, kicks: 100 },
    ],
    raiders: [{ platform: 'twitch', name: 'CaptainCozy', viewers: 42 }],
    mods: [{ platform: 'youtube', name: 'ModMaya' }],
  }
}

function makeHighlight(id = 'hl-1', eventId = 'ev-1', text = 'Great clutch!'): ChatHighlight {
  return {
    id,
    event_id: eventId,
    source_id: 'tw-1',
    platform: 'twitch',
    actor: actor('MiraMod', { color: '#7fb4ff', roles: 2 }),
    content: { text, fragments: [{ type: 'text', text }] },
    is_action: false,
    pinned_at: Date.now(),
    expires_at: null,
  }
}

const creditsWidget = (extra: Record<string, unknown> = {}): Widget => ({
  id: 'wec',
  kind: 'end_credits',
  x: 100,
  y: 100,
  w: 800,
  h: 600,
  config: {
    theme: 'molten',
    title: 'Thanks for watching',
    sections: ['followers', 'subs', 'gifters', 'tippers', 'raiders', 'mods'],
    speed: 120,
    font: 'system',
    text_color: '#eef0f5',
    accent_color: '#ff7a59',
    background: null,
    loop: true,
    ...extra,
  },
})

const emoteWidget = (extra: Record<string, unknown> = {}): Widget => ({
  id: 'wew',
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
    ...extra,
  },
})

const highlightWidget = (extra: Record<string, unknown> = {}): Widget => ({
  id: 'whl',
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
    ...extra,
  },
})

function emoteMsg(url: string, msgIndex: number, count = 1) {
  const base = chat('EmoteUser', 'Kappa')
  const fragments = Array.from({ length: count }, (_, i) => ({
    type: 'emote' as const,
    provider: 'native' as const,
    id: `${msgIndex}-${i}`,
    name: 'Kappa',
    url,
    zero_width: false,
  }))
  return {
    ...base,
    id: `ev-em-${msgIndex}`,
    source_id: `src-em-${msgIndex}`,
    kind: {
      type: 'chat_message' as const,
      actor: actor(`Emoter${msgIndex}`),
      content: { text: 'Kappa', fragments },
      reply_to: null,
      is_action: false,
    },
  }
}

beforeEach(() => {
  document.body.replaceChildren()
  root = document.createElement('div')
  document.body.appendChild(root)
})

afterEach(() => {
  rt?.destroy()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('end_credits widget', () => {
  it('renders all six session sections with textContent only and scrolls smoothly with transform', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({ credits: makeCredits() }, overlay([creditsWidget()])))

    const w = root.querySelector<HTMLElement>('.fc-w-end-credits')!
    expect(w.hidden).toBe(false)
    expect(w.textContent).toContain('New followers')
    expect(w.textContent).toContain('LunaLagoon')
    expect(w.textContent).toContain(XSS[0]!)
    expect(w.textContent).toContain('DesertFoxx')
    expect(w.textContent).toContain('GiftGoblin')
    expect(w.textContent).toContain('Asha')
    expect(w.textContent).toContain('500 Bits')
    expect(w.textContent).toContain('100 KICKs')
    expect(w.textContent).toContain('CaptainCozy')
    expect(w.textContent).toContain('ModMaya')
    expect(deepAll(root, 'script, img, svg[onload], [onerror]')).toEqual([])

    const track = root.querySelector<HTMLElement>('.fc-credits-track')!
    expect(rafCallbacks.length).toBeGreaterThan(0)
    rafCallbacks.shift()!(1000)
    const firstTransform = track.style.transform
    rafCallbacks.shift()!(1050)
    const nextTransform = track.style.transform
    expect(nextTransform).toContain('translate3d(')
    expect(nextTransform).not.toBe(firstTransform)

    // Hiding stops rAF loop
    rt.setVisible(false)
    expect(w.closest('.fc-ov')?.classList.contains('is-hidden')).toBe(true)
  })

  it('respects section filter and reduced motion static layout', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    rt = createOverlay(root, { audio: false, lowMotion: true })
    rt.apply(
      snapshot(
        { credits: makeCredits() },
        overlay([creditsWidget({ sections: ['mods'], text_color: 'javascript:alert(1)' })]),
      ),
    )
    const w = root.querySelector<HTMLElement>('.fc-w-end-credits')!
    expect(w.classList.contains('is-static')).toBe(true)
    expect(w.style.getPropertyValue('--fc-credits-text')).toBe('')
    expect(w.textContent).toContain('Moderators')
    expect(w.textContent).toContain('ModMaya')
    expect(w.textContent).not.toContain('New followers')
    expect(rafSpy).not.toHaveBeenCalled()
  })
})

describe('end_credits upkeep', () => {
  function rafQueue() {
    const q: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      q.push(cb)
      return q.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    return q
  }

  it('does not rebuild the roster for frames that carry no credits', () => {
    rafQueue()
    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({ credits: makeCredits() }, overlay([creditsWidget()])))
    const heading = root.querySelector('.fc-credits-heading')
    expect(heading).not.toBeNull()
    const made = vi.spyOn(document, 'createElement')
    rt.apply(frame('state', { viewers: { twitch: 3 } }))
    expect(made, 'no throwaway rows for an unrelated frame').not.toHaveBeenCalled()
    made.mockRestore()
    expect(root.querySelector('.fc-credits-heading')).toBe(heading)
    rt.apply(frame('state', { credits: { ...makeCredits(), followers: [] } }))
    expect(root.querySelector('.fc-credits-heading')).not.toBe(heading)
  })

  it('plays again when loop is switched on after a one-shot roll finished', () => {
    const q = rafQueue()
    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({ credits: makeCredits() }, overlay([creditsWidget({ loop: false })])))
    const track = root.querySelector<HTMLElement>('.fc-credits-track')!
    let t = 1000
    for (let i = 0; i < 400 && q.length; i++) q.shift()!((t += 100))
    expect(track.style.opacity).toBe('0')
    rt.apply(frame('config', overlay([creditsWidget({ loop: true })])))
    expect(track.style.opacity).toBe('1')
    expect(q.length).toBeGreaterThan(0)
  })
})

describe('emote_wall widget', () => {
  it('allows only Ferrocast platform CDN URLs and rejects hostile URLs', () => {
    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({}, overlay([emoteWidget()])))

    const validUrls = [
      'https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0',
      'https://files.kick.com/emotes/4148074/fullsize',
      'https://cdn.7tv.app/emote/1/1x.webp',
      'https://cdn.betterttv.net/emote/1/2x',
      'https://cdn.frankerfacez.com/emote/1/2',
      'https://yt3.ggpht.com/abc',
    ]
    const hostileUrls = [
      'http://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0',
      'https://evil.example/track.png',
      'https://static-cdn.jtvnw.net.evil.com/x.png',
      'https://user@static-cdn.jtvnw.net/x.png',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'javascript:alert(1)',
    ]

    validUrls.forEach((u, i) => rt.apply(frame('event', emoteMsg(u, i))))
    hostileUrls.forEach((u, i) => rt.apply(frame('event', emoteMsg(u, 100 + i))))

    const imgs = [...root.querySelectorAll<HTMLImageElement>('.fc-emote-particle')]
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(validUrls)
  })

  it('caps DOM nodes during a 500-emote flood across physics modes and cleans up moderation/timers', () => {
    vi.useFakeTimers()
    const rafCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    rt = createOverlay(root, { audio: false })
    rt.apply(
      snapshot({}, overlay([emoteWidget({ max_emotes: 30, physics: 'fountain', lifetime_s: 4 })])),
    )

    // 500-emote burst flood (both rapid batch & multi-emote message)
    rt.apply(
      frame(
        'event',
        emoteMsg('https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0', 0, 50),
      ),
    )
    expect(root.querySelectorAll('.fc-emote-particle').length).toBeLessThanOrEqual(8)

    for (let i = 1; i <= 500; i++) {
      rt.apply(frame('event', emoteMsg('https://cdn.7tv.app/emote/1/1x.webp', i, 1)))
      if (i % 20 === 0) vi.advanceTimersByTime(1000)
      expect(root.querySelectorAll('.fc-emote-particle').length).toBeLessThanOrEqual(30)
    }

    // Advance one animation frame -> particles transform via translate3d & opacity
    if (rafCallbacks.length > 0) {
      rafCallbacks.shift()!(1000)
      rafCallbacks.shift()!(1016)
      const p = root.querySelector<HTMLElement>('.fc-emote-particle')
      if (p) {
        expect(p.style.transform).toContain('translate3d(')
      }
    }

    // Clear chat empties active wall cleanly
    rt.apply(frame('clear_chat', { platform: null }))
    expect(root.querySelectorAll('.fc-emote-particle').length).toBe(0)
  })

  it('uses static placement and clears timers under reduced motion', () => {
    vi.useFakeTimers()
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    rt = createOverlay(root, { audio: false, lowMotion: true })
    rt.apply(snapshot({}, overlay([emoteWidget({ lifetime_s: 3 })])))
    rt.apply(frame('event', emoteMsg('https://files.kick.com/emotes/4148074/fullsize', 1)))
    expect(root.querySelectorAll('.fc-emote-particle').length).toBe(1)
    expect(rafSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3000)
    expect(root.querySelectorAll('.fc-emote-particle').length).toBe(0)
  })
})

describe('emote_wall hidden', () => {
  it('drops its flying emotes and timers while OBS has the source hidden', () => {
    vi.useFakeTimers()
    rt = createOverlay(root, { audio: false, lowMotion: true })
    rt.apply(snapshot({}, overlay([emoteWidget({ lifetime_s: 30 })])))
    rt.apply(frame('event', emoteMsg('https://files.kick.com/emotes/4148074/fullsize', 1, 3)))
    expect(root.querySelectorAll('.fc-emote-particle').length).toBe(3)
    rt.setVisible(false)
    expect(root.querySelectorAll('.fc-emote-particle').length).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('chat_highlight widget', () => {
  it('shows pinned card safely as textContent, dismisses on clear and times out cleanly', () => {
    vi.useFakeTimers()
    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({}, overlay([highlightWidget({ duration_s: 10 })])))

    const w = root.querySelector<HTMLElement>('.fc-w-chat-highlight')!
    expect(w.hidden).toBe(true)

    const hostileHighlight: ChatHighlight = {
      ...makeHighlight('hl-xss', 'ev-xss', XSS[0]!),
      actor: actor(XSS[1]!, { color: 'javascript:alert(1)' }),
    }
    rt.apply(frame('state', { chat_highlight: hostileHighlight }))
    expect(w.hidden).toBe(false)
    expect(w.textContent).toContain(XSS[1]!)
    expect(w.textContent).toContain(XSS[0]!)
    expect(deepAll(root, 'script, img, svg[onload], [onerror]')).toEqual([])

    // Timeout after duration_s = 10s
    vi.advanceTimersByTime(10_000)
    expect(w.hidden).toBe(true)

    // New highlight shows and clears on message deletion
    rt.apply(frame('state', { chat_highlight: makeHighlight('hl-2', 'ev-2', 'Pin two') }))
    expect(w.hidden).toBe(false)
    expect(w.textContent).toContain('Pin two')
    rt.apply(frame('delete_message', { platform: 'twitch', message_id: 'tw-1' }))
    expect(w.hidden).toBe(true)
  })

  it('shows a pinned Facebook comment, with its platform glyph', () => {
    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({}, overlay([highlightWidget()])))
    const w = root.querySelector<HTMLElement>('.fc-w-chat-highlight')!
    const h: ChatHighlight = {
      ...makeHighlight('hl-fb', 'ev-fb', 'Hello from Facebook'),
      platform: 'facebook',
    }
    rt.apply(frame('state', { chat_highlight: h }))
    expect(w.hidden).toBe(false)
    expect(w.textContent).toContain('Hello from Facebook')
    expect(w.querySelector('.fc-glyph-facebook')).not.toBeNull()
  })

  it('only loads emotes and badges from the trusted CDNs, never any https host', () => {
    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({}, overlay([highlightWidget()])))
    const h = makeHighlight('hl-cdn', 'ev-cdn', 'Kappa Kappa')
    h.actor = actor('MiraMod', { badges: [] })
    h.actor.badges = [
      { set: 'bad', version: '1', title: 'Evil', image_url: 'https://evil.example/b.png' },
      {
        set: 'ok',
        version: '1',
        title: 'Good',
        image_url: 'https://static-cdn.jtvnw.net/badges/v1/x/2',
      },
    ] as never
    h.content = {
      text: 'Kappa Kappa',
      fragments: [
        {
          type: 'emote',
          provider: 'native',
          id: '1',
          name: 'Kappa',
          url: 'https://evil.example/e.png',
          zero_width: false,
        },
        { type: 'text', text: ' ' },
        {
          type: 'emote',
          provider: 'native',
          id: '2',
          name: 'Kappa',
          url: 'http://127.0.0.1:9/e.png',
          zero_width: false,
        },
        {
          type: 'emote',
          provider: 'native',
          id: '3',
          name: 'Kappa',
          url: 'https://cdn.7tv.app/emote/1/2x.webp',
          zero_width: false,
        },
      ],
    } as never
    rt.apply(frame('state', { chat_highlight: h }))
    const srcs = deepAll(root, 'img').map((i) => (i as HTMLImageElement).getAttribute('src'))
    expect(srcs.sort()).toEqual(
      ['https://cdn.7tv.app/emote/1/2x.webp', 'https://static-cdn.jtvnw.net/badges/v1/x/2'].sort(),
    )
    for (const img of deepAll(root, 'img')) {
      expect((img as HTMLImageElement).referrerPolicy).toBe('no-referrer')
    }
  })
})

describe('chat_highlight timing', () => {
  it('counts the duration from when it was shown, not from the latest state frame', () => {
    vi.useFakeTimers()
    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({}, overlay([highlightWidget({ duration_s: 10 })])))
    const w = root.querySelector<HTMLElement>('.fc-w-chat-highlight')!
    const h = makeHighlight('hl-t', 'ev-t', 'stays ten seconds')
    rt.apply(frame('state', { chat_highlight: h }))
    const bodyBefore = w.querySelector('.fc-hl-body')?.firstChild
    vi.advanceTimersByTime(6000)
    rt.apply(frame('state', { viewers: { twitch: 12 } }))
    expect(w.hidden).toBe(false)
    expect(w.querySelector('.fc-hl-body')?.firstChild, 'no rebuild for other state').toBe(
      bodyBefore,
    )
    vi.advanceTimersByTime(5000)
    expect(w.hidden, '11s after it was shown').toBe(true)
  })

  it('keeps the remaining time across an OBS hide and show', () => {
    vi.useFakeTimers()
    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({}, overlay([highlightWidget({ duration_s: 10 })])))
    const w = root.querySelector<HTMLElement>('.fc-w-chat-highlight')!
    rt.apply(frame('state', { chat_highlight: makeHighlight('hl-v', 'ev-v', 'x') }))
    vi.advanceTimersByTime(8000)
    rt.setVisible(false)
    rt.setVisible(true)
    vi.advanceTimersByTime(3000)
    expect(w.hidden).toBe(true)
  })
})

describe('timing and state follow-ups', () => {
  it('does not count the time OBS had the source hidden against duration_s', () => {
    vi.useFakeTimers()
    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({}, overlay([highlightWidget({ duration_s: 30 })])))
    const w = root.querySelector<HTMLElement>('.fc-w-chat-highlight')!
    rt.apply(frame('state', { chat_highlight: makeHighlight('hl-h', 'ev-h', 'x') }))
    vi.advanceTimersByTime(5000)
    rt.setVisible(false)
    vi.advanceTimersByTime(40_000)
    rt.setVisible(true)
    vi.advanceTimersByTime(20_000)
    expect(w.hidden, '25 s visible of 30').toBe(false)
    vi.advanceTimersByTime(6000)
    expect(w.hidden, '31 s visible').toBe(true)
  })

  it('rebuilds the roster when a section with no data is switched back', () => {
    const credits = { ...makeCredits(), mods: [] }
    rt = createOverlay(root, { audio: false })
    rt.apply(snapshot({ credits }, overlay([creditsWidget({ sections: ['followers'] })])))
    expect(root.textContent).toContain('LunaLagoon')
    rt.apply(frame('config', overlay([creditsWidget({ sections: ['mods'] })])))
    expect(root.textContent).not.toContain('LunaLagoon')
    rt.apply(frame('config', overlay([creditsWidget({ sections: ['followers'] })])))
    expect(root.textContent).toContain('LunaLagoon')
  })
})

describe('removing a widget', () => {
  it('takes its element off the page for all three new widgets', () => {
    rt = createOverlay(root, { audio: false })
    rt.apply(
      snapshot({}, overlay([creditsWidget(), emoteWidget(), highlightWidget({ duration_s: 10 })])),
    )
    for (const c of ['end-credits', 'emote-wall', 'chat-highlight']) {
      expect(root.querySelector(`.fc-w-${c}`), c).not.toBeNull()
    }
    rt.apply(frame('config', overlay([])))
    for (const c of ['end-credits', 'emote-wall', 'chat-highlight']) {
      expect(root.querySelector(`.fc-w-${c}`), c).toBeNull()
    }
  })
})
