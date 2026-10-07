// Winter cabin: a snowy night outside a log cabin. Pines dusted with snow, a roof under a
// thick white blanket, two windows glowing gold and a string of lights along the eave. The
// headline sits on a cream card with a red Nordic knit band, the goal fills like a candy
// cane. Festive without the clip art. The Spark is a small ornament on the knit band.

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

const NIGHT = '#0d1a2e'
const DUSK = '#1f3554'
const SNOW = '#eef3f8'
const PINE = '#173a2c'
const PINE2 = '#21503b'
const LOG = '#3a2219'
const RED = '#b3202f'
const CREAM = '#f7eedf'
const INK = '#2a1a14'
const GOLD = '#ffc56b'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname'] as const

const ribbonLabel = {
  variant: 'ribbon',
  accent: RED,
  text: CREAM,
  background: RED,
  radius: 6,
  font: 'Hanken Grotesk',
}
const caneGoal = {
  variant: 'candy',
  accent: RED,
  track: '#fbf5ea',
  text: INK,
  background: '#f7eedfee',
  radius: 24,
  font: 'Hanken Grotesk',
}
const cardEvents = {
  variant: 'cards',
  accent: RED,
  text: INK,
  background: '#f7eedff2',
  radius: 14,
  font: 'Hanken Grotesk',
}
const serif = (size: number, color = INK) => ({
  font: 'Playfair Display',
  size,
  weight: 800,
  color,
})
const caps = (size: number, color = CREAM) => ({
  font: 'Hanken Grotesk',
  size,
  weight: 700,
  color,
  uppercase: true,
  letter_spacing: 0.26,
})

/** A pine: three stacked triangles with a snowy tip. */
const pine = (id: string, x: number, bottom: number, s = 1) => [
  box(`${id}-c`, [x, bottom - 200 * s, 180 * s, 200 * s], {
    shape: 'triangle',
    fill: PINE2,
    fill2: PINE,
    angle: 180,
  }),
  box(`${id}-b`, [x + 20 * s, bottom - 290 * s, 140 * s, 160 * s], {
    shape: 'triangle',
    fill: PINE2,
    fill2: PINE,
    angle: 180,
  }),
  box(`${id}-a`, [x + 45 * s, bottom - 360 * s, 90 * s, 110 * s], {
    shape: 'triangle',
    fill: SNOW,
    fill2: PINE2,
    angle: 180,
  }),
]

/** The cabin: log walls, a snowed-in roof, two warm windows, a red door and the eave lights. */
const cabin = (x: number, y: number) => [
  box('win-glow', [x + 20, y + 120, 520, 300], {
    shape: 'ellipse',
    fill: '#ffc56b33',
    fill2: '#ffc56b00',
    angle: 180,
    ...enter('fade', 300, 'pulse'),
  }),
  box('walls', [x + 40, y + 170, 480, 250], {
    shape: 'rect',
    fill: '#4a2c20',
    fill2: LOG,
    angle: 180,
  }),
  box('roof', [x, y, 560, 190], { shape: 'triangle', fill: '#2a1712' }),
  box('roof-snow', [x + 26, y - 18, 508, 170], {
    shape: 'triangle',
    fill: '#ffffff',
    fill2: '#d7e2ee',
    angle: 180,
  }),
  pattern('eave-lights', [x + 30, y + 168, 500, 34], 'lights', GOLD, { moving: true, scale: 0.9 }),
  box('win-a', [x + 80, y + 230, 120, 110], {
    shape: 'rect',
    fill: '#ffe2a3',
    fill2: '#f29b38',
    angle: 180,
    radius: 4,
    shadow: 'glow',
  }),
  box('win-b', [x + 360, y + 230, 120, 110], {
    shape: 'rect',
    fill: '#ffe2a3',
    fill2: '#f29b38',
    angle: 180,
    radius: 4,
    shadow: 'glow',
  }),
  cut('mull-a', [x + 80, y + 230, 120, 110], 'cross', { fill: LOG }),
  cut('mull-b', [x + 360, y + 230, 120, 110], 'cross', { fill: LOG }),
  box('door', [x + 230, y + 250, 100, 170], {
    shape: 'rect',
    fill: RED,
    fill2: '#7c1520',
    angle: 180,
    radius: 6,
  }),
]

const night = () => [
  box('sky', [0, 0, 1920, 1080], { shape: 'rect', fill: NIGHT, fill2: DUSK, angle: 180 }),
  pattern('stars', [0, 0, 1920, 420], 'stars', '#ffffff', { scale: 0.7 }),
  ...pine('p1', 1040, 900, 1.1),
  ...pine('p2', 1756, 930, 0.9),
  ...cabin(1240, 420),
  box('ground', [0, 840, 1920, 240], { shape: 'rect', fill: SNOW, fill2: '#c9d6e6', angle: 180 }),
  box('drift', [820, 800, 1100, 200], { shape: 'ellipse', fill: SNOW }),
]

const snowfall = () =>
  pattern('snow', [0, 0, 1920, 1080], 'snow', '#ffffff', { moving: true, scale: 1.2 })

/** The cream card with a red knit band across the top. */
const card = (x: number, y: number, w: number, h: number, band: string) => [
  box('card', [x, y, w, h], {
    shape: 'rect',
    fill: CREAM,
    fill2: '#efe2cc',
    angle: 180,
    radius: 20,
    shadow: 'soft',
    ...enter('rise', 0),
  }),
  box('band', [x, y + 34, w, 74], { shape: 'rect', fill: RED }),
  pattern('knit-top', [x, y + 34, w, 14], 'zigzag', CREAM, { scale: 0.5 }),
  text('band-t', [x + 40, y + 52, w - 80, 40], {
    text: band,
    ...caps(24),
    align: 'center',
  }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...night(),
    ...card(
      120,
      140,
      900,
      640,
      key === 'starting_soon' ? 'Tonight by the fire' : 'Stepped out for cocoa',
    ),
    brand([980, 152, 24, 24], 'mark', RED),
    text('title', [160, 270, 820, 140], {
      text: title,
      ...serif(112),
      align: 'center',
      ...enter('rise', 200),
    }),
    text('sub', [180, 420, 780, 44], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 28,
      weight: 500,
      color: '#6b4a3a',
      align: 'center',
      ...enter('fade', 500),
    }),
    ...(key === 'starting_soon'
      ? [
          text('t-label', [180, 520, 780, 36], {
            text: 'Doors open in',
            ...caps(22, RED),
            align: 'center',
          }),
          countdown(
            'timer',
            [180, 560, 780, 170],
            300,
            '{time}',
            { ...serif(140, RED), align: 'center', ...enter('zoom', 600) },
            'Come in',
          ),
        ]
      : [widget('events', 'events', [230, 516, 680, 250], live.events(cardEvents))]),
    snowfall(),
    rotator('socials', [120, 880, 900, 44], SOCIALS, {
      ...caps(24, INK),
      align: 'center',
      letter_spacing: 0.16,
    }),
    widget('goal', 'goal', [140, 950, 560, 96], live.goal(caneGoal)),
    widget(
      'latest',
      'label',
      [740, 966, 440, 60],
      live.label('latest_follower', 'Welcome in, {value}', ribbonLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'winter-cabin',
    name: 'Winter cabin',
    description:
      'A snowy night outside a log cabin: glowing windows, pines, eave lights and a red knit band.',
    style: 'cozy',
    motion: 'smooth',
  },
  [
    scene('in_game', 'In game', [
      pattern('lights-top', [0, 0, 1920, 36], 'lights', GOLD, { moving: true, scale: 1.4 }),
      box('tag', [40, 56, 460, 132], { shape: 'rect', fill: '#f7eedff2', radius: 16 }),
      box('tag-band', [40, 56, 460, 12], { shape: 'rect', fill: RED, radius: 16 }),
      widget(
        'latest',
        'label',
        [56, 80, 428, 48],
        live.label('latest_follower', 'Welcome in, {value}', {
          ...ribbonLabel,
          variant: 'underline',
          text: INK,
          accent: RED,
          background: '#00000000',
        }),
      ),
      widget(
        'sub',
        'label',
        [56, 132, 428, 48],
        live.label('latest_sub', 'Latest sub: {value}', {
          ...ribbonLabel,
          variant: 'underline',
          text: INK,
          accent: PINE2,
          background: '#00000000',
        }),
      ),
      widget('alerts', 'alerts', [560, 50, 800, 420], live.alerts),
      widget('goal', 'goal', [1380, 60, 500, 96], live.goal(caneGoal)),
      mat('cam-mat', [44, 680, 480, 300], CREAM, 10, 16),
      cam('cam', [44, 680, 480, 300], 'stitch', {
        color: RED,
        accent: CREAM,
        thickness: 3,
        radius: 12,
      }),
      brand([494, 1000, 24, 24], 'mark', CREAM),
      pattern('snow-r', [1500, 700, 420, 380], 'snow', '#ffffff', { moving: true, scale: 0.4 }),
      box('soc', [1440, 1000, 440, 48], { shape: 'rect', fill: '#0d1a2ed9', radius: 24 }),
      rotator('socials', [1460, 1010, 400, 30], SOCIALS, {
        ...caps(18),
        letter_spacing: 0.12,
        align: 'center',
      }),
      widget('events', 'events', [1520, 560, 360, 420], live.events(cardEvents)),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 80, 1220, 760], { fill: NIGHT, fill2: DUSK, angle: 180 }),
      pattern('stars', [1300, 0, 620, 300], 'stars', '#ffffff', { scale: 0.5 }),
      pattern('lights-top', [0, 0, 1920, 40], 'lights', GOLD, { moving: true, scale: 1.4 }),
      mat('cam-mat', [60, 80, 1220, 760], CREAM, 12, 18),
      cam('cam', [60, 80, 1220, 760], 'stitch', {
        color: RED,
        accent: CREAM,
        thickness: 3,
        radius: 14,
      }),
      box('chat-card', [1320, 80, 560, 760], {
        shape: 'rect',
        fill: CREAM,
        fill2: '#efe2cc',
        angle: 180,
        radius: 20,
      }),
      box('chat-band', [1320, 108, 560, 64], { shape: 'rect', fill: RED }),
      pattern('chat-knit', [1320, 108, 560, 12], 'zigzag', CREAM, { scale: 0.5 }),
      text('chat-head', [1350, 124, 500, 40], {
        text: 'Fireside chat',
        ...caps(24),
        align: 'center',
      }),
      widget(
        'chat',
        'chat',
        [1336, 190, 528, 636],
        live.chat({
          variant: 'plates',
          accent: RED,
          text: INK,
          background: '#ffffff',
          radius: 12,
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [270, 140, 800, 420], live.alerts),
      brand([1846, 88, 24, 24], 'mark', RED),
      box('ground', [0, 870, 1920, 210], {
        shape: 'rect',
        fill: SNOW,
        fill2: '#c9d6e6',
        angle: 180,
      }),
      ...pine('p1', 1700, 1080, 0.55),
      ...pine('p2', 1790, 1080, 0.45),
      widget('goal', 'goal', [60, 948, 560, 96], live.goal(caneGoal)),
      widget(
        'latest',
        'label',
        [660, 966, 440, 60],
        live.label('latest_sub', 'Latest sub: {value}', ribbonLabel),
      ),
      rotator('socials', [1130, 978, 520, 36], SOCIALS, {
        ...caps(20, INK),
        letter_spacing: 0.12,
      }),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'The fire is lit and the cocoa is on.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'Grabbing more firewood. Stay warm.'),
    scene('ending', 'Ending', [
      ...night(),
      ...card(120, 120, 900, 700, 'Goodnight from the cabin'),
      brand([980, 132, 24, 24], 'mark', RED),
      text('title', [160, 250, 820, 130], {
        text: 'Warm wishes',
        ...serif(108),
        align: 'center',
        ...enter('rise', 200),
      }),
      text('sub', [180, 390, 780, 44], {
        text: 'Thank you for spending the evening here.',
        font: 'Hanken Grotesk',
        size: 28,
        weight: 500,
        color: '#6b4a3a',
        align: 'center',
      }),
      widget(
        'top',
        'label',
        [250, 470, 640, 62],
        live.label('top_tip_session', 'Top tip: {value}', ribbonLabel),
      ),
      widget(
        'subs',
        'label',
        [250, 546, 640, 62],
        live.label('session_subs', 'Subs tonight: {value}', ribbonLabel),
      ),
      widget('events', 'events', [250, 624, 640, 170], {
        ...live.events({ ...cardEvents, variant: 'stack' }),
        max_items: 3,
      }),
      snowfall(),
      rotator('socials', [120, 880, 900, 44], SOCIALS, {
        ...caps(24, INK),
        align: 'center',
        letter_spacing: 0.16,
      }),
    ]),
  ],
  'builtin.cabin-window',
)
