import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FerroClient } from '../src/client'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { validateLayer } from '../src/design'
import { ApiError } from '../src/errors'
import { MUSIC_DEFAULT, checkMusicConfig, musicApi } from '../src/music'
import type { Widget } from '../src'

const err = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('expected an error')
}

describe('layers that move with the music (core::layer parity)', () => {
  it('accepts what the engine accepts', () => {
    for (const ok of [
      { type: 'text', text: '{time}', countdown: 300, countdown_look: 'ring', countdown_up: true },
      {
        type: 'fx',
        preset: 'nightdrive',
        color: '#ff3df0',
        color2: '#33d4ff',
        background: '#07040f',
        speed: 1.5,
        density: 1,
        reactive: true,
      },
      { type: 'music', look: 'pulse', color: '#ffa424', font: 'Space Grotesk', title_size: 28 },
      {
        type: 'sound',
        on_show: 'whoosh',
        loop: 'rain',
        last_ticks: true,
        at_zero: 'impact',
        volume: 0.6,
        duck: true,
        on_show_media: '01hx2k3m4n5p6q7r8s9t0vwxyz',
      },
      { type: 'sound' },
    ])
      expect(validateLayer(ok), JSON.stringify(ok)).toBeNull()
  })

  it('refuses what the engine refuses, naming the field', () => {
    for (const [bad, field] of [
      [{ type: 'text', countdown_look: 'sundial' }, 'config.countdown_look'],
      [{ type: 'text', countdown: 0 }, 'config.countdown'],
      [{ type: 'fx' }, 'config.preset'],
      [{ type: 'fx', preset: 'lava' }, 'config.preset'],
      [{ type: 'fx', preset: 'hex', speed: 9 }, 'config.speed'],
      [{ type: 'fx', preset: 'hex', color: 'url(x)' }, 'config.color'],
      [{ type: 'music', look: 'ring' }, 'config.look'],
      [{ type: 'music', font: 'a;b' }, 'config.font'],
      [{ type: 'sound', on_show: 'airhorn' }, 'config.on_show'],
      [{ type: 'sound', loop: 'whoosh' }, 'config.loop'],
      [{ type: 'sound', volume: 2 }, 'config.volume'],
      [{ type: 'sound', loop_media: 'https://x.test/a.mp3' }, 'config.loop_media'],
    ] as const) {
      const e = validateLayer(bad)
      expect(e, JSON.stringify(bad)).toMatch(new RegExp(`^${field.replace('.', '\\.')}`))
      expect(e?.endsWith('.')).toBe(true)
    }
  })
})

describe('music settings (engine::music parity)', () => {
  it('are checked like the engine checks them', () => {
    expect(checkMusicConfig(MUSIC_DEFAULT)).toBeNull()
    expect(checkMusicConfig({ beat_input: 'Desktop Audio', song: 'player', file: null })).toBeNull()
    expect(
      checkMusicConfig({ ...MUSIC_DEFAULT, song: 'file', file: 'C:\\Snip\\Snip.txt' }),
    ).toBeNull()
    for (const [bad, field] of [
      [{ ...MUSIC_DEFAULT, beat_input: '  ' }, 'beat_input'],
      [{ ...MUSIC_DEFAULT, beat_input: 'a\nb' }, 'beat_input'],
      [{ ...MUSIC_DEFAULT, song: 'file' as const }, 'file'],
      [{ ...MUSIC_DEFAULT, file: 'song.txt' }, 'file'],
      [{ ...MUSIC_DEFAULT, file: '/etc/passwd' }, 'file'],
    ] as const)
      expect(checkMusicConfig(bad)).toMatch(new RegExp(`^${field}:`))
  })
})

describe('music in the demo engine', () => {
  let engine: DemoEngine
  let client: FerroClient
  beforeEach(() => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  })
  afterEach(() => engine.dispose())

  it('saves the settings and refuses bad ones', async () => {
    const api = musicApi(client)
    const v = await api.get()
    expect(v.config).toEqual(MUSIC_DEFAULT)
    expect(v.now.playing).toBe(false)
    const saved = await api.save({ beat_input: 'Desktop Audio', song: 'player' })
    expect(saved.config).toEqual({ beat_input: 'Desktop Audio', song: 'player', file: null })
    expect(saved.now.playing).toBe(true)
    expect(saved.now.title).toBeTruthy()
    expect((await err(api.save({ song: 'file' }))).status).toBe(400)
    expect((await err(api.save({ song: 'spotify' as never }))).message).toMatch(/^song/)
    expect((await api.get()).config.song).toBe('player')
    const off = await api.save({ beat_input: '', song: 'off' })
    expect(off.config.beat_input).toBeNull()
    expect(off.now.playing).toBe(false)
  })

  it('sends music frames only to overlays with a layer that uses them', async () => {
    const [main] = await client.overlays()
    const other = await client.createOverlay('Plain')
    const layer = {
      id: 'beat',
      kind: 'layer',
      x: 0,
      y: 0,
      w: 600,
      h: 200,
      config: { type: 'music', look: 'wave' },
    } as Widget
    await client.saveOverlay({ ...main!, widgets: [...main!.widgets, layer] })
    const listen = (url: string) => {
      const token = /\/o\/([^/]+)\//.exec(url)?.[1] ?? ''
      const frames: { type: string; data: Record<string, unknown> }[] = []
      const sock = engine.socket(`ws://127.0.0.1:47820/o/${token}/ws`)
      sock.onmessage = (ev) => frames.push(JSON.parse(String(ev.data)))
      return frames
    }
    const withMusic = listen(main!.url)
    const plain = listen(other.url)
    await new Promise((r) => setTimeout(r, 10))
    const snap = withMusic.find((f) => f.type === 'snapshot')
    expect((snap?.data.state as { music: unknown }).music).toEqual({
      playing: false,
      level: 0,
      title: null,
      artist: null,
    })
    await musicApi(client).save({ beat_input: 'Desktop Audio' })
    await new Promise((r) => setTimeout(r, 200))
    const music = withMusic.filter((f) => f.type === 'music')
    expect(music.length).toBeGreaterThan(1)
    expect(music.at(-1)?.data.playing).toBe(true)
    expect(plain.some((f) => f.type === 'music')).toBe(false)
  })
})
