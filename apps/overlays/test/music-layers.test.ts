// The 25 Oct layers through the real overlay runtime: timer looks, motion backgrounds, the
// music piece (song titles from other apps are untrusted text) and the sound element.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Widget } from '@ferrocast/api/types'

const played: { name: string; volume: number; loop: boolean }[] = []
const stopped: string[] = []
vi.mock('../src/design/screen-sounds', () => ({
  SCREEN_SOUNDS: {},
  unlockScreenAudio: () => undefined,
  playUrl: (url: string, volume: number, loop = false) => {
    played.push({ name: `url:${url}`, volume, loop })
    return { setVolume: () => undefined, stop: () => stopped.push(url) }
  },
  playScreenSound: (name: string, volume: number, loop = false) => {
    const me = { name, volume, loop }
    played.push(me)
    return {
      setVolume: (v: number) => {
        me.volume = v
      },
      stop: () => stopped.push(name),
    }
  },
}))

import { createOverlay, parseMusic, type OverlayRuntime } from '../src/runtime'
import { clearTimers, reportTimer, timerEnd } from '../src/design/timers'
import { hex6 } from '../src/widgets/motion'
import { wordsText } from '../src/widgets/layer'
import { XSS, deepAll, frame, overlay, snapshot } from './helpers'

let root: HTMLElement
let rt: OverlayRuntime

const layer = (id: string, config: Record<string, unknown>, box = [100, 100, 600, 200]): Widget =>
  ({ id, kind: 'layer', x: box[0], y: box[1], w: box[2], h: box[3], config }) as unknown as Widget

function page(layers: Widget[], audio = true): void {
  rt?.destroy()
  rt = createOverlay(root, { send: () => undefined, audio })
  rt.apply(snapshot({}, overlay(layers)))
}

const music = (data: Record<string, unknown>) => frame('music', data as never)

beforeEach(() => {
  vi.useFakeTimers()
  document.body.replaceChildren()
  root = document.createElement('div')
  document.body.appendChild(root)
  played.length = 0
  stopped.length = 0
  clearTimers()
})
afterEach(() => {
  rt?.destroy()
  vi.useRealTimers()
})

describe('timer looks', () => {
  const t = () => (deepAll(root, '.fc-lt')[0] as HTMLElement).textContent

  it('words say how long is left in plain words', () => {
    expect([wordsText(300), wordsText(90), wordsText(60), wordsText(45), wordsText(1)]).toEqual([
      '5 minutes',
      '2 minutes',
      '1 minute',
      '45 seconds',
      '1 second',
    ])
    page([
      layer('cd', {
        type: 'text',
        text: 'Live in {time}',
        countdown: 300,
        countdown_look: 'words',
      }),
    ])
    expect(t()).toBe('Live in 5 minutes')
  })

  it('the ring and the bar empty as the timer counts down', () => {
    page([
      layer('ring', { type: 'text', text: '{time}', countdown: 100, countdown_look: 'ring' }),
      layer(
        'bar',
        { type: 'text', text: '{time}', countdown: 100, countdown_look: 'bar' },
        [100, 400, 600, 100],
      ),
    ])
    const ring = deepAll(root, '.fc-cd-ring .fill')[0] as SVGCircleElement
    const fill = deepAll(root, '.fc-cd-fill')[0] as HTMLElement
    expect(ring).toBeDefined()
    expect(Number(ring.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 1)
    vi.advanceTimersByTime(50_000)
    const len = Number(ring.getAttribute('stroke-dasharray'))
    expect(Number(ring.getAttribute('stroke-dashoffset'))).toBeCloseTo(len / 2, 0)
    expect(fill.style.transform).toBe('scaleX(0.5)')
  })

  it('flip cards hold one character each and change in place', () => {
    page([layer('cd', { type: 'text', text: '{time}', countdown: 75, countdown_look: 'flip' })])
    const cards = () => deepAll(root, '.fc-flip').map((c) => c.textContent)
    expect(cards()).toEqual(['0', '1', '1', '5'])
    expect(deepAll(root, '.fc-flip-sep').map((c) => c.textContent)).toEqual([':'])
    const first = deepAll(root, '.fc-flip')[0]
    vi.advanceTimersByTime(16_000)
    expect(cards()).toEqual(['0', '0', '5', '9'])
    expect(deepAll(root, '.fc-flip')[0]).toBe(first)
  })

  it('thin is a look of its own; an unknown look is digital', () => {
    page([
      layer('a', { type: 'text', text: '{time}', countdown: 60, countdown_look: 'thin' }),
      layer('b', { type: 'text', text: '{time}', countdown: 60, countdown_look: 'sundial' }),
    ])
    expect(deepAll(root, '.cd-thin')).toHaveLength(1)
    expect(deepAll(root, '[class*="cd-sundial"]')).toHaveLength(0)
  })

  it('a running timer tells the page when it ends, and stops telling when hidden', () => {
    const now = Date.now()
    page([layer('cd', { type: 'text', text: '{time}', countdown: 30 })])
    expect(timerEnd()).toBe(now + 30_000)
    rt.setVisible(false)
    expect(timerEnd()).toBeNull()
  })
})

describe('motion backgrounds', () => {
  it('draw on a canvas the size of the layer; a bad preset is the hex grid', () => {
    page([
      layer('bg', { type: 'fx', preset: 'nightdrive', reactive: true }, [0, 0, 1920, 1080]),
      layer('bad', { type: 'fx', preset: 'javascript:alert(1)' }),
    ])
    const canvases = deepAll(root, '.fc-w-fx canvas') as HTMLCanvasElement[]
    expect(canvases).toHaveLength(2)
    expect(canvases[0]?.width).toBeGreaterThanOrEqual(1920)
    expect(root.innerHTML).not.toContain('javascript')
  })

  it('colours come out as #rrggbb whatever the design wrote', () => {
    expect(hex6('#abc', '#000000')).toBe('#aabbcc')
    expect(hex6('#ffa42480', '#000000')).toBe('#ffa424')
    expect(hex6('transparent', '#123456')).toBe('#123456')
    expect(hex6('red;}', '#123456')).toBe('#123456')
  })

  it('a layer that becomes a motion background is rebuilt as one', () => {
    page([layer('l', { type: 'text', text: 'Hi' })])
    expect(deepAll(root, '.fc-w-fx')).toHaveLength(0)
    rt.apply(frame('config', overlay([layer('l', { type: 'fx', preset: 'orbit' })])))
    expect(deepAll(root, '.fc-w-fx')).toHaveLength(1)
    expect(deepAll(root, '.fc-layer-text')).toHaveLength(0)
  })
})

describe('the music piece', () => {
  it('shows only while music plays, with the song as text', () => {
    page([layer('m', { type: 'music', look: 'pulse' })])
    const piece = deepAll(root, '.fc-w-music')[0] as HTMLElement
    expect(piece.classList.contains('is-quiet')).toBe(true)
    rt.apply(music({ playing: true, level: 0.7, title: XSS[0], artist: XSS[1] }))
    expect(piece.classList.contains('is-quiet')).toBe(false)
    const song = deepAll(root, '.fc-music-song')[0] as HTMLElement
    expect(song.textContent).toBe(`${XSS[0]} · ${XSS[1]}`)
    expect(deepAll(root, '.fc-w-music img, .fc-w-music script, .fc-w-music iframe')).toHaveLength(0)
    rt.apply(music({ playing: false, level: 0, title: null, artist: null }))
    expect(piece.classList.contains('is-quiet')).toBe(true)
  })

  it('can always show, and can leave the song out', () => {
    page([layer('m', { type: 'music', only_playing: false, show_title: false })])
    const piece = deepAll(root, '.fc-w-music')[0] as HTMLElement
    expect(piece.classList.contains('is-quiet')).toBe(false)
    expect((deepAll(root, '.fc-music-song')[0] as HTMLElement).style.display).toBe('none')
  })

  it('music frames are checked field by field', () => {
    expect(parseMusic({ playing: true, level: 7, title: '', artist: 3 })).toEqual({
      playing: true,
      level: 1,
      title: null,
      artist: null,
    })
    expect(parseMusic({ playing: 'yes', level: Number.NaN })).toMatchObject({
      playing: false,
      level: 0,
    })
    expect(parseMusic('loud')).toBeNull()
    expect(parseMusic({ title: 'x'.repeat(500) })?.title).toHaveLength(200)
  })
})

describe('the sound element', () => {
  it('plays its sound when the screen comes on air, and loops behind it', () => {
    page([layer('s', { type: 'sound', on_show: 'whoosh', loop: 'rain', volume: 0.5 })])
    expect(played).toEqual([
      { name: 'whoosh', volume: 0.5, loop: false },
      { name: 'rain', volume: 0.5, loop: true },
    ])
    rt.setVisible(false)
    expect(stopped).toEqual(['rain'])
    played.length = 0
    rt.setVisible(true)
    expect(played.map((p) => p.name)).toEqual(['whoosh', 'rain'])
  })

  it('is silent where the page has no sound (dashboard previews)', () => {
    page([layer('s', { type: 'sound', on_show: 'whoosh', loop: 'rain' })], false)
    expect(played).toHaveLength(0)
  })

  it('ticks in a timer’s last ten seconds and plays its sound once at zero', () => {
    page([
      layer('cd', { type: 'text', text: '{time}', countdown: 12 }),
      layer('s', { type: 'sound', last_ticks: true, at_zero: 'impact' }),
    ])
    vi.advanceTimersByTime(1_900)
    expect(played).toHaveLength(0)
    vi.advanceTimersByTime(10_400)
    const names = played.map((p) => p.name)
    expect(names.filter((n) => n === 'tick')).toHaveLength(10)
    expect(names.filter((n) => n === 'impact')).toHaveLength(1)
    vi.advanceTimersByTime(5_000)
    expect(played.filter((p) => p.name === 'impact')).toHaveLength(1)
  })

  it('plays quieter while music plays, when asked', () => {
    page([layer('s', { type: 'sound', loop: 'pad', volume: 0.8, duck: true })])
    const loop = played.find((p) => p.name === 'pad')
    expect(loop?.volume).toBe(0.8)
    rt.apply(music({ playing: true, level: 0.5, title: null, artist: null }))
    expect(loop?.volume).toBeCloseTo(0.28)
  })

  it('plays the streamer’s own file, and never an address from outside', () => {
    page([
      layer('s', { type: 'sound', on_show_media: '01hx2k3m4n5p6q7r8s9t0vwxyz', on_show: 'chime' }),
      layer('t', { type: 'sound', on_show_media: 'https://tracker.test/a.mp3', on_show: 'chime' }),
    ])
    expect(played[0]?.name).toMatch(/^url:.*01hx2k3m4n5p6q7r8s9t0vwxyz/)
    expect(played[1]?.name).toBe('chime')
    expect(played.some((p) => p.name.includes('tracker.test'))).toBe(false)
  })
})

describe('the page’s timers', () => {
  it('the next one to end wins, else the one that ended last', () => {
    reportTimer('a', 5_000)
    reportTimer('b', 3_000)
    expect(timerEnd(1_000)).toBe(3_000)
    expect(timerEnd(4_000)).toBe(5_000)
    expect(timerEnd(6_000)).toBe(5_000)
    reportTimer('a', null)
    reportTimer('b', null)
    expect(timerEnd(6_000)).toBeNull()
  })
})
