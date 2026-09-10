// Mochi pop: kawaii stickers. Pastel clouds and blobs with little faces drawn from shapes,
// hearts and stars, rising bubbles, thick white sticker outlines, candy goal, bouncy
// entrances, round Fredoka type. The Spark is a tiny badge on the cam sticker in game and
// on a cloud on the waiting screens.

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

const PINK = '#ff9ecf'
const HOT = '#ff5fa8'
const MINT = '#9ff0d0'
const BUTTER = '#fff1a8'
const LILAC = '#c9b6ff'
const INK = '#5a3d5c'
const WHITE = '#ffffff'
const SOCIALS = ['twitch.tv/yourname', 'youtube @yourname', 'discord.gg/yourname'] as const

const stickerLabel = {
  variant: 'sticker',
  accent: HOT,
  text: INK,
  background: WHITE,
  radius: 22,
  font: 'Fredoka',
}
const candyGoal = {
  variant: 'candy',
  accent: HOT,
  track: '#ffe3f0',
  text: INK,
  background: WHITE,
  radius: 26,
  font: 'Fredoka',
}
const bubbleEvents = {
  variant: 'stickers',
  accent: HOT,
  text: INK,
  background: WHITE,
  radius: 18,
  font: 'Fredoka',
}

/** A mochi: a soft blob with two eyes, blush and a tiny mouth. */
const mochi = (id: string, x: number, y: number, s: number, color: string, rot = 0) => [
  cut(
    `${id}`,
    [x, y, s, s * 0.82],
    'blob',
    { fill: color, stroke: WHITE, stroke_width: 0, shadow: 'soft', ...enter('pop', 200) },
    { rotation: rot },
  ),
  box(
    `${id}-e1`,
    [x + s * 0.32, y + s * 0.32, s * 0.07, s * 0.1],
    { shape: 'ellipse', fill: INK },
    { rotation: rot },
  ),
  box(
    `${id}-e2`,
    [x + s * 0.6, y + s * 0.32, s * 0.07, s * 0.1],
    { shape: 'ellipse', fill: INK },
    { rotation: rot },
  ),
  box(
    `${id}-b1`,
    [x + s * 0.22, y + s * 0.44, s * 0.12, s * 0.06],
    { shape: 'ellipse', fill: '#ff7fb780' },
    { rotation: rot },
  ),
  box(
    `${id}-b2`,
    [x + s * 0.66, y + s * 0.44, s * 0.12, s * 0.06],
    { shape: 'ellipse', fill: '#ff7fb780' },
    { rotation: rot },
  ),
  box(
    `${id}-m`,
    [x + s * 0.46, y + s * 0.42, s * 0.08, s * 0.05],
    { shape: 'ellipse', fill: INK },
    { rotation: rot },
  ),
]
const puff = (id: string, x: number, y: number, w: number, color = WHITE) =>
  cut(id, [x, y, w, w * 0.6], 'cloud', { fill: color, ...enter('fade', 0, 'float') })
const star = (id: string, x: number, y: number, s: number, color: string) =>
  cut(id, [x, y, s, s], 'star', { fill: color, ...enter('pop', 400) })
const heart = (id: string, x: number, y: number, s: number, color: string) =>
  cut(id, [x, y, s, s * 0.9], 'heart', { fill: color, ...enter('pop', 500) })
const sky = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: '#ffe3f0', fill2: '#e6f7ff', angle: 160 }),
  pattern('dots', [0, 0, 1920, 1080], 'dots', '#ffffff99', { scale: 1.8 }),
  pattern('bubbles', [0, 0, 1920, 1080], 'bubbles', '#ffffffcc', { moving: true, scale: 0.8 }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...sky(),
    puff('cloud-a', 80, 80, 360),
    puff('cloud-b', 1460, 120, 300),
    brand([1590, 212, 34, 34], 'badge', MINT),
    ...mochi('m1', 180, 640, 300, PINK, -6),
    ...mochi('m2', 1440, 600, 340, MINT, 8),
    star('s1', 520, 180, 70, BUTTER),
    star('s2', 1320, 380, 50, LILAC),
    heart('h1', 1280, 160, 60, HOT),
    text('title', [360, 270, 1200, 170], {
      text: title,
      font: 'Fredoka',
      size: 140,
      weight: 700,
      color: HOT,
      align: 'center',
      effect: 'sticker',
      color2: WHITE,
      split: 'letters',
      ...enter('bounce', 150),
    }),
    text('sub', [460, 440, 1000, 50], {
      text: sub,
      font: 'Fredoka',
      size: 36,
      weight: 600,
      color: INK,
      align: 'center',
      ...enter('fade', 700),
    }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [710, 510, 500, 120],
          300,
          '{time}',
          {
            font: 'Fredoka',
            size: 100,
            weight: 700,
            color: INK,
            align: 'center',
            effect: 'sticker',
            color2: WHITE,
            ...enter('pop', 900),
          },
          'yay!',
        )
      : widget('events', 'events', [660, 510, 600, 280], live.events(bubbleEvents)),
    rotator(
      'socials',
      [560, 820, 800, 50],
      SOCIALS,
      { font: 'Fredoka', size: 34, weight: 600, color: INK, align: 'center' },
      5,
    ),
    widget('goal', 'goal', [610, 900, 700, 100], live.goal(candyGoal)),
  ])

export default themeDesign(
  {
    slug: 'mochi-pop',
    name: 'Mochi pop',
    description:
      'Kawaii stickers: pastel mochi with faces, clouds, hearts, bubbles and a candy goal.',
    style: 'playful',
    motion: 'bouncy',
  },
  [
    scene('in_game', 'In game', [
      mat('cam-sticker', [44, 664, 472, 332], WHITE, 16, 44),
      cam('cam', [44, 664, 472, 332], 'stitch', {
        color: '#ffc4e1',
        accent: HOT,
        thickness: 4,
        radius: 34,
      }),
      ...mochi('m1', 430, 590, 120, PINK, 10),
      brand([476, 976, 30, 30], 'badge', MINT),
      widget(
        'latest',
        'label',
        [40, 40, 420, 60],
        live.label('latest_follower', 'new friend: {value}', stickerLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1420, 40, 460, 100], live.goal(candyGoal)),
      heart('h1', 1840, 150, 40, HOT),
      widget('events', 'events', [1500, 720, 380, 320], live.events(bubbleEvents)),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [62, 82, 1196, 816], { fill: '#ffe3f0' }),
      mat('cam-sticker', [62, 82, 1196, 816], WHITE, 22, 56),
      cam('cam', [62, 82, 1196, 816], 'stitch', {
        color: '#ffc4e1',
        accent: HOT,
        thickness: 4,
        radius: 42,
      }),
      box('chat-sticker', [1320, 60, 560, 860], {
        shape: 'rect',
        fill: WHITE,
        radius: 44,
        shadow: 'soft',
      }),
      text('chat-head', [1350, 80, 500, 56], {
        text: 'chit chat',
        font: 'Fredoka',
        size: 44,
        weight: 700,
        color: HOT,
      }),
      widget(
        'chat',
        'chat',
        [1340, 150, 520, 750],
        live.chat({
          variant: 'speech',
          accent: HOT,
          text: INK,
          background: '#ffe3f0',
          radius: 20,
          font: 'Fredoka',
        }),
      ),
      widget('alerts', 'alerts', [260, 140, 800, 420], live.alerts),
      ...mochi('m1', 1150, 860, 180, MINT, -8),
      brand([1840, 84, 30, 30], 'badge', MINT),
      widget('goal', 'goal', [40, 960, 560, 100], live.goal(candyGoal)),
      widget(
        'latest',
        'label',
        [640, 975, 440, 60],
        live.label('latest_sub', 'new sub: {value}', stickerLabel),
      ),
      star('s1', 1400, 980, 50, BUTTER),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'starting soon!',
      'getting snacks and fluffing pillows',
    ),
    waiting('brb', 'Be right back', 'brb!', 'went to pet the cat. back soon'),
    scene('ending', 'Ending', [
      ...sky(),
      puff('cloud-a', 80, 80, 360),
      puff('cloud-b', 1460, 120, 300),
      brand([1590, 212, 34, 34], 'badge', MINT),
      ...mochi('m1', 160, 620, 320, LILAC, -6),
      ...mochi('m2', 1460, 640, 300, BUTTER, 6),
      text('title', [360, 220, 1200, 170], {
        text: 'bye bye!',
        font: 'Fredoka',
        size: 150,
        weight: 700,
        color: HOT,
        align: 'center',
        effect: 'sticker',
        color2: WHITE,
        split: 'letters',
        ...enter('bounce', 150),
      }),
      text('sub', [460, 390, 1000, 50], {
        text: 'thank you for the hugs and the hype',
        font: 'Fredoka',
        size: 36,
        weight: 600,
        color: INK,
        align: 'center',
      }),
      widget('events', 'events', [660, 470, 600, 300], live.events(bubbleEvents)),
      widget(
        'top',
        'label',
        [660, 800, 600, 60],
        live.label('top_tip_session', 'top tip: {value}', stickerLabel),
      ),
      rotator(
        'socials',
        [560, 900, 800, 50],
        SOCIALS,
        { font: 'Fredoka', size: 34, weight: 600, color: INK, align: 'center' },
        5,
      ),
    ]),
  ],
  'builtin.mochi-sticker',
)
