// Pixel quest: a daytime 8-bit adventure. Blocky clouds over a sky, a checkered grass and
// dirt ground, hearts and coins in a HUD, stepped pixel panels, pixel type, a health-bar
// goal. "Press start" blinks on the waiting screen. The Spark is a coin in the HUD.

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

const SKY = '#5ec8ff'
const SKY2 = '#a8e4ff'
const GRASS = '#3fb950'
const GRASS2 = '#2b8a3e'
const DIRT = '#8a5a2b'
const GOLD = '#ffd23f'
const INK = '#14142b'
const WHITE = '#ffffff'
const SOCIALS = ['TWITCH.TV/YOURNAME', 'YOUTUBE @YOURNAME', 'DISCORD GG/YOURNAME'] as const

const px = { font: 'Press Start 2P', weight: 400 } as const
const pixLabel = {
  variant: 'sticker',
  accent: GOLD,
  text: INK,
  background: WHITE,
  radius: 0,
  font: 'Press Start 2P',
  font_size: 16,
}
const hpGoal = {
  variant: 'hp',
  accent: '#ff4d6d',
  track: '#3a1020',
  text: WHITE,
  background: INK,
  radius: 0,
  font: 'Press Start 2P',
  uppercase: true,
}
const pixEvents = {
  variant: 'cards',
  accent: GOLD,
  text: WHITE,
  background: INK,
  radius: 0,
  font: 'Silkscreen',
  uppercase: true,
}

/** A blocky cloud from stacked rectangles. */
const cloud = (id: string, x: number, y: number, s = 1) => [
  box(`${id}-a`, [x, y + 40 * s, 240 * s, 40 * s], { shape: 'rect', fill: WHITE }),
  box(`${id}-b`, [x + 40 * s, y + 20 * s, 160 * s, 30 * s], { shape: 'rect', fill: WHITE }),
  box(`${id}-c`, [x + 80 * s, y, 80 * s, 30 * s], { shape: 'rect', fill: WHITE }),
]
const coin = (id: string, x: number, y: number, d = 40) => [
  box(`${id}`, [x, y, d, d], { shape: 'ellipse', fill: GOLD, stroke: '#c98a00', stroke_width: 4 }),
  box(`${id}-s`, [x + d * 0.42, y + d * 0.22, d * 0.16, d * 0.56], {
    shape: 'rect',
    fill: '#fff3b0',
  }),
]
const heart = (id: string, x: number, y: number, full = true) =>
  cut(id, [x, y, 40, 36], 'heart', {
    fill: full ? '#ff4d6d' : '#5a2a3a',
    stroke: INK,
    stroke_width: 0,
  })
const ground = (y: number) => [
  box('dirt', [0, y + 40, 1920, 1080 - y - 40], {
    shape: 'rect',
    fill: DIRT,
    fill2: '#6b4220',
    angle: 180,
  }),
  pattern('dirt-px', [0, y + 40, 1920, 1080 - y - 40], 'checker', '#00000022', { scale: 1.4 }),
  box('grass', [0, y, 1920, 40], { shape: 'rect', fill: GRASS }),
  pattern('grass-px', [0, y, 1920, 40], 'checker', GRASS2, { scale: 0.7 }),
]
const panel = (id: string, x: number, y: number, w: number, h: number) =>
  cut(id, [x, y, w, h], 'steps', { fill: INK }, { opacity: 0.92 })

const world = () => [
  box('sky', [0, 0, 1920, 1080], { shape: 'rect', fill: SKY2, fill2: SKY, angle: 0 }),
  ...cloud('cl1', 120, 110, 1.2),
  ...cloud('cl2', 1400, 70, 1),
  ...cloud('cl3', 900, 210, 0.7),
  pattern(
    'dust',
    [0, 300, 1920, 520],
    'pixels',
    WHITE,
    { moving: true, scale: 0.6 },
    { opacity: 0.7 },
  ),
  ...ground(820),
]

const hud = () => [
  heart('h1', 60, 40),
  heart('h2', 110, 40),
  heart('h3', 160, 40, false),
  ...coin('hud-coin', 240, 38),
  brand([294, 42, 32, 32], 'badge', GOLD),
  text('hud-x', [340, 44, 200, 30], {
    ...px,
    text: 'x 99',
    size: 22,
    color: WHITE,
    outline: 4,
    outline_color: INK,
  }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...world(),
    ...hud(),
    text('title', [160, 300, 1600, 120], {
      ...px,
      text: title,
      size: 76,
      color: GOLD,
      align: 'center',
      outline: 10,
      outline_color: INK,
      effect: 'extrude',
      color2: INK,
      split: 'letters',
      ...enter('bounce', 200),
    }),
    text('sub', [360, 440, 1200, 50], {
      ...px,
      text: sub,
      size: 22,
      color: WHITE,
      align: 'center',
      outline: 5,
      outline_color: INK,
    }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [660, 540, 600, 80],
          300,
          'LOADING {time}',
          { ...px, size: 34, color: WHITE, align: 'center', outline: 6, outline_color: INK },
          'READY!',
        )
      : text('press', [660, 540, 600, 80], {
          ...px,
          text: 'PRESS START',
          size: 34,
          color: WHITE,
          align: 'center',
          outline: 6,
          outline_color: INK,
          ...enter('fade', 600, 'pulse'),
        }),
    ...coin('c1', 760, 660),
    ...coin('c2', 840, 640),
    ...coin('c3', 920, 660),
    ...coin('c4', 1000, 640),
    ...coin('c5', 1080, 660),
    panel('soc-panel', 610, 880, 700, 80),
    rotator(
      'socials',
      [630, 900, 660, 40],
      SOCIALS,
      { ...px, size: 18, color: WHITE, align: 'center' },
      5,
    ),
    widget('goal', 'goal', [60, 900, 500, 110], live.goal(hpGoal)),
    widget(
      'latest',
      'label',
      [1360, 920, 500, 64],
      live.label('latest_follower', 'NEW PLAYER {value}', pixLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'pixel-quest',
    name: 'Pixel quest',
    description: 'A daytime 8-bit adventure: blocky clouds, hearts and coins, a health-bar goal.',
    style: 'retro',
    motion: 'bouncy',
  },
  [
    scene('in_game', 'In game', [
      mat('cam-mat', [40, 660, 480, 340], INK, 10),
      cam('cam', [40, 660, 480, 340], 'pixel', {
        color: WHITE,
        accent: GOLD,
        thickness: 6,
        radius: 0,
        label: 'P1',
      }),
      ...hud(),
      widget(
        'latest',
        'label',
        [40, 96, 460, 60],
        live.label('latest_follower', 'NEW PLAYER {value}', pixLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1400, 40, 480, 110], live.goal(hpGoal)),
      widget('events', 'events', [1500, 720, 380, 320], live.events(pixEvents)),
      rotator(
        'socials',
        [560, 1030, 800, 34],
        SOCIALS,
        { ...px, size: 16, color: WHITE, align: 'center', outline: 4, outline_color: INK },
        5,
      ),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('sky', [60, 110, 1200, 780], { fill: SKY }),
      ...cloud('cl1', 1340, 0, 0.8),
      box('grass', [0, 890, 1920, 40], { shape: 'rect', fill: GRASS }),
      pattern('grass-px', [0, 890, 1920, 40], 'checker', GRASS2, { scale: 0.7 }),
      box('dirt', [0, 930, 1920, 150], { shape: 'rect', fill: DIRT, fill2: '#6b4220', angle: 180 }),
      mat('cam-mat', [60, 110, 1200, 780], INK, 12),
      cam('cam', [60, 110, 1200, 780], 'pixel', {
        color: WHITE,
        accent: GOLD,
        thickness: 6,
        radius: 0,
        label: 'P1',
      }),
      panel('chat-panel', 1310, 90, 570, 820),
      text('chat-head', [1340, 110, 500, 36], { ...px, text: 'PARTY CHAT', size: 22, color: GOLD }),
      widget(
        'chat',
        'chat',
        [1330, 160, 530, 730],
        live.chat({
          variant: 'lines',
          accent: GOLD,
          text: WHITE,
          background: INK,
          radius: 0,
          font: 'Silkscreen',
        }),
      ),
      widget('alerts', 'alerts', [260, 140, 800, 420], live.alerts),
      ...hud().map((l) => ({ ...l, y: l.y + 900 })),
      widget('goal', 'goal', [600, 940, 520, 110], live.goal(hpGoal)),
      widget(
        'latest',
        'label',
        [1340, 960, 520, 64],
        live.label('latest_sub', 'NEW SUB {value}', pixLabel),
      ),
    ]),
    waiting('starting_soon', 'Starting soon', 'STARTING SOON', 'A NEW ADVENTURE IS LOADING'),
    waiting('brb', 'Be right back', 'PAUSED', 'SAVING GAME. BACK IN A MOMENT'),
    scene('ending', 'Ending', [
      ...world(),
      ...hud(),
      text('title', [160, 230, 1600, 120], {
        ...px,
        text: 'QUEST COMPLETE',
        size: 72,
        color: GOLD,
        align: 'center',
        outline: 10,
        outline_color: INK,
        effect: 'extrude',
        color2: INK,
        split: 'letters',
        ...enter('bounce', 200),
      }),
      text('sub', [360, 370, 1200, 50], {
        ...px,
        text: 'THANKS FOR PLAYING. CONTINUE NEXT STREAM?',
        size: 20,
        color: WHITE,
        align: 'center',
        outline: 5,
        outline_color: INK,
      }),
      panel('log', 560, 450, 800, 330),
      text('log-head', [600, 470, 700, 36], { ...px, text: 'PARTY LOG', size: 22, color: GOLD }),
      widget('events', 'events', [590, 520, 740, 250], live.events(pixEvents)),
      widget(
        'top',
        'label',
        [610, 900, 700, 64],
        live.label('top_tip_session', 'HIGH SCORE {value}', pixLabel),
      ),
    ]),
  ],
  'builtin.quest-dialog',
)
