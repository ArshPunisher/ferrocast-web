// The design model (port of core::design / core::layer) and the demo engine's design routes:
// picking, template variables and plurals, branding rules, every check with its message,
// `.ferrodesign` round trips and hostile files, and every error status.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  EVENT_KEYS,
  Template,
  baseLook,
  checkCss,
  normalizeCss,
  designMediaIds,
  designSample,
  eventKey,
  intoUser,
  isBrandLayer,
  isColor,
  isFontFamily,
  isMediaRef,
  newAlertDesign,
  pickLook,
  previewAlert,
  remapMedia,
  validateDesign,
  validateLayer,
  withAmount,
  type Design,
  type Widget,
} from '../src'
import { FerroClient } from '../src/client'
import { DEMO_TOKEN, DemoEngine } from '../src/demo'
import { importEntries, sniff } from '../src/demo/features/designs'
import { ApiError } from '../src/errors'

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82,
])

function builtinAlert(): Design {
  const d = newAlertDesign('Molten')
  return {
    ...d,
    id: 'builtin.molten',
    built_in: true,
    branded: true,
    origin: { type: 'built_in', from: null },
  }
}

function builtinTheme(): Design {
  const layers: Widget[] = [
    {
      id: 'bg',
      kind: 'layer',
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
      config: { type: 'shape', shape: 'rect', fill: '#101216' },
    },
    {
      id: 'title',
      kind: 'layer',
      x: 160,
      y: 420,
      w: 1600,
      h: 160,
      config: { type: 'text', text: 'Be right back', size: 96 },
    },
    {
      id: 'goal',
      kind: 'goal',
      x: 660,
      y: 900,
      w: 600,
      h: 80,
      config: { goal_id: '', theme: 'molten' },
    },
    {
      id: 'spark',
      kind: 'layer',
      x: 1840,
      y: 1010,
      w: 56,
      h: 48,
      config: { type: 'brand', variant: 'mark' },
    },
  ]
  return {
    schema: 1,
    id: 'builtin.forge',
    kind: 'theme',
    name: 'Forge',
    description: '',
    tags: { style: 'bold', motion: 'smooth' },
    pro: false,
    built_in: true,
    branded: true,
    origin: { type: 'built_in', from: null },
    content: {
      scenes: (['in_game', 'just_chatting', 'starting_soon', 'brb', 'ending'] as const).map(
        (key) => ({
          key,
          name: `Scene ${key}`,
          width: 1920,
          height: 1080,
          background: null,
          layers,
        }),
      ),
      alert_design: 'builtin.molten',
    },
    created_at: 0,
    updated_at: 0,
  }
}

const widgetDesign = (): Design => ({
  ...builtinAlert(),
  id: 'builtin.goal',
  kind: 'widget',
  content: {
    widget: 'goal',
    w: 640,
    h: 80,
    config: { goal_id: '', theme: 'molten' },
    style: { variant: 'segments', accent: '#ffa424', brand: 'corner' },
  },
})

describe('picking a look', () => {
  it('maps events to finer keys like the engine', () => {
    const k = (key: (typeof EVENT_KEYS)[number]) => eventKey(designSample(key)!)
    for (const key of EVENT_KEYS) expect(k(key), key).toBe(key)
    const resub = designSample('resub')!
    expect(resub.kind.type === 'subscription' && resub.kind.months).toBe(6)
  })

  it('falls back to the plainer look and picks the highest matching variation', () => {
    const d = newAlertDesign('x')
    if (d.kind !== 'alert') throw new Error()
    delete d.content.events.resub
    delete d.content.events.superchat
    expect(pickLook(d, designSample('resub')!)?.variation.id).toBe('sub-0')
    expect(pickLook(d, designSample('superchat')!)?.variation.id).toBe('tip-0')
    const tip = d.content.events.tip!
    tip.variations.push(
      {
        id: 'big',
        name: 'Big',
        condition: { type: 'amount_at_least', value: 1000, currency: null },
        priority: 5,
        look: baseLook(),
      },
      {
        id: 'huge',
        name: 'Huge',
        condition: { type: 'amount_at_least', value: 5000, currency: 'INR' },
        priority: 9,
        look: baseLook(),
      },
    )
    expect(pickLook(d, designSample('tip', { amount: 500 })!)?.variation.id).toBe('tip-0')
    expect(pickLook(d, designSample('tip', { amount: 1500 })!)?.variation.id).toBe('big')
    expect(pickLook(d, designSample('tip', { amount: 9000 })!)?.variation.id).toBe('huge')
    expect(validateDesign(d)).toBeNull()
  })

  it('renders text with highlights and singular-aware counts', () => {
    const t = Template.parse('{name|upper} tipped {amount}! {missing}{{x}}')
    expect(t.renderParts({ name: 'kavya', amount: '₹750' }, ['name', 'amount'])).toEqual([
      { text: 'KAVYA', hl: true },
      { text: ' tipped ', hl: false },
      { text: '₹750', hl: true },
      { text: '! {x}', hl: false },
    ])
    const d = newAlertDesign('x')
    if (d.kind !== 'alert') throw new Error()
    d.content.events.sub!.variations[0]!.look.title = '{name} subscribed for {months} months'
    d.content.events.resub!.variations[0]!.look.title = '{name} subscribed for {months} months'
    const one = previewAlert(d, 'sub')!
    expect(one.title).toMatch(/for 1 month$/)
    const many = previewAlert(d, 'resub', { amount: 14 })!
    expect(many.title).toMatch(/for 14 months$/)
    expect(many.design?.title_parts.find((p) => p.hl)?.text).toBe('PixelPanda')
  })

  it('previews a forced variation, long names and amounts', () => {
    const d = newAlertDesign('x')
    if (d.kind !== 'alert') throw new Error()
    d.content.events.tip!.variations.push({
      id: 'big',
      name: 'Big',
      condition: { type: 'amount_at_least', value: 10_000, currency: null },
      priority: 1,
      look: { ...baseLook(), frame: 'neon' },
    })
    expect(previewAlert(d, 'tip', { variationId: 'big' })?.design?.look.frame).toBe('neon')
    expect(previewAlert(d, 'tip', { longName: true })?.title).toContain(
      'TheLegendaryChaiDrinker_9000xX',
    )
    expect(previewAlert(d, 'tip', { amount: 2500 })?.title).toContain('2,500')
    const raid = withAmount(designSample('raid')!, 3)
    expect(raid.kind.type === 'raid' && raid.kind.viewers).toBe(3)
  })
})

describe('branding', () => {
  it('a copy is never built-in, branded or Pro, and loses mark layers', () => {
    const t = builtinTheme()
    const mine = intoUser(t, 'mine', { type: 'duplicate', from: 'Forge' }, 5)
    expect([mine.built_in, mine.branded, mine.pro]).toEqual([false, false, false])
    expect(
      mine.kind === 'theme' && mine.content.scenes.every((s) => !s.layers.some(isBrandLayer)),
    ).toBe(true)
    expect(validateDesign(mine)).toBeNull()
    const w = intoUser(widgetDesign(), 'w', { type: 'duplicate', from: null }, 0)
    expect(w.kind === 'widget' && w.content.style.brand).toBeUndefined()
    expect(validateDesign({ ...t, built_in: false, branded: false })).toMatch(
      /only in built-in designs/,
    )
    expect(validateDesign({ ...builtinAlert(), built_in: false })).toMatch(/^branded:/)
  })
})

describe('checks (same messages as the engine)', () => {
  it('values that could break out of CSS or fetch files are refused', () => {
    expect(['#fff', '#ffa42480', 'transparent'].every(isColor)).toBe(true)
    expect(['red', '#fff;}', 'url(x)', ''].some(isColor)).toBe(false)
    expect(isMediaRef('asset:alerts/coin.png') && isMediaRef('m01abc')).toBe(true)
    expect(['../x', 'asset:../x', 'asset:/a', 'https://x', 'a b'].some(isMediaRef)).toBe(false)
    expect(isFontFamily('Press Start 2P') && !isFontFamily("a';}")).toBe(true)
    expect(checkCss('css', 'div{background:url(https://t.test/p.gif)}')).toMatch(/^css: url\(\)/)
    expect(checkCss('css', '@import "x";')).toMatch(/@import/)
    // a comment opener inside a string can't hide a later fetch (matches core::layer)
    expect(
      checkCss('css', '.x{content:"/*"} .y{background:url(https://tracker.test/p.gif)} /* */'),
    ).toMatch(/url\(\)/)
    expect(checkCss('css', ".x{content:'/*'} .y{background:url(//t.test/p.gif)}")).toMatch(
      /url\(\)/,
    )
    expect(normalizeCss('a{/* hi */color:red}')).toBe('a{color:red}')
    expect(normalizeCss('.x{content:"/* not a comment */"}')).toBe(
      '.x{content:"/* not a comment */"}',
    )
    for (const sneaky of [
      'div{background:u\\72l(https://t.test)}',
      '@\\69mport "x";',
      'div{background:ur\\l(//t.test)}',
      "div{background:image-set('https://t.test/a.png' 1x)}",
    ])
      expect(checkCss('css', sneaky), sneaky).not.toBeNull()
    expect(checkCss('css', 'div{background:url("data:image/png;base64,AA")}')).toBeNull()
  })

  it('every look field names itself', () => {
    const cases: [(l: ReturnType<typeof baseLook>) => void, string][] = [
      [(l) => (l.media_size = 9000), 'look.media_size'],
      [(l) => (l.media = { kind: 'image', ref: null }), 'look.media.ref'],
      [(l) => (l.title = '{name'), 'look.title'],
      [(l) => (l.font.family = 'a;b'), 'look.font.family'],
      [(l) => (l.font.weight = 1000), 'look.font.weight'],
      [(l) => (l.colors.highlight = 'red'), 'look.colors.highlight'],
      [(l) => (l.anim.in_ms = 9000), 'look.anim.in_ms'],
      [(l) => (l.sound.volume = 101), 'look.sound.volume'],
      [(l) => (l.duration_ms = 500), 'look.duration_ms'],
      [(l) => (l.duration_ms = 1000), 'look.duration_ms'],
      [(l) => (l.tts.min_amount = -1), 'look.tts.min_amount'],
      [(l) => (l.css = '@import url(x);'), 'look.css'],
    ]
    for (const [edit, field] of cases) {
      const d = newAlertDesign('x')
      if (d.kind !== 'alert') throw new Error()
      edit(d.content.events.tip!.variations[0]!.look)
      const m = validateDesign(d)
      expect(m, field).toContain(field)
      expect(m?.startsWith('content.events.tip.variations[0]')).toBe(true)
      expect(m?.endsWith('.')).toBe(true)
    }
    const d = newAlertDesign('x')
    if (d.kind !== 'alert') throw new Error()
    d.content.events.tip!.variations[0]!.look.colors.highlight = 'red'
    // The exact wording the engine uses.
    expect(validateDesign(d)).toBe(
      'content.events.tip.variations[0].look.colors.highlight: "red" isn\'t a colour; use #rrggbb.',
    )
  })

  it('the library layer options are checked (API-REQUESTS R20)', () => {
    expect(
      validateLayer({
        type: 'shape',
        clip: 'star',
        pattern: 'confetti',
        pattern_scale: 2,
        shadow: 'glow',
      }),
    ).toBeNull()
    expect(validateLayer({ type: 'shape', clip: 'url(x)' })).toMatch(/^config\.clip/)
    expect(validateLayer({ type: 'shape', pattern: 'evil' })).toMatch(/^config\.pattern/)
    expect(validateLayer({ type: 'shape', pattern_scale: 9 })).toMatch(/^config\.pattern_scale/)
    expect(validateLayer({ type: 'webcam', variant: 'hud' })).toBeNull()
    expect(validateLayer({ type: 'frame', variant: 'iframe' })).toMatch(/^config\.variant/)
    expect(
      validateLayer({
        type: 'text',
        text: 'a',
        effect: 'neon',
        color2: '#ff00ff',
        split: 'letters',
      }),
    ).toBeNull()
    expect(validateLayer({ type: 'text', text: 'a', effect: 'blink' })).toMatch(/^config\.effect/)
    expect(validateLayer({ type: 'text', text: 'a', color2: 'red' })).toMatch(/^config\.color2/)
    expect(validateLayer({ type: 'text', text: 'a', rotate: ['x', 'y'], rotate_s: 4 })).toBeNull()
    expect(validateLayer({ type: 'text', text: 'a', rotate: Array(9).fill('x') })).toBe(
      'config.rotate: give up to 8 lines to show in turn.',
    )
    expect(validateLayer({ type: 'text', text: 'a', rotate: ['x'.repeat(81)] })).toBe(
      'config.rotate[0]: each line is text of up to 80 characters.',
    )
    expect(validateLayer({ type: 'text', text: '{time}', countdown: 300 })).toBeNull()
    expect(validateLayer({ type: 'text', text: 'a', countdown: 0 })).toMatch(/^config\.countdown/)
  })

  it('layers and scenes are checked like overlays', () => {
    expect(validateLayer({ type: 'iframe' })).toMatch(/^config\.type/)
    expect(validateLayer({ type: 'image' })).toMatch(/^config\.media/)
    expect(validateLayer({ type: 'text', text: 'x'.repeat(501) })).toMatch(/^config\.text/)
    expect(validateLayer({ type: 'text', anim: { in: 'explode' } })).toMatch(/^config\.anim\.in/)
    expect(
      validateLayer({ type: 'frame', style: 'notch', color: '#ffa424', label: 'LIVE' }),
    ).toBeNull()
    const t = builtinTheme()
    if (t.kind !== 'theme') throw new Error()
    t.content.scenes[0]!.layers = [{ ...t.content.scenes[0]!.layers[1]!, x: 5000 }]
    expect(validateDesign(t)).toMatch(
      /^content\.scenes\[0\]\.layers: widget 'title' is outside the canvas/,
    )
    expect(validateDesign(builtinTheme())).toBeNull()
    expect(validateDesign(widgetDesign())).toBeNull()
  })

  it('media ids skip bundled files and remap', () => {
    const d = newAlertDesign('x')
    if (d.kind !== 'alert') throw new Error()
    d.content.events.tip!.variations[0]!.look.media = { kind: 'image', ref: 'old1' }
    d.content.events.tip!.variations[0]!.look.sound.ref = 'asset:sounds/coin.mp3'
    expect(designMediaIds(d)).toEqual(['old1'])
    expect(designMediaIds(remapMedia(d, { old1: 'new1' }))).toEqual(['new1'])
  })
})

let engine: DemoEngine
let client: FerroClient

beforeEach(() => {
  engine = new DemoEngine({
    autoplay: false,
    latencyMs: 0,
    designs: [builtinAlert(), builtinTheme(), widgetDesign()],
  })
  client = new FerroClient({
    base: engine.base,
    token: DEMO_TOKEN,
    fetch: engine.fetch,
    sleep: async () => {},
  })
})
afterEach(() => engine.dispose())

const err = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x)
  expect(e).toBeInstanceOf(ApiError)
  return e as ApiError
}

describe('demo engine: design routes', () => {
  it('lists built-ins first, creates only your own, refuses built-in edits', async () => {
    const all = await client.designs()
    expect(all.map((d) => d.id)).toEqual(['builtin.molten', 'builtin.forge', 'builtin.goal'])
    expect((await client.designs('theme')).length).toBe(1)
    expect((await err(client.request('GET', '/api/v1/designs?kind=sticker'))).status).toBe(400)
    const mine = await client.createDesign(builtinAlert())
    expect([mine.built_in, mine.branded, mine.id.startsWith('builtin.')]).toEqual([
      false,
      false,
      false,
    ])
    const e = await err(client.saveDesign(builtinAlert()))
    expect([e.status, e.code]).toEqual([409, 'built_in'])
    expect((await err(client.saveDesign({ ...mine, name: '' }))).status).toBe(400)
    expect(
      (
        await err(
          client.saveDesign({ ...builtinTheme(), id: mine.id, built_in: false, branded: false }),
        )
      ).status,
    ).toBe(409)
    expect((await err(client.design('nope'))).status).toBe(404)
    expect((await err(client.deleteDesign('builtin.molten'))).code).toBe('built_in')
  })

  it('duplicate, use, the active design and delete', async () => {
    const copy = await client.duplicateDesign('builtin.forge')
    expect(copy.name).toBe('Forge copy')
    expect(copy.kind === 'theme' && copy.content.alert_design?.startsWith('builtin.')).toBe(false)
    const used = await client.useDesign('builtin.forge')
    expect(used.overlays).toHaveLength(5)
    expect(used.alert_design).toBe('builtin.molten')
    expect(used.overlays[0]?.design).toEqual({
      id: 'builtin.forge',
      scene: 'in_game',
      branded: true,
    })
    // The mark of a built-in can't be edited away.
    const o = used.overlays[0]!
    const e = await err(
      client.saveOverlay({ ...o, widgets: o.widgets.filter((w) => !isBrandLayer(w)) }),
    )
    expect([e.status, e.code]).toEqual([409, 'branding'])
    // The active design can't be deleted.
    const mine = await client.duplicateDesign('builtin.molten')
    await client.setActiveAlertDesign(mine.id)
    expect((await err(client.deleteDesign(mine.id))).code).toBe('in_use')
    expect((await err(client.setActiveAlertDesign('builtin.forge'))).status).toBe(400)
    await client.setActiveAlertDesign(null)
    await client.deleteDesign(mine.id)
    expect((await err(client.useDesign('builtin.goal'))).status).toBe(400)
    const [main] = await client.overlays()
    const w = await client.useDesign('builtin.goal', { overlay_id: main!.id })
    expect(w.overlays[0]?.widgets.at(-1)?.config).toMatchObject({
      design_id: 'builtin.goal',
      branded: true,
    })
  })

  it('a test alert from the designer uses that design and amount', async () => {
    const mine = await client.duplicateDesign('builtin.molten')
    const [main] = await client.overlays()
    const token = /\/o\/([^/]+)\//.exec(main!.url)?.[1] ?? ''
    const frames: { type: string; data: { design?: { design_id: string }; title: string } }[] = []
    const sock = engine.socket(`ws://127.0.0.1:47820/o/${token}/ws`)
    sock.onmessage = (ev) => frames.push(JSON.parse(String(ev.data)))
    await new Promise((r) => setTimeout(r, 10))
    await client.testAlert({ kind: 'tip', design_id: mine.id, amount: 1234 })
    await new Promise((r) => setTimeout(r, 10))
    const a = frames.find((f) => f.type === 'alert')
    expect(a?.data.design?.design_id).toBe(mine.id)
    expect(a?.data.title).toContain('1,234')
    expect((await err(client.testAlert({ kind: 'tip', amount: -1 }))).status).toBe(400)
    expect((await err(client.testAlert({ kind: 'tip', design_id: 'gone' }))).status).toBe(404)
  })

  it('.ferrodesign export and import round trip, with media', async () => {
    const up = await client.upload(new Blob([PNG], { type: 'image/png' }), 'coin.png')
    const d = newAlertDesign('With art')
    if (d.kind !== 'alert') throw new Error()
    d.content.events.tip!.variations[0]!.look.media = { kind: 'image', ref: up.id }
    const mine = await client.createDesign(d)
    expect((await err(client.exportDesign('builtin.molten'))).code).toBe('built_in')
    const file = await client.exportDesign(mine.id)
    const r = await client.importDesign(file, 'With-art.ferrodesign')
    expect(r.designs).toHaveLength(1)
    expect(r.media_files).toBe(1)
    expect(r.designs[0]?.origin.type).toBe('import')
    expect(r.designs[0]?.id).not.toBe(mine.id)
    expect(designMediaIds(r.designs[0]!)[0]).not.toBe(up.id)
    expect((await err(client.deleteMedia(up.id))).code).toBe('in_use')
  })

  it('hostile design files get the right status', async () => {
    const m = (v: number) =>
      strToU8(
        JSON.stringify({
          format: 'ferrodesign',
          version: v,
          name: 'x',
          kind: 'alert',
          designs: 1,
          files: {},
        }),
      )
    const design = strToU8(JSON.stringify(newAlertDesign('Shared')))
    const z = (e: Record<string, Uint8Array>) => new Blob([zipSync(e) as unknown as BlobPart])
    const cases: [Blob, number, string][] = [
      [new Blob(['nope']), 415, 'bad_design_file'],
      [z({ 'designs/1.json': design }), 415, 'bad_design_file'],
      [
        z({ 'manifest.json': m(1), 'designs/1.json': design, 'run.js': strToU8('x') }),
        415,
        'unsafe_design_file',
      ],
      [
        z({
          'manifest.json': m(1),
          'designs/1.json': design,
          [`media/${'0'.repeat(64)}.png`]: PNG,
        }),
        415,
        'damaged_design_file',
      ],
      [z({ 'manifest.json': m(4), 'designs/1.json': design }), 422, 'design_too_new'],
      [
        z({ 'manifest.json': m(1), 'designs/1.json': strToU8('{"schema":1}') }),
        422,
        'invalid_design',
      ],
      [new Blob([]), 400, 'invalid'],
    ]
    for (const [blob, status, code] of cases) {
      const e = await err(client.importDesign(blob, 'x.ferrodesign'))
      expect([e.status, e.code], code).toEqual([status, code])
    }
  })

  it('a page dressed as a picture never becomes media', async () => {
    const page = strToU8('<html><script>alert(1)</script>')
    const d = await crypto.subtle.digest('SHA-256', page as unknown as ArrayBuffer)
    const sha = Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('')
    const io = {
      newId: () => 'n',
      now: () => 0,
      addMedia: () => {
        throw new Error('never')
      },
      save: () => {},
    }
    const e = await importEntries(
      {
        'manifest.json': strToU8('{"format":"ferrodesign","version":1}'),
        'designs/1.json': strToU8(JSON.stringify(newAlertDesign('x'))),
        [`media/${sha}.png`]: page,
      },
      io,
    ).catch((x: unknown) => x)
    expect((e as { code: string }).code).toBe('unsupported_type')
    expect(sniff(PNG)?.mime).toBe('image/png')
    expect(sniff(strToU8('<svg/>'))).toBeNull()
  })
})
