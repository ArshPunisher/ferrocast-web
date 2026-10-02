// Lo-fi loft: a small room late at night. A plum wall, a window on a sleeping city with a
// big moon, a warm desk lamp, a plant on the sill and a mug on the desk. Italic serif
// headlines, a cream cassette label for the countdown, soft amber light. Dry and calm (no
// rain, that's Chai rain). The Spark sits on the window sill like a little ornament.

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

const WALL = '#251f3a'
const WALL2 = '#16122a'
const WOOD = '#3d2f4d'
const AMBER = '#ffb86b'
const CREAM = '#f6e7d0'
const SAGE = '#8fb39a'
const ROSE = '#e8a3a0'
const INK = '#1a1526'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'discord.gg/yourname'] as const

const chipLabel = {
  variant: 'chip',
  accent: AMBER,
  text: CREAM,
  background: '#1a1526d9',
  radius: 22,
  font: 'Hanken Grotesk',
}
const warmGoal = {
  variant: 'liquid',
  accent: AMBER,
  track: '#120e1e',
  text: CREAM,
  background: '#251f3ae6',
  radius: 24,
  font: 'Hanken Grotesk',
}
const cardEvents = {
  variant: 'cards',
  accent: AMBER,
  text: CREAM,
  background: '#1a1526cc',
  radius: 18,
  font: 'Hanken Grotesk',
}
const serif = (size: number) => ({
  font: 'Playfair Display',
  size,
  weight: 700,
  italic: true,
  color: CREAM,
})
const mono = { font: 'JetBrains Mono', weight: 500, color: AMBER, letter_spacing: 0.18 }

/** The window: wooden frame, night sky, stars, moon, a skyline with a few lit windows. */
const windowAt = (x: number, y: number, w: number, h: number) => {
  const ix = x + 22
  const iy = y + 22
  const iw = w - 44
  const ih = h - 44
  return [
    box('win-frame', [x, y, w, h], { shape: 'rect', fill: WOOD, radius: 18, shadow: 'soft' }),
    box('win-sky', [ix, iy, iw, ih], {
      shape: 'rect',
      fill: '#33468a',
      fill2: '#141a3c',
      angle: 0,
      radius: 6,
    }),
    pattern('win-stars', [ix, iy, iw, ih * 0.55], 'stars', '#fff7e0', {
      moving: true,
      scale: 0.6,
    }),
    box('moon-glow', [x + w * 0.56, y + h * 0.08, w * 0.34, w * 0.34], {
      shape: 'ellipse',
      fill: '#fff2c933',
      fill2: '#fff2c900',
      angle: 180,
    }),
    box('moon', [x + w * 0.64, y + h * 0.13, w * 0.18, w * 0.18], {
      shape: 'ellipse',
      fill: '#fff6dc',
      fill2: '#f3d9a0',
      angle: 160,
      shadow: 'glow',
      ...enter('fade', 300),
    }),
    box('city-a', [ix, iy + ih * 0.66, iw * 0.3, ih * 0.34], { shape: 'rect', fill: '#0f1228' }),
    box('city-b', [ix + iw * 0.28, iy + ih * 0.54, iw * 0.2, ih * 0.46], {
      shape: 'rect',
      fill: '#121630',
    }),
    box('city-c', [ix + iw * 0.5, iy + ih * 0.72, iw * 0.5, ih * 0.28], {
      shape: 'rect',
      fill: '#0d1024',
    }),
    pattern('lights-a', [ix + 8, iy + ih * 0.7, iw * 0.3 - 16, ih * 0.28], 'dots', '#ffcf8a55', {
      scale: 0.9,
    }),
    pattern(
      'lights-c',
      [ix + iw * 0.52, iy + ih * 0.76, iw * 0.46, ih * 0.22],
      'dots',
      '#ffcf8a44',
      {
        scale: 0.9,
      },
    ),
    box('mullion-v', [x + w / 2 - 5, iy, 10, ih], { shape: 'rect', fill: WOOD }),
    box('mullion-h', [ix, y + h * 0.48, iw, 10], { shape: 'rect', fill: WOOD }),
    box('sill', [x - 30, y + h - 4, w + 60, 26], { shape: 'rect', fill: '#4b3a5c', radius: 6 }),
  ]
}

/** A plant in a rose pot, sitting at (x, bottom). */
const plant = (x: number, bottom: number, s = 1) => [
  cut(
    'leaf-a',
    [x - 30 * s, bottom - 190 * s, 80 * s, 130 * s],
    'leaf',
    { fill: SAGE, fill2: '#5f8a6e', angle: 160 },
    { rotation: -28 },
  ),
  cut(
    'leaf-b',
    [x + 20 * s, bottom - 220 * s, 80 * s, 150 * s],
    'leaf',
    { fill: '#a5c9ae', fill2: SAGE, angle: 160 },
    { rotation: 6 },
  ),
  cut(
    'leaf-c',
    [x + 70 * s, bottom - 180 * s, 76 * s, 120 * s],
    'leaf',
    { fill: SAGE, fill2: '#5f8a6e', angle: 160 },
    { rotation: 34 },
  ),
  cut('pot', [x, bottom - 90 * s, 120 * s, 90 * s], 'trapezoid', {
    fill: ROSE,
    fill2: '#c97f80',
    angle: 180,
  }),
]

/** The desk lamp throwing a warm pool of light. */
const lamp = (x: number, deskY: number) => [
  box('lamp-glow', [Math.max(0, x - 160), Math.max(0, deskY - 585), 560, 560], {
    shape: 'ellipse',
    fill: '#ffb86b1c',
    fill2: '#ffb86b00',
    angle: 180,
    ...enter('fade', 0, 'pulse'),
  }),
  box('lamp-stem', [x + 112, deskY - 250, 14, 250], { shape: 'rect', fill: '#c9a27a' }),
  cut('lamp-shade', [x, deskY - 380, 240, 150], 'trapezoid', {
    fill: AMBER,
    fill2: '#e0873c',
    angle: 180,
    shadow: 'glow',
  }),
  box('lamp-base', [x + 50, deskY - 26, 140, 30], { shape: 'ellipse', fill: '#c9a27a' }),
]

const desk = (y: number) => [
  box('desk', [0, y, 1920, 1080 - y], {
    shape: 'rect',
    fill: '#3b2c43',
    fill2: '#211829',
    angle: 180,
  }),
  box('desk-edge', [0, y, 1920, 6], { shape: 'rect', fill: '#5a4568' }),
]

const mug = (x: number, deskY: number) => [
  box('mug-handle', [x + 70, deskY - 70, 40, 44], {
    shape: 'rect',
    stroke: CREAM,
    stroke_width: 9,
    radius: 20,
  }),
  box('mug', [x, deskY - 96, 90, 96], {
    shape: 'rect',
    fill: CREAM,
    fill2: '#e6d2b4',
    angle: 180,
    radius: 14,
  }),
  box('mug-band', [x, deskY - 64, 90, 12], { shape: 'rect', fill: ROSE }),
]

const wall = () => [
  box('wall', [0, 0, 1920, 1080], { shape: 'rect', fill: WALL, fill2: WALL2, angle: 180 }),
  pattern('wallpaper', [0, 0, 1920, 880], 'lines', '#ffffff06', { scale: 2.4 }),
]

/** A cream cassette-label plate. */
const label = (id: string, x: number, y: number, w: number, h: number) => [
  box(id, [x, y, w, h], { shape: 'rect', fill: CREAM, radius: 14, shadow: 'soft' }),
  box(`${id}-stripe`, [x, y + 16, w, 8], { shape: 'rect', fill: AMBER }),
  box(`${id}-stripe2`, [x, y + 28, w, 4], { shape: 'rect', fill: ROSE }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...wall(),
    ...windowAt(1260, 110, 520, 560),
    brand([1720, 668, 28, 28], 'mark', CREAM),
    ...plant(1330, 676, 0.9),
    ...desk(880),
    ...lamp(150, 880),
    ...mug(1660, 880),
    text('kicker', [380, 150, 820, 36], {
      text: key === 'starting_soon' ? 'side a  ·  tonight in the loft' : 'side b  ·  intermission',
      ...mono,
      size: 22,
      align: 'center',
      uppercase: true,
      ...enter('fade', 100),
    }),
    text('title', [340, 200, 900, 150], {
      text: title,
      ...serif(124),
      align: 'center',
      shadow: 'soft',
      ...enter('rise', 200),
    }),
    text('sub', [380, 360, 820, 44], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 30,
      weight: 500,
      color: '#d9cbe6',
      align: 'center',
      ...enter('fade', 600),
    }),
    ...(key === 'starting_soon'
      ? [
          ...label('tape', 560, 450, 460, 170),
          countdown(
            'timer',
            [560, 488, 460, 120],
            300,
            '{time}',
            {
              font: 'JetBrains Mono',
              size: 92,
              weight: 600,
              color: INK,
              align: 'center',
              ...enter('zoom', 700),
            },
            'press play',
          ),
        ]
      : [widget('events', 'events', [500, 440, 580, 300], live.events(cardEvents))]),
    rotator('socials', [380, 790, 820, 40], SOCIALS, { ...mono, size: 24, align: 'center' }),
    widget('goal', 'goal', [480, 930, 600, 96], live.goal(warmGoal)),
    widget(
      'latest',
      'label',
      [1120, 950, 420, 58],
      live.label('latest_follower', 'Latest: {value}', chipLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'lofi-loft',
    name: 'Lo-fi loft',
    description:
      'A cosy room at night: a moonlit window, a warm desk lamp, a plant and a mug. Five calm scenes.',
    style: 'cozy',
    motion: 'smooth',
  },
  [
    scene('in_game', 'In game', [
      mat('cam-mat', [44, 668, 480, 320], CREAM, 10, 18),
      cam('cam', [44, 668, 480, 320], 'tape', {
        color: CREAM,
        accent: AMBER,
        thickness: 3,
        radius: 14,
      }),
      brand([494, 1000, 26, 26], 'mark', CREAM),
      widget(
        'latest',
        'label',
        [40, 40, 420, 58],
        live.label('latest_follower', 'Latest: {value}', chipLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 110, 420, 58],
        live.label('latest_sub', 'Sub: {value}', chipLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      cut('moon-mini', [1834, 36, 46, 46], 'moon', { fill: '#fff2c9', shadow: 'glow' }),
      widget('goal', 'goal', [1360, 100, 520, 96], live.goal(warmGoal)),
      box('np', [1420, 994, 460, 50], { shape: 'rect', fill: '#1a1526d9', radius: 25 }),
      pattern('np-eq', [1440, 1004, 64, 30], 'eq', AMBER, { moving: true, scale: 0.5 }),
      rotator('socials', [1516, 1004, 350, 30], SOCIALS, { ...mono, size: 20, color: CREAM }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 70, 1220, 780], { fill: WALL2 }),
      pattern('bg-lines', [1300, 0, 620, 880], 'lines', '#ffffff06', { scale: 2.4 }),
      mat('cam-mat', [60, 70, 1220, 780], WOOD, 14, 22),
      cam('cam', [60, 70, 1220, 780], 'tape', {
        color: CREAM,
        accent: AMBER,
        thickness: 3,
        radius: 16,
      }),
      box('chat-panel', [1320, 70, 560, 780], {
        shape: 'rect',
        fill: '#1a1526e6',
        radius: 24,
        stroke: '#ffffff14',
        stroke_width: 1,
      }),
      text('chat-head', [1352, 92, 500, 50], { text: 'the loft chat', ...serif(40) }),
      box('chat-rule', [1352, 148, 120, 3], { shape: 'rect', fill: AMBER }),
      widget(
        'chat',
        'chat',
        [1336, 166, 528, 670],
        live.chat({
          variant: 'plates',
          accent: AMBER,
          text: CREAM,
          background: '#2a2340',
          radius: 14,
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [270, 120, 800, 420], live.alerts),
      ...desk(900),
      widget('goal', 'goal', [60, 948, 580, 96], live.goal(warmGoal)),
      widget(
        'latest',
        'label',
        [680, 966, 420, 58],
        live.label('latest_sub', 'Latest sub: {value}', chipLabel),
      ),
      rotator('socials', [1140, 980, 380, 32], SOCIALS, { ...mono, size: 20, color: CREAM }),
      brand([1846, 92, 26, 26], 'mark', CREAM),
    ]),
    waiting('starting_soon', 'Starting soon', 'Starting soon', 'The kettle is on. Settle in.'),
    waiting('brb', 'Be right back', 'Be right back', 'Flipping the record. Two minutes.'),
    scene('ending', 'Ending', [
      ...wall(),
      ...windowAt(1260, 110, 520, 560),
      brand([1720, 668, 28, 28], 'mark', CREAM),
      ...plant(1330, 676, 0.9),
      ...desk(880),
      ...lamp(150, 880),
      ...mug(1660, 880),
      text('kicker', [380, 120, 820, 36], {
        text: 'end of side b',
        ...mono,
        size: 22,
        align: 'center',
        uppercase: true,
      }),
      text('title', [340, 170, 900, 150], {
        text: 'Goodnight, loft',
        ...serif(116),
        align: 'center',
        shadow: 'soft',
        ...enter('rise', 200),
      }),
      text('sub', [380, 330, 820, 44], {
        text: 'Thank you for keeping me company.',
        font: 'Hanken Grotesk',
        size: 30,
        weight: 500,
        color: '#d9cbe6',
        align: 'center',
      }),
      widget(
        'events',
        'events',
        [520, 410, 540, 330],
        live.events({ ...cardEvents, variant: 'timeline' }),
      ),
      rotator('socials', [380, 790, 820, 40], SOCIALS, { ...mono, size: 24, align: 'center' }),
      widget(
        'top',
        'label',
        [560, 950, 460, 58],
        live.label('top_tip_session', 'Top tip: {value}', chipLabel),
      ),
    ]),
  ],
  'builtin.lofi-cassette',
)
