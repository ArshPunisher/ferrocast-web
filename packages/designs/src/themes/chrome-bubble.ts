// Chrome bubble: Y2K pop. A periwinkle-to-lilac sky, glossy chrome orbs with a hot white
// highlight, four-point sparkles, rising bubbles and liquid chrome capitals in Righteous.
// Panels are fat glossy pills with a white rim. The Spark sits inside a small chrome orb.

import {
  brand,
  box,
  cam,
  countdown,
  cut,
  enter,
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

const SKY = '#b9c8ff'
const LILAC = '#f1d2ff'
const MAGENTA = '#ff3fc8'
const BLUE = '#3456ff'
const INK = '#1d1546'
const WHITE = '#ffffff'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'discord.gg/yourname'] as const

const pillLabel = {
  variant: 'chip',
  accent: MAGENTA,
  text: INK,
  background: '#ffffffd9',
  radius: 30,
  font: 'Righteous',
}
const bubbleGoal = {
  variant: 'liquid',
  accent: MAGENTA,
  track: '#dfe4ff',
  text: INK,
  background: '#ffffffd9',
  radius: 32,
  font: 'Righteous',
}
const bubbleEvents = {
  variant: 'stickers',
  accent: BLUE,
  text: INK,
  background: '#ffffffcc',
  radius: 24,
  font: 'Righteous',
}
const chrome = (size: number) => ({
  font: 'Righteous',
  size,
  weight: 400,
  color: '#ffffff',
  color2: BLUE,
  effect: 'chrome' as const,
  uppercase: true,
  shadow: 'soft' as const,
})

/** A glossy chrome orb: a cool gradient ball, a rim, and a hot white highlight. */
const orb = (id: string, x: number, y: number, d: number, tint = BLUE, loop = false) => [
  box(id, [x, y, d, d], {
    shape: 'ellipse',
    fill: '#ffffff',
    fill2: tint,
    angle: 160,
    stroke: '#ffffffcc',
    stroke_width: Math.max(2, d * 0.02),
    shadow: 'soft',
    ...enter('pop', 200, loop ? 'float' : 'none'),
  }),
  box(`${id}-hi`, [x + d * 0.2, y + d * 0.12, d * 0.32, d * 0.2], {
    shape: 'ellipse',
    fill: '#ffffffee',
    fill2: '#ffffff00',
    angle: 180,
  }),
]
const sparkle = (id: string, x: number, y: number, s: number, c = WHITE) =>
  cut(id, [x, y, s, s], 'sparkle', { fill: c, shadow: 'glow', ...enter('pop', 500) })

const sky = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: SKY, fill2: LILAC, angle: 135 }),
  cut(
    'blob-a',
    [0, 600, 760, 480],
    'blob',
    { fill: '#ff9ee8', fill2: '#ff9ee800', angle: 30 },
    { opacity: 0.55 },
  ),
  cut(
    'blob-b',
    [1300, 0, 620, 460],
    'blob',
    { fill: '#9fe8ff', fill2: '#9fe8ff00', angle: 200 },
    { opacity: 0.6 },
  ),
  pattern('bubbles', [0, 0, 1920, 1080], 'bubbles', '#ffffffcc', { moving: true, scale: 0.9 }),
  pattern('sparkles', [0, 0, 1920, 1080], 'sparkles', WHITE, { moving: true, scale: 0.6 }),
]

/** A glossy white pill panel. */
const pill = (id: string, x: number, y: number, w: number, h: number) => [
  box(id, [x, y, w, h], {
    shape: 'rect',
    fill: '#ffffffd9',
    fill2: '#ffffff99',
    angle: 180,
    radius: h / 2,
    stroke: WHITE,
    stroke_width: 3,
    shadow: 'soft',
  }),
  box(`${id}-gloss`, [x + h * 0.4, y + 8, w - h * 0.8, h * 0.28], {
    shape: 'rect',
    fill: '#ffffffcc',
    fill2: '#ffffff00',
    angle: 180,
    radius: h,
  }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...sky(),
    ...orb('orb-a', 120, 140, 260, BLUE, true),
    ...orb('orb-b', 1580, 640, 220, MAGENTA, true),
    ...orb('orb-c', 1460, 170, 90, '#8a7dff'),
    brand([1489, 199, 32, 32], 'mark', WHITE),
    sparkle('sp1', 470, 120, 70),
    sparkle('sp2', 1340, 420, 54, MAGENTA),
    sparkle('sp3', 300, 760, 46),
    text('kicker', [460, 214, 1000, 40], {
      text: key === 'starting_soon' ? 'now loading' : 'buffering',
      font: 'Righteous',
      size: 30,
      weight: 400,
      color: MAGENTA,
      align: 'center',
      uppercase: true,
      letter_spacing: 0.4,
      ...enter('fade', 100),
    }),
    text('title', [160, 260, 1600, 200], {
      text: title,
      ...chrome(150),
      align: 'center',
      split: 'letters',
      ...enter('pop', 200),
    }),
    text('sub', [460, 470, 1000, 50], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 34,
      weight: 700,
      color: INK,
      align: 'center',
      ...enter('fade', 700),
    }),
    ...(key === 'starting_soon'
      ? [
          ...pill('timer-pill', 680, 560, 560, 150),
          countdown(
            'timer',
            [680, 576, 560, 120],
            300,
            '{time}',
            {
              font: 'Righteous',
              size: 100,
              weight: 400,
              color: BLUE,
              color2: MAGENTA,
              effect: 'gradient',
              align: 'center',
              ...enter('zoom', 800),
            },
            'online!',
          ),
        ]
      : [
          widget('events', 'events', [660, 560, 600, 260], {
            ...live.events(bubbleEvents),
            max_items: 4,
          }),
        ]),
    rotator('socials', [560, 850, 800, 44], SOCIALS, {
      font: 'Righteous',
      size: 30,
      weight: 400,
      color: INK,
      align: 'center',
      letter_spacing: 0.06,
    }),
    widget('goal', 'goal', [400, 940, 600, 100], live.goal(bubbleGoal)),
    widget(
      'latest',
      'label',
      [1040, 960, 480, 60],
      live.label('latest_follower', 'Latest: {value}', pillLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'chrome-bubble',
    name: 'Chrome bubble',
    description:
      'Y2K pop: chrome orbs, liquid chrome capitals, sparkles and bubbles on a periwinkle sky.',
    style: 'playful',
    motion: 'bouncy',
  },
  [
    scene('in_game', 'In game', [
      mat('cam-rim', [44, 664, 480, 330], WHITE, 8, 46),
      cam('cam', [44, 664, 480, 330], null, {
        style: 'double',
        color: MAGENTA,
        accent: BLUE,
        thickness: 3,
        radius: 40,
      }),
      ...orb('orb-a', 470, 604, 96, MAGENTA),
      brand([502, 636, 32, 32], 'mark', WHITE),
      sparkle('sp1', 24, 620, 40),
      widget(
        'latest',
        'label',
        [40, 40, 440, 60],
        live.label('latest_follower', 'Latest: {value}', pillLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 110, 440, 60],
        live.label('latest_sub', 'Sub: {value}', pillLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1380, 40, 500, 100], live.goal(bubbleGoal)),
      sparkle('sp2', 1846, 150, 34, MAGENTA),
      widget('events', 'events', [1520, 760, 360, 280], {
        ...live.events(bubbleEvents),
        max_items: 4,
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 80, 1200, 800], { fill: SKY, fill2: LILAC, angle: 135 }),
      pattern('bubbles', [1290, 0, 630, 1080], 'bubbles', '#ffffffcc', {
        moving: true,
        scale: 0.7,
      }),
      mat('cam-rim', [60, 80, 1200, 800], WHITE, 10, 52),
      cam('cam', [60, 80, 1200, 800], null, {
        style: 'double',
        color: MAGENTA,
        accent: BLUE,
        thickness: 3,
        radius: 44,
      }),
      box('chat-card', [1300, 80, 580, 800], {
        shape: 'rect',
        fill: '#ffffffb3',
        fill2: '#ffffff80',
        angle: 180,
        radius: 40,
        stroke: WHITE,
        stroke_width: 3,
        shadow: 'soft',
      }),
      text('chat-head', [1336, 100, 500, 60], {
        text: 'chat room',
        font: 'Righteous',
        size: 44,
        weight: 400,
        color: BLUE,
        color2: MAGENTA,
        effect: 'gradient',
        uppercase: true,
      }),
      widget(
        'chat',
        'chat',
        [1320, 170, 540, 690],
        live.chat({
          variant: 'speech',
          accent: MAGENTA,
          text: INK,
          background: '#ffffff',
          radius: 22,
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [260, 140, 800, 420], live.alerts),
      ...orb('orb-a', 1180, 830, 120, MAGENTA),
      brand([1222, 870, 34, 34], 'mark', WHITE),
      widget('goal', 'goal', [60, 940, 600, 100], live.goal(bubbleGoal)),
      widget(
        'latest',
        'label',
        [700, 960, 440, 60],
        live.label('latest_sub', 'Latest sub: {value}', pillLabel),
      ),
      rotator('socials', [1320, 970, 560, 44], SOCIALS, {
        font: 'Righteous',
        size: 28,
        weight: 400,
        color: INK,
        align: 'right',
      }),
      sparkle('sp1', 1840, 30, 40),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Charging the flip phone. Almost there.',
    ),
    waiting('brb', 'Be right back', 'BRB', 'Burning a new mix CD. Back in a sec.'),
    scene('ending', 'Ending', [
      ...sky(),
      ...orb('orb-a', 140, 160, 240, BLUE, true),
      ...orb('orb-b', 1560, 620, 240, MAGENTA, true),
      brand([1840, 1010, 32, 32], 'mark', INK),
      sparkle('sp1', 470, 130, 64),
      sparkle('sp2', 1400, 200, 54, MAGENTA),
      text('title', [160, 180, 1600, 190], {
        text: 'Logging off',
        ...chrome(144),
        align: 'center',
        split: 'letters',
        ...enter('pop', 200),
      }),
      text('sub', [460, 380, 1000, 50], {
        text: 'Thanks for hanging out. Stay sparkly.',
        font: 'Hanken Grotesk',
        size: 34,
        weight: 700,
        color: INK,
        align: 'center',
      }),
      widget('events', 'events', [660, 460, 600, 300], {
        ...live.events(bubbleEvents),
        max_items: 4,
      }),
      widget(
        'top',
        'label',
        [700, 790, 520, 60],
        live.label('top_tip_session', 'Top tip: {value}', pillLabel),
      ),
      rotator('socials', [560, 900, 800, 44], SOCIALS, {
        font: 'Righteous',
        size: 30,
        weight: 400,
        color: INK,
        align: 'center',
      }),
    ]),
  ],
  'builtin.chrome-pop',
)
