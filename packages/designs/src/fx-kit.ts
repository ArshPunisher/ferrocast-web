// The motion themes (owner's picks, 25 Oct board): a live world behind every break screen,
// music that shows and moves only while it plays, a timer in the theme's own look and a sound
// element. Each theme file gives its world, colours, type and choices; this lays out all eight
// screens the same careful way, so every theme has In game, Just chatting, Starting soon,
// Getting ready, BRB, Paused, Offline and Ending.

import type {
  CountdownLook,
  FxPreset,
  SoundLoop,
  Stinger,
  TextEffect,
  WidgetStyle,
} from '@ferrocast/api'
import {
  box,
  brand,
  cam,
  countdown,
  enter,
  fx,
  live,
  musicPiece,
  rotator,
  scene,
  sound,
  surround,
  text,
  themeDesign,
  widget,
  type Box,
  type Meta,
} from './kit'

type FrameVariant = Parameters<typeof cam>[2]
type CamStyle = 'line' | 'double' | 'corners' | 'notch' | 'glow'

export interface FxThemeSpec {
  meta: Meta
  /** The world behind the break screens. */
  preset: FxPreset
  /** Main glow, second colour, ground; text and quieter text. */
  a: string
  b: string
  bg: string
  ink: string
  dim: string
  /** The headline: font, weight and treatment. */
  head: {
    font: string
    weight?: number
    effect?: TextEffect
    color2?: string
    uppercase?: boolean
    italic?: boolean
    spacing?: number
  }
  /** Body and number fonts. */
  body?: string
  mono?: string
  timer: CountdownLook
  music: 'wave' | 'pulse'
  /** How Starting soon puts the screen, timer and music together (board combos A to D). */
  layout: 'band' | 'panel' | 'skyline' | 'low' | 'center'
  camFrame: { style: CamStyle; variant?: FrameVariant; radius?: number; label?: string }
  sounds: { start: Stinger; zero: Stinger; loop: SoundLoop }
  /** Where the Spark mark sits on the break screens (it moves around between themes). */
  mark: Box
  speed?: number
  density?: number
  alert: string
}

const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'kick.com/yourname'] as const

/** `#rrggbb` with an alpha byte. */
const a8 = (hex: string, alpha: number) =>
  `${hex.slice(0, 7)}${Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')}`

export function fxTheme(t: FxThemeSpec) {
  const body = t.body ?? 'Hanken Grotesk'
  const mono = t.mono ?? 'JetBrains Mono'
  const panel = a8(t.bg, 0.86)
  const goalStyle: WidgetStyle = {
    variant: 'bar',
    accent: t.a,
    track: a8(t.ink, 0.12),
    text: t.ink,
    background: panel,
    radius: 10,
  }
  const tag: WidgetStyle = {
    variant: 'tag',
    accent: t.a,
    text: t.ink,
    background: panel,
    radius: 10,
  }
  const cards: WidgetStyle = {
    variant: 'cards',
    accent: t.a,
    text: t.ink,
    background: panel,
    radius: 12,
  }
  const plates: WidgetStyle = {
    variant: 'plates',
    accent: t.a,
    text: t.ink,
    background: panel,
    radius: 14,
  }

  const world = (speed = t.speed ?? 1, reactive = true) =>
    fx('world', [0, 0, 1920, 1080], {
      preset: t.preset,
      color: t.a,
      color2: t.b,
      background: t.bg,
      speed,
      density: t.density ?? 1,
      reactive,
    })
  /** Darker towards the bottom, so words and widgets read over any world. */
  const shade = box('shade', [0, 0, 1920, 1080], {
    shape: 'rect',
    fill: a8(t.bg, 0.15),
    fill2: a8(t.bg, 0.78),
    angle: 180,
  })
  const title = (words: string, b: Box, size = 132) =>
    text('title', b, {
      text: words,
      font: t.head.font,
      size,
      weight: t.head.weight ?? 800,
      color: t.ink,
      align: 'center',
      ...(t.head.effect ? { effect: t.head.effect } : { shadow: 'glow' as const }),
      ...(t.head.color2 ? { color2: t.head.color2 } : {}),
      ...(t.head.uppercase ? { uppercase: true } : {}),
      ...(t.head.italic ? { italic: true } : {}),
      letter_spacing: t.head.spacing ?? -0.02,
      ...enter('rise', 150),
    })
  const sub = (words: string, y: number) =>
    text('sub', [360, y, 1200, 56], {
      text: words,
      font: body,
      size: 34,
      weight: 500,
      color: t.dim,
      align: 'center',
      shadow: 'soft',
      ...enter('fade', 450),
    })
  const timerBox = (y: number): Box =>
    t.timer === 'ring'
      ? [830, y, 260, 260]
      : t.timer === 'flip'
        ? [660, y, 600, 140]
        : [690, y, 540, 130]
  const timerH = t.timer === 'ring' ? 260 : t.timer === 'flip' ? 140 : 130
  const timer = (y: number) =>
    countdown(
      'timer',
      timerBox(y),
      300,
      '{time}',
      {
        font: t.timer === 'words' ? body : mono,
        size: t.timer === 'ring' ? 64 : t.timer === 'words' ? 56 : 92,
        weight: t.timer === 'thin' ? 200 : 700,
        color: t.a,
        align: 'center',
        shadow: 'glow',
        countdown_look: t.timer,
        countdown_up: true,
        ...enter('fade', 600),
      },
      'Live now',
    )
  const beat = (b: Box, size = 26) =>
    musicPiece('music', b, {
      look: t.music,
      color: t.a,
      color2: t.b,
      text_color: t.ink,
      font: body,
      title_size: size,
      show_title: true,
      only_playing: true,
    })
  const socials = (y: number, align: 'left' | 'center' | 'right' = 'center', b?: Box) =>
    rotator('socials', b ?? [560, y, 800, 44], SOCIALS, {
      font: body,
      size: 26,
      weight: 600,
      color: t.ink,
      align,
      shadow: 'soft',
    })
  const goal = (b: Box) => widget('goal', 'goal', b, live.goal(goalStyle))
  const latest = (b: Box, source = 'latest_follower', words = 'Latest follower: {value}') =>
    widget('latest', 'label', b, live.label(source, words, tag))
  const mark = () => brand(t.mark, 'badge', t.a)

  // ---------------------------------------------------------------- Starting soon (combos A to D)

  const starting = () => {
    const tm = sound('sound', {
      on_show: t.sounds.start,
      last_ticks: true,
      at_zero: t.sounds.zero,
      volume: 0.6,
      duck: true,
    })
    const corner = [goal([40, 990, 460, 56]), latest([1420, 990, 460, 56])]
    switch (t.layout) {
      case 'band':
        // A: the screen, the timer, and a dark band with the heartbeat and the song.
        return [
          world(),
          shade,
          title('Starting soon', [160, 250, 1600, 170]),
          timer(450),
          box('band', [0, 760, 1920, 200], { shape: 'rect', fill: a8(t.bg, 0.72) }),
          beat([160, 772, 1600, 176], 28),
          ...corner,
          tm,
          mark(),
        ]
      case 'panel':
        // B: a glass panel in the middle holding the wave and the song.
        return [
          world(),
          shade,
          title('Starting soon', [160, 200, 1600, 170]),
          timer(390),
          box('panel', [384, 610, 1152, 200], {
            shape: 'rect',
            fill: a8(t.bg, 0.78),
            radius: 22,
            stroke: a8(t.a, 0.35),
            stroke_width: 1,
          }),
          beat([420, 622, 1080, 176], 28),
          socials(870),
          ...corner,
          tm,
          mark(),
        ]
      case 'skyline':
        // C: the world itself jumps to the beat; words up top, the song under the timer.
        return [
          world(),
          box('sky', [0, 0, 1920, 560], {
            shape: 'rect',
            fill: a8(t.bg, 0.55),
            fill2: a8(t.bg, 0),
            angle: 180,
          }),
          title('Starting soon', [160, 120, 1600, 170]),
          timer(300),
          beat([560, 300 + timerH + 20, 800, 110], 26),
          socials(910),
          ...corner,
          tm,
          mark(),
        ]
      case 'low':
        // D: the world pulses; the wave and the song low on the screen.
        return [
          world(),
          shade,
          title('Starting soon', [160, 300, 1600, 170]),
          timer(490),
          beat([420, 780, 1080, 150], 26),
          ...corner,
          tm,
          mark(),
        ]
      default: {
        const total = 170 + 10 + 56 + 30 + timerH + 40 + 150
        const y0 = Math.round((960 - total) / 2)
        return [
          world(),
          shade,
          title('Starting soon', [160, y0, 1600, 170]),
          sub('Grab a drink. We go live in a moment.', y0 + 180),
          timer(y0 + 266),
          beat([560, y0 + 266 + timerH + 40, 800, 150], 26),
          ...corner,
          tm,
          mark(),
        ]
      }
    }
  }

  // ---------------------------------------------------------------- the other break screens

  const breakScreen = (
    words: string,
    line: string,
    extras: ReturnType<typeof widget>[],
    sounds: Parameters<typeof sound>[1] | null,
    speed?: number,
  ) => [
    world(speed),
    shade,
    title(words, [160, 300, 1600, 170]),
    sub(line, 480),
    beat([510, 580, 900, 150], 26),
    ...extras,
    ...(sounds ? [sound('sound', { volume: 0.55, duck: true, ...sounds })] : []),
    mark(),
  ]

  const inGame = [
    cam('cam', [40, 690, 480, 300], t.camFrame.variant ?? null, {
      style: t.camFrame.style,
      color: t.a,
      accent: t.b,
      thickness: 3,
      radius: t.camFrame.radius ?? 14,
      label: t.camFrame.label ?? 'Live',
    }),
    brand([478, 996, 28, 28], 'mark', t.ink),
    // The world, as a slim live bar along the bottom.
    fx('bar', [0, 1022, 1920, 58], {
      preset: t.preset,
      color: t.a,
      color2: t.b,
      background: t.bg,
      speed: (t.speed ?? 1) * 0.8,
      density: 0.6,
      reactive: true,
    }),
    box('seam', [0, 1020, 1920, 2], {
      shape: 'rect',
      fill: t.a,
      fill2: t.b,
      angle: 90,
      shadow: 'glow',
    }),
    widget('alerts', 'alerts', [560, 60, 800, 420], live.alerts),
    goal([660, 1029, 600, 44]),
    latest([40, 40, 440, 56]),
    widget('events', 'events', [1500, 40, 380, 300], live.events(cards)),
    socials(0, 'right', [1400, 1030, 480, 40]),
  ]

  const hole: Box = [40, 60, 1240, 860]
  const chatting = [
    ...surround('bg', hole, { fill: t.bg }),
    fx('side', [1320, 0, 600, 1080], {
      preset: t.preset,
      color: t.a,
      color2: t.b,
      background: t.bg,
      speed: (t.speed ?? 1) * 0.7,
      density: 0.8,
      reactive: true,
    }),
    box('side-shade', [1320, 0, 600, 1080], { shape: 'rect', fill: a8(t.bg, 0.55) }),
    cam('cam', hole, t.camFrame.variant ?? null, {
      style: t.camFrame.style,
      color: t.a,
      accent: t.b,
      thickness: 3,
      radius: t.camFrame.radius ?? 18,
    }),
    widget('chat', 'chat', [1340, 60, 560, 800], live.chat(plates)),
    socials(0, 'center', [1340, 876, 560, 44]),
    beat([1340, 930, 560, 120], 22),
    widget('alerts', 'alerts', [240, 120, 800, 420], live.alerts),
    latest([40, 950, 460, 56], 'latest_sub', 'Latest sub: {value}'),
    goal([560, 950, 720, 56]),
    brand([1240, 26, 28, 28], 'mark', t.ink),
  ]

  return themeDesign(
    t.meta,
    [
      scene('in_game', 'In game', inGame),
      scene('just_chatting', 'Just chatting', chatting),
      scene('starting_soon', 'Starting soon', starting()),
      scene(
        'getting_ready',
        'Getting ready',
        breakScreen(
          'Getting ready',
          'Setting things up. Music on.',
          [goal([40, 990, 460, 56]), latest([1420, 990, 460, 56])],
          { loop: t.sounds.loop },
        ),
      ),
      scene(
        'brb',
        'Be right back',
        breakScreen(
          'Be right back',
          'Stretching, refilling, back in a minute.',
          [
            widget('events', 'events', [660, 760, 600, 200], live.events(cards)),
            latest([1420, 990, 460, 56]),
          ],
          { on_show: 'whoosh', loop: t.sounds.loop },
        ),
      ),
      scene(
        'paused',
        'Paused',
        breakScreen(
          'Paused',
          'Back in a moment.',
          [goal([660, 780, 600, 56]), latest([1420, 990, 460, 56])],
          { on_show: 'glitch', loop: t.sounds.loop },
          (t.speed ?? 1) * 0.4,
        ),
      ),
      scene('offline', 'Offline', [
        world((t.speed ?? 1) * 0.5, false),
        shade,
        title('Offline', [160, 300, 1600, 170], 150),
        sub('Next stream: Friday, 8 PM', 480),
        socials(580),
        latest([730, 680, 460, 56]),
        mark(),
      ]),
      scene('ending', 'Ending', [
        world(),
        shade,
        title('Thanks for watching', [160, 220, 1600, 170], 120),
        sub('See you next stream.', 400),
        widget('events', 'events', [660, 490, 600, 240], live.events(cards)),
        widget(
          'top',
          'label',
          [660, 760, 600, 60],
          live.label('top_tip_session', 'Top tip tonight: {value}', tag),
        ),
        socials(860),
        sound('sound', { on_show: 'chime', volume: 0.55, duck: true }),
        mark(),
      ]),
    ],
    t.alert,
  )
}
