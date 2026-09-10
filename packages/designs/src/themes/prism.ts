// Prism: holographic glass. Soft iridescent blobs drifting behind clear glass panels, an
// iridescent ring around the cam that slowly turns, hairlines, sparkles and an airy grotesk.
// Restrained on purpose. The Spark is etched faintly into a glass panel's corner.

import {
  brand,
  box,
  cam,
  countdown,
  cut,
  enter,
  fancyFrame,
  live,
  surround,
  pattern,
  rotator,
  scene,
  text,
  themeDesign,
  widget,
} from '../kit'

const DUSK = '#0e0f1a'
const ICE = '#a8f0ff'
const ROSE = '#ffb8f0'
const MINT = '#c8ffde'
const BUTTER = '#fff3a8'
const WHITE = '#ffffff'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname'] as const

const glassLabel = {
  variant: 'chip',
  accent: ICE,
  text: WHITE,
  background: '#ffffff1f',
  radius: 18,
  font: 'Space Grotesk',
}
const ringGoal = {
  variant: 'ring',
  accent: ROSE,
  track: '#ffffff26',
  text: WHITE,
  background: '#ffffff17',
  radius: 40,
  font: 'Space Grotesk',
}
const glassEvents = { variant: 'stack', accent: MINT, text: WHITE, font: 'Space Grotesk' }

const glass = (id: string, x: number, y: number, w: number, h: number, r = 32) =>
  box(id, [x, y, w, h], {
    shape: 'rect',
    fill: '#ffffff1a',
    fill2: '#ffffff08',
    angle: 135,
    radius: r,
    stroke: '#ffffff40',
    stroke_width: 1,
  })
const blobs = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: '#161833', fill2: DUSK, angle: 160 }),
  cut(
    'blob-a',
    [-0 + 80, 60, 760, 700],
    'blob',
    { fill: ROSE, fill2: '#ffb8f000', angle: 160, ...enter('fade', 0, 'float') },
    { opacity: 0.45 },
  ),
  cut(
    'blob-b',
    [1180, 320, 700, 680],
    'blob',
    { fill: ICE, fill2: '#a8f0ff00', angle: 20, ...enter('fade', 300, 'float') },
    { opacity: 0.4 },
  ),
  cut(
    'blob-c',
    [760, 0, 520, 440],
    'blob',
    { fill: BUTTER, fill2: '#fff3a800', angle: 200 },
    { opacity: 0.22 },
  ),
  pattern('sparkles', [0, 0, 1920, 1080], 'sparkles', WHITE, { moving: true, scale: 0.8 }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...blobs(),
    glass('panel', 360, 250, 1200, 560, 48),
    brand([1508, 760, 30, 30], 'watermark', WHITE),
    text('kicker', [440, 300, 1040, 40], {
      text: key === 'starting_soon' ? 'Stream starts in' : 'Be right back',
      font: 'Space Grotesk',
      size: 28,
      weight: 500,
      color: ICE,
      align: 'center',
      uppercase: true,
      letter_spacing: 0.3,
      ...enter('fade', 150),
    }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [440, 350, 1040, 220],
          300,
          '{time}',
          {
            font: 'Space Grotesk',
            size: 200,
            weight: 300,
            color: WHITE,
            color2: ROSE,
            effect: 'gradient',
            align: 'center',
            letter_spacing: -0.04,
            ...enter('zoom', 300),
          },
          'Now',
        )
      : text('title', [440, 350, 1040, 220], {
          text: title,
          font: 'Space Grotesk',
          size: 150,
          weight: 300,
          color: WHITE,
          color2: ICE,
          effect: 'gradient',
          align: 'center',
          letter_spacing: -0.04,
          ...enter('zoom', 300),
        }),
    box('rule', [760, 600, 400, 1], {
      shape: 'rect',
      fill: '#ffffff00',
      fill2: '#ffffffaa',
      angle: 90,
    }),
    text('sub', [440, 620, 1040, 50], {
      text: sub,
      font: 'Space Grotesk',
      size: 30,
      weight: 400,
      color: '#e6e8ff',
      align: 'center',
      ...enter('fade', 600),
    }),
    rotator(
      'socials',
      [560, 700, 800, 44],
      SOCIALS,
      { font: 'Space Grotesk', size: 28, weight: 500, color: WHITE, align: 'center' },
      5,
    ),
    widget('goal', 'goal', [360, 880, 420, 90], live.goal(ringGoal)),
    widget(
      'latest',
      'label',
      [1140, 900, 420, 56],
      live.label('latest_follower', 'Latest  {value}', glassLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'prism',
    name: 'Prism',
    description: 'Holographic glass: iridescent blobs, clear panels and a slowly turning cam ring.',
    style: 'minimal',
    motion: 'smooth',
    pro: true,
  },
  [
    scene('in_game', 'In game', [
      fancyFrame('cam-ring', [40, 660, 480, 340], 'holo', {
        color: ICE,
        accent: ROSE,
        thickness: 5,
        radius: 28,
        ...enter('fade', 0, 'float'),
      }),
      cam('cam', [40, 660, 480, 340], null, {
        color: '#ffffff00',
        accent: '#ffffff00',
        thickness: 1,
        radius: 28,
      }),
      brand([480, 960, 26, 26], 'watermark', WHITE),
      widget(
        'latest',
        'label',
        [40, 40, 400, 56],
        live.label('latest_follower', 'Latest  {value}', glassLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1460, 40, 420, 90], live.goal(ringGoal)),
      widget('events', 'events', [1520, 800, 360, 240], live.events(glassEvents)),
      rotator(
        'socials',
        [560, 1020, 800, 40],
        SOCIALS,
        {
          font: 'Space Grotesk',
          size: 24,
          weight: 500,
          color: WHITE,
          align: 'center',
          shadow: 'soft',
        },
        5,
      ),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [40, 60, 1240, 860], { fill: DUSK }),
      cut(
        'blob-b',
        [1300, 380, 600, 600],
        'blob',
        { fill: ICE, fill2: '#a8f0ff00', angle: 20 },
        { opacity: 0.35 },
      ),
      pattern('sparkles', [1290, 0, 630, 1080], 'sparkles', WHITE, { moving: true, scale: 0.5 }),
      fancyFrame('cam-ring', [40, 60, 1240, 860], 'holo', {
        color: ICE,
        accent: ROSE,
        thickness: 6,
        radius: 36,
        ...enter('fade', 0, 'float'),
      }),
      cam('cam', [40, 60, 1240, 860], null, {
        color: '#ffffff00',
        accent: '#ffffff00',
        thickness: 1,
        radius: 36,
      }),
      glass('chat-glass', 1320, 60, 560, 860, 36),
      text('chat-head', [1360, 86, 480, 40], {
        text: 'Chat',
        font: 'Space Grotesk',
        size: 26,
        weight: 500,
        color: ICE,
        uppercase: true,
        letter_spacing: 0.3,
      }),
      widget(
        'chat',
        'chat',
        [1340, 140, 520, 760],
        live.chat({
          variant: 'glass',
          accent: ICE,
          text: WHITE,
          background: '#0e0f1a',
          radius: 18,
          font: 'Space Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [260, 140, 800, 420], live.alerts),
      widget('goal', 'goal', [40, 960, 420, 90], live.goal(ringGoal)),
      widget(
        'latest',
        'label',
        [500, 977, 400, 56],
        live.label('latest_sub', 'Latest sub  {value}', glassLabel),
      ),
      rotator(
        'socials',
        [1320, 984, 560, 40],
        SOCIALS,
        { font: 'Space Grotesk', size: 24, weight: 500, color: WHITE, align: 'right' },
        5,
      ),
      brand([1838, 880, 28, 28], 'watermark', WHITE),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Settle in. Something calm is on its way.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'A short pause. Stay a while.'),
    scene('ending', 'Ending', [
      ...blobs(),
      glass('panel', 360, 160, 1200, 760, 48),
      text('title', [440, 220, 1040, 160], {
        text: 'Thank you',
        font: 'Space Grotesk',
        size: 140,
        weight: 300,
        color: WHITE,
        color2: ROSE,
        effect: 'gradient',
        align: 'center',
        letter_spacing: -0.04,
        ...enter('zoom', 200),
      }),
      text('sub', [440, 390, 1040, 50], {
        text: 'For the company, the chat and the calm.',
        font: 'Space Grotesk',
        size: 30,
        weight: 400,
        color: '#e6e8ff',
        align: 'center',
      }),
      widget('events', 'events', [560, 470, 800, 260], live.events(glassEvents)),
      widget(
        'top',
        'label',
        [660, 760, 600, 56],
        live.label('top_tip_session', 'Top tip  {value}', glassLabel),
      ),
      rotator(
        'socials',
        [560, 840, 800, 44],
        SOCIALS,
        { font: 'Space Grotesk', size: 28, weight: 500, color: WHITE, align: 'center' },
        5,
      ),
      brand([1508, 868, 30, 30], 'watermark', WHITE),
    ]),
  ],
  'builtin.prism-holo',
)
