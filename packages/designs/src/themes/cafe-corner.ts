// Café corner: a bright neighbourhood coffee shop at mid-morning. Latte walls with white
// tiles, a striped awning over a sunny window, brass pendant lamps, a warm wood counter and
// a flat white with a heart in the foam. Headlines are chalk on a framed slate board, the
// labels are kraft paper tags. Daylight, not night. The Spark is chalked on the board.

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

const LATTE = '#efe2cf'
const LATTE2 = '#e3cfb2'
const SLATE = '#2f3b35'
const SLATE2 = '#232d28'
const CHALK = '#f6f1e7'
const FOAM = '#e9c99a'
const WOOD = '#9a6844'
const WOOD2 = '#5f3b24'
const BRASS = '#c9a25a'
const SAGE = '#7d9a7a'
const ESPRESSO = '#3b2417'
const KRAFT = '#dcbf94'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname'] as const

const kraftLabel = {
  variant: 'tag',
  accent: SAGE,
  text: ESPRESSO,
  background: KRAFT,
  radius: 6,
  font: 'Hanken Grotesk',
}
const cupGoal = {
  variant: 'sketch',
  accent: '#b8693a',
  track: '#f3e7d6',
  text: ESPRESSO,
  background: '#fffaf2f2',
  radius: 14,
  font: 'Hanken Grotesk',
}
const chalkEvents = {
  variant: 'timeline',
  accent: FOAM,
  text: CHALK,
  font: 'Hanken Grotesk',
}
const chalk = (size: number, color = CHALK) => ({
  font: 'Caveat Brush',
  size,
  weight: 400,
  color,
})
const hand = (size: number, color = CHALK) => ({
  font: 'Caveat',
  size,
  weight: 600,
  color,
})

/** Latte wall with a band of white subway tiles. */
const wall = () => [
  box('wall', [0, 0, 1920, 1080], { shape: 'rect', fill: LATTE, fill2: LATTE2, angle: 180 }),
  pattern('tiles', [0, 520, 1920, 340], 'grid', '#ffffff73', { ground: '#f6ede0', scale: 1.4 }),
  box('tile-cap', [0, 514, 1920, 8], { shape: 'rect', fill: '#d8c3a4' }),
]

/** A sunny window under a striped, scalloped awning, with a plant on the sill. */
const sunnyWindow = (x: number, y: number) => [
  box('win', [x, y, 500, 380], { shape: 'rect', fill: '#fbf7f0', radius: 10, shadow: 'soft' }),
  box('glass', [x + 18, y + 18, 464, 344], {
    shape: 'rect',
    fill: '#cfe6f2',
    fill2: '#f3f9fc',
    angle: 180,
    radius: 4,
  }),
  pattern('sun', [x + 18, y + 18, 464, 344], 'rays', '#ffffff40', { scale: 2 }),
  box('mull', [x + 246, y + 18, 8, 344], { shape: 'rect', fill: '#fbf7f0' }),
  pattern(
    'awning',
    [x - 30, y - 40, 560, 96],
    'stripes',
    SAGE,
    {
      ground: '#f6efe2',
      scale: 2.4,
      clip: 'wave',
    },
    { rotation: 180 },
  ),
  cut(
    'leaf-a',
    [x + 40, y + 250, 70, 120],
    'leaf',
    { fill: '#6f9a6a', fill2: '#4c7449', angle: 160 },
    { rotation: -22 },
  ),
  cut(
    'leaf-b',
    [x + 90, y + 230, 70, 140],
    'leaf',
    { fill: '#86b17f', fill2: '#5c8657', angle: 160 },
    { rotation: 12 },
  ),
  cut('pot', [x + 50, y + 320, 100, 60], 'trapezoid', {
    fill: '#c97b52',
    fill2: '#a95e3a',
    angle: 180,
  }),
]

/** A brass pendant lamp hanging from the ceiling. */
const pendant = (id: string, x: number, drop: number, loop = false) => [
  box(`${id}-cord`, [x + 59, 0, 2, drop], { shape: 'rect', fill: '#4a3a2c' }),
  box(`${id}-glow`, [x - 60, drop + 20, 240, 200], {
    shape: 'ellipse',
    fill: '#ffe2a640',
    fill2: '#ffe2a600',
    angle: 180,
    ...(loop ? enter('fade', 200, 'pulse') : {}),
  }),
  cut(`${id}-shade`, [x, drop, 120, 70], 'trapezoid', {
    fill: BRASS,
    fill2: '#9b7636',
    angle: 180,
  }),
]

const counter = (y: number) => [
  box('counter', [0, y, 1920, 1080 - y], { shape: 'rect', fill: WOOD, fill2: WOOD2, angle: 180 }),
  pattern('grain', [0, y + 18, 1920, 1062 - y], 'lines', '#00000018', { scale: 2.2 }),
  box('counter-top', [0, y, 1920, 18], {
    shape: 'rect',
    fill: '#c08a5e',
    fill2: '#a8744a',
    angle: 180,
  }),
]

/** A flat white with a foam heart, steam curling up. */
const cup = (x: number, top: number) => [
  cut('steam', [x + 46, top - 120, 40, 100], 'drop', {
    fill: '#ffffff80',
    fill2: '#ffffff00',
    angle: 0,
    ...enter('fade', 600, 'float'),
  }),
  box('saucer', [x - 30, top + 96, 200, 30], { shape: 'ellipse', fill: '#fbf7f0' }),
  box('cup', [x, top + 10, 140, 104], {
    shape: 'rect',
    fill: '#ffffff',
    fill2: '#ece4d8',
    angle: 90,
    radius: 30,
  }),
  box('handle', [x + 126, top + 30, 44, 50], {
    shape: 'rect',
    stroke: '#dccdb8',
    stroke_width: 10,
    radius: 22,
  }),
  box('coffee', [x + 6, top, 128, 36], {
    shape: 'ellipse',
    fill: '#b98352',
    fill2: '#8d5a32',
    angle: 180,
  }),
  cut('heart', [x + 54, top + 6, 32, 24], 'heart', { fill: '#f4e3c9' }),
]

/** The framed chalkboard. */
const board = (x: number, y: number, w: number, h: number) => [
  box('board', [x, y, w, h], {
    shape: 'rect',
    fill: SLATE,
    fill2: SLATE2,
    angle: 160,
    radius: 10,
    stroke: '#8a5a3b',
    stroke_width: 16,
    shadow: 'soft',
    ...enter('rise', 0),
  }),
  pattern('smudge', [x + 16, y + 16, w - 32, h - 32], 'halftone', '#ffffff08', { scale: 3 }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...wall(),
    ...sunnyWindow(1300, 120),
    ...pendant('lamp-a', 150, 120, true),
    ...pendant('lamp-b', 1100, 60),
    ...board(320, 150, 860, 660),
    brand([1128, 176, 26, 26], 'mark', CHALK),
    text('kicker', [360, 186, 780, 50], {
      text: key === 'starting_soon' ? "Today's special" : 'Back in five',
      ...hand(40, FOAM),
      align: 'center',
      ...enter('fade', 100),
    }),
    text('title', [360, 230, 780, 150], {
      text: title,
      ...chalk(128),
      align: 'center',
      ...enter('fade', 200),
    }),
    box('chalk-rule', [600, 392, 300, 4], { shape: 'rect', fill: '#f6f1e766', radius: 2 }),
    text('sub', [380, 410, 740, 50], {
      text: sub,
      ...hand(36),
      align: 'center',
      ...enter('fade', 500),
    }),
    ...(key === 'starting_soon'
      ? [
          text('t-label', [380, 500, 740, 46], {
            text: 'Brewing for',
            ...hand(36, FOAM),
            align: 'center',
          }),
          countdown(
            'timer',
            [380, 540, 740, 170],
            300,
            '{time}',
            { ...chalk(150, CHALK), align: 'center', ...enter('zoom', 600) },
            'Fresh pot!',
          ),
        ]
      : [
          widget('events', 'events', [420, 490, 660, 290], {
            ...live.events(chalkEvents),
            max_items: 5,
          }),
        ]),
    ...counter(860),
    ...cup(1500, 744),
    rotator('socials', [300, 1000, 900, 40], SOCIALS, { ...hand(34, CHALK), align: 'center' }),
    widget('goal', 'goal', [60, 880, 560, 96], live.goal(cupGoal)),
    widget(
      'latest',
      'label',
      [680, 900, 480, 60],
      live.label('latest_follower', 'New regular: {value}', kraftLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'cafe-corner',
    name: 'Café corner',
    description:
      'A sunny coffee shop: latte walls, a striped awning, brass lamps, a flat white and chalkboard headlines.',
    style: 'cozy',
    motion: 'smooth',
  },
  [
    scene('in_game', 'In game', [
      widget(
        'latest',
        'label',
        [40, 40, 440, 60],
        live.label('latest_follower', 'New regular: {value}', kraftLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 110, 440, 60],
        live.label('latest_sub', 'On the house: {value}', { ...kraftLabel, accent: '#b8693a' }),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1380, 40, 500, 96], live.goal(cupGoal)),
      mat('cam-mat', [44, 680, 480, 300], '#fbf7f0', 10, 8),
      cam('cam', [44, 680, 480, 300], 'polaroid', {
        color: '#fbf7f0',
        accent: SAGE,
        thickness: 3,
        radius: 6,
      }),
      brand([496, 996, 24, 24], 'mark', ESPRESSO),
      widget('events', 'events', [1500, 640, 380, 330], {
        ...live.events({
          variant: 'stickers',
          accent: '#b8693a',
          text: ESPRESSO,
          background: '#fffaf2',
          radius: 10,
          font: 'Hanken Grotesk',
        }),
        max_items: 4,
      }),
      box('soc', [1500, 992, 380, 50], { shape: 'rect', fill: '#2f3b35e6', radius: 25 }),
      rotator('socials', [1500, 994, 380, 44], SOCIALS, { ...hand(30), align: 'center' }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 80, 1220, 760], { fill: LATTE, fill2: LATTE2, angle: 180 }),
      mat('cam-mat', [60, 80, 1220, 760], '#fbf7f0', 14, 12),
      cam('cam', [60, 80, 1220, 760], null, {
        style: 'line',
        color: '#d8c3a4',
        accent: SAGE,
        thickness: 2,
        radius: 10,
      }),
      ...board(1320, 80, 560, 760),
      text('chat-head', [1350, 102, 500, 56], {
        text: 'Overheard at the counter',
        ...hand(40, FOAM),
        align: 'center',
      }),
      brand([1830, 104, 24, 24], 'mark', CHALK),
      widget(
        'chat',
        'chat',
        [1346, 170, 508, 650],
        live.chat({
          variant: 'speech',
          accent: '#b8693a',
          text: ESPRESSO,
          background: '#fffaf2',
          radius: 16,
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [270, 140, 800, 420], live.alerts),
      ...counter(880),
      ...cup(1720, 850),
      widget('goal', 'goal', [60, 930, 560, 96], live.goal(cupGoal)),
      widget(
        'latest',
        'label',
        [660, 948, 460, 60],
        live.label('latest_sub', 'Latest sub: {value}', kraftLabel),
      ),
      rotator('socials', [1160, 956, 460, 44], SOCIALS, { ...hand(32, CHALK) }),
    ]),
    waiting('starting_soon', 'Starting soon', 'Starting soon', 'Pull up a stool by the window.'),
    waiting('brb', 'Be right back', 'Be right back', 'Steaming more milk. Back in a sip.'),
    scene('ending', 'Ending', [
      ...wall(),
      ...sunnyWindow(1300, 120),
      ...pendant('lamp-a', 150, 120, true),
      ...pendant('lamp-b', 1100, 60),
      ...board(320, 150, 860, 660),
      brand([1128, 176, 26, 26], 'mark', CHALK),
      text('kicker', [360, 186, 780, 50], {
        text: "That's last orders",
        ...hand(40, FOAM),
        align: 'center',
      }),
      text('title', [360, 230, 780, 150], {
        text: 'See you tomorrow',
        ...chalk(112),
        align: 'center',
        ...enter('fade', 200),
      }),
      text('sub', [380, 390, 740, 50], {
        text: 'Thanks for the company. Same table?',
        ...hand(36),
        align: 'center',
      }),
      widget(
        'top',
        'label',
        [480, 460, 540, 60],
        live.label('top_tip_session', 'Best tip: {value}', kraftLabel),
      ),
      widget(
        'subs',
        'label',
        [480, 530, 540, 60],
        live.label('session_subs', 'Subs today: {value}', kraftLabel),
      ),
      widget('events', 'events', [440, 610, 620, 180], {
        ...live.events(chalkEvents),
        max_items: 3,
      }),
      ...counter(860),
      ...cup(1500, 744),
      rotator('socials', [300, 960, 900, 40], SOCIALS, { ...hand(34, CHALK), align: 'center' }),
    ]),
  ],
  'builtin.chalk-menu',
)
