// Forge: the molten Ferrocast look as a full theme. Cast-metal panels with a glowing seam,
// embers rising off the seam, molten gradient headlines, notched cam frames and a molten
// countdown. The Spark sits in the cam frame's notch in game, at the end of the seam on
// the waiting screens, and small beside the sign-off on the ending screen.

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

const MOLTEN = '#ffa424'
const DEEP = '#cf7400'
const ARC = '#33d4ff'
const INK = '#eef0f4'
const DIM = '#b3b9c4'
const IRON = '#0a0b0d'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'kick.com/yourname'] as const
const goalStyle = {
  variant: 'bar',
  accent: MOLTEN,
  track: '#16191e',
  text: INK,
  background: '#101216e6',
  radius: 10,
}
const tag = { variant: 'tag', accent: MOLTEN, text: INK, background: '#101216', radius: 10 }
const cards = { variant: 'cards', accent: MOLTEN, text: INK, background: '#101216e6', radius: 12 }

/** Cast metal: a dark ground with faint brushed lines, a molten seam and embers off it. */
const backdrop = (seamY: number) => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: IRON, fill2: '#16110a', angle: 160 }),
  pattern('brushed', [0, 0, 1920, 1080], 'lines', '#ffffff05', { scale: 0.25 }),
  box('heat', [0, seamY - 260, 1920, 260], {
    shape: 'rect',
    fill: '#ffa42400',
    fill2: '#ffa4241f',
    angle: 180,
  }),
  pattern('embers', [0, seamY - 420, 1920, 420], 'embers', MOLTEN, { moving: true }),
  box('seam', [0, seamY, 1920, 4], {
    shape: 'rect',
    fill: MOLTEN,
    fill2: ARC,
    angle: 90,
    shadow: 'glow',
  }),
  box('cool', [0, seamY + 4, 1920, 1080 - seamY - 4], {
    shape: 'rect',
    fill: '#0d0f12',
    fill2: IRON,
    angle: 180,
  }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...backdrop(660),
    text('title', [160, 300, 1600, 170], {
      text: title,
      font: 'Bricolage Grotesque',
      size: 140,
      weight: 800,
      color: '#ffe0a8',
      color2: DEEP,
      effect: 'gradient',
      align: 'center',
      letter_spacing: -0.03,
      ...enter('rise', 150),
    }),
    text('sub', [360, 480, 1200, 60], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 36,
      weight: 500,
      color: DIM,
      align: 'center',
      ...enter('fade', 450),
    }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [710, 700, 500, 110],
          300,
          '{time}',
          {
            font: 'JetBrains Mono',
            size: 84,
            weight: 700,
            color: MOLTEN,
            align: 'center',
            shadow: 'glow',
            ...enter('fade', 600),
          },
          'Live now',
        )
      : widget('events', 'events', [660, 700, 600, 200], live.events(cards)),
    rotator('socials', [560, 940, 800, 44], SOCIALS, {
      font: 'Hanken Grotesk',
      size: 28,
      weight: 600,
      color: INK,
      align: 'center',
    }),
    widget('goal', 'goal', [60, 940, 460, 80], live.goal(goalStyle)),
    widget(
      'latest',
      'label',
      [1400, 950, 460, 60],
      live.label('latest_follower', 'Latest follower: {value}', tag),
    ),
    brand([1878, 646, 32, 32], 'badge', MOLTEN),
  ])

export default themeDesign(
  {
    slug: 'forge',
    name: 'Forge',
    description:
      'Cast metal with a molten seam, rising embers and a molten countdown. Five scenes.',
    style: 'bold',
    motion: 'smooth',
  },
  [
    scene('in_game', 'In game', [
      cam('cam', [40, 700, 480, 340], null, {
        style: 'notch',
        color: MOLTEN,
        accent: ARC,
        thickness: 3,
        radius: 14,
        label: 'Live',
      }),
      brand([266, 1026, 28, 28], 'mark', INK),
      box('cam-seam', [40, 1050, 480, 3], {
        shape: 'rect',
        fill: MOLTEN,
        fill2: ARC,
        angle: 90,
        shadow: 'glow',
      }),
      widget('alerts', 'alerts', [560, 60, 800, 420], live.alerts),
      widget('goal', 'goal', [660, 996, 600, 56], live.goal(goalStyle)),
      widget(
        'latest',
        'label',
        [40, 40, 440, 60],
        live.label('latest_follower', 'Latest follower: {value}', tag),
      ),
      widget('events', 'events', [1500, 40, 380, 320], live.events(cards)),
      rotator('socials', [1380, 1010, 500, 40], SOCIALS, {
        font: 'Hanken Grotesk',
        size: 24,
        weight: 600,
        color: INK,
        align: 'right',
        shadow: 'soft',
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [40, 110, 1200, 860], { fill: IRON }),
      pattern('embers', [1260, 600, 660, 480], 'embers', MOLTEN, { moving: true, scale: 0.5 }),
      mat('cam-mat', [40, 110, 1200, 860], '#16191e', 6, 22),
      cam('cam', [40, 110, 1200, 860], null, {
        style: 'double',
        color: MOLTEN,
        accent: '#343a44',
        thickness: 3,
        radius: 18,
      }),
      widget(
        'chat',
        'chat',
        [1280, 110, 600, 760],
        live.chat({
          variant: 'plates',
          accent: MOLTEN,
          text: INK,
          background: '#101216e6',
          radius: 14,
        }),
      ),
      box('chat-seam', [1280, 890, 600, 3], {
        shape: 'rect',
        fill: MOLTEN,
        fill2: ARC,
        angle: 90,
        shadow: 'glow',
      }),
      rotator('socials', [1280, 910, 600, 44], SOCIALS, {
        font: 'Hanken Grotesk',
        size: 26,
        weight: 600,
        color: INK,
        align: 'right',
      }),
      brand([1848, 1010, 32, 32], 'mark', INK),
      widget('alerts', 'alerts', [240, 150, 800, 420], live.alerts),
      widget(
        'latest',
        'label',
        [40, 36, 460, 56],
        live.label('latest_sub', 'Latest sub: {value}', tag),
      ),
      widget('goal', 'goal', [600, 996, 640, 56], live.goal(goalStyle)),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Grab a drink. We go live in a moment.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'Stretching, refilling, back in a minute.'),
    scene('ending', 'Ending', [
      ...backdrop(760),
      text('title', [160, 260, 1600, 160], {
        text: 'Thanks for hanging out',
        font: 'Bricolage Grotesque',
        size: 120,
        weight: 800,
        color: '#ffe0a8',
        color2: DEEP,
        effect: 'gradient',
        align: 'center',
        letter_spacing: -0.03,
        ...enter('rise', 150),
      }),
      text('sub', [560, 430, 760, 60], {
        text: 'See you next stream.',
        font: 'Hanken Grotesk',
        size: 36,
        weight: 500,
        color: DIM,
        align: 'center',
      }),
      brand([1318, 444, 32, 32], 'mark', MOLTEN),
      widget('events', 'events', [660, 520, 600, 220], live.events(cards)),
      widget(
        'top',
        'label',
        [660, 800, 600, 64],
        live.label('top_tip_session', 'Top tip tonight: {value}', tag),
      ),
      rotator('socials', [560, 900, 800, 44], SOCIALS, {
        font: 'Hanken Grotesk',
        size: 28,
        weight: 600,
        color: INK,
        align: 'center',
      }),
      cut('spark-l', [600, 822, 20, 20], 'sparkle', { fill: MOLTEN }),
    ]),
  ],
  'builtin.molten-plate',
)
