// Diwali lights: indigo night, strings of warm lights along the top, a row of flickering
// diyas, a rangoli of nested petals and diamonds, marigold garlands and sparkles, Baloo 2
// type with a Hindi greeting. The Spark sits small at the centre of the rangoli, and on the
// garland knot in the live scenes.

import {
  brand,
  box,
  cam,
  countdown,
  cut,
  enter,
  live,
  mat,
  surround,
  pattern,
  rotator,
  scene,
  text,
  themeDesign,
  widget,
} from '../kit'

const NIGHT = '#120a2e'
const NIGHT2 = '#24104d'
const MARIGOLD = '#ff9f1c'
const SAFFRON = '#ff6b00'
const MAGENTA = '#e0218a'
const GOLD = '#ffd166'
const CREAM = '#fff4e0'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname'] as const

const festLabel = { variant: 'ribbon', accent: MAGENTA, text: CREAM, font: 'Baloo 2' }
const festGoal = {
  variant: 'liquid',
  accent: MARIGOLD,
  track: '#0c0620',
  text: CREAM,
  background: '#24104de6',
  radius: 24,
  font: 'Baloo 2',
}
const festEvents = {
  variant: 'cards',
  accent: MARIGOLD,
  text: CREAM,
  background: '#24104de6',
  radius: 16,
  font: 'Baloo 2',
}

/** A diya: clay bowl, warm glow, a flame that flickers. */
const diya = (id: string, x: number, y: number, s = 1) => [
  cut(`${id}-flame`, [x + 46 * s, y - 64 * s, 28 * s, 60 * s], 'drop', {
    fill: '#fff3b0',
    fill2: SAFFRON,
    angle: 180,
    shadow: 'glow',
    ...enter('fade', 300, 'pulse'),
  }),
  box(`${id}-bowl`, [x, y, 120 * s, 46 * s], {
    shape: 'rect',
    fill: '#d9622b',
    fill2: '#8a2f12',
    angle: 180,
    radius: 6,
  }),
  box(`${id}-rim`, [x - 6 * s, y - 6 * s, 132 * s, 14 * s], { shape: 'ellipse', fill: '#f08a4b' }),
]
/** A rangoli: nested rings, petals and diamonds with the mark at its heart. */
const rangoli = (cx: number, cy: number, r: number) => [
  cut('rg-burst', [cx - r, cy - r, r * 2, r * 2], 'burst', {
    fill: MAGENTA,
    ...enter('zoom', 100),
  }),
  cut('rg-star', [cx - r * 0.78, cy - r * 0.78, r * 1.56, r * 1.56], 'star', { fill: MARIGOLD }),
  box('rg-ring', [cx - r * 0.5, cy - r * 0.5, r, r], {
    shape: 'ellipse',
    fill: NIGHT2,
    stroke: GOLD,
    stroke_width: 6,
  }),
  cut('rg-diamond', [cx - r * 0.34, cy - r * 0.34, r * 0.68, r * 0.68], 'diamond', {
    fill: '#2ec4b6',
  }),
  brand([cx - 15, cy - 15, 30, 30], 'mark', CREAM),
]
const garland = (y: number) =>
  pattern('garland', [0, y, 1920, 26], 'dots', MARIGOLD, { scale: 1.1 })
const night = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: NIGHT2, fill2: NIGHT, angle: 180 }),
  pattern('sparkle', [0, 0, 1920, 1080], 'sparkles', GOLD, { moving: true, scale: 0.9 }),
  pattern('lights', [0, 0, 1920, 200], 'lights', GOLD, { moving: true, scale: 1.3 }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...night(),
    ...rangoli(1460, 470, 230),
    text('hindi', [140, 230, 900, 90], {
      text: 'शुभ दीपावली',
      font: 'Baloo 2',
      size: 72,
      weight: 800,
      color: GOLD,
      ...enter('fade', 150),
    }),
    text('title', [130, 310, 1000, 170], {
      text: title,
      font: 'Baloo 2',
      size: 130,
      weight: 800,
      color: CREAM,
      color2: MARIGOLD,
      effect: 'gradient',
      ...enter('rise', 300),
    }),
    text('sub', [140, 480, 900, 50], {
      text: sub,
      font: 'Baloo 2',
      size: 34,
      weight: 500,
      color: '#f3dcc0',
      ...enter('fade', 600),
    }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [140, 550, 700, 110],
          300,
          'Starting in {time}',
          {
            font: 'Baloo 2',
            size: 72,
            weight: 800,
            color: GOLD,
            shadow: 'glow',
            ...enter('fade', 800),
          },
          'Here we go',
        )
      : widget('events', 'events', [140, 550, 620, 220], live.events(festEvents)),
    ...diya('d1', 180, 900),
    ...diya('d2', 560, 920, 0.8),
    ...diya('d3', 1300, 920, 0.8),
    ...diya('d4', 1660, 900),
    rotator(
      'socials',
      [700, 790, 800, 44],
      SOCIALS,
      { font: 'Baloo 2', size: 32, weight: 700, color: CREAM, align: 'left' },
      5,
    ),
    widget('goal', 'goal', [760, 880, 440, 96], live.goal(festGoal)),
  ])

export default themeDesign(
  {
    slug: 'diwali-lights',
    name: 'Diwali lights',
    description:
      'Strings of warm lights, flickering diyas and a rangoli, with a Hindi greeting. Festive pack.',
    style: 'cozy',
    motion: 'lively',
    pro: true,
  },
  [
    scene('in_game', 'In game', [
      pattern('lights', [0, 0, 1920, 120], 'lights', GOLD, { moving: true, scale: 1.4 }),
      cam('cam', [40, 680, 480, 330], 'bulbs', {
        color: MARIGOLD,
        accent: GOLD,
        thickness: 4,
        radius: 18,
        label: 'Happy Diwali',
        ...enter('fade', 0, 'pulse'),
      }),
      ...diya('d1', 540, 1000, 0.6),
      cut('knot', [252, 1016, 56, 56], 'burst', { fill: MAGENTA }),
      brand([266, 1030, 28, 28], 'mark', CREAM),
      widget(
        'latest',
        'label',
        [40, 140, 460, 60],
        live.label('latest_follower', 'Welcome {value}', festLabel),
      ),
      widget('alerts', 'alerts', [560, 120, 800, 420], live.alerts),
      widget('goal', 'goal', [1420, 140, 460, 96], live.goal(festGoal)),
      widget('events', 'events', [1500, 760, 380, 270], live.events(festEvents)),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [56, 156, 1208, 768], { fill: NIGHT }),
      pattern('lights', [0, 0, 1920, 140], 'lights', GOLD, { moving: true, scale: 1.3 }),
      mat('cam-mat', [56, 156, 1208, 768], '#0c0620', 16, 30),
      cam('cam', [56, 156, 1208, 768], 'bulbs', {
        color: MARIGOLD,
        accent: GOLD,
        thickness: 4,
        radius: 24,
        ...enter('fade', 0, 'pulse'),
      }),
      box('chat-back', [1320, 140, 560, 800], {
        shape: 'rect',
        fill: '#24104de6',
        radius: 30,
        stroke: '#ff9f1c66',
        stroke_width: 2,
      }),
      text('chat-head', [1350, 156, 500, 50], {
        text: 'Mehfil chat',
        font: 'Baloo 2',
        size: 36,
        weight: 800,
        color: GOLD,
      }),
      widget(
        'chat',
        'chat',
        [1340, 210, 520, 710],
        live.chat({
          variant: 'plates',
          accent: MARIGOLD,
          text: CREAM,
          background: '#120a2e',
          radius: 16,
          font: 'Baloo 2',
        }),
      ),
      widget('alerts', 'alerts', [260, 200, 800, 420], live.alerts),
      garland(948),
      cut('knot', [932, 934, 56, 56], 'burst', { fill: MAGENTA }),
      brand([946, 948, 28, 28], 'mark', CREAM),
      widget('goal', 'goal', [40, 980, 520, 90], live.goal(festGoal)),
      widget(
        'latest',
        'label',
        [1340, 990, 520, 60],
        live.label('latest_sub', 'New sub {value}', festLabel),
      ),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Lighting the diyas. Pull up a cushion.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'Grabbing mithai. Back in a minute.'),
    scene('ending', 'Ending', [
      ...night(),
      ...rangoli(960, 330, 170),
      text('title', [160, 540, 1600, 150], {
        text: 'Thank you, and Happy Diwali',
        font: 'Baloo 2',
        size: 100,
        weight: 800,
        color: CREAM,
        color2: MARIGOLD,
        effect: 'gradient',
        align: 'center',
        ...enter('rise', 300),
      }),
      text('hindi', [360, 680, 1200, 60], {
        text: 'रोशनी और खुशियाँ आपके साथ रहें',
        font: 'Baloo 2',
        size: 40,
        weight: 600,
        color: GOLD,
        align: 'center',
      }),
      widget('events', 'events', [120, 760, 560, 270], live.events(festEvents)),
      widget(
        'top',
        'label',
        [740, 800, 440, 60],
        live.label('top_tip_session', 'Top tip {value}', festLabel),
      ),
      rotator(
        'socials',
        [700, 900, 520, 44],
        SOCIALS,
        { font: 'Baloo 2', size: 30, weight: 700, color: CREAM, align: 'center' },
        5,
      ),
      ...diya('d4', 1640, 920),
    ]),
  ],
  'builtin.diya-glow',
)
