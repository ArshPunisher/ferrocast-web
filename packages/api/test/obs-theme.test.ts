import { describe, expect, it } from 'vitest'
import {
  checkThemePlan,
  guessThemePlan,
  obsThemeApi,
  planCounts,
  restyleTheme,
  themeAccent,
} from '../src/obs-theme'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { newAlertDesign } from '../src/design'
import type { Design, ObsScenes } from '../src'

const KEYS = ['in_game', 'just_chatting', 'starting_soon', 'brb', 'ending'] as const
const NAMES = ['In game', 'Just chatting', 'Starting soon', 'BRB', 'Ending']

function theme(id: string, name: string): Design {
  return {
    schema: 1,
    id,
    kind: 'theme',
    name,
    description: '',
    tags: { style: 'bold', motion: 'smooth' },
    pro: false,
    built_in: true,
    branded: true,
    origin: { type: 'built_in', from: null },
    content: {
      scenes: KEYS.map((key, i) => ({
        key,
        name: NAMES[i]!,
        width: 1920,
        height: 1080,
        background: null,
        layers: [],
      })),
      alert_design: 'builtin.molten',
    },
    created_at: 0,
    updated_at: 0,
  }
}

function molten(): Design {
  return {
    ...newAlertDesign('Molten'),
    id: 'builtin.molten',
    built_in: true,
    branded: true,
    origin: { type: 'built_in', from: null },
  }
}

/** A theme whose alert design is gone. */
function ghost(): Design {
  const t = theme('builtin.ghost', 'Ghost')
  if (t.kind === 'theme') t.content.alert_design = 'builtin.gone'
  return t
}

function demo() {
  const engine = new DemoEngine({
    autoplay: false,
    latencyMs: 0,
    designs: [molten(), theme('builtin.forge', 'Forge'), theme('builtin.prism', 'Prism'), ghost()],
  })
  const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  return { engine, client, api: obsThemeApi(client) }
}

async function refusal(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('expected a refusal')
}

const screens = KEYS.map((key, i) => ({ key, name: NAMES[i]! }))
const item = (source: string, kind: string, enabled = true) => ({ id: 1, source, kind, enabled })

describe('guesses, as the engine makes them', () => {
  it('picks the game scene even with its capture off, never a recording one', () => {
    const obs: ObsScenes = {
      current: 'Be Right Back',
      scenes: [
        { name: 'Starting Scene', items: [item('Intro', 'ffmpeg_source')] },
        {
          name: 'Gameplay',
          items: [
            item('macOS Screen Capture', 'screen_capture', false),
            item('Cam', 'macos-avcapture'),
          ],
        },
        { name: 'Be Right Back', items: [] },
        { name: 'Chatting', items: [item('Webcam', 'macos-avcapture')] },
        { name: 'Recording', items: [item('macOS Screen Capture', 'screen_capture')] },
      ],
    }
    const p = guessThemePlan('Forge', screens, obs, [])
    expect(p.prefix).toBe('Forge · ')
    expect(p.screens.map((s) => [s.key, s.under, s.role])).toEqual([
      ['in_game', 'Gameplay', 'live'],
      ['just_chatting', 'Chatting', null],
      ['starting_soon', null, 'starting'],
      ['brb', null, 'brb'],
      ['ending', null, 'ending'],
    ])
    expect(
      checkThemePlan(
        p,
        screens,
        obs.scenes.map((s) => s.name),
        [],
      ),
    ).toBeNull()
    expect(
      planCounts(
        p,
        obs.scenes.map((s) => s.name),
        screens,
      ),
    ).toEqual({ added: 5, changed: 0 })
  })

  it('refuses plans that cannot work, naming the field', () => {
    const scenes = ['Gameplay', 'BRB']
    const base = guessThemePlan('Forge', screens, { current: null, scenes: [] }, [])
    const bad = (f: (p: typeof base) => void) => {
      const p = structuredClone(base)
      f(p)
      return checkThemePlan(p, screens, scenes, ['Cam'])
    }
    expect(bad((p) => (p.screens[0]!.key = 'nope'))).toMatch(/^screens\.0\.key/)
    expect(bad((p) => (p.screens[2]!.place = { kind: 'on_top', scene: 'Missing' }))).toMatch(
      /no scene/,
    )
    expect(bad((p) => (p.screens[3]!.role = 'live'))).toMatch(/only one screen/)
    expect(bad((p) => (p.screens[0]!.under = 'Nowhere'))).toMatch(/^screens\.0\.under/)
    expect(bad((p) => (p.prefix = 'x'.repeat(41)))).toMatch(/^prefix/)
    expect(bad((p) => (p.screens[1]!.under = 'Cam'))).toBeNull()
  })
})

describe('demo: a theme into OBS', () => {
  it('puts every screen in OBS and Undo takes only that away', async () => {
    const { engine, client, api } = demo()
    engine.obsTheme.seedOldWidget('Gameplay', 'Alert box', 'StreamElements')
    engine.studio.obs.streaming = false // the demo streams by default
    const before = structuredClone(engine.studio.obs)
    const roles = [engine.studio.showCfg.starting_scene, engine.studio.scenesCfg.brb_scene]
    const plan = await api.plan('builtin.forge')
    expect(plan.plan.screens[0]!.under).toBe('Gameplay')
    expect(plan.plan.screens[1]!.under).toBe('Just Chatting')
    expect(plan.old_widgets).toEqual([
      { source: 'Alert box', vendor: 'StreamElements', scenes: ['Gameplay'] },
    ])
    expect(plan.obs_cameras).toEqual(['Webcam'])

    const r = await api.apply('builtin.forge')
    expect(r.steps.every((s) => s.status === 'done')).toBe(true)
    const names = engine.studio.obs.scenes.map((s) => s.name)
    for (const n of NAMES) expect(names).toContain(`Forge · ${n}`)
    const inGame = engine.studio.obs.scenes.find((s) => s.name === 'Forge · In game')!
    expect(inGame.items[0]!.source).toBe('Gameplay')
    expect(inGame.items.at(-1)!.source).toMatch(/^Ferrocast: In game/)
    expect(engine.studio.showCfg.starting_scene).toBe('Forge · Starting soon')
    expect(engine.studio.scenesCfg.brb_scene).toBe('Forge · BRB')
    expect(engine.studio.obs.current).toBe('Forge · Starting soon')
    expect(
      engine.studio.obs.scenes
        .find((s) => s.name === 'Gameplay')!
        .items.find((i) => i.source === 'Alert box')!.enabled,
    ).toBe(false)
    expect((await api.current())!.design_name).toBe('Forge')

    // Again: nothing doubles.
    const count = engine.studio.obs.scenes.length
    await api.apply('builtin.forge')
    expect(engine.studio.obs.scenes.length).toBe(count)
    expect(engine.studio.obs.scenes.find((s) => s.name === 'Forge · In game')!.items).toHaveLength(
      2,
    )

    // Another theme takes its place in the same scenes and overlays.
    const urls = (await client.overlays()).map((o) => o.url)
    const sw = await api.apply('builtin.prism')
    expect(sw.steps[0]!.id).toBe('switch_theme')
    expect(engine.studio.obs.scenes.length).toBe(count)
    expect(engine.studio.obs.scenes.map((s) => s.name)).toContain('Prism · In game')
    expect((await client.overlays()).map((o) => o.url)).toEqual(urls)
    const themed = (await client.overlays()).filter((o) => o.design)
    expect(themed).toHaveLength(5)
    expect(
      themed.every((o) => o.name.endsWith('(Prism)') && o.design!.id === 'builtin.prism'),
    ).toBe(true)
    expect(engine.studio.showCfg.live_scene).toBe('Prism · In game')

    const u = await api.takeOut()
    expect(u.applied).toBeNull()
    expect(engine.studio.obs).toEqual(before)
    expect([engine.studio.showCfg.starting_scene, engine.studio.scenesCfg.brb_scene]).toEqual(roles)
    expect(await api.current()).toBeNull()
    expect((await refusal(api.takeOut())).code).toBe('no_theme_in_obs')
  })

  it('refuses a bad plan, a non-theme and a closed OBS in words', async () => {
    const { client, api } = demo()
    const p = (await api.plan('builtin.forge')).plan
    p.screens[0]!.under = 'Nope'
    const bad = await refusal(api.apply('builtin.forge', p))
    expect([bad.status, bad.message]).toEqual([400, expect.stringMatching(/^screens\.0\.under/)])
    const extra = await refusal(
      api.apply('builtin.forge', { ...p, nope: 1 } as unknown as typeof p),
    )
    expect(extra.status).toBe(400)
    expect((await refusal(api.plan('builtin.molten'))).message).toMatch(/^design:/)
    await client.request('PUT', '/api/v1/obs', { host: '127.0.0.1', port: 4999 })
    const closed = await refusal(api.plan('builtin.forge'))
    expect([closed.status, closed.code]).toEqual([422, 'obs_unreachable'])
  })
})

describe('demo: a missing alert design', () => {
  it('fails only its own step and keeps what went into OBS undoable', async () => {
    const { engine, api } = demo()
    const before = structuredClone(engine.studio.obs)
    const r = await api.apply('builtin.ghost')
    const alert = r.steps.find((s) => s.id === 'alerts')!
    expect(alert.status).toBe('failed')
    expect(r.steps.filter((s) => s.status === 'failed')).toHaveLength(1)
    expect((await api.current())!.design_name).toBe('Ghost')
    await api.takeOut()
    expect(engine.studio.obs).toEqual(before)
  })
})

describe('make it yours', () => {
  it('changes the colour, font, name and mark on every screen', () => {
    const t = theme('builtin.forge', 'Forge')
    if (t.kind !== 'theme') throw new Error('theme')
    for (const s of t.content.scenes)
      s.layers = [
        {
          id: 'bar',
          kind: 'layer',
          x: 0,
          y: 0,
          w: 100,
          h: 20,
          config: { type: 'shape', shape: 'rect', fill: '#ffa424', fill2: '#ffa42400' },
        },
        {
          id: 'sub',
          kind: 'layer',
          x: 0,
          y: 40,
          w: 400,
          h: 40,
          config: {
            type: 'text',
            text: 'twitch.tv/yourname',
            font: 'Hanken Grotesk',
            color: '#eef0f4',
          },
        },
        {
          id: 'timer',
          kind: 'layer',
          x: 0,
          y: 90,
          w: 200,
          h: 60,
          config: { type: 'text', text: '{time}', font: 'JetBrains Mono', color: '#ffa424' },
        },
        {
          id: 'mark',
          kind: 'layer',
          x: 1800,
          y: 1000,
          w: 60,
          h: 50,
          config: { type: 'brand', variant: 'mark' },
        },
      ] as never
    expect(themeAccent(t)).toBe('#ffa424')
    const r = restyleTheme(t, {
      accent: '#2BB673',
      font: 'bold',
      handle: '@arxpunisher',
      logo: 'm123',
    })
    if (r.kind !== 'theme') throw new Error('theme')
    const [bar, sub, timer, logo] = r.content.scenes[0]!.layers.map(
      (l) => l.config as unknown,
    ) as Record<string, unknown>[]
    expect([bar!.fill, bar!.fill2]).toEqual(['#2bb673', '#2bb67300'])
    expect([sub!.text, sub!.font, sub!.color]).toEqual([
      'twitch.tv/arxpunisher',
      'Bricolage Grotesque',
      '#eef0f4',
    ])
    expect([timer!.font, timer!.color]).toEqual(['JetBrains Mono', '#2bb673'])
    expect(logo).toEqual({ type: 'image', media: 'm123', fit: 'contain' })
    expect(r.branded).toBe(false)
    // Shades of the old colour (a title gradient's ends) move to the new colour's hue.
    const grad = restyleTheme(
      {
        ...t,
        content: {
          ...t.content,
          scenes: [
            {
              ...t.content.scenes[0]!,
              layers: [
                ...t.content.scenes[0]!.layers,
                {
                  id: 'title',
                  kind: 'layer',
                  x: 0,
                  y: 0,
                  w: 900,
                  h: 140,
                  config: {
                    type: 'text',
                    text: 'Starting soon',
                    color: '#ffe0a8',
                    color2: '#cf7400',
                  },
                },
              ] as never,
            },
          ],
        },
      },
      { accent: '#ff4fa3' },
    )
    if (grad.kind !== 'theme') throw new Error('theme')
    const title = grad.content.scenes[0]!.layers.at(-1)!.config as unknown as Record<string, string>
    expect(title.color).not.toBe('#ffe0a8')
    expect(title.color2).not.toBe('#cf7400')
    expect(themeAccent(grad)).toBe('#ff4fa3')
    // Without a logo the mark just goes; a second restyle finds the new colour.
    const plain = restyleTheme(r, { accent: '#ff4fa3' })
    if (plain.kind !== 'theme') throw new Error('theme')
    expect(plain.content.scenes[0]!.layers).toHaveLength(3)
    expect(themeAccent(plain)).toBe('#ff4fa3')
  })

  it('screens in OBS follow a theme you change, until edited by hand', async () => {
    const { client, api } = demo()
    const mine = await client.duplicateDesign('builtin.forge', 'Forge (mine)')
    await api.apply(mine.id)
    const brb = async () => (await client.overlays()).find((o) => o.design?.scene === 'brb')!
    expect((await brb()).design!.follows).toBe(true)
    const restyled = restyleTheme(mine as never, { handle: 'nova' })
    if (restyled.kind !== 'theme') throw new Error('theme')
    restyled.content.scenes.forEach((s) =>
      s.layers.push({
        id: 'extra',
        kind: 'layer',
        x: 0,
        y: 0,
        w: 40,
        h: 40,
        config: { type: 'shape', shape: 'rect', fill: '#ffffff' },
      } as never),
    )
    await client.saveDesign(restyled)
    expect((await brb()).widgets.some((w) => w.id === 'extra')).toBe(true)
    const o = await brb()
    const saved = await client.saveOverlay({
      ...o,
      widgets: o.widgets.filter((w) => w.id !== 'extra'),
    })
    expect(saved.design!.follows).toBe(false)
    const back = await client.followDesign(o.id)
    expect(back.design!.follows).toBe(true)
    expect(back.url).toBe(o.url)
  })
})

describe('demo: mic on break screens', () => {
  it('adds the mic to Starting, BRB and Ending only when asked', async () => {
    const { engine, api } = demo()
    const plan = (await api.plan('builtin.forge')).plan
    expect(plan.mic_on_breaks).toBe(false)
    await api.apply('builtin.forge', { ...plan, mic_on_breaks: true })
    const has = (name: string) =>
      engine.studio.obs.scenes.find((s) => s.name === name)!.items.some((i) => i.source === 'Mic')
    expect(has('Forge · Starting soon') && has('Forge · BRB') && has('Forge · Ending')).toBe(true)
    expect(has('Forge · In game')).toBe(false)
    await api.apply('builtin.forge', { ...plan, mic_on_breaks: false })
    expect(has('Forge · BRB')).toBe(false)
  })
})

describe('demo: live', () => {
  it('never switches what viewers see, and waits to take a scene on air out', async () => {
    const { engine, api } = demo()
    engine.studio.obs.current = 'Gameplay'
    const r = await api.apply('builtin.forge')
    expect(r.steps.find((s) => s.id === 'switch')!.status).toBe('skipped')
    expect(engine.studio.obs.current).toBe('Gameplay')
    engine.studio.obs.current = 'Forge · In game'
    const e = await refusal(api.takeOut())
    expect([e.status, e.code]).toEqual([409, 'theme_on_air'])
    engine.studio.obs.current = 'Gameplay'
    expect((await api.takeOut()).applied).toBeNull()
  })
})
