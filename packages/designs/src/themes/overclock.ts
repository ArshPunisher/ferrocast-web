// Overclock: a cyberpunk HUD. Corner-bracket frames, cut-corner panels, a hex grid washed
// with scan lines, readouts that look like a cockpit, acid green on near black. Waiting
// screens centre a targeting reticle with the countdown inside a hexagon. The Spark is the
// small hex badge on the cam readout in game, and an ID chip on the waiting screens.

import {
  brand,
  box,
  cam,
  countdown,
  cut,
  enter,
  fancyFrame,
  live,
  pattern,
  rotator,
  scene,
  text,
  themeDesign,
  widget,
} from '../kit'

const VOID = '#05070a'
const ACID = '#d4ff2a'
const CYAN = '#19f0ff'
const ALERT = '#ff3b5c'
const INK = '#e9fbe9'
const SOCIALS = [
  'TWITCH // yourname',
  'YOUTUBE // @yourname',
  'KICK // yourname',
  'DISCORD // gg/yourname',
] as const

const hudLabel = {
  variant: 'bracket',
  accent: ACID,
  text: INK,
  background: '#05070acc',
  font: 'Orbitron',
  uppercase: true,
}
const hudGoal = {
  variant: 'chevron',
  accent: ACID,
  track: '#18221a',
  text: INK,
  background: '#05070ae6',
  font: 'Orbitron',
  uppercase: true,
}
const hudEvents = {
  variant: 'hud',
  accent: CYAN,
  text: INK,
  background: '#05070a',
  font: 'Orbitron',
  uppercase: true,
}
const mono = {
  font: 'JetBrains Mono',
  size: 18,
  weight: 600,
  color: CYAN,
  letter_spacing: 0.18,
  uppercase: true,
} as const

/** A readout line: tiny mono caps. */
const readout = (
  id: string,
  x: number,
  y: number,
  w: number,
  words: string,
  color: string = CYAN,
) => text(id, [x, y, w, 26], { ...mono, text: words, color })

/** The full-screen backdrop: void, hex-ish grid, scan lines, vignette bars. */
const backdrop = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: '#0a1210', fill2: VOID, angle: 160 }),
  pattern('grid', [0, 0, 1920, 1080], 'grid', '#d4ff2a14', { scale: 2.6, moving: true }),
  pattern('scan', [0, 0, 1920, 1080], 'scanlines', '#ffffff08', { moving: true }),
  box('bar-t', [0, 0, 1920, 64], {
    shape: 'rect',
    fill: '#000000',
    fill2: '#00000000',
    angle: 180,
  }),
  box('rule-t', [60, 60, 1800, 2], { shape: 'rect', fill: ACID, fill2: '#d4ff2a00', angle: 90 }),
  readout('sys', 60, 24, 600, 'SYS.ONLINE  ::  NODE 07  ::  LINK STABLE'),
  readout('clock', 1260, 24, 600, 'REC  ●  SIGNAL 98%  ::  LAT 12MS', ACID),
]

/** The reticle: rings, ticks and a hexagon that holds the big words. */
const reticle = (cx: number, cy: number) => [
  box('ring-a', [cx - 330, cy - 330, 660, 660], {
    shape: 'ellipse',
    stroke: '#19f0ff55',
    stroke_width: 2,
    ...enter('zoom', 100),
  }),
  box('ring-b', [cx - 260, cy - 260, 520, 520], {
    shape: 'ellipse',
    stroke: '#d4ff2a88',
    stroke_width: 4,
    ...enter('zoom', 250),
  }),
  pattern('ring-rays', [cx - 300, cy - 300, 600, 600], 'rays', '#19f0ff1f', {
    clip: 'octagon',
    moving: true,
  }),
  cut('hex', [cx - 200, cy - 175, 400, 350], 'hexagon', {
    fill: '#0b1a12',
    fill2: VOID,
    angle: 180,
    ...enter('zoom', 350),
  }),
  cut('hex-edge', [cx - 206, cy - 181, 412, 6], 'parallelogram', { fill: ACID }),
  box('tick-l', [cx - 360, cy - 2, 80, 4], { shape: 'rect', fill: ACID }),
  box('tick-r', [cx + 280, cy - 2, 80, 4], { shape: 'rect', fill: ACID }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...backdrop(),
    ...reticle(960, 560),
    text('title', [160, 120, 1600, 130], {
      text: title,
      font: 'Orbitron',
      size: 104,
      weight: 900,
      color: INK,
      color2: CYAN,
      effect: 'glitch',
      align: 'center',
      uppercase: true,
      letter_spacing: 0.06,
      split: 'letters',
      ...enter('fade', 150, 'pulse'),
    }),
    readout('sub', 560, 255, 800, sub, ACID),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [760, 500, 400, 120],
          300,
          '{time}',
          {
            font: 'Orbitron',
            size: 88,
            weight: 800,
            color: ACID,
            align: 'center',
            shadow: 'glow',
            ...enter('zoom', 500),
          },
          'LIVE',
        )
      : text('hold', [760, 500, 400, 120], {
          text: 'HOLD',
          font: 'Orbitron',
          size: 88,
          weight: 800,
          color: ALERT,
          align: 'center',
          shadow: 'glow',
          ...enter('zoom', 500, 'pulse'),
        }),
    readout(
      'under',
      760,
      620,
      400,
      key === 'starting_soon' ? 'T-MINUS TO LAUNCH' : 'OPERATOR AWAY',
      CYAN,
    ),
    widget('goal', 'goal', [80, 930, 560, 92], live.goal(hudGoal)),
    widget('events', 'events', [1460, 760, 400, 260], live.events(hudEvents)),
    rotator('socials', [700, 960, 520, 40], SOCIALS, {
      ...mono,
      size: 22,
      color: INK,
      align: 'center',
    }),
    fancyFrame('id-chip', [1460, 708, 400, 40], 'hud', {
      color: ACID,
      accent: CYAN,
      thickness: 2,
      radius: 0,
    }),
    readout('id-text', 1500, 715, 300, 'ID // RECENT ACTIVITY', ACID),
    brand([1818, 712, 32, 32], 'badge', ACID),
  ])

export default themeDesign(
  {
    slug: 'overclock',
    name: 'Overclock',
    description:
      'A cyberpunk HUD: bracket frames, cut-corner panels, scan lines and a targeting reticle.',
    style: 'tech',
    motion: 'lively',
  },
  [
    scene('in_game', 'In game', [
      cam('cam', [40, 650, 480, 330], 'hud', {
        color: ACID,
        accent: CYAN,
        thickness: 4,
        radius: 0,
        label: 'Cam 01',
      }),
      readout('cam-read', 40, 994, 360, 'FEED // OPERATOR', CYAN),
      brand([488, 994, 30, 30], 'badge', ACID),
      widget(
        'latest',
        'label',
        [40, 40, 460, 52],
        live.label('latest_follower', 'New follower {value}', hudLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 102, 460, 52],
        live.label('latest_sub', 'New sub {value}', hudLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1400, 40, 480, 92], live.goal(hudGoal)),
      widget('events', 'events', [1480, 760, 400, 270], live.events(hudEvents)),
      cut('rail', [1400, 140, 480, 4], 'parallelogram', { fill: CYAN }),
      rotator('socials', [560, 1030, 800, 34], SOCIALS, {
        ...mono,
        size: 20,
        color: INK,
        align: 'center',
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      cam('cam', [40, 100, 1220, 800], 'hud', {
        color: ACID,
        accent: CYAN,
        thickness: 5,
        radius: 0,
        label: 'Live feed',
      }),
      readout('cam-top', 60, 60, 700, 'FEED 01 // 1080P60 // OPERATOR ONLINE', CYAN),
      fancyFrame('chat-frame', [1300, 100, 580, 800], 'hud', {
        color: CYAN,
        accent: ACID,
        thickness: 3,
        radius: 0,
        label: 'Comms',
      }),
      widget(
        'chat',
        'chat',
        [1320, 130, 540, 750],
        live.chat({
          variant: 'terminal',
          accent: ACID,
          text: INK,
          background: '#05070ad9',
          radius: 0,
        }),
      ),
      widget('alerts', 'alerts', [250, 140, 800, 420], live.alerts),
      widget('goal', 'goal', [40, 940, 560, 92], live.goal(hudGoal)),
      widget(
        'latest',
        'label',
        [640, 960, 460, 52],
        live.label('latest_sub', 'New sub {value}', hudLabel),
      ),
      rotator('socials', [1300, 970, 580, 40], SOCIALS, {
        ...mono,
        size: 22,
        color: INK,
        align: 'right',
      }),
      brand([1840, 914, 30, 30], 'badge', ACID),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Booting up',
      'SYSTEMS WARMING  ::  STREAM STARTS SHORTLY',
    ),
    waiting('brb', 'Be right back', 'Signal paused', 'OPERATOR STEPPED AWAY  ::  BACK IN A MOMENT'),
    scene('ending', 'Ending', [
      ...backdrop(),
      text('title', [160, 170, 1600, 140], {
        text: 'Session complete',
        font: 'Orbitron',
        size: 100,
        weight: 900,
        color: INK,
        color2: CYAN,
        effect: 'glitch',
        align: 'center',
        uppercase: true,
        letter_spacing: 0.05,
        ...enter('fade', 150),
      }),
      readout('sub', 560, 320, 800, 'LOGGING OFF  ::  THANKS FOR RUNNING WITH US', ACID),
      fancyFrame('log', [560, 400, 800, 420], 'hud', {
        color: ACID,
        accent: CYAN,
        thickness: 4,
        radius: 0,
        label: 'Session log',
      }),
      widget('events', 'events', [590, 430, 740, 300], live.events(hudEvents)),
      widget(
        'top',
        'label',
        [590, 748, 740, 52],
        live.label('top_tip_session', 'Top tip {value}', hudLabel),
      ),
      rotator('socials', [560, 880, 800, 40], SOCIALS, {
        ...mono,
        size: 24,
        color: INK,
        align: 'center',
      }),
      cut('end-hex', [940, 950, 40, 36], 'hexagon', { fill: '#d4ff2a33' }),
      brand([1300, 834, 30, 30], 'badge', ACID),
    ]),
  ],
  'builtin.overclock-hud',
)
