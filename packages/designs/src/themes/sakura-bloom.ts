// Sakura bloom: an anime spring evening. A blush sky with a pale sun, a lilac mountain, a
// vermilion torii on a little hill, soft clouds and petals drifting across everything.
// Script headlines with a white sticker edge, ribbon labels, a rose timeline. The Spark
// sits on the torii's top beam like a charm.

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

const BLUSH = '#ffd9e6'
const CREAM = '#fff4ec'
const SAKURA = '#f7a8c4'
const ROSE = '#d6457a'
const VERMILION = '#e0483e'
const PLUM = '#4a2342'
const LILAC = '#c9b3e6'
const WHITE = '#ffffff'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'discord.gg/yourname'] as const

const ribbonLabel = {
  variant: 'ribbon',
  accent: ROSE,
  text: WHITE,
  background: ROSE,
  radius: 6,
  font: 'Hanken Grotesk',
}
const blossomGoal = {
  variant: 'liquid',
  accent: ROSE,
  track: '#ffe4ee',
  text: PLUM,
  background: '#fffaf7e6',
  radius: 22,
  font: 'Hanken Grotesk',
}
const roseEvents = {
  variant: 'timeline',
  accent: ROSE,
  text: PLUM,
  font: 'Hanken Grotesk',
}
const script = (size: number) => ({
  font: 'Pacifico',
  size,
  weight: 400,
  color: ROSE,
  color2: WHITE,
  effect: 'sticker' as const,
})

/** A vermilion torii: two posts, a tie beam and a curved-looking top beam. */
const torii = (x: number, y: number, w: number) => {
  const h = w * 0.82
  const post = w * 0.08
  return [
    box('torii-l', [x + w * 0.16, y + h * 0.14, post, h * 0.86], {
      shape: 'rect',
      fill: VERMILION,
    }),
    box('torii-r', [x + w * 0.76, y + h * 0.14, post, h * 0.86], {
      shape: 'rect',
      fill: VERMILION,
    }),
    box('torii-tie', [x + w * 0.08, y + h * 0.3, w * 0.84, h * 0.06], {
      shape: 'rect',
      fill: VERMILION,
    }),
    cut('torii-top', [x, y, w, h * 0.12], 'trapezoid', { fill: '#2b1422' }, { rotation: 180 }),
    box('torii-lintel', [x + w * 0.04, y + h * 0.1, w * 0.92, h * 0.07], {
      shape: 'rect',
      fill: VERMILION,
      ...enter('rise', 300),
    }),
  ]
}

const spring = (sunX: number) => [
  box('sky', [0, 0, 1920, 1080], { shape: 'rect', fill: BLUSH, fill2: CREAM, angle: 180 }),
  box('sun', [sunX, 120, 420, 420], {
    shape: 'ellipse',
    fill: '#ffffffcc',
    fill2: '#ffe9f0',
    angle: 180,
    ...enter('fade', 100),
  }),
  cut('cloud-a', [80, 90, 340, 170], 'cloud', { fill: '#ffffffd9', ...enter('fade', 0, 'float') }),
  cut('cloud-b', [1500, 60, 300, 150], 'cloud', { fill: '#ffffffb3' }),
  box('mountain', [700, 380, 1100, 500], {
    shape: 'triangle',
    fill: LILAC,
    fill2: '#eadff5',
    angle: 180,
  }),
  box('peak', [1120, 380, 260, 120], { shape: 'triangle', fill: WHITE }),
  box('hill', [0, 780, 1920, 300], {
    shape: 'ellipse',
    fill: '#ffc2d6',
    fill2: '#ffb0ca',
    angle: 180,
  }),
  box('ground', [0, 900, 1920, 180], {
    shape: 'rect',
    fill: '#ffb0ca',
    fill2: '#f79bba',
    angle: 180,
  }),
]

const petals = (id = 'petals') =>
  pattern(id, [0, 0, 1920, 1080], 'petals', SAKURA, { moving: true, scale: 1 })

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...spring(1240),
    ...torii(1300, 440, 420),
    brand([1496, 446, 28, 28], 'mark', WHITE),
    petals(),
    text('kicker', [140, 230, 900, 40], {
      text: key === 'starting_soon' ? 'spring stream  ·  opening soon' : 'tea break  ·  back soon',
      font: 'Hanken Grotesk',
      size: 26,
      weight: 700,
      color: PLUM,
      uppercase: true,
      letter_spacing: 0.24,
      ...enter('fade', 100),
    }),
    text('title', [120, 270, 1100, 200], {
      text: title,
      ...script(124),
      split: 'letters',
      ...enter('rise', 200),
    }),
    text('sub', [140, 480, 900, 50], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 32,
      weight: 600,
      color: PLUM,
      ...enter('fade', 700),
    }),
    ...(key === 'starting_soon'
      ? [
          box('timer-card', [140, 560, 460, 150], {
            shape: 'rect',
            fill: '#fffaf7e6',
            radius: 28,
            stroke: WHITE,
            stroke_width: 4,
            shadow: 'soft',
          }),
          cut('timer-flower', [560, 540, 70, 70], 'sparkle', {
            fill: SAKURA,
            ...enter('pop', 900),
          }),
          countdown(
            'timer',
            [140, 574, 460, 120],
            300,
            '{time}',
            {
              font: 'Hanken Grotesk',
              size: 96,
              weight: 800,
              color: ROSE,
              align: 'center',
              letter_spacing: -0.02,
              ...enter('zoom', 600),
            },
            'irasshai!',
          ),
        ]
      : [widget('events', 'events', [140, 560, 560, 260], live.events(roseEvents))]),
    rotator('socials', [140, 860, 700, 44], SOCIALS, {
      font: 'Hanken Grotesk',
      size: 28,
      weight: 700,
      color: PLUM,
      letter_spacing: 0.04,
    }),
    widget('goal', 'goal', [140, 940, 600, 100], live.goal(blossomGoal)),
    widget(
      'latest',
      'label',
      [800, 964, 460, 56],
      live.label('latest_follower', 'New friend: {value}', ribbonLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'sakura-bloom',
    name: 'Sakura bloom',
    description:
      'An anime spring evening: blush sky, a vermilion torii, drifting petals and script headlines.',
    style: 'cozy',
    motion: 'smooth',
  },
  [
    scene('in_game', 'In game', [
      pattern('petals', [1380, 160, 540, 420], 'petals', SAKURA, { moving: true, scale: 0.4 }),
      mat('cam-mat', [44, 664, 480, 324], WHITE, 10, 28),
      cam('cam', [44, 664, 480, 324], null, {
        style: 'double',
        color: SAKURA,
        accent: ROSE,
        thickness: 3,
        radius: 22,
      }),
      cut('cam-flower', [480, 630, 76, 76], 'sparkle', { fill: SAKURA, shadow: 'soft' }),
      brand([504, 654, 28, 28], 'mark', WHITE),
      widget(
        'latest',
        'label',
        [40, 40, 440, 56],
        live.label('latest_follower', 'New friend: {value}', ribbonLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 106, 440, 56],
        live.label('latest_sub', 'Sub: {value}', ribbonLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1380, 40, 500, 100], live.goal(blossomGoal)),
      cut('flower-b', [1830, 150, 46, 46], 'sparkle', { fill: SAKURA }),
      rotator('socials', [1320, 1010, 560, 40], SOCIALS, {
        font: 'Hanken Grotesk',
        size: 24,
        weight: 700,
        color: WHITE,
        align: 'right',
        shadow: 'soft',
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 70, 1200, 800], { fill: BLUSH, fill2: CREAM, angle: 180 }),
      pattern('petals', [1270, 0, 650, 1080], 'petals', SAKURA, { moving: true, scale: 0.6 }),
      mat('cam-mat', [60, 70, 1200, 800], WHITE, 12, 32),
      cam('cam', [60, 70, 1200, 800], null, {
        style: 'double',
        color: SAKURA,
        accent: ROSE,
        thickness: 3,
        radius: 24,
      }),
      box('chat-card', [1300, 70, 580, 800], {
        shape: 'rect',
        fill: '#fffaf7e6',
        radius: 32,
        stroke: WHITE,
        stroke_width: 4,
        shadow: 'soft',
      }),
      text('chat-head', [1334, 84, 500, 80], { text: 'chat', ...script(52) }),
      widget(
        'chat',
        'chat',
        [1320, 170, 540, 680],
        live.chat({
          variant: 'speech',
          accent: ROSE,
          text: PLUM,
          background: '#ffe9f0',
          radius: 20,
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [260, 140, 800, 420], live.alerts),
      ...torii(1620, 880, 160).map((l) => ({ ...l, id: `jc-${l.id}` })),
      brand([1688, 882, 24, 24], 'mark', WHITE),
      widget('goal', 'goal', [60, 940, 600, 100], live.goal(blossomGoal)),
      widget(
        'latest',
        'label',
        [700, 962, 460, 56],
        live.label('latest_sub', 'Latest sub: {value}', ribbonLabel),
      ),
      rotator('socials', [1180, 974, 420, 40], SOCIALS, {
        font: 'Hanken Grotesk',
        size: 24,
        weight: 700,
        color: PLUM,
      }),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Petals are falling. Pour some tea.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'Stepped out to the garden. Back soon.'),
    scene('ending', 'Ending', [
      ...spring(1240),
      ...torii(1300, 440, 420),
      brand([1496, 446, 28, 28], 'mark', WHITE),
      petals(),
      text('title', [120, 200, 1100, 200], {
        text: 'Mata ne!',
        ...script(140),
        split: 'letters',
        ...enter('rise', 200),
      }),
      text('sub', [140, 410, 900, 50], {
        text: 'Thank you for spending spring with me.',
        font: 'Hanken Grotesk',
        size: 32,
        weight: 600,
        color: PLUM,
      }),
      widget('events', 'events', [140, 490, 560, 300], live.events(roseEvents)),
      widget(
        'top',
        'label',
        [140, 830, 520, 56],
        live.label('top_tip_session', 'Top tip: {value}', ribbonLabel),
      ),
      rotator('socials', [140, 940, 700, 44], SOCIALS, {
        font: 'Hanken Grotesk',
        size: 28,
        weight: 700,
        color: PLUM,
      }),
    ]),
  ],
  'builtin.sakura-petal',
)
