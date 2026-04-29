import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOverlay, type OverlayRuntime } from '../src/runtime'
import { playAlertPreview, THEME_IDS } from '../src/index'
import { safeImageUrl, safeMediaUrl, readableColor, luminance, safeText } from '../src/dom'
import {
  XSS,
  actor,
  alert,
  chat,
  deepAll,
  deepText,
  follow,
  frame,
  overlay,
  snapshot,
  widgets,
} from './helpers'

let root: HTMLElement
let sent: string[]
let rt: OverlayRuntime

const acks = () =>
  sent.map((s) => JSON.parse(s) as { type: string; data: { alert_id: string; phase: string } })
const dangerous = () => deepAll(root, 'script, iframe, object, embed, [onerror], [onload], a[href]')

beforeEach(() => {
  vi.useFakeTimers()
  document.body.replaceChildren()
  root = document.createElement('div')
  document.body.appendChild(root)
  sent = []
  rt = createOverlay(root, { send: (d) => sent.push(d), audio: false })
})
afterEach(() => {
  rt.destroy()
  vi.useRealTimers()
})

describe('snapshot first', () => {
  it('ignores every frame before the first snapshot', () => {
    rt.apply(frame('event', chat('early', 'too soon')))
    rt.apply(frame('alert', alert('a0')))
    expect(root.querySelectorAll('.fc-w').length).toBe(0)
    rt.apply(snapshot())
    expect(root.querySelectorAll('.fc-w').length).toBe(6)
    expect(deepText(root)).not.toContain('too soon')
    expect(sent).toEqual([])
  })

  it('renders all six widgets with snapshot state, nothing blank', () => {
    rt.apply(snapshot({ chat: [chat('kuro', 'hello there')], events: [follow('LunaLagoon')] }))
    expect(root.querySelector('.fc-w-chat')?.textContent).toContain('hello there')
    expect(root.querySelector('.fc-w-events')?.textContent).toContain('LunaLagoon')
    expect(root.querySelector('.fc-goal-nums')?.textContent).toBe('20 / 50')
    expect(root.querySelector('.fc-label-text')?.textContent).toBe('Latest: LunaLagoon')
    expect(root.querySelector('.fc-viewers-count')?.textContent).toBe('500')
    const box = root.querySelector('.fc-w-chat') as HTMLElement
    expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual([
      '40px',
      '560px',
      '520px',
      '480px',
    ])
  })

  it('survives garbage state in a snapshot', () => {
    rt.apply({
      v: 1,
      seq: 1,
      type: 'snapshot',
      data: {
        overlay: overlay(),
        state: { goals: 'x', labels: [], viewers: null, events: 7, chat: {} } as never,
      },
    })
    expect(root.querySelectorAll('.fc-w').length).toBe(6)
    expect((root.querySelector('.fc-w-goal') as HTMLElement).hidden).toBe(true)
  })

  it('skips unknown widget kinds and frame types', () => {
    const ws = [
      ...widgets(),
      { id: 'wx', kind: 'teleporter', x: 0, y: 0, w: 10, h: 10, config: {} } as never,
    ]
    rt.apply(snapshot({}, overlay(ws)))
    expect(root.querySelectorAll('.fc-w').length).toBe(6)
    expect(() => rt.apply({ v: 1, seq: 9, type: 'create_event', data: {} } as never)).not.toThrow()
  })
})

describe('viewer text is text (R-37)', () => {
  it('names, messages, alerts, labels and goals never become markup', () => {
    rt.apply(
      snapshot({
        goals: [
          {
            id: 'g1',
            title: XSS[0] as string,
            kind: 'subs',
            target: 5,
            currency: null,
            starts_at: 0,
            ends_at: null,
            current: 1,
          },
        ],
        labels: { wl: XSS[1] as string },
      }),
    )
    for (const x of XSS) {
      rt.apply(frame('event', chat(x, x)))
      rt.apply(frame('event', follow(x)))
    }
    rt.apply(
      frame('alert', alert('x1', { title: XSS[0] as string, body: XSS[1] as string, css: '' })),
    )
    expect(dangerous()).toHaveLength(0)
    expect(deepAll(root, 'img')).toHaveLength(0)
    const text = deepText(root)
    for (const x of XSS) expect(text).toContain(x)
  })

  it('caps huge names and messages', () => {
    rt.apply(snapshot())
    const huge = 'A'.repeat(10_000)
    rt.apply(frame('event', chat(huge, huge)))
    const line = root.querySelector('.fc-msg') as HTMLElement
    expect(line.querySelector('.fc-name')?.textContent?.length).toBeLessThanOrEqual(60)
    expect(line.querySelector('.fc-text')?.textContent?.length).toBeLessThanOrEqual(501)
    rt.apply(frame('alert', alert('big', { title: huge, body: huge })))
    expect(deepAll(root, '.al-title')[0]?.textContent?.length).toBeLessThanOrEqual(300)
  })

  it('tames RTL overrides and zalgo, keeps emoji and scripts', () => {
    rt.apply(snapshot())
    const zalgo = 'Z' + '̶'.repeat(60) + 'oe'
    rt.apply(frame('event', chat('evil‮name', zalgo)))
    rt.apply(frame('event', chat('مرحبا', 'سلام 🎮 नमस्ते')))
    const names = [...root.querySelectorAll('.fc-name')].map((n) => n.textContent)
    expect(names).toEqual(['evilname', 'مرحبا'])
    const texts = [...root.querySelectorAll('.fc-text')].map((n) => n.textContent ?? '')
    expect(Array.from(texts[0] ?? '').length).toBeLessThan(10)
    expect(texts[1]).toBe('سلام 🎮 नमस्ते')
    expect(root.querySelector('.fc-name')?.getAttribute('dir')).toBe('auto')
  })

  it('emotes only load from safe URLs; javascript: renders as the name', () => {
    rt.apply(snapshot())
    const e = chat('kai', 'Kappa hi LUL')
    if (e.kind.type === 'chat_message')
      e.kind.content.fragments = [
        {
          type: 'emote',
          provider: 'native',
          id: '1',
          name: 'Kappa',
          url: 'javascript:alert(1)',
          zero_width: false,
        },
        { type: 'text', text: ' hi ' },
        {
          type: 'emote',
          provider: 'seven_tv',
          id: '2',
          name: 'LUL',
          url: 'https://cdn.7tv.app/emote/2/1x.webp',
          zero_width: false,
        },
        {
          type: 'emote',
          provider: 'bttv',
          id: '3',
          name: 'tab',
          url: 'java\tscript:alert(1)',
          zero_width: false,
        },
        { type: 'link', url: 'javascript:alert(2)' },
        { type: 'mention', login: '<b>x</b>' },
      ]
    rt.apply(frame('event', e))
    const imgs = [...root.querySelectorAll('.fc-emote')] as HTMLImageElement[]
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['https://cdn.7tv.app/emote/2/1x.webp'])
    const line = root.querySelector('.fc-text')?.textContent ?? ''
    expect(line).toContain('Kappa')
    expect(line).toContain('javascript:alert(2)')
    expect(line).toContain('@<b>x</b>')
    expect(root.querySelectorAll('a').length).toBe(0)
  })

  it('ignores unsafe name colours and badge URLs', () => {
    rt.apply(snapshot())
    rt.apply(
      frame(
        'event',
        chat(
          'c',
          'hi',
          {},
          {
            color: 'red;background:url(javascript:alert(1))',
            badges: [{ set: 'mod', version: '1', title: 'Mod', image_url: 'javascript:alert(1)' }],
          },
        ),
      ),
    )
    const name = root.querySelector('.fc-name') as HTMLElement
    expect(name.style.color).toBe('')
    expect(root.querySelectorAll('.fc-badge').length).toBe(0)
  })
})

describe('chat', () => {
  it('stays bounded after 5,000 messages', () => {
    rt.apply(snapshot())
    for (let i = 0; i < 5000; i++) rt.apply(frame('event', chat(`u${i % 40}`, `message ${i}`)))
    expect(root.querySelectorAll('.fc-msg').length).toBe(30)
    expect(root.querySelector('.fc-msg:last-child .fc-text')?.textContent).toBe('message 4999')
  })

  it('hides commands and bots, filters platforms', () => {
    const ws = widgets()
    const c = ws[1]
    if (c?.kind === 'chat') c.config.platforms = ['twitch']
    rt.apply(snapshot({}, overlay(ws)))
    rt.apply(frame('event', chat('a', '!discord')))
    rt.apply(frame('event', chat('Nightbot', 'beep', {}, { roles: 256 })))
    rt.apply(frame('event', chat('yt', 'from youtube', { platform: 'youtube' })))
    rt.apply(frame('event', chat('b', 'kept')))
    expect([...root.querySelectorAll('.fc-text')].map((n) => n.textContent)).toEqual(['kept'])
  })

  it('removes deleted messages, banned users and cleared chats', () => {
    rt.apply(snapshot())
    const m1 = chat('alice', 'one')
    const m2 = chat('bob', 'two')
    const m3 = chat('bob', 'three')
    const m4 = chat('yt', 'four', { platform: 'youtube' })
    for (const m of [m1, m2, m3, m4]) rt.apply(frame('event', m))
    rt.apply(frame('delete_message', { platform: 'twitch', message_id: m1.source_id ?? '' }))
    expect(root.querySelectorAll('.fc-msg').length).toBe(3)
    rt.apply(frame('delete_user', { platform: 'twitch', user_id: 'u-bob' }))
    expect([...root.querySelectorAll('.fc-text')].map((n) => n.textContent)).toEqual(['four'])
    rt.apply(frame('clear_chat', { platform: 'kick' }))
    expect(root.querySelectorAll('.fc-msg').length).toBe(1)
    rt.apply(frame('clear_chat', { platform: null }))
    expect(root.querySelectorAll('.fc-msg').length).toBe(0)
  })

  it('fades lines after fade_after_s', () => {
    const ws = widgets()
    const c = ws[1]
    if (c?.kind === 'chat') c.config.fade_after_s = 5
    rt.apply(snapshot({}, overlay(ws)))
    rt.apply(frame('event', chat('a', 'bye soon')))
    vi.advanceTimersByTime(5000)
    expect(root.querySelector('.fc-msg')?.classList.contains('is-gone')).toBe(true)
    vi.advanceTimersByTime(500)
    expect(root.querySelectorAll('.fc-msg').length).toBe(0)
  })

  it('nudges unreadable name colours', () => {
    expect(readableColor('#000000', true)).not.toBe('#000000')
    expect(luminance(readableColor('#050510', true) ?? '#000000')).toBeGreaterThanOrEqual(0.2)
    expect(readableColor('#ffffff', false)).not.toBe('#ffffff')
    expect(readableColor('#7fb4ff', true)).toBe('#7fb4ff')
    expect(readableColor('blue', true)).toBeNull()
  })
})

describe('alerts', () => {
  it('plays one at a time, acks started then finished, in order', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('a1')))
    rt.apply(frame('alert', alert('a2')))
    expect(deepAll(root, '.al').length).toBe(1)
    expect(acks().map((a) => `${a.data.alert_id}:${a.data.phase}`)).toEqual(['a1:started'])
    vi.advanceTimersByTime(2000 + 300)
    expect(acks().map((a) => `${a.data.alert_id}:${a.data.phase}`)).toEqual([
      'a1:started',
      'a1:finished',
    ])
    vi.advanceTimersByTime(250)
    expect(acks().at(-1)?.data).toEqual({ alert_id: 'a2', phase: 'started' })
    vi.advanceTimersByTime(2300)
    expect(acks().at(-1)?.data).toEqual({ alert_id: 'a2', phase: 'finished' })
    expect(deepAll(root, '.al').length).toBe(0)
  })

  it('a duplicate alert_id plays once', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('dup')))
    rt.apply(frame('alert', alert('dup')))
    vi.advanceTimersByTime(10_000)
    rt.apply(frame('alert', alert('dup')))
    vi.advanceTimersByTime(10_000)
    expect(acks().filter((a) => a.data.phase === 'started')).toHaveLength(1)
  })

  it('alert_hide ends the current alert at once', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('h1', { duration_ms: 30_000 })))
    rt.apply(frame('alert_hide', { alert_id: 'h1' }))
    expect(deepAll(root, '.al.is-out').length).toBe(1)
    vi.advanceTimersByTime(300)
    expect(acks().at(-1)?.data).toEqual({ alert_id: 'h1', phase: 'finished' })
  })

  it('alert_hide for a waiting alert removes it without playing', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('p1')))
    rt.apply(frame('alert', alert('p2')))
    rt.apply(frame('alert_hide', { alert_id: 'p2' }))
    vi.advanceTimersByTime(20_000)
    expect(acks().some((a) => a.data.alert_id === 'p2')).toBe(false)
  })

  it('clamps silly durations', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('z', { duration_ms: 0 })))
    vi.advanceTimersByTime(999)
    expect(acks()).toHaveLength(1)
    vi.advanceTimersByTime(400)
    expect(acks().at(-1)?.data.phase).toBe('finished')
  })

  it('respects rule_ids on the widget and never acks alerts it does not show', () => {
    const ws = widgets()
    const a = ws[0]
    if (a?.kind === 'alerts') a.config.rule_ids = ['tip']
    rt.apply(snapshot({}, overlay(ws)))
    rt.apply(frame('alert', alert('nope', { rule_id: 'follow' })))
    expect(deepAll(root, '.al').length).toBe(0)
    expect(sent).toEqual([])
  })

  it('keeps streamer CSS inside the alert shadow root', () => {
    rt.apply(snapshot())
    rt.apply(
      frame('alert', alert('css', { css: '.al-title { color: red } body { display: none }' })),
    )
    const host = root.querySelector('.fc-alert-host') as HTMLElement
    expect(host.shadowRoot).toBeTruthy()
    const styles = [...(host.shadowRoot?.querySelectorAll('style') ?? [])].map((s) => s.textContent)
    expect(styles.some((s) => s?.includes('body { display: none }'))).toBe(true)
    expect(document.head.querySelectorAll('style').length).toBe(0)
  })

  it('a theme or layout it does not know falls back safely', () => {
    const ws = widgets()
    const a = ws[0]
    if (a?.kind === 'alerts') a.config.theme = '"><script>'
    rt.apply(snapshot({}, overlay(ws)))
    rt.apply(frame('alert', alert('t', { layout: 'explode' })))
    const card = deepAll(root, '.al')[0] as HTMLElement
    expect(card.dataset.theme).toBe('molten')
    expect(card.dataset.layout).toBe('stack')
  })

  it('a rejected audio play still shows the alert and acks', async () => {
    const play = vi.fn(() => Promise.reject(new Error('NotAllowedError')))
    const OrigAudio = globalThis.Audio
    globalThis.Audio = vi.fn(function (this: {
      play: unknown
      volume: number
      addEventListener: unknown
      pause: unknown
    }) {
      this.play = play
      this.volume = 1
      this.addEventListener = () => {}
      this.pause = () => {}
    }) as unknown as typeof Audio
    const loud = createOverlay(document.createElement('div'), {
      send: (d) => sent.push(d),
      audio: true,
    })
    loud.apply(snapshot())
    loud.apply(frame('alert', alert('snd', { sound: 'data:audio/wav;base64,AAAA', volume: 250 })))
    await Promise.resolve()
    expect(play).toHaveBeenCalled()
    vi.advanceTimersByTime(2300)
    expect(acks().map((a) => a.data.phase)).toEqual(['started', 'finished'])
    loud.destroy()
    globalThis.Audio = OrigAudio
  })

  it('refuses unsafe media URLs', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('img', { image: 'javascript:alert(1)' })))
    expect(deepAll(root, 'img, video').length).toBe(0)
    vi.advanceTimersByTime(3000)
    rt.apply(frame('alert', alert('img2', { image: 'media/abc.webm' })))
    vi.advanceTimersByTime(10)
    expect(deepAll(root, 'video').length).toBe(1)
  })

  it('a broken alert acks failed and the next one still plays', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('bad', { title: 5 as unknown as string })))
    rt.apply(frame('alert', alert('good')))
    vi.advanceTimersByTime(10)
    expect(acks().map((a) => `${a.data.alert_id}:${a.data.phase}`)).toEqual([
      'bad:failed',
      'good:started',
    ])
  })

  it('removing the alerts widget mid-alert releases the queue', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('mid', { duration_ms: 20_000 })))
    rt.apply(frame('config', overlay(widgets().filter((w) => w.kind !== 'alerts'))))
    expect(acks().at(-1)?.data).toEqual({ alert_id: 'mid', phase: 'finished' })
  })
})

describe('state, config and visibility', () => {
  it('merges partial state', () => {
    rt.apply(snapshot())
    rt.apply(frame('state', { viewers: { kick: 57 } }))
    expect(root.querySelector('.fc-viewers-count')?.textContent).toBe('557')
    rt.apply(frame('state', { labels: { wl: 'Latest: pixelpilgrim' } }))
    expect(root.querySelector('.fc-label-text')?.textContent).toBe('Latest: pixelpilgrim')
    rt.apply(
      frame('state', {
        goals: [
          {
            id: 'g1',
            title: 'Sub goal',
            kind: 'subs',
            target: 50,
            currency: null,
            starts_at: 0,
            ends_at: null,
            current: 80,
          },
        ],
      }),
    )
    expect(root.querySelector('.fc-w-goal')?.classList.contains('is-done')).toBe(true)
    expect((root.querySelector('.fc-goal-fill') as HTMLElement).style.transform).toBe('scaleX(1)')
  })

  it('formats money goals in major units', () => {
    rt.apply(
      snapshot({
        goals: [
          {
            id: 'g1',
            title: 'Tips',
            kind: 'tips',
            target: 10_000,
            currency: 'INR',
            starts_at: 0,
            ends_at: null,
            current: 3450,
          },
        ],
      }),
    )
    expect(root.querySelector('.fc-goal-nums')?.textContent).toBe('₹3,450 / ₹10,000')
  })

  it('config re-renders in place, keeping widgets that stayed', () => {
    rt.apply(snapshot())
    rt.apply(frame('event', chat('a', 'still here')))
    const chatEl = root.querySelector('.fc-w-chat')
    const ws = widgets().filter((w) => w.kind !== 'goal')
    const c = ws.find((w) => w.kind === 'chat')
    if (c) c.x = 100
    rt.apply(frame('config', overlay(ws)))
    expect(root.querySelector('.fc-w-chat')).toBe(chatEl)
    expect((chatEl as HTMLElement).style.left).toBe('100px')
    expect(root.querySelector('.fc-w-goal')).toBeNull()
    expect(root.textContent).toContain('still here')
  })

  it('hidden pauses animation; widgets learn about it', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('v1')))
    rt.setVisible(false)
    expect(root.querySelector('.fc-ov')?.classList.contains('is-hidden')).toBe(true)
    expect(deepAll(root, '.al.is-paused').length).toBe(1)
    rt.setVisible(true)
    expect(deepAll(root, '.al.is-paused').length).toBe(0)
  })

  it('unknown event kinds are ignored', () => {
    rt.apply(snapshot())
    expect(() =>
      rt.apply(
        frame('event', {
          ...follow('x'),
          kind: { type: 'hype_train_level_9000', actor: actor('x') } as never,
        }),
      ),
    ).not.toThrow()
    expect(root.querySelectorAll('.fc-ev').length).toBe(0)
  })
})

describe('preview helpers', () => {
  it('playAlertPreview loops without sending anything', () => {
    const stage = document.createElement('div')
    const stop = playAlertPreview(stage, alert('pv', { duration_ms: 1000 }), {
      theme: 'sticker',
      loop: true,
    })
    expect(deepAll(stage, '.al[data-theme="sticker"]').length).toBe(1)
    vi.advanceTimersByTime(1000 + 300 + 950)
    expect(deepAll(stage, '.al').length).toBe(1)
    stop()
    expect(stage.childElementCount).toBe(0)
  })
  it('exports the five themes', () => {
    expect(THEME_IDS).toEqual(['molten', 'daylight', 'arcade', 'minimal', 'sticker'])
  })
})

describe('url and text rules', () => {
  it('safeImageUrl', () => {
    expect(safeImageUrl('https://cdn.example/x.png')).toBe('https://cdn.example/x.png')
    expect(safeImageUrl('http://127.0.0.1:47820/o/t/media/1')).toBe(
      'http://127.0.0.1:47820/o/t/media/1',
    )
    expect(safeImageUrl('media/1')).toBe('media/1')
    expect(safeImageUrl('data:image/png;base64,AA')).toBe('data:image/png;base64,AA')
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:x',
      'http://evil.example/x.png',
      '//evil.example/x',
      'data:text/html,<b>',
      'vbscript:x',
      ' java\nscript:x',
      '',
      42,
      null,
    ])
      expect(safeImageUrl(bad), String(bad)).toBeNull()
    expect(safeMediaUrl('data:audio/wav;base64,AA')).toBe('data:audio/wav;base64,AA')
    expect(safeMediaUrl('data:text/html;base64,AA')).toBeNull()
  })
  it('safeText caps by characters', () => {
    expect(Array.from(safeText('🎮'.repeat(1000), 10)).length).toBe(10)
    expect(safeText(undefined)).toBe('')
  })
})

describe('tts and revoked frames', () => {
  it('speaks an approved TTS message once, never while hidden', () => {
    const speak = vi.fn()
    const cancel = vi.fn()
    const g = globalThis as unknown as {
      speechSynthesis?: unknown
      SpeechSynthesisUtterance?: unknown
    }
    const prev = [g.speechSynthesis, g.SpeechSynthesisUtterance]
    g.speechSynthesis = { speak, cancel }
    g.SpeechSynthesisUtterance = function (this: { text: string }, t: string) {
      this.text = t
    }
    const talk = createOverlay(document.createElement('div'), { audio: true })
    talk.apply(snapshot())
    talk.apply(frame('tts', { id: 't1', text: 'Keep it up <script>', audio: null }))
    talk.apply(frame('tts', { id: 't1', text: 'Keep it up <script>', audio: null }))
    expect(speak).toHaveBeenCalledTimes(1)
    expect((speak.mock.calls[0]?.[0] as { text: string }).text).toBe('Keep it up <script>')
    talk.setVisible(false)
    expect(cancel).toHaveBeenCalled()
    talk.apply(frame('tts', { id: 't2', text: 'hidden', audio: null }))
    expect(speak).toHaveBeenCalledTimes(1)
    talk.setVisible(true)
    talk.apply(frame('tts', { id: 't3', text: 'x'.repeat(5000), audio: null }))
    expect((speak.mock.calls[1]?.[0] as { text: string }).text.length).toBeLessThanOrEqual(500)
    talk.destroy()
    ;[g.speechSynthesis, g.SpeechSynthesisUtterance] = prev
  })

  it('tts without speech synthesis is ignored quietly', () => {
    rt.apply(snapshot())
    expect(() => rt.apply(frame('tts', { id: 'n', text: 'hello', audio: null }))).not.toThrow()
  })

  it('revoked clears the page for good and sends nothing more', () => {
    rt.apply(snapshot({ chat: [chat('a', 'visible before')] }))
    rt.apply(frame('alert', alert('rv', { duration_ms: 20_000 })))
    rt.apply(frame('alert', alert('rv2')))
    const before = sent.length
    rt.apply(frame('revoked', {}))
    expect(rt.revoked).toBe(true)
    expect(root.querySelectorAll('.fc-w').length).toBe(0)
    expect(deepText(root)).toBe('')
    expect(sent.length).toBe(before)
    rt.apply(snapshot())
    rt.apply(frame('event', chat('b', 'after revoke')))
    expect(root.querySelectorAll('.fc-w').length).toBe(0)
  })
})

describe('review fixes', () => {
  const restyle = (theme: string) => {
    const ws = widgets()
    for (const w of ws) (w.config as { theme?: string }).theme = theme
    rt.apply(frame('config', overlay(ws)))
  }
  const lines = () => [...root.querySelectorAll('.fc-text')].map((n) => n.textContent)

  it('banned, cleared and deleted messages stay gone after a redraw', () => {
    rt.apply(snapshot())
    const a = chat('alice', 'keep me')
    const b = chat('bob', 'banned one')
    const y = chat('yt', 'youtube line', { platform: 'youtube' }, { platform: 'youtube' })
    const d = chat('dan', 'deleted one')
    for (const m of [a, b, y, d]) rt.apply(frame('event', m))
    rt.apply(frame('delete_user', { platform: 'twitch', user_id: 'u-bob' }))
    rt.apply(frame('delete_message', { platform: 'twitch', message_id: d.source_id ?? '' }))
    rt.apply(frame('clear_chat', { platform: 'youtube' }))
    restyle('daylight')
    expect(lines()).toEqual(['keep me'])
    rt.apply(frame('clear_chat', { platform: null }))
    restyle('arcade')
    expect(lines()).toEqual([])
  })

  it('faded lines are not brought back by a redraw', () => {
    const ws = widgets()
    const c = ws[1]
    if (c?.kind === 'chat') c.config.fade_after_s = 5
    rt.apply(snapshot({}, overlay(ws)))
    rt.apply(frame('event', chat('a', 'old news')))
    vi.advanceTimersByTime(6000)
    rt.apply(frame('event', chat('b', 'fresh')))
    const ws2 = widgets()
    const c2 = ws2[1]
    if (c2?.kind === 'chat') {
      c2.config.fade_after_s = 5
      c2.config.theme = 'sticker'
    }
    rt.apply(frame('config', overlay(ws2)))
    expect(lines()).toEqual(['fresh'])
  })

  it('a snapshot skips lines that would already have faded', () => {
    const ws = widgets()
    const c = ws[1]
    if (c?.kind === 'chat') c.config.fade_after_s = 10
    const old = chat('a', 'an hour ago', { received_at: Date.now() - 3_600_000 })
    const recent = chat('b', 'just now', { received_at: Date.now() - 1000 })
    rt.apply(snapshot({ chat: [old, recent] }, overlay(ws)))
    expect(lines()).toEqual(['just now'])
  })

  it('hidden freezes the alert clock and the queue; shown resumes with the time left', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('f1', { duration_ms: 4000 })))
    rt.apply(frame('alert', alert('f2', { duration_ms: 2000 })))
    vi.advanceTimersByTime(1000)
    rt.setVisible(false)
    vi.advanceTimersByTime(60_000)
    expect(acks().map((a) => `${a.data.alert_id}:${a.data.phase}`)).toEqual(['f1:started'])
    rt.setVisible(true)
    vi.advanceTimersByTime(2900)
    expect(acks().length).toBe(1)
    vi.advanceTimersByTime(100 + 300)
    expect(acks().at(-1)?.data).toEqual({ alert_id: 'f1', phase: 'finished' })
    vi.advanceTimersByTime(250)
    expect(acks().at(-1)?.data).toEqual({ alert_id: 'f2', phase: 'started' })
  })

  it('hidden between alerts stops dequeuing until shown', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('g1', { duration_ms: 1000 })))
    rt.apply(frame('alert', alert('g2', { duration_ms: 1000 })))
    vi.advanceTimersByTime(1000 + 300)
    rt.setVisible(false)
    vi.advanceTimersByTime(10_000)
    expect(acks().some((a) => a.data.alert_id === 'g2')).toBe(false)
    rt.setVisible(true)
    expect(acks().at(-1)?.data).toEqual({ alert_id: 'g2', phase: 'started' })
  })

  it('hiding pauses alert audio and showing resumes it', () => {
    const made: {
      paused: boolean
      ended: boolean
      currentTime: number
      pause: () => void
      play: () => Promise<void>
    }[] = []
    const OrigAudio = globalThis.Audio
    globalThis.Audio = vi.fn(function (
      this: (typeof made)[number] & { volume: number; addEventListener: unknown },
    ) {
      this.paused = false
      this.ended = false
      this.currentTime = 0.4
      this.volume = 1
      this.addEventListener = () => {}
      this.pause = () => {
        this.paused = true
      }
      this.play = () => {
        this.paused = false
        return Promise.resolve()
      }
      made.push(this)
    }) as unknown as typeof Audio
    const loud = createOverlay(document.createElement('div'), { audio: true })
    loud.apply(snapshot())
    loud.apply(frame('alert', alert('au', { sound: 'media/ding.mp3', duration_ms: 5000 })))
    expect(made).toHaveLength(1)
    loud.setVisible(false)
    expect(made[0]?.paused).toBe(true)
    loud.setVisible(true)
    expect(made[0]?.paused).toBe(false)
    loud.destroy()
    globalThis.Audio = OrigAudio
  })

  it('TTS after the sound plays once even if error and a rejected play both fire', async () => {
    const urls: string[] = []
    const OrigAudio = globalThis.Audio
    globalThis.Audio = vi.fn(function (
      this: { addEventListener: unknown; play: unknown; pause: unknown; volume: number },
      url: string,
    ) {
      urls.push(url)
      const listeners: Record<string, () => void> = {}
      this.volume = 1
      this.pause = () => {}
      this.addEventListener = (t: string, f: () => void) => {
        listeners[t] = f
      }
      this.play = () => {
        queueMicrotask(() => listeners.error?.())
        return Promise.reject(new Error('NotAllowedError'))
      }
    }) as unknown as typeof Audio
    const loud = createOverlay(document.createElement('div'), { audio: true })
    loud.apply(snapshot())
    loud.apply(frame('alert', alert('tt', { sound: 'media/ding.mp3', tts_audio: 'media/tts.wav' })))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(urls).toEqual(['media/ding.mp3', 'media/tts.wav'])
    loud.destroy()
    globalThis.Audio = OrigAudio
  })

  it('engine media ids resolve under the overlay page; no WAV yet means the browser speaks tts_text', async () => {
    const urls: string[] = []
    const spoken: string[] = []
    const g = globalThis as unknown as {
      speechSynthesis?: unknown
      SpeechSynthesisUtterance?: unknown
    }
    const prev = [g.speechSynthesis, g.SpeechSynthesisUtterance]
    g.speechSynthesis = { speak: (u: { text: string }) => spoken.push(u.text), cancel: () => {} }
    g.SpeechSynthesisUtterance = function (this: { text: string }, t: string) {
      this.text = t
    }
    const OrigAudio = globalThis.Audio
    globalThis.Audio = vi.fn(function (
      this: { addEventListener: unknown; play: unknown; pause: unknown; volume: number },
      url: string,
    ) {
      urls.push(url)
      const listeners: Record<string, () => void> = {}
      this.volume = 1
      this.pause = () => {}
      this.addEventListener = (t: string, f: () => void) => {
        listeners[t] = f
      }
      this.play = () => {
        queueMicrotask(() => listeners.ended?.())
        return Promise.resolve()
      }
    }) as unknown as typeof Audio
    const loud = createOverlay(document.createElement('div'), { audio: true })
    loud.apply(snapshot())
    loud.apply(
      frame('alert', alert('id1', { sound: 'm-chime', tts_audio: null, tts_text: 'Keep it up!' })),
    )
    for (let i = 0; i < 4; i++) await Promise.resolve()
    expect(urls).toEqual(['media/m-chime'])
    expect(spoken).toEqual(['Keep it up!'])
    // An approved TTS frame with a rendered WAV plays it instead of speaking.
    loud.apply(frame('tts', { id: 'w1', text: 'read me', audio: 'tts-42' }))
    expect(urls.at(-1)).toBe('media/tts-42')
    expect(spoken).toEqual(['Keep it up!'])
    // A hostile audio value is refused and the text is spoken instead.
    loud.apply(frame('tts', { id: 'w2', text: 'fallback', audio: 'javascript:alert(1)' }))
    expect(urls).not.toContain('javascript:alert(1)')
    expect(spoken).toContain('fallback')
    loud.destroy()
    globalThis.Audio = OrigAudio
    ;[g.speechSynthesis, g.SpeechSynthesisUtterance] = prev
  })

  it('removing the alerts widget acks queued alerts as failed', () => {
    rt.apply(snapshot())
    rt.apply(frame('alert', alert('q1', { duration_ms: 20_000 })))
    rt.apply(frame('alert', alert('q2')))
    rt.apply(frame('alert', alert('q3')))
    rt.apply(frame('config', overlay(widgets().filter((w) => w.kind !== 'alerts'))))
    expect(acks().map((a) => `${a.data.alert_id}:${a.data.phase}`)).toEqual([
      'q1:started',
      'q1:finished',
      'q2:failed',
      'q3:failed',
    ])
  })

  it('the events widget forgets old ids, so its memory stays bounded', () => {
    rt.apply(snapshot())
    const first = follow('first-follower')
    rt.apply(frame('event', first))
    for (let i = 0; i < 400; i++) rt.apply(frame('event', follow(`f${i}`)))
    rt.apply(frame('event', { ...first, seq: 99_999 }))
    expect(root.querySelector('.fc-ev .fc-ev-name')?.textContent).toBe('first-follower')
  })
})
