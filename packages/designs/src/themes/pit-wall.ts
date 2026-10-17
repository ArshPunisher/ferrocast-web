// Pit wall: race-day telemetry. Carbon black, racing red slabs, a chequered strip, five
// start lights over the countdown and a timing tower where the live labels sit like
// positions. Italic Oswald capitals, mono readouts, a purple "fastest" accent. The Spark
// is the small marshal light at the end of the chequered strip.

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

const CARBON = '#0c0d10'
const RED = '#e10600'
const WHITE = '#f5f5f7'
const TEAL = '#00d2be'
const PURPLE = '#a855f7'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'kick.com/yourname'] as const

const towerLabel = {
  variant: 'tag',
  accent: RED,
  text: WHITE,
  background: '#15161be6',
  radius: 2,
  font: 'Oswald',
  font_size: 26,
  uppercase: true,
}
const chevronGoal = {
  variant: 'chevron',
  accent: RED,
  track: '#26272e',
  text: WHITE,
  background: '#15161be6',
  radius: 0,
  font: 'Oswald',
  uppercase: true,
}
const radioEvents = {
  variant: 'timeline',
  accent: PURPLE,
  text: WHITE,
  font: 'Oswald',
  uppercase: true,
}
const oswald = (size: number, color = WHITE) => ({
  font: 'Oswald',
  size,
  weight: 700,
  italic: true,
  color,
  uppercase: true,
})
const mono = {
  font: 'JetBrains Mono',
  weight: 600,
  color: TEAL,
  uppercase: true,
  letter_spacing: 0.14,
}

const carbon = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: '#15161b', fill2: CARBON, angle: 160 }),
  pattern('weave', [0, 0, 1920, 1080], 'checker', '#ffffff05', { scale: 0.4 }),
  pattern('speed', [0, 0, 1920, 1080], 'lines', '#ffffff08', { scale: 1.6 }),
]

const chequer = (id: string, x: number, y: number, w: number, h: number) =>
  pattern(id, [x, y, w, h], 'checker', WHITE, { ground: CARBON, scale: 1.1 })

/** Five start lights; they come on one after another. */
const lights = (x: number, y: number) =>
  [0, 1, 2, 3, 4].flatMap((i) => [
    box(`pod-${i}`, [x + i * 120, y, 96, 150], { shape: 'rect', fill: '#050506', radius: 14 }),
    box(`lamp-${i}`, [x + i * 120 + 18, y + 18, 60, 60], {
      shape: 'ellipse',
      fill: RED,
      shadow: 'glow',
      ...enter('pop', 300 + i * 450),
    }),
    box(`lamp-off-${i}`, [x + i * 120 + 18, y + 84, 60, 48], { shape: 'ellipse', fill: '#2a0a0a' }),
  ])

/** The timing tower: a header and live labels stacked like positions. */
const tower = (x: number, y: number, w: number) => [
  box('tower-head', [x, y, w, 52], { shape: 'rect', fill: RED }),
  text('tower-head-t', [x + 20, y + 6, w - 40, 42], {
    text: 'Timing',
    ...oswald(32),
    letter_spacing: 0.1,
  }),
  widget(
    'p1',
    'label',
    [x, y + 64, w, 56],
    live.label('latest_follower', 'P1  {value}', towerLabel),
  ),
  widget('p2', 'label', [x, y + 128, w, 56], live.label('latest_sub', 'P2  {value}', towerLabel)),
  widget(
    'p3',
    'label',
    [x, y + 192, w, 56],
    live.label('latest_tip', 'P3  {value}', { ...towerLabel, accent: PURPLE }),
  ),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...carbon(),
    cut('slab', [0, 120, 260, 860], 'parallelogram', { fill: RED, ...enter('slide_left', 0) }),
    chequer('flag', 0, 0, 1920, 40),
    box('flag-end', [1840, 4, 80, 32], { shape: 'rect', fill: CARBON }),
    brand([1866, 6, 28, 28], 'mark', '#ffd400'),
    text('kicker', [340, 150, 1000, 40], {
      text: key === 'starting_soon' ? 'Round 07  ·  Formation lap' : 'Box, box  ·  Pit window open',
      ...mono,
      size: 26,
      ...enter('fade', 100),
    }),
    text('title', [330, 190, 1200, 190], {
      text: title,
      ...oswald(180),
      effect: 'long_shadow',
      color2: RED,
      ...enter('slide_left', 150),
    }),
    text('sub', [340, 390, 1000, 50], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 32,
      weight: 600,
      color: '#c7c9d1',
      ...enter('fade', 600),
    }),
    ...(key === 'starting_soon'
      ? [
          ...lights(340, 480),
          text('t-label', [340, 660, 600, 40], { text: 'Lights out in', ...mono, size: 26 }),
          countdown(
            'timer',
            [340, 690, 700, 150],
            300,
            '{time}',
            {
              font: 'JetBrains Mono',
              size: 130,
              weight: 700,
              color: WHITE,
              ...enter('fade', 2600),
            },
            'Go go go',
          ),
        ]
      : [widget('events', 'events', [340, 480, 640, 340], live.events(radioEvents))]),
    ...tower(1400, 480, 440),
    widget('goal', 'goal', [1400, 790, 440, 100], live.goal(chevronGoal)),
    rotator('socials', [340, 950, 900, 50], SOCIALS, { ...mono, size: 30, color: WHITE }),
    chequer('flag-b', 0, 1040, 1920, 40),
  ])

export default themeDesign(
  {
    slug: 'pit-wall',
    name: 'Pit wall',
    description:
      'Race-day telemetry: carbon, racing red, five start lights, a timing tower and a chequered strip.',
    style: 'tech',
    motion: 'smooth',
  },
  [
    scene('in_game', 'In game', [
      ...tower(40, 40, 420),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1400, 40, 480, 100], live.goal(chevronGoal)),
      chequer('cam-flag', 44, 1000, 480, 24),
      mat('cam-mat', [44, 680, 480, 300], RED, 5),
      cam('cam', [44, 680, 480, 300], null, {
        style: 'line',
        color: RED,
        accent: WHITE,
        thickness: 2,
      }),
      cut('cam-tag', [44, 640, 260, 40], 'parallelogram', { fill: RED }),
      text('cam-tag-t', [64, 642, 230, 36], { text: 'Onboard', ...oswald(28) }),
      brand([494, 1024, 24, 24], 'mark', '#ffd400'),
      cut('soc-bar', [1300, 1000, 600, 56], 'parallelogram', { fill: '#15161be6' }),
      rotator('socials', [1330, 1008, 540, 42], SOCIALS, {
        ...mono,
        size: 24,
        color: WHITE,
        align: 'right',
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 80, 1220, 760], { fill: CARBON }),
      pattern('speed', [1300, 0, 620, 1080], 'lines', '#ffffff08', { scale: 1.6 }),
      chequer('flag', 0, 0, 1920, 32),
      mat('cam-mat', [60, 80, 1220, 760], RED, 5),
      cam('cam', [60, 80, 1220, 760], null, {
        style: 'line',
        color: RED,
        accent: WHITE,
        thickness: 2,
      }),
      cut('cam-tag', [60, 846, 340, 48], 'parallelogram', { fill: RED }),
      text('cam-tag-t', [84, 850, 300, 42], { text: 'Driver cam', ...oswald(32) }),
      box('radio', [1320, 80, 560, 760], { shape: 'rect', fill: '#15161bf2', radius: 4 }),
      box('radio-head', [1320, 80, 560, 56], { shape: 'rect', fill: WHITE }),
      text('radio-head-t', [1344, 86, 400, 44], { text: 'Team radio', ...oswald(34, CARBON) }),
      pattern('radio-eq', [1780, 94, 80, 28], 'eq', RED, { moving: true, scale: 0.5 }),
      widget(
        'chat',
        'chat',
        [1336, 150, 528, 670],
        live.chat({
          variant: 'lines',
          accent: TEAL,
          text: WHITE,
          background: '#15161b00',
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [270, 140, 800, 420], live.alerts),
      box('flag-end', [1840, 0, 80, 32], { shape: 'rect', fill: CARBON }),
      brand([1866, 2, 28, 28], 'mark', '#ffd400'),
      widget('goal', 'goal', [60, 940, 580, 100], live.goal(chevronGoal)),
      widget(
        'latest',
        'label',
        [680, 964, 460, 56],
        live.label('latest_sub', 'P1  {value}', towerLabel),
      ),
      rotator('socials', [1180, 970, 700, 44], SOCIALS, {
        ...mono,
        size: 26,
        color: WHITE,
        align: 'right',
      }),
    ]),
    waiting('starting_soon', 'Starting soon', 'Starting soon', 'Tyres are warm. Grid is forming.'),
    waiting('brb', 'Be right back', 'Pit stop', 'Fresh tyres, quick top-up. Back in a lap.'),
    scene('ending', 'Ending', [
      ...carbon(),
      cut('slab', [0, 120, 260, 860], 'parallelogram', { fill: RED }),
      chequer('flag', 0, 0, 1920, 120),
      text('kicker', [340, 170, 1000, 40], {
        text: 'Session complete  ·  Classified',
        ...mono,
        size: 26,
      }),
      text('title', [330, 210, 1300, 190], {
        text: 'Chequered flag',
        ...oswald(170),
        effect: 'long_shadow',
        color2: RED,
        ...enter('slide_left', 150),
      }),
      text('sub', [340, 410, 1000, 50], {
        text: 'Thanks for racing with me. See you next round.',
        font: 'Hanken Grotesk',
        size: 32,
        weight: 600,
        color: '#c7c9d1',
      }),
      widget('events', 'events', [340, 500, 640, 360], live.events(radioEvents)),
      box('tower-head', [1400, 500, 440, 52], { shape: 'rect', fill: PURPLE }),
      text('tower-head-t', [1420, 506, 400, 42], {
        text: 'Podium',
        ...oswald(32),
        letter_spacing: 0.1,
      }),
      widget(
        'p1',
        'label',
        [1400, 564, 440, 56],
        live.label('top_tip_session', 'P1  {value}', towerLabel),
      ),
      widget(
        'p2',
        'label',
        [1400, 628, 440, 56],
        live.label('session_subs', 'Subs  {value}', towerLabel),
      ),
      widget(
        'p3',
        'label',
        [1400, 692, 440, 56],
        live.label('session_follows', 'Follows  {value}', towerLabel),
      ),
      rotator('socials', [340, 950, 900, 50], SOCIALS, { ...mono, size: 30, color: WHITE }),
      chequer('flag-b', 0, 1040, 1920, 40),
      box('flag-end', [1840, 1044, 80, 32], { shape: 'rect', fill: CARBON }),
      brand([1866, 1046, 28, 28], 'mark', '#ffd400'),
    ]),
  ],
  'builtin.pit-board',
)
