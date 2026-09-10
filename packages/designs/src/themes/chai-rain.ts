// Chai & rain: a lo-fi room at night. A rain-streaked window with a moon, a steaming mug,
// a trailing plant, warm lamp glow, rounded cards, handwritten headings and a now-playing
// card. The Spark is printed small on the mug, and on a coaster in the live scenes.

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

const NIGHT = '#10242b'
const DEEP = '#0b1a1f'
const GLASS = '#1f3b4d'
const LAMP = '#ffb35c'
const CREAM = '#fff3e0'
const LEAF = '#6fbf8e'
const LEAF2 = '#3f8f68'
const SOCIALS = [
  'twitch.tv/yourname',
  'Find me on YouTube @yourname',
  'Join the Discord: gg/yourname',
] as const

const softLabel = {
  variant: 'chip',
  accent: LAMP,
  text: CREAM,
  background: '#173039e6',
  radius: 20,
  font: 'Caveat',
  font_size: 26,
}
const softGoal = {
  variant: 'liquid',
  accent: LAMP,
  track: '#0b1a1f',
  text: CREAM,
  background: '#173039e6',
  radius: 20,
  font: 'Caveat',
}
const softEvents = { variant: 'timeline', accent: LAMP, text: CREAM, font: 'Caveat' }

/** A window: frame, glass, moon, rain, and the cross bars. */
const window = (x: number, y: number, w: number, h: number) => [
  box('win-frame', [x - 18, y - 18, w + 36, h + 36], {
    shape: 'rect',
    fill: '#2a1d16',
    fill2: '#1a120d',
    angle: 180,
    radius: 18,
  }),
  box('win-glass', [x, y, w, h], {
    shape: 'rect',
    fill: GLASS,
    fill2: '#0e1d27',
    angle: 180,
    radius: 8,
  }),
  cut('moon', [x + w * 0.62, y + h * 0.12, w * 0.2, w * 0.2], 'moon', {
    fill: '#f3ead2',
    shadow: 'glow',
  }),
  pattern('rain', [x, y, w, h], 'rain', '#cfe6ff', { moving: true, radius: 8 }),
  box('bar-v', [x + w / 2 - 6, y, 12, h], { shape: 'rect', fill: '#2a1d16' }),
  box('bar-h', [x, y + h * 0.48, w, 12], { shape: 'rect', fill: '#2a1d16' }),
  box('sill', [x - 40, y + h + 14, w + 80, 22], { shape: 'rect', fill: '#3a281c', radius: 6 }),
]

/** The mug, with steam and the small Spark printed on it. */
const mug = (x: number, y: number) => [
  box('mug-handle', [x + 104, y + 30, 54, 70], {
    shape: 'ellipse',
    stroke: '#e8d8c3',
    stroke_width: 12,
  }),
  box('mug', [x, y, 130, 140], {
    shape: 'rect',
    fill: '#f2e6d6',
    fill2: '#d9c6ad',
    angle: 90,
    radius: 18,
  }),
  box('chai', [x + 8, y + 6, 114, 16], { shape: 'ellipse', fill: '#c4874a' }),
  cut('steam-a', [x + 26, y - 110, 34, 90], 'leaf', {
    fill: '#ffffff26',
    ...enter('fade', 400, 'float'),
  }),
  cut('steam-b', [x + 70, y - 140, 30, 110], 'leaf', {
    fill: '#ffffff1c',
    ...enter('fade', 900, 'float'),
  }),
  brand([x + 51, y + 60, 28, 28], 'mark', '#8a5a33'),
]

/** A plant trailing down from the top corner. */
const plant = (x: number) => [
  box('pot', [x, 0, 150, 70], {
    shape: 'rect',
    fill: '#c96f4a',
    fill2: '#9c4f33',
    angle: 180,
    radius: 10,
  }),
  cut('leaf-1', [x + 10, 60, 60, 110], 'leaf', { fill: LEAF }, { rotation: 18 }),
  cut('leaf-2', [x + 70, 70, 54, 100], 'leaf', { fill: LEAF2 }, { rotation: -14 }),
  cut('leaf-3', [x + 30, 160, 50, 96], 'leaf', { fill: LEAF }, { rotation: 32 }),
  cut('leaf-4', [x + 86, 170, 46, 90], 'leaf', { fill: LEAF2 }, { rotation: -28 }),
]

/** Now playing: a rounded card with music bars. */
const nowPlaying = (x: number, y: number) => [
  box('np-card', [x, y, 460, 96], {
    shape: 'rect',
    fill: '#173039',
    fill2: '#10242b',
    angle: 90,
    radius: 24,
    stroke: '#ffffff1a',
    stroke_width: 1,
  }),
  pattern('np-eq', [x + 22, y + 26, 56, 44], 'eq', LAMP, { moving: true, scale: 0.6 }),
  text('np-cap', [x + 100, y + 16, 340, 26], {
    text: 'Now playing',
    font: 'Hanken Grotesk',
    size: 18,
    weight: 600,
    color: '#9fc4b8',
    uppercase: true,
    letter_spacing: 0.12,
  }),
  text('np-song', [x + 100, y + 42, 340, 40], {
    text: 'rain on the window, slowed',
    font: 'Caveat',
    size: 34,
    weight: 700,
    color: CREAM,
  }),
]

const room = () => [
  box('wall', [0, 0, 1920, 1080], { shape: 'rect', fill: NIGHT, fill2: DEEP, angle: 160 }),
  pattern(
    'lamp-glow',
    [0, 0, 1920, 1080],
    'bokeh',
    LAMP,
    { moving: true, scale: 0.7 },
    { opacity: 0.6 },
  ),
  box('desk', [0, 880, 1920, 200], {
    shape: 'rect',
    fill: '#2a1d16',
    fill2: '#1a120d',
    angle: 180,
  }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...room(),
    ...window(1100, 140, 640, 560),
    ...plant(1620),
    ...mug(1240, 740),
    text('title', [120, 230, 960, 170], {
      text: title,
      font: 'Caveat',
      size: 116,
      weight: 700,
      color: CREAM,
      ...enter('rise', 150),
    }),
    text('sub', [126, 410, 860, 50], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 30,
      weight: 500,
      color: '#cfe3dc',
      ...enter('fade', 500),
    }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [126, 480, 600, 90],
          300,
          'brewing… {time}',
          { font: 'Caveat', size: 72, weight: 700, color: LAMP, ...enter('fade', 700) },
          'pouring now',
        )
      : widget('events', 'events', [126, 480, 620, 260], live.events(softEvents)),
    ...nowPlaying(120, 760),
    rotator(
      'socials',
      [640, 790, 520, 40],
      SOCIALS,
      { font: 'Caveat', size: 32, weight: 600, color: CREAM, align: 'left' },
      6,
    ),
    widget('goal', 'goal', [120, 900, 520, 96], live.goal(softGoal)),
    widget(
      'latest',
      'label',
      [680, 930, 440, 56],
      live.label('latest_follower', 'last in: {value}', softLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'chai-rain',
    name: 'Chai & rain',
    description:
      'A lo-fi room at night: rainy window, steaming mug, plants and a now-playing card.',
    style: 'cozy',
    motion: 'smooth',
  },
  [
    scene('in_game', 'In game', [
      cam('cam', [40, 670, 480, 340], 'polaroid', {
        color: '#f6efe4',
        accent: '#4b3a2c',
        thickness: 12,
        radius: 6,
        label: 'cosy corner',
      }),
      box('coaster', [536, 956, 60, 60], {
        shape: 'ellipse',
        fill: '#c96f4a',
        stroke: '#9c4f33',
        stroke_width: 3,
      }),
      brand([552, 972, 28, 28], 'mark', '#fff3e0'),
      widget(
        'latest',
        'label',
        [40, 40, 420, 56],
        live.label('latest_follower', 'last in: {value}', softLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1420, 40, 460, 96], live.goal(softGoal)),
      ...nowPlaying(1420, 950),
      rotator(
        'socials',
        [600, 1020, 720, 40],
        SOCIALS,
        { font: 'Caveat', size: 30, weight: 600, color: CREAM, align: 'center', shadow: 'soft' },
        6,
      ),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('wall', [56, 76, 1188, 788], { fill: NIGHT }),
      ...plant(1720),
      mat('cam-mat', [56, 76, 1188, 788], '#173039', 16, 30),
      cam('cam', [56, 76, 1188, 788], null, {
        color: '#ffb35c66',
        accent: LAMP,
        thickness: 2,
        radius: 22,
      }),
      box('chat-back', [1300, 60, 380, 820], { shape: 'rect', fill: '#173039e6', radius: 30 }),
      text('chat-head', [1330, 80, 320, 50], {
        text: 'chatting with you',
        font: 'Caveat',
        size: 36,
        weight: 700,
        color: LAMP,
      }),
      widget(
        'chat',
        'chat',
        [1316, 140, 350, 720],
        live.chat({
          variant: 'speech',
          accent: LAMP,
          text: CREAM,
          background: '#10242b',
          radius: 18,
        }),
      ),
      widget('alerts', 'alerts', [250, 120, 800, 420], live.alerts),
      ...mug(1720, 910),
      widget('goal', 'goal', [40, 930, 520, 96], live.goal(softGoal)),
      ...nowPlaying(600, 930),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'putting the kettle on',
      'Settle in. The stream starts in a few minutes.',
    ),
    waiting('brb', 'Be right back', 'refilling my chai', 'Back in a minute. Stay cosy.'),
    scene('ending', 'Ending', [
      ...room(),
      ...window(1100, 140, 640, 560),
      ...mug(1240, 740),
      text('title', [120, 200, 900, 170], {
        text: 'thanks for staying',
        font: 'Caveat',
        size: 132,
        weight: 700,
        color: CREAM,
        ...enter('rise', 150),
      }),
      text('sub', [126, 380, 860, 50], {
        text: 'Rest well. Same window, next time.',
        font: 'Hanken Grotesk',
        size: 30,
        weight: 500,
        color: '#cfe3dc',
      }),
      widget('events', 'events', [126, 460, 640, 280], live.events(softEvents)),
      widget(
        'top',
        'label',
        [126, 780, 520, 56],
        live.label('top_tip_session', 'kindest tip: {value}', softLabel),
      ),
      rotator(
        'socials',
        [126, 880, 700, 44],
        SOCIALS,
        { font: 'Caveat', size: 34, weight: 600, color: CREAM },
        6,
      ),
    ]),
  ],
  'builtin.chai-steam',
)
