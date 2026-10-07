// Tokyo neon: a back street in the city after rain. Dark towers, tall vertical shop signs
// glowing magenta, cyan and amber, red paper lanterns, rain still falling and every colour
// smeared across the wet road. The headline is a big neon tube sign. No sunset grid, no
// glitch: just the street. The Spark hangs on the sign.

import {
  brand,
  box,
  cam,
  countdown,
  enter,
  fancyFrame,
  live,
  mat,
  pattern,
  rotator,
  scene,
  surround,
  text,
  themeDesign,
  widget,
} from '../kit'

const NIGHT = '#0a0916'
const DUSK = '#1d1033'
const TOWER = '#110d20'
const MAGENTA = '#ff2e88'
const CYAN = '#29e3ff'
const AMBER = '#ffb547'
const LANTERN = '#e8322f'
const WHITE = '#f4f1ff'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname'] as const

const neonLabel = {
  variant: 'neon',
  accent: MAGENTA,
  text: WHITE,
  background: '#0d0a1ae6',
  radius: 10,
  font: 'Teko',
  font_size: 30,
  uppercase: true,
}
const tubeGoal = {
  variant: 'tube',
  accent: CYAN,
  track: '#0d0a1a',
  text: WHITE,
  background: '#0d0a1ae6',
  radius: 12,
  font: 'Teko',
  uppercase: true,
}
const cardEvents = {
  variant: 'cards',
  accent: MAGENTA,
  text: WHITE,
  background: '#0d0a1ad9',
  radius: 8,
  font: 'Hanken Grotesk',
}
const teko = (size: number, color = WHITE) => ({
  font: 'Teko',
  size,
  weight: 500,
  color,
  uppercase: true,
  letter_spacing: 0.04,
})
const neon = (size: number, glow: string) => ({
  ...teko(size),
  color: glow,
  color2: glow,
  effect: 'neon' as const,
})

/** A tall vertical shop sign: a dark board, a neon edge and stacked letters. */
const sign = (id: string, x: number, y: number, word: string, color: string, h = 380) => [
  box(`${id}-board`, [x, y, 84, h], {
    shape: 'rect',
    fill: '#120a1f',
    stroke: color,
    stroke_width: 3,
    radius: 6,
    shadow: 'glow',
  }),
  text(`${id}-t`, [x, y + 16, 84, h - 24], {
    text: word.split('').join('\n'),
    ...neon(Math.round((h - 40) / word.length / 1.02), color),
    align: 'center',
  }),
  box(`${id}-wet`, [x - 10, 830, 104, 230], {
    shape: 'rect',
    fill: `${color}38`,
    fill2: `${color}00`,
    angle: 180,
  }),
]

/** A red paper lantern. */
const lantern = (id: string, x: number, y: number, loop = false) => [
  box(`${id}-cord`, [x + 33, y - 40, 2, 40], { shape: 'rect', fill: '#3a2a3f' }),
  box(`${id}`, [x, y, 68, 84], {
    shape: 'ellipse',
    fill: '#ff6a4d',
    fill2: LANTERN,
    angle: 180,
    shadow: 'glow',
    ...(loop ? enter('fade', 200, 'pulse') : {}),
  }),
  pattern(`${id}-ribs`, [x + 6, y + 10, 56, 64], 'lines', '#7a101040', { scale: 0.7 }),
]

const street = () => [
  box('sky', [0, 0, 1920, 1080], { shape: 'rect', fill: NIGHT, fill2: DUSK, angle: 180 }),
  box('tower-a', [0, 120, 380, 720], { shape: 'rect', fill: TOWER }),
  pattern('win-a', [30, 160, 320, 640], 'dots', '#ffb54722', { scale: 1.4 }),
  box('tower-b', [1560, 60, 360, 780], { shape: 'rect', fill: '#0e0a1b' }),
  pattern('win-b', [1590, 100, 300, 700], 'grid', '#29e3ff14', { scale: 1.6 }),
  box('road', [0, 830, 1920, 250], {
    shape: 'rect',
    fill: '#151027',
    fill2: '#05040a',
    angle: 180,
  }),
  box('curb', [0, 826, 1920, 6], { shape: 'rect', fill: '#2a2140' }),
  ...sign('s1', 250, 200, 'RAMEN', MAGENTA, 420),
  ...sign('s2', 130, 300, 'BAR', CYAN, 260),
  ...sign('s3', 1620, 160, 'OPEN24', AMBER, 460),
  ...lantern('l1', 520, 60, true),
  ...lantern('l2', 1340, 80),
  pattern('rain', [0, 0, 1920, 1080], 'rain', '#c9d6ff', { moving: true, scale: 1.2 }),
]

/** The big sign: a dark board ringed by a neon tube. */
const bigSign = (x: number, y: number, w: number, h: number) => [
  box('sign', [x, y, w, h], {
    shape: 'rect',
    fill: '#0d0a1ae6',
    radius: 18,
    ...enter('fade', 0),
  }),
  fancyFrame('sign-tube', [x, y, w, h], 'tube', {
    color: CYAN,
    accent: MAGENTA,
    thickness: 4,
    radius: 18,
  }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...street(),
    ...bigSign(480, 150, 960, 420),
    brand([1394, 166, 26, 26], 'mark', CYAN),
    text('kicker', [520, 180, 880, 40], {
      text: key === 'starting_soon' ? 'Night shift  ·  going live' : 'Back alley  ·  short break',
      ...teko(34, AMBER),
      letter_spacing: 0.3,
      align: 'center',
      ...enter('fade', 100),
    }),
    text('title', [500, 214, 920, 170], {
      text: title,
      ...neon(168, MAGENTA),
      align: 'center',
      ...enter('fade', 200, key === 'starting_soon' ? 'pulse' : 'none'),
    }),
    ...(key === 'starting_soon'
      ? [
          countdown(
            'timer',
            [500, 390, 920, 160],
            300,
            '{time}',
            { ...neon(150, CYAN), align: 'center' },
            'Lights on',
          ),
        ]
      : [
          widget('events', 'events', [640, 392, 640, 170], {
            ...live.events(cardEvents),
            max_items: 3,
          }),
        ]),
    text('sub', [480, 600, 960, 44], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 28,
      weight: 500,
      color: '#d7d0f2',
      align: 'center',
      shadow: 'soft',
      ...enter('fade', 500),
    }),
    rotator('socials', [560, 680, 800, 44], SOCIALS, {
      ...teko(36),
      align: 'center',
      letter_spacing: 0.14,
      shadow: 'soft',
    }),
    widget('goal', 'goal', [420, 950, 560, 96], live.goal(tubeGoal)),
    widget(
      'latest',
      'label',
      [1020, 966, 480, 62],
      live.label('latest_follower', 'New regular: {value}', neonLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'tokyo-neon',
    name: 'Tokyo neon',
    description:
      'A rain-slick city back street at night: tall neon shop signs, red lanterns and colour on the wet road.',
    style: 'bold',
    motion: 'lively',
  },
  [
    scene('in_game', 'In game', [
      widget(
        'latest',
        'label',
        [40, 40, 440, 62],
        live.label('latest_follower', 'New regular: {value}', neonLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 114, 440, 62],
        live.label('latest_sub', 'Sub: {value}', { ...neonLabel, accent: CYAN }),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1380, 44, 500, 96], live.goal(tubeGoal)),
      box('s-board', [1820, 180, 60, 300], {
        shape: 'rect',
        fill: '#120a1fd9',
        stroke: MAGENTA,
        stroke_width: 2,
        radius: 4,
      }),
      text('s-t', [1820, 192, 60, 280], {
        text: 'L\nI\nV\nE',
        ...neon(62, MAGENTA),
        align: 'center',
      }),
      mat('cam-mat', [44, 680, 480, 300], '#0d0a1a', 8, 12),
      cam('cam', [44, 680, 480, 300], 'tube', {
        color: CYAN,
        accent: MAGENTA,
        thickness: 3,
        radius: 12,
      }),
      brand([494, 996, 24, 24], 'mark', CYAN),
      widget('events', 'events', [1500, 600, 380, 360], {
        ...live.events(cardEvents),
        max_items: 4,
      }),
      box('soc', [1500, 990, 380, 50], { shape: 'rect', fill: '#0d0a1ad9', radius: 8 }),
      rotator('socials', [1500, 994, 380, 42], SOCIALS, {
        ...teko(28),
        align: 'center',
        letter_spacing: 0.12,
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 80, 1220, 760], { fill: NIGHT, fill2: DUSK, angle: 180 }),
      pattern('rain', [1290, 0, 630, 1080], 'rain', '#c9d6ff', { moving: true, scale: 0.6 }),
      box('road', [0, 880, 1920, 200], {
        shape: 'rect',
        fill: '#151027',
        fill2: '#05040a',
        angle: 180,
      }),
      mat('cam-mat', [60, 80, 1220, 760], '#0d0a1a', 10, 16),
      cam('cam', [60, 80, 1220, 760], 'tube', {
        color: CYAN,
        accent: MAGENTA,
        thickness: 4,
        radius: 16,
      }),
      box('chat-panel', [1320, 80, 560, 760], {
        shape: 'rect',
        fill: '#0d0a1ae6',
        stroke: MAGENTA,
        stroke_width: 2,
        radius: 16,
        shadow: 'glow',
      }),
      text('chat-head', [1350, 92, 500, 60], { text: 'Street talk', ...neon(56, MAGENTA) }),
      widget(
        'chat',
        'chat',
        [1336, 160, 528, 664],
        live.chat({
          variant: 'neon',
          accent: CYAN,
          text: WHITE,
          background: '#14102a',
          radius: 8,
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [270, 140, 800, 420], live.alerts),
      ...lantern('l1', 1700, 940),
      brand([1842, 100, 24, 24], 'mark', MAGENTA),
      widget('goal', 'goal', [60, 952, 560, 96], live.goal(tubeGoal)),
      widget(
        'latest',
        'label',
        [660, 968, 480, 62],
        live.label('latest_sub', 'Latest sub: {value}', neonLabel),
      ),
      rotator('socials', [1180, 976, 480, 44], SOCIALS, { ...teko(32), letter_spacing: 0.12 }),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Last train is in. Grab a seat at the counter.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'Stepped out for a convenience store run.'),
    scene('ending', 'Ending', [
      ...street(),
      ...bigSign(480, 120, 960, 560),
      brand([1394, 136, 26, 26], 'mark', CYAN),
      text('kicker', [520, 150, 880, 40], {
        text: 'Closing time',
        ...teko(34, AMBER),
        letter_spacing: 0.3,
        align: 'center',
      }),
      text('title', [500, 184, 920, 160], {
        text: 'Oyasumi',
        ...neon(160, MAGENTA),
        align: 'center',
        ...enter('fade', 200),
      }),
      text('sub', [520, 340, 880, 40], {
        text: 'Goodnight. Thanks for walking the city with me.',
        font: 'Hanken Grotesk',
        size: 26,
        weight: 500,
        color: '#d7d0f2',
        align: 'center',
      }),
      widget(
        'top',
        'label',
        [640, 400, 640, 62],
        live.label('top_tip_session', 'Top tip: {value}', neonLabel),
      ),
      widget(
        'subs',
        'label',
        [640, 474, 640, 62],
        live.label('session_subs', 'Subs tonight: {value}', { ...neonLabel, accent: CYAN }),
      ),
      widget('events', 'events', [640, 552, 640, 116], {
        ...live.events(cardEvents),
        max_items: 2,
      }),
      rotator('socials', [560, 720, 800, 44], SOCIALS, {
        ...teko(36),
        align: 'center',
        letter_spacing: 0.14,
        shadow: 'soft',
      }),
    ]),
  ],
  'builtin.neon-kanban',
)
