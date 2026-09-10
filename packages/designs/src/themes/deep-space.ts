// Deep space: a mission control in orbit. A drifting starfield, a ringed planet and moons,
// orbit paths, a comet, a round porthole cam, Bebas capitals with a grotesk for details.
// Waiting screens count down to launch. The Spark is a small moon on an orbit path.

import {
  brand,
  box,
  cam,
  countdown,
  cut,
  enter,
  live,
  surround,
  pattern,
  rotator,
  scene,
  text,
  themeDesign,
  widget,
} from '../kit'

const VOID = '#03040b'
const NEBULA = '#3b1d6e'
const TEAL = '#1fd1c1'
const PLANET = '#ff9f5a'
const WHITE = '#eef6ff'
const MUTED = '#bcd2ff'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'discord.gg/yourname'] as const

const orbitLabel = {
  variant: 'chip',
  accent: TEAL,
  text: WHITE,
  background: '#0a1028e6',
  radius: 30,
  font: 'Bebas Neue',
  font_size: 28,
}
const ringGoal = {
  variant: 'ring',
  accent: TEAL,
  track: '#ffffff1f',
  text: WHITE,
  background: '#0a1028e6',
  radius: 50,
  font: 'Bebas Neue',
}
const spaceEvents = { variant: 'timeline', accent: TEAL, text: WHITE, font: 'Space Grotesk' }
const detail = {
  font: 'Space Grotesk',
  size: 22,
  weight: 500,
  color: MUTED,
  letter_spacing: 0.2,
  uppercase: true,
} as const

const planet = (x: number, y: number, d: number) => [
  box('planet-glow', [x - d * 0.1, y - d * 0.1, d * 1.2, d * 1.2], {
    shape: 'ellipse',
    fill: `${PLANET}22`,
    fill2: `${PLANET}00`,
    angle: 180,
  }),
  box('planet', [x, y, d, d], {
    shape: 'ellipse',
    fill: '#ffd0a8',
    fill2: '#8a3b1d',
    angle: 160,
    ...enter('zoom', 100),
  }),
  box('planet-bands', [x, y, d, d], {
    shape: 'ellipse',
    pattern: 'lines',
    fill: '#00000026',
    pattern_scale: 1.6,
  }),
  box(
    'ring',
    [x - d * 0.45, y + d * 0.38, d * 1.9, d * 0.28],
    { shape: 'ellipse', stroke: '#ffe2c9aa', stroke_width: 6 },
    { rotation: -14 },
  ),
]
const space = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: NEBULA, fill2: VOID, angle: 200 }),
  pattern('nebula', [0, 0, 1920, 1080], 'bokeh', '#7b4bd8', { scale: 0.6 }, { opacity: 0.55 }),
  pattern('stars', [0, 0, 1920, 1080], 'stars', '#ffffff', { moving: true, scale: 1.3 }),
  box(
    'comet',
    [1180, 140, 380, 3],
    { shape: 'rect', fill: '#ffffff00', fill2: '#ffffff', angle: 90, ...enter('slide_right', 800) },
    { rotation: 18 },
  ),
]
const orbitPath = (x: number, y: number, w: number, h: number) => [
  box('orbit', [x, y, w, h], { shape: 'ellipse', stroke: '#1fd1c155', stroke_width: 2 }),
  cut('moonlet', [x + w * 0.06, y + h * 0.18, 44, 44], 'moon', { fill: '#c9d6ea' }),
  brand([x + w * 0.82, y + h * 0.84, 30, 30], 'badge', TEAL),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...space(),
    ...planet(1240, 380, 380),
    ...orbitPath(1060, 300, 740, 540),
    text('kicker', [120, 280, 900, 40], {
      ...detail,
      text: key === 'starting_soon' ? 'Mission 01  ·  pre-launch' : 'Mission 01  ·  holding orbit',
      color: TEAL,
    }),
    text('title', [110, 320, 1000, 200], {
      text: title,
      font: 'Bebas Neue',
      size: 180,
      color: WHITE,
      letter_spacing: 0.02,
      split: 'letters',
      ...enter('rise', 200),
    }),
    text('sub', [120, 520, 900, 50], {
      text: sub,
      font: 'Space Grotesk',
      size: 30,
      weight: 400,
      color: MUTED,
      ...enter('fade', 600),
    }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [120, 590, 700, 130],
          300,
          'T- {time}',
          { font: 'Bebas Neue', size: 130, color: TEAL, shadow: 'glow', ...enter('fade', 800) },
          'Liftoff',
        )
      : widget('events', 'events', [120, 600, 620, 260], live.events(spaceEvents)),
    rotator('socials', [120, 900, 700, 44], SOCIALS, { ...detail, size: 26, color: WHITE }, 5),
    widget('goal', 'goal', [1340, 900, 480, 100], live.goal(ringGoal)),
  ])

export default themeDesign(
  {
    slug: 'deep-space',
    name: 'Deep space',
    description:
      'Mission control in orbit: starfield, ringed planet, a porthole cam and a launch countdown.',
    style: 'tech',
    motion: 'smooth',
  },
  [
    scene('in_game', 'In game', [
      box('porthole-back', [30, 690, 380, 380], {
        shape: 'ellipse',
        stroke: '#0a1028e6',
        stroke_width: 22,
      }),
      cam('cam', [50, 710, 340, 340], 'circle', {
        color: '#c9d6ea',
        accent: TEAL,
        thickness: 8,
        radius: 200,
        label: 'Commander',
      }),
      box('porthole-orbit', [10, 670, 420, 420 - 10], {
        shape: 'ellipse',
        stroke: '#1fd1c144',
        stroke_width: 2,
      }),
      brand([382, 712, 28, 28], 'badge', TEAL),
      widget(
        'latest',
        'label',
        [40, 40, 420, 56],
        live.label('latest_follower', 'New crew  {value}', orbitLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1420, 40, 460, 100], live.goal(ringGoal)),
      widget('events', 'events', [1520, 780, 360, 250], live.events(spaceEvents)),
      rotator(
        'socials',
        [560, 1024, 800, 40],
        SOCIALS,
        { ...detail, size: 22, color: WHITE, align: 'center' },
        5,
      ),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 80, 1200, 820], { fill: VOID }),
      pattern('stars', [1270, 0, 650, 1080], 'stars', '#ffffff', { moving: true, scale: 0.5 }),
      cam('cam', [60, 80, 1200, 820], 'hud', {
        color: '#c9d6ea',
        accent: TEAL,
        thickness: 3,
        radius: 0,
        label: 'Bridge cam',
      }),
      box('chat-back', [1300, 80, 560, 820], {
        shape: 'rect',
        fill: '#0a1028cc',
        radius: 24,
        stroke: '#1fd1c144',
        stroke_width: 1,
      }),
      text('chat-head', [1330, 100, 500, 40], { ...detail, text: 'Comms channel', color: TEAL }),
      widget(
        'chat',
        'chat',
        [1320, 150, 520, 730],
        live.chat({
          variant: 'neon',
          accent: TEAL,
          text: WHITE,
          background: '#0a1028',
          radius: 12,
          font: 'Space Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [260, 140, 800, 420], live.alerts),
      ...planet(1680, 930, 120).map((l) =>
        l.id === 'planet-glow' ? { ...l, w: 130, h: 130, x: 1675, y: 925 } : l,
      ),
      widget('goal', 'goal', [60, 950, 480, 100], live.goal(ringGoal)),
      widget(
        'latest',
        'label',
        [580, 972, 440, 56],
        live.label('latest_sub', 'New crew  {value}', orbitLabel),
      ),
      brand([1820, 860, 28, 28], 'badge', TEAL),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Launching soon',
      'Fuel loaded. Strap in, we lift off shortly.',
    ),
    waiting('brb', 'Be right back', 'Holding orbit', 'Small course correction. Back in a moment.'),
    scene('ending', 'Ending', [
      ...space(),
      ...planet(1240, 380, 380),
      ...orbitPath(1060, 300, 740, 540),
      text('kicker', [120, 240, 900, 40], {
        ...detail,
        text: 'Mission 01  ·  complete',
        color: TEAL,
      }),
      text('title', [110, 280, 1000, 200], {
        text: 'Splashdown',
        font: 'Bebas Neue',
        size: 180,
        color: WHITE,
        letter_spacing: 0.02,
        ...enter('rise', 200),
      }),
      text('sub', [120, 480, 900, 50], {
        text: 'Thanks for flying with us. Next launch soon.',
        font: 'Space Grotesk',
        size: 30,
        weight: 400,
        color: MUTED,
      }),
      widget('events', 'events', [120, 560, 620, 280], live.events(spaceEvents)),
      widget(
        'top',
        'label',
        [120, 870, 560, 56],
        live.label('top_tip_session', 'Top tip  {value}', orbitLabel),
      ),
      rotator('socials', [120, 960, 700, 44], SOCIALS, { ...detail, size: 26, color: WHITE }, 5),
    ]),
  ],
  'builtin.orbit-ring',
)
