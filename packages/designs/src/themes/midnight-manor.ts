// Midnight manor: a Halloween night. A huge pale moon with bats crossing it, a crooked
// manor silhouette, jack-o'-lanterns with carved faces, drifting fog, a cobweb in the
// corner, dripping Creepster headlines. The Spark is a small mark on a pumpkin.

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

const NIGHT = '#0d0716'
const PURPLE = '#5b2a86'
const PUMPKIN = '#ff7a1a'
const SLIME = '#8cff4a'
const BONE = '#efe6d8'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'discord.gg/yourname'] as const

const spookLabel = {
  variant: 'tag',
  accent: PUMPKIN,
  text: BONE,
  background: '#1c1029f0',
  radius: 8,
  font: 'Creepster',
  font_size: 28,
}
const slimeGoal = {
  variant: 'liquid',
  accent: SLIME,
  track: '#140b20',
  text: BONE,
  background: '#1c1029f0',
  radius: 16,
  font: 'Creepster',
}
const spookEvents = {
  variant: 'cards',
  accent: PUMPKIN,
  text: BONE,
  background: '#1c1029e6',
  radius: 10,
}

/** A jack-o'-lantern: body, stem, carved eyes and grin. */
const pumpkin = (id: string, x: number, y: number, s: number, mark = false) => [
  box(`${id}-stem`, [x + s * 0.44, y - s * 0.12, s * 0.12, s * 0.2], {
    shape: 'rect',
    fill: '#3f6b2a',
    radius: 4,
  }),
  box(`${id}`, [x, y, s, s * 0.8], {
    shape: 'ellipse',
    fill: '#ffa14a',
    fill2: '#d9520b',
    angle: 160,
  }),
  cut(
    `${id}-e1`,
    [x + s * 0.22, y + s * 0.2, s * 0.18, s * 0.16],
    'pennant',
    { fill: '#ffe08a' },
    { rotation: 180 },
  ),
  cut(
    `${id}-e2`,
    [x + s * 0.6, y + s * 0.2, s * 0.18, s * 0.16],
    'pennant',
    { fill: '#ffe08a' },
    { rotation: 180 },
  ),
  cut(
    `${id}-grin`,
    [x + s * 0.24, y + s * 0.46, s * 0.52, s * 0.16],
    'moon',
    { fill: '#ffe08a' },
    { rotation: -90 },
  ),
  ...(mark ? [brand([x + s * 0.5 - 14, y + s * 0.8 - 34, 28, 28], 'mark', '#3a1a05')] : []),
]
const bat = (id: string, x: number, y: number, w: number, rot = 0) =>
  cut(
    id,
    [x, y, w, w * 0.5],
    'bat',
    { fill: '#000000', ...enter('slide_right', 400, 'float') },
    { rotation: rot },
  )
const manor = (x: number, y: number) => [
  box('house', [x, y + 140, 420, 260], { shape: 'rect', fill: '#07040c' }),
  box('roof', [x - 20, y + 30, 460, 120], { shape: 'triangle', fill: '#07040c' }),
  box('tower', [x + 300, y - 60, 90, 240], { shape: 'rect', fill: '#07040c' }),
  box('tower-roof', [x + 280, y - 150, 130, 100], { shape: 'triangle', fill: '#07040c' }),
  box('win1', [x + 70, y + 200, 50, 70], {
    shape: 'rect',
    fill: '#ffd166',
    ...enter('fade', 600, 'pulse'),
  }),
  box('win2', [x + 320, y + 10, 40, 56], { shape: 'rect', fill: '#ffd166' }),
]
const web = (x: number, y: number, s: number) => [
  pattern('web-rings', [x, y, s, s], 'rings', '#efe6d855', { scale: 1.6, clip: 'pennant' }),
  pattern('web-rays', [x, y, s, s], 'rays', '#efe6d844', { clip: 'pennant' }),
]
const night = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: '#2a1240', fill2: NIGHT, angle: 180 }),
  box('moon-glow', [1160, 40, 620, 620], {
    shape: 'ellipse',
    fill: '#f0dfb433',
    fill2: '#f0dfb400',
    angle: 180,
  }),
  box('moon', [1260, 140, 420, 420], {
    shape: 'ellipse',
    fill: '#fff8e6',
    fill2: '#d9c48f',
    angle: 200,
    ...enter('fade', 100),
  }),
  ...manor(1340, 520),
  bat('bat1', 1300, 260, 120, -10),
  bat('bat2', 1520, 200, 80, 12),
  bat('bat3', 1440, 380, 60, -4),
  box('hill', [0, 880, 1920, 200], { shape: 'ellipse', fill: '#07040c' }),
  box('ground', [0, 980, 1920, 100], { shape: 'rect', fill: '#07040c' }),
  pattern(
    'fog',
    [0, 760, 1920, 320],
    'bokeh',
    '#d8c9ea',
    { moving: true, scale: 1.2 },
    { opacity: 0.35 },
  ),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...night(),
    ...web(0, 0, 360),
    text('title', [120, 240, 1100, 200], {
      text: title,
      font: 'Creepster',
      size: 150,
      color: SLIME,
      shadow: 'glow',
      split: 'letters',
      ...enter('drop', 200),
    }),
    text('sub', [130, 440, 1000, 50], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 32,
      weight: 600,
      color: '#d8c9ea',
      ...enter('fade', 700),
    }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [130, 510, 760, 120],
          300,
          'Doors creak open in {time}',
          { font: 'Creepster', size: 64, color: PUMPKIN, ...enter('fade', 900) },
          'Enter if you dare',
        )
      : widget('events', 'events', [130, 520, 600, 260], live.events(spookEvents)),
    ...pumpkin('p1', 140, 860, 170, true),
    ...pumpkin('p2', 360, 900, 120),
    rotator(
      'socials',
      [620, 940, 640, 44],
      SOCIALS,
      { font: 'Creepster', size: 34, color: BONE },
      5,
    ),
    widget('goal', 'goal', [1360, 960, 500, 96], live.goal(slimeGoal)),
  ])

export default themeDesign(
  {
    slug: 'midnight-manor',
    name: 'Midnight manor',
    description:
      'A Halloween night: huge moon, bats, a crooked manor, carved pumpkins and fog. Seasonal pack.',
    style: 'playful',
    motion: 'lively',
    pro: true,
  },
  [
    scene('in_game', 'In game', [
      ...web(0, 0, 220),
      cam('cam', [40, 680, 480, 330], 'brush', {
        color: PURPLE,
        accent: PUMPKIN,
        thickness: 6,
        radius: 0,
        label: 'Live from the manor',
      }),
      ...pumpkin('p1', 460, 930, 120, true),
      bat('bat1', 520, 640, 80, -8),
      widget(
        'latest',
        'label',
        [240, 40, 420, 60],
        live.label('latest_follower', 'New ghoul {value}', spookLabel),
      ),
      widget('alerts', 'alerts', [560, 120, 800, 420], live.alerts),
      widget('goal', 'goal', [1400, 40, 480, 96], live.goal(slimeGoal)),
      widget('events', 'events', [1500, 760, 380, 270], live.events(spookEvents)),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [56, 96, 1188, 788], { fill: NIGHT }),
      mat('cam-mat', [56, 96, 1188, 788], '#140b20', 16, 12),
      cam('cam', [56, 96, 1188, 788], 'brush', {
        color: PURPLE,
        accent: PUMPKIN,
        thickness: 6,
        radius: 0,
      }),
      box('chat-back', [1300, 80, 580, 820], {
        shape: 'rect',
        fill: '#140b20e6',
        radius: 120,
        stroke: PURPLE,
        stroke_width: 3,
      }),
      text('chat-head', [1300, 110, 580, 60], {
        text: 'The séance',
        font: 'Creepster',
        size: 48,
        color: SLIME,
        align: 'center',
      }),
      widget(
        'chat',
        'chat',
        [1330, 180, 520, 700],
        live.chat({
          variant: 'plates',
          accent: PUMPKIN,
          text: BONE,
          background: '#231433',
          radius: 10,
        }),
      ),
      widget('alerts', 'alerts', [260, 140, 800, 420], live.alerts),
      ...pumpkin('p1', 1120, 860, 150, true),
      bat('bat1', 1180, 30, 90, 8),
      widget('goal', 'goal', [40, 950, 520, 96], live.goal(slimeGoal)),
      widget(
        'latest',
        'label',
        [600, 968, 440, 60],
        live.label('latest_sub', 'New ghoul {value}', spookLabel),
      ),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'The candles are lit. Something stirs in the manor.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'Went to check that noise in the attic…'),
    scene('ending', 'Ending', [
      ...night(),
      ...web(0, 0, 360),
      text('title', [120, 230, 1100, 200], {
        text: 'Rest in peace',
        font: 'Creepster',
        size: 150,
        color: SLIME,
        shadow: 'glow',
        ...enter('drop', 200),
      }),
      text('sub', [130, 430, 1000, 50], {
        text: 'Thanks for surviving the night. Same haunt, next time.',
        font: 'Hanken Grotesk',
        size: 30,
        weight: 600,
        color: '#d8c9ea',
      }),
      widget('events', 'events', [130, 500, 600, 280], live.events(spookEvents)),
      widget(
        'top',
        'label',
        [130, 800, 520, 60],
        live.label('top_tip_session', 'Bravest tip {value}', spookLabel),
      ),
      ...pumpkin('p1', 760, 860, 170, true),
      rotator(
        'socials',
        [980, 990, 640, 44],
        SOCIALS,
        { font: 'Creepster', size: 34, color: BONE },
        5,
      ),
    ]),
  ],
  'builtin.midnight-howl',
)
