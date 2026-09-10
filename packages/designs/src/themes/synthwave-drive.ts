// Synthwave drive: a striped sunset over a horizon grid that rolls towards you, chrome
// capitals, neon tubes. Waiting screens are the full drive; live scenes keep a thin grid
// strip and the sun as a corner accent so the game stays clear. The Spark rides the horizon
// line as a small ticker dot, and sits in the cam's lower edge in game.

import {
  brand,
  box,
  cam,
  countdown,
  cut,
  enter,
  live,
  pattern,
  rotator,
  scene,
  text,
  themeDesign,
  widget,
} from '../kit'

const NIGHT = '#0b0221'
const PINK = '#ff3ea5'
const CYAN = '#2de2e6'
const SUN1 = '#ffd319'
const SUN2 = '#ff2975'
const INK = '#fdf6ff'
const SOCIALS = [
  'twitch.tv/yourname',
  'youtube.com/@yourname',
  'kick.com/yourname',
  'Discord: discord.gg/yourname',
] as const

const neonLabel = {
  variant: 'neon',
  accent: PINK,
  text: INK,
  background: '#12052ee6',
  radius: 6,
  font: 'Audiowide',
  uppercase: true,
}
const tubeGoal = {
  variant: 'tube',
  accent: CYAN,
  track: '#12052e',
  text: INK,
  background: '#0b0221d9',
  radius: 6,
  font: 'Audiowide',
  uppercase: true,
}

/** The sun: a gradient disc with night bands cut through its lower half. */
const sun = (x: number, y: number, d: number, id = 'sun') => [
  box(`${id}-glow`, [x - d * 0.12, Math.max(0, y - d * 0.12), d * 1.24, d * 1.24], {
    shape: 'ellipse',
    fill: '#ff297533',
    fill2: '#ff297500',
    angle: 180,
  }),
  box(id, [x, y, d, d], {
    shape: 'ellipse',
    fill: SUN1,
    fill2: SUN2,
    angle: 180,
    ...enter('rise', 100),
  }),
  box(`${id}-bands`, [x, y, d, d], { shape: 'ellipse', pattern: 'blinds', fill: NIGHT }),
]

/** The full drive: sky, stars, sun, mountains, rolling grid, horizon glow. */
const world = (sunX: number, sunY: number, sunD: number) => [
  box('sky', [0, 0, 1920, 1080], { shape: 'rect', fill: '#1a0546', fill2: NIGHT, angle: 180 }),
  pattern('stars', [0, 0, 1920, 560], 'stars', '#ffffff', { moving: true, scale: 1.2 }),
  ...sun(sunX, sunY, sunD),
  box('ridge-a', [0, 470, 700, 220], {
    shape: 'triangle',
    fill: '#2a0a5e',
    fill2: '#160536',
    angle: 180,
  }),
  box('ridge-b', [1160, 430, 760, 260], {
    shape: 'triangle',
    fill: '#330b6b',
    fill2: '#160536',
    angle: 180,
  }),
  box('floor', [0, 690, 1920, 390], { shape: 'rect', fill: '#14043a', fill2: NIGHT, angle: 180 }),
  pattern('grid', [0, 690, 1920, 390], 'perspective', PINK, { moving: true, scale: 1.4 }),
  box('horizon', [0, 686, 1920, 6], {
    shape: 'rect',
    fill: CYAN,
    fill2: PINK,
    angle: 90,
    shadow: 'glow',
  }),
]

const waiting = (
  key: 'starting_soon' | 'brb',
  name: string,
  title: string,
  sub: string,
  timer: boolean,
) =>
  scene(key, name, [
    ...world(key === 'brb' ? 1260 : 780, key === 'brb' ? 250 : 330, key === 'brb' ? 400 : 360),
    text('title', key === 'brb' ? [140, 230, 1060, 260] : [160, 70, 1600, 160], {
      text: title,
      font: 'Audiowide',
      size: key === 'brb' ? 116 : 136,
      weight: 400,
      color: '#ffe3f6',
      color2: PINK,
      effect: 'chrome',
      align: key === 'brb' ? 'left' : 'center',
      uppercase: true,
      letter_spacing: 0.02,
      ...enter('drop', 200),
    }),
    text('sub', key === 'brb' ? [146, 500, 900, 50] : [360, 240, 1200, 50], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 32,
      weight: 600,
      color: '#c9f7f8',
      align: key === 'brb' ? 'left' : 'center',
      letter_spacing: 0.04,
      ...enter('fade', 600),
    }),
    ...(timer
      ? [
          countdown(
            'timer',
            [710, 760, 500, 110],
            300,
            '{time}',
            {
              font: 'Audiowide',
              size: 92,
              weight: 400,
              color: CYAN,
              color2: PINK,
              effect: 'neon',
              align: 'center',
              ...enter('zoom', 500),
            },
            'Here we go',
          ),
        ]
      : [
          widget(
            'events',
            'events',
            [146, 580, 900, 60],
            live.events({
              variant: 'ticker',
              accent: PINK,
              text: INK,
              background: '#0b022100',
              font: 'Audiowide',
              uppercase: true,
            }),
          ),
        ]),
    rotator('socials', [560, 950, 800, 50], SOCIALS, {
      font: 'Audiowide',
      size: 28,
      weight: 400,
      color: INK,
      align: 'center',
      letter_spacing: 0.06,
      shadow: 'glow',
    }),
    widget('goal', 'goal', [1380, 900, 480, 96], live.goal(tubeGoal)),
    widget(
      'latest',
      'label',
      [60, 920, 480, 60],
      live.label('latest_follower', 'Latest: {value}', neonLabel),
    ),
    brand([1834, 674, 30, 30], 'badge', CYAN),
  ])

export default themeDesign(
  {
    slug: 'synthwave-drive',
    name: 'Synthwave drive',
    description:
      'A striped sunset over a rolling neon grid, chrome capitals and a countdown. Five scenes.',
    style: 'retro',
    motion: 'lively',
  },
  [
    scene('in_game', 'In game', [
      box(
        'strip',
        [0, 1010, 1920, 70],
        { shape: 'rect', fill: '#0b0221', fill2: '#0b022100', angle: 0 },
        { opacity: 0.9 },
      ),
      pattern('strip-grid', [0, 1010, 1920, 70], 'perspective', PINK, { moving: true, scale: 0.7 }),
      box('strip-line', [0, 1008, 1920, 3], {
        shape: 'rect',
        fill: CYAN,
        fill2: PINK,
        angle: 90,
        shadow: 'glow',
      }),
      ...sun(1730, 40, 140, 'mini-sun'),
      cam('cam', [40, 640, 500, 340], 'tube', {
        color: PINK,
        accent: CYAN,
        thickness: 3,
        radius: 10,
        label: 'Live',
      }),
      brand([276, 966, 28, 28], 'badge', CYAN),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget(
        'latest',
        'label',
        [40, 40, 440, 56],
        live.label('latest_follower', 'Latest: {value}', neonLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 108, 440, 56],
        live.label('latest_sub', 'Sub: {value}', neonLabel),
      ),
      widget('goal', 'goal', [1420, 210, 460, 92], live.goal(tubeGoal)),
      rotator('socials', [1300, 1024, 580, 44], SOCIALS, {
        font: 'Audiowide',
        size: 24,
        weight: 400,
        color: INK,
        align: 'right',
        letter_spacing: 0.06,
        shadow: 'glow',
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      box('bg-floor', [0, 880, 1920, 200], {
        shape: 'rect',
        fill: '#0b022100',
        fill2: '#0b0221',
        angle: 180,
      }),
      pattern('bg-grid', [0, 900, 1920, 180], 'perspective', PINK, { moving: true, scale: 0.9 }),
      ...sun(1500, 30, 220, 'chat-sun'),
      cam('cam', [40, 90, 1240, 780], 'tube', {
        color: PINK,
        accent: CYAN,
        thickness: 3,
        radius: 12,
        label: 'Just chatting',
      }),
      widget(
        'chat',
        'chat',
        [1320, 150, 560, 720],
        live.chat({ variant: 'neon', accent: CYAN, text: INK, background: '#0b0221d9', radius: 6 }),
      ),
      widget('alerts', 'alerts', [260, 140, 800, 420], live.alerts),
      widget('goal', 'goal', [40, 920, 560, 96], live.goal(tubeGoal)),
      widget(
        'latest',
        'label',
        [640, 940, 440, 56],
        live.label('latest_sub', 'Latest sub: {value}', neonLabel),
      ),
      rotator('socials', [1320, 948, 560, 44], SOCIALS, {
        font: 'Audiowide',
        size: 24,
        weight: 400,
        color: INK,
        align: 'right',
        letter_spacing: 0.06,
        shadow: 'glow',
      }),
      brand([1846, 96, 30, 30], 'badge', CYAN),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Engines warming up. Grab a drink.',
      true,
    ),
    waiting(
      'brb',
      'Be right back',
      'Be right back',
      'Refuelling. Back on the road in a minute.',
      false,
    ),
    scene('ending', 'Ending', [
      ...world(760, 470, 400),
      text('title', [160, 90, 1600, 150], {
        text: 'Thanks for riding',
        font: 'Audiowide',
        size: 120,
        weight: 400,
        color: '#ffe3f6',
        color2: PINK,
        effect: 'chrome',
        align: 'center',
        uppercase: true,
        ...enter('rise', 150),
      }),
      text('sub', [360, 250, 1200, 50], {
        text: 'Same road, next stream.',
        font: 'Hanken Grotesk',
        size: 32,
        weight: 600,
        color: '#c9f7f8',
        align: 'center',
      }),
      widget(
        'events',
        'events',
        [660, 740, 600, 230],
        live.events({
          variant: 'timeline',
          accent: CYAN,
          text: INK,
          font: 'Audiowide',
          uppercase: true,
        }),
      ),
      widget(
        'top',
        'label',
        [660, 990, 600, 56],
        live.label('top_tip_session', 'Top tip: {value}', neonLabel),
      ),
      rotator('socials', [80, 1000, 520, 44], SOCIALS, {
        font: 'Audiowide',
        size: 24,
        weight: 400,
        color: INK,
        letter_spacing: 0.06,
        shadow: 'glow',
      }),
      cut('flag', [1700, 960, 40, 40], 'sparkle', { fill: CYAN, shadow: 'glow' }),
      brand([1834, 674, 30, 30], 'badge', CYAN),
    ]),
  ],
  'builtin.synthwave-chrome',
)
