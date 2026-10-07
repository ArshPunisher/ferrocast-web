// Ocean depths: a slow dive from sunlit teal down into the abyss. Shafts of light fall from
// the surface, caustics ripple at the top, bubbles rise past kelp and dark rock, and a
// glowing jellyfish drifts by. The countdown sits in a sonar ring like a depth gauge, and
// the accents glow aqua like bioluminescence. The Spark sits on the gauge like a beacon.

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

const SHALLOW = '#127a86'
const DEEP = '#05304a'
const ABYSS = '#020b16'
const AQUA = '#5ef2e0'
const JELLY = '#c69bff'
const FOAM = '#e8fbff'
const ROCK = '#03141f'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'discord.gg/yourname'] as const

const glassLabel = {
  variant: 'chip',
  accent: AQUA,
  text: FOAM,
  background: '#04263ad9',
  radius: 24,
  font: 'Hanken Grotesk',
}
const tankGoal = {
  variant: 'liquid',
  accent: AQUA,
  track: '#021521',
  text: FOAM,
  background: '#04263ae6',
  radius: 26,
  font: 'Hanken Grotesk',
}
const glowEvents = {
  variant: 'timeline',
  accent: AQUA,
  text: FOAM,
  font: 'Hanken Grotesk',
}
const display = (size: number) => ({
  font: 'Bricolage Grotesque',
  size,
  weight: 300,
  color: FOAM,
  color2: AQUA,
  effect: 'gradient' as const,
  letter_spacing: -0.02,
})
const gauge = (size: number, color = AQUA) => ({
  font: 'JetBrains Mono',
  size,
  weight: 500,
  color,
  uppercase: true,
  letter_spacing: 0.22,
})

/** Water from the lit surface down to black, with light shafts and caustics. */
const water = () => [
  box('water', [0, 0, 1920, 1080], {
    shape: 'rect',
    fill: SHALLOW,
    fill2: ABYSS,
    angle: 180,
  }),
  box('mid', [0, 360, 1920, 720], {
    shape: 'rect',
    fill: '#05304a00',
    fill2: '#020b16cc',
    angle: 180,
  }),
  cut(
    'ray-a',
    [260, 0, 260, 820],
    'trapezoid',
    { fill: '#e8fbff1f', fill2: '#e8fbff00', angle: 180 },
    { rotation: 14 },
  ),
  cut(
    'ray-b',
    [760, 0, 200, 700],
    'trapezoid',
    { fill: '#e8fbff17', fill2: '#e8fbff00', angle: 180 },
    { rotation: 6 },
  ),
  cut(
    'ray-c',
    [1300, 0, 300, 860],
    'trapezoid',
    { fill: '#e8fbff1a', fill2: '#e8fbff00', angle: 180 },
    { rotation: -10 },
  ),
  pattern('caustics', [0, 0, 1920, 260], 'waves', '#e8fbff14', { scale: 2.2, moving: true }),
]

/** Kelp and rock along the floor. */
const floor = () => [
  cut(
    'kelp-a',
    [90, 560, 110, 460],
    'leaf',
    { fill: '#0f5a4a', fill2: '#04241f', angle: 180, ...enter('fade', 0, 'float') },
    { rotation: -8 },
  ),
  cut(
    'kelp-b',
    [180, 640, 90, 400],
    'leaf',
    { fill: '#137060', fill2: '#04241f', angle: 180 },
    { rotation: 10 },
  ),
  cut(
    'kelp-c',
    [1720, 600, 100, 440],
    'leaf',
    { fill: '#0f5a4a', fill2: '#04241f', angle: 180, ...enter('fade', 0, 'float') },
    { rotation: 6 },
  ),
  cut('rock-a', [0, 900, 620, 180], 'blob', { fill: ROCK }),
  cut('rock-b', [1420, 880, 500, 200], 'blob', { fill: '#041a28' }),
  box('seabed', [0, 1010, 1920, 70], { shape: 'rect', fill: ROCK }),
]

/** A jellyfish: a glowing dome with a frilled skirt and three trailing tentacles. */
const jelly = (x: number, y: number) => [
  box('jelly-glow', [x - 70, y - 50, 280, 260], {
    shape: 'ellipse',
    fill: '#c69bff2e',
    fill2: '#c69bff00',
    angle: 180,
    ...enter('fade', 400, 'pulse'),
  }),
  ...[30, 66, 100].map((dx, i) =>
    box(`jelly-t${i}`, [x + dx, y + 80, 6, 150 - i * 30], {
      shape: 'rect',
      fill: '#d9c2ff99',
      fill2: '#c69bff00',
      angle: 180,
      radius: 3,
    }),
  ),
  box('jelly-dome', [x, y, 140, 100], {
    shape: 'ellipse',
    fill: '#f6edff',
    fill2: '#e3cfff',
    angle: 180,
    shadow: 'glow',
  }),
  cut(
    'jelly-skirt',
    [x, y + 46, 140, 46],
    'wave',
    { fill: '#e3cfff', fill2: JELLY, angle: 0 },
    { rotation: 180 },
  ),
]

const bubbles = (
  id = 'bubbles',
  b: readonly [number, number, number, number] = [0, 0, 1920, 1080],
) => pattern(id, b, 'bubbles', '#e8fbff', { moving: true, scale: 0.9 })

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...water(),
    ...floor(),
    ...jelly(1520, 200),
    pattern('glow', [0, 420, 1920, 560], 'fireflies', AQUA, { moving: true, scale: 0.7 }),
    bubbles(),
    text('kicker', [460, 120, 1000, 34], {
      text: key === 'starting_soon' ? 'Descent  ·  depth 0042 m' : 'Holding depth  ·  0310 m',
      ...gauge(22),
      align: 'center',
      ...enter('fade', 100),
    }),
    text('title', [360, 160, 1200, 160], {
      text: title,
      ...display(140),
      align: 'center',
      ...enter('rise', 200),
    }),
    text('sub', [460, 330, 1000, 44], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 28,
      weight: 400,
      color: '#b9e6ee',
      align: 'center',
      ...enter('fade', 500),
    }),
    ...(key === 'starting_soon'
      ? [
          pattern('sonar', [700, 400, 520, 360], 'rings', '#5ef2e026', { scale: 1.6 }),
          box('gauge', [710, 470, 500, 210], {
            shape: 'rect',
            fill: '#04263a99',
            stroke: '#5ef2e080',
            stroke_width: 2,
            radius: 105,
            ...enter('zoom', 400),
          }),
          text('t-label', [710, 494, 500, 30], {
            text: 'Diving in',
            ...gauge(18, '#9fdbe3'),
            align: 'center',
          }),
          countdown(
            'timer',
            [710, 522, 500, 130],
            300,
            '{time}',
            {
              font: 'JetBrains Mono',
              size: 104,
              weight: 300,
              color: AQUA,
              align: 'center',
              shadow: 'glow',
            },
            'Splash',
          ),
          brand([1176, 560, 24, 24], 'mark', AQUA),
        ]
      : [
          box('ev-glass', [660, 420, 600, 330], {
            shape: 'rect',
            fill: '#04263a99',
            stroke: '#5ef2e055',
            stroke_width: 1,
            radius: 24,
          }),
          widget('events', 'events', [690, 440, 540, 290], {
            ...live.events(glowEvents),
            max_items: 5,
          }),
          brand([1222, 432, 24, 24], 'mark', AQUA),
        ]),
    rotator('socials', [560, 800, 800, 36], SOCIALS, { ...gauge(22, FOAM), align: 'center' }),
    widget('goal', 'goal', [400, 940, 560, 96], live.goal(tankGoal)),
    widget(
      'latest',
      'label',
      [1000, 958, 460, 60],
      live.label('latest_follower', 'New diver: {value}', glassLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'ocean-depths',
    name: 'Ocean depths',
    description:
      'Down from sunlit teal into the abyss: light shafts, rising bubbles, kelp and a glowing jellyfish.',
    style: 'cozy',
    motion: 'smooth',
  },
  [
    scene('in_game', 'In game', [
      widget(
        'latest',
        'label',
        [40, 40, 440, 58],
        live.label('latest_follower', 'New diver: {value}', glassLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 108, 440, 58],
        live.label('latest_sub', 'Latest sub: {value}', glassLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1380, 46, 500, 96], live.goal(tankGoal)),
      bubbles('bubbles-l', [0, 200, 120, 460]),
      mat('cam-mat', [44, 680, 480, 300], '#04263acc', 8, 22),
      cam('cam', [44, 680, 480, 300], null, {
        style: 'glow',
        color: AQUA,
        accent: JELLY,
        thickness: 2,
        radius: 20,
      }),
      brand([494, 996, 24, 24], 'mark', AQUA),
      box('ev-glass', [1520, 690, 360, 290], {
        shape: 'rect',
        fill: '#04263ab3',
        stroke: '#5ef2e055',
        stroke_width: 1,
        radius: 22,
      }),
      widget('events', 'events', [1540, 708, 320, 256], {
        ...live.events(glowEvents),
        max_items: 4,
      }),
      rotator('socials', [1500, 1004, 380, 30], SOCIALS, {
        ...gauge(16, FOAM),
        align: 'center',
        shadow: 'soft',
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 80, 1220, 760], { fill: DEEP, fill2: ABYSS, angle: 180 }),
      pattern('caustics', [0, 0, 1920, 80], 'waves', '#e8fbff14', { scale: 2.2 }),
      bubbles('bubbles', [1290, 0, 630, 1080]),
      mat('cam-mat', [60, 80, 1220, 760], '#04263a', 10, 26),
      cam('cam', [60, 80, 1220, 760], null, {
        style: 'glow',
        color: AQUA,
        accent: JELLY,
        thickness: 2,
        radius: 24,
      }),
      box('chat-glass', [1320, 80, 560, 760], {
        shape: 'rect',
        fill: '#04263ab3',
        stroke: '#5ef2e055',
        stroke_width: 1,
        radius: 26,
      }),
      text('chat-head', [1350, 102, 500, 40], { text: 'Sonar chat', ...gauge(20) }),
      box('chat-rule', [1350, 146, 500, 1], { shape: 'rect', fill: '#5ef2e055' }),
      widget(
        'chat',
        'chat',
        [1336, 160, 528, 664],
        live.chat({
          variant: 'glass',
          accent: AQUA,
          text: FOAM,
          background: '#06324a',
          radius: 16,
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [270, 140, 800, 420], live.alerts),
      brand([1840, 106, 24, 24], 'mark', AQUA),
      cut('rock-a', [0, 900, 620, 180], 'blob', { fill: ROCK }),
      box('seabed', [0, 1010, 1920, 70], { shape: 'rect', fill: ROCK }),
      widget('goal', 'goal', [60, 952, 560, 96], live.goal(tankGoal)),
      widget(
        'latest',
        'label',
        [660, 970, 440, 60],
        live.label('latest_sub', 'Latest sub: {value}', glassLabel),
      ),
      rotator('socials', [1140, 984, 520, 32], SOCIALS, { ...gauge(18, FOAM) }),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Check your air. We go under shortly.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'Taking a breath at the surface.'),
    scene('ending', 'Ending', [
      ...water(),
      ...floor(),
      ...jelly(1520, 200),
      bubbles(),
      text('kicker', [460, 110, 1000, 34], {
        text: 'Surfacing  ·  dive logged',
        ...gauge(22),
        align: 'center',
      }),
      text('title', [360, 150, 1200, 160], {
        text: 'Thanks for diving in',
        ...display(116),
        align: 'center',
        ...enter('rise', 200),
      }),
      text('sub', [460, 310, 1000, 44], {
        text: 'Same reef, next time. Bring a friend.',
        font: 'Hanken Grotesk',
        size: 28,
        weight: 400,
        color: '#b9e6ee',
        align: 'center',
      }),
      box('log-glass', [600, 390, 720, 380], {
        shape: 'rect',
        fill: '#04263a99',
        stroke: '#5ef2e055',
        stroke_width: 1,
        radius: 26,
      }),
      brand([1282, 402, 24, 24], 'mark', AQUA),
      widget(
        'top',
        'label',
        [640, 420, 640, 60],
        live.label('top_tip_session', 'Top tip: {value}', glassLabel),
      ),
      widget(
        'subs',
        'label',
        [640, 492, 640, 60],
        live.label('session_subs', 'Subs this dive: {value}', glassLabel),
      ),
      widget('events', 'events', [650, 570, 620, 180], {
        ...live.events(glowEvents),
        max_items: 3,
      }),
      rotator('socials', [560, 820, 800, 36], SOCIALS, { ...gauge(22, FOAM), align: 'center' }),
    ]),
  ],
  'builtin.abyss-glow',
)
