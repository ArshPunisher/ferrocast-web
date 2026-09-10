// Doodle desk: a sketchbook page. Ruled paper with a margin line, hand-drawn frames, washi
// tape, sticky notes, doodled stars and arrows, marker headlines with highlighter swipes.
// The Spark is doodled small in the page margin on every scene.

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

const PAPER = '#f8f9fb'
const INK = '#1d2b53'
const YELLOW = '#ffe14d'
const PINK = '#ff7eb6'
const MINT = '#7be0c3'
const BLUE = '#6aa8ff'
const SOCIALS = [
  'twitch.tv/yourname',
  'youtube: @yourname',
  'insta: @yourname',
  'discord.gg/yourname',
] as const

const noteLabel = {
  variant: 'sticker',
  accent: PINK,
  text: INK,
  background: '#ffffff',
  radius: 10,
  font: 'Caveat Brush',
  font_size: 26,
}
const sketchGoal = {
  variant: 'sketch',
  accent: PINK,
  track: '#ffffff',
  text: INK,
  background: '#ffffff',
  radius: 12,
  font: 'Caveat Brush',
}
const stickerEvents = {
  variant: 'stickers',
  accent: PINK,
  text: INK,
  background: '#ffffff',
  radius: 8,
  font: 'Caveat Brush',
}

const tape = (id: string, x: number, y: number, w: number, rot: number, color = '#9fd8ffcc') =>
  cut(id, [x, y, w, 34], 'torn', { fill: color }, { rotation: rot })
const note = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  words: string,
  rot: number,
  color = YELLOW,
) => [
  box(
    `${id}-n`,
    [x, y, w, h],
    { shape: 'rect', fill: color, fill2: '#ffd52e', angle: 180, radius: 4, shadow: 'soft' },
    { rotation: rot },
  ),
  text(
    `${id}-t`,
    [x + 18, y + 14, w - 36, h - 28],
    { text: words, font: 'Caveat Brush', size: 30, color: INK, align: 'center' },
    { rotation: rot },
  ),
]
const star = (id: string, x: number, y: number, s: number, color: string) =>
  cut(id, [x, y, s, s], 'star', { fill: color, ...enter('pop', 300) })
const page = () => [
  box('paper', [0, 0, 1920, 1080], { shape: 'rect', fill: PAPER }),
  pattern('rules', [0, 0, 1920, 1080], 'paper', '#e2556a', { scale: 1.6 }, { opacity: 0.9 }),
  brand([66, 1020, 32, 32], 'mark', INK),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...page(),
    text('title', [220, 150, 1100, 200], {
      text: title,
      font: 'Caveat Brush',
      size: 150,
      color: INK,
      effect: 'marker',
      color2: '#ffe14dcc',
      split: 'words',
      ...enter('pop', 150),
    }),
    text('sub', [230, 360, 1000, 60], {
      text: sub,
      font: 'Caveat',
      size: 46,
      weight: 600,
      color: INK,
      ...enter('fade', 600),
    }),
    cut('arrow', [240, 470, 220, 90], 'arrow', { fill: PINK }, { rotation: 8 }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [480, 450, 520, 130],
          300,
          '{time}',
          {
            font: 'Caveat Brush',
            size: 110,
            color: INK,
            effect: 'sticker',
            color2: '#ffffff',
            ...enter('pop', 700),
          },
          'go go go',
        )
      : widget('events', 'events', [480, 450, 560, 300], live.events(stickerEvents)),
    ...note('n1', 1380, 140, 300, 220, 'snacks: check\nwater: check', -6),
    tape('t1', 1470, 124, 120, 4),
    ...note('n2', 1440, 430, 300, 220, 'say hi in chat!', 5, '#ffc1dc'),
    tape('t2', 1530, 414, 120, -6, '#b8f0dccc'),
    star('s1', 1200, 120, 70, YELLOW),
    star('s2', 1270, 220, 40, MINT),
    star('s3', 140, 780, 56, BLUE),
    fancyFrame('scribble', [1340, 720, 480, 240], 'sketch', {
      color: INK,
      accent: PINK,
      thickness: 4,
      radius: 0,
    }),
    rotator(
      'socials',
      [1370, 800, 420, 60],
      SOCIALS,
      { font: 'Caveat Brush', size: 40, color: INK, align: 'center' },
      5,
    ),
    widget('goal', 'goal', [230, 860, 560, 100], live.goal(sketchGoal)),
    widget(
      'latest',
      'label',
      [840, 880, 420, 60],
      live.label('latest_follower', 'newest pal: {value}', noteLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'doodle-desk',
    name: 'Doodle desk',
    description:
      'A sketchbook page: ruled paper, hand-drawn frames, tape, sticky notes and doodles.',
    style: 'playful',
    motion: 'bouncy',
  },
  [
    scene('in_game', 'In game', [
      cam('cam', [40, 660, 480, 340], 'sketch', {
        color: INK,
        accent: PINK,
        thickness: 5,
        radius: 0,
      }),
      tape('cam-tape-a', 0, 650, 130, -30),
      tape('cam-tape-b', 430, 650, 130, 30, '#ffc1dccc'),
      text('cam-cap', [60, 1010, 300, 50], {
        text: 'that’s me!',
        font: 'Caveat Brush',
        size: 40,
        color: '#ffffff',
        outline: 6,
        outline_color: INK,
      }),
      cut('cam-arrow', [330, 1004, 120, 56], 'arrow', { fill: PINK }, { rotation: -150 }),
      brand([480, 1018, 30, 30], 'mark', '#ffffff'),
      widget(
        'latest',
        'label',
        [40, 40, 420, 60],
        live.label('latest_follower', 'newest pal: {value}', noteLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1400, 40, 480, 100], live.goal(sketchGoal)),
      widget('events', 'events', [1500, 700, 380, 340], live.events(stickerEvents)),
      star('s1', 480, 40, 40, YELLOW),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('paper', [180, 90, 1080, 760], { fill: PAPER }),
      box('margin', [120, 0, 3, 90], { shape: 'rect', fill: '#e2556a' }),
      box('margin-b', [120, 850, 3, 230], { shape: 'rect', fill: '#e2556a' }),
      brand([66, 1020, 32, 32], 'mark', INK),
      cam('cam', [180, 90, 1080, 760], 'sketch', {
        color: INK,
        accent: PINK,
        thickness: 6,
        radius: 0,
      }),
      tape('tape-a', 130, 70, 160, -32),
      tape('tape-b', 1170, 70, 160, 32, '#ffc1dccc'),
      box(
        'chat-sheet',
        [1320, 80, 560, 790],
        { shape: 'rect', fill: '#ffffff', radius: 6, shadow: 'soft' },
        { rotation: 1.2 },
      ),
      text('chat-head', [1350, 96, 500, 60], {
        text: 'chat says…',
        font: 'Caveat Brush',
        size: 48,
        color: INK,
        effect: 'marker',
        color2: '#7be0c3cc',
      }),
      widget(
        'chat',
        'chat',
        [1340, 170, 520, 680],
        live.chat({
          variant: 'paper',
          accent: YELLOW,
          text: INK,
          background: '#ffffff',
          radius: 6,
          font: 'Caveat',
        }),
      ),
      widget('alerts', 'alerts', [320, 130, 800, 420], live.alerts),
      widget('goal', 'goal', [180, 900, 560, 100], live.goal(sketchGoal)),
      widget(
        'latest',
        'label',
        [790, 920, 420, 60],
        live.label('latest_sub', 'new sub: {value}', noteLabel),
      ),
      star('s1', 1250, 900, 60, YELLOW),
      star('s2', 1320, 960, 36, PINK),
      rotator(
        'socials',
        [1400, 940, 460, 56],
        SOCIALS,
        { font: 'Caveat Brush', size: 38, color: INK, align: 'center' },
        5,
      ),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'starting soon!',
      'sharpening pencils, finding the good snacks',
    ),
    waiting('brb', 'Be right back', 'brb!', 'went to doodle something. back in a sec'),
    scene('ending', 'Ending', [
      ...page(),
      text('title', [220, 130, 1480, 200], {
        text: 'thanks for hanging out!',
        font: 'Caveat Brush',
        size: 140,
        color: INK,
        effect: 'marker',
        color2: '#ffc1dccc',
        align: 'center',
        split: 'words',
        ...enter('pop', 150),
      }),
      text('sub', [420, 330, 1080, 60], {
        text: 'same page, next time',
        font: 'Caveat',
        size: 46,
        weight: 600,
        color: INK,
        align: 'center',
      }),
      widget('events', 'events', [300, 440, 620, 380], live.events(stickerEvents)),
      ...note('n1', 1080, 450, 340, 240, 'top tip tonight\nyou rock', -4, '#ffc1dc'),
      widget(
        'top',
        'label',
        [1060, 730, 520, 60],
        live.label('top_tip_session', 'top tip: {value}', noteLabel),
      ),
      star('s1', 1500, 420, 80, YELLOW),
      star('s2', 1620, 520, 44, MINT),
      rotator(
        'socials',
        [700, 900, 520, 60],
        SOCIALS,
        { font: 'Caveat Brush', size: 42, color: INK, align: 'center' },
        5,
      ),
    ]),
  ],
  'builtin.doodle-note',
)
