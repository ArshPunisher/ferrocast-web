// Floodlight: match night at the stadium. Two floodlight towers burn over a striped pitch,
// beams fall across the stands while the crowd flashes, and a black scoreboard with amber
// LED numbers carries the headline. In game it becomes a broadcast score bug. Works for
// cricket and football alike. The Spark is a tiny sponsor dot on the scoreboard's rim.

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

const NIGHT = '#06101f'
const PITCH = '#11603a'
const BOARD = '#0b0c0e'
const LED = '#ffc21a'
const LAMP = '#fff6d6'
const WHITE = '#ffffff'
const SKY = '#3ad1ff'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname'] as const

const boardLabel = {
  variant: 'ticket',
  accent: LED,
  text: WHITE,
  background: '#0b0c0ee6',
  radius: 4,
  font: 'Bebas Neue',
  font_size: 30,
  uppercase: true,
}
const ledGoal = {
  variant: 'segments',
  accent: LED,
  track: '#2a2410',
  text: WHITE,
  background: '#0b0c0ee6',
  radius: 4,
  font: 'Bebas Neue',
  font_size: 30,
  uppercase: true,
}
const tickerEvents = {
  variant: 'ticker',
  accent: LED,
  text: WHITE,
  background: '#0b0c0ee6',
  font: 'Bebas Neue',
  font_size: 30,
  uppercase: true,
}
const bebas = (size: number, color = WHITE) => ({
  font: 'Bebas Neue',
  size,
  weight: 400,
  color,
  uppercase: true,
  letter_spacing: 0.04,
})

/** A floodlight tower: a pole and a lamp bank that glows. */
const tower = (id: string, x: number, beamTo: 'left' | 'right') => [
  cut(
    `${id}-beam`,
    beamTo === 'right' ? [x, 60, 760, 760] : [Math.max(0, x - 600), 60, 760, 760],
    'trapezoid',
    {
      fill: '#fff6d61f',
      fill2: '#fff6d600',
      angle: 180,
    },
    { rotation: beamTo === 'right' ? -24 : 24 },
  ),
  box(`${id}-pole`, [x + 70, 160, 18, 560], { shape: 'rect', fill: '#1c2738' }),
  box(`${id}-bank`, [x, 60, 160, 110], {
    shape: 'rect',
    fill: '#2a3142',
    radius: 6,
  }),
  pattern(
    `${id}-lamps`,
    [x + 8, 68, 144, 94],
    'dots',
    LAMP,
    {
      ground: '#fff6d633',
      scale: 1.2,
    },
    { opacity: 0.95 },
  ),
  box(`${id}-glow`, [x - 40, 20, 240, 190], {
    shape: 'ellipse',
    fill: '#fff6d659',
    fill2: '#fff6d600',
    angle: 180,
    ...enter('fade', 200, 'pulse'),
  }),
]

const stadium = () => [
  box('sky', [0, 0, 1920, 1080], { shape: 'rect', fill: '#0d1d3a', fill2: NIGHT, angle: 180 }),
  ...tower('t1', 120, 'right'),
  ...tower('t2', 1640, 'left'),
  box('stands', [0, 520, 1920, 220], {
    shape: 'rect',
    fill: '#0b1426',
    fill2: '#121e36',
    angle: 180,
  }),
  pattern('crowd', [0, 530, 1920, 200], 'bokeh', '#ffffff', { moving: true, scale: 1.1 }),
  box('roof', [0, 510, 1920, 14], { shape: 'rect', fill: '#1c2738' }),
  box('pitch', [0, 740, 1920, 340], { shape: 'rect', fill: '#17784a', fill2: PITCH, angle: 180 }),
  pattern('mow', [0, 740, 1920, 340], 'stripes', '#ffffff0f', { scale: 4 }),
  box('rope', [0, 736, 1920, 6], { shape: 'rect', fill: WHITE }),
]

/** The scoreboard: a black slab with an amber rim and a header strip. */
const board = (x: number, y: number, w: number, h: number, head: string) => [
  box('board', [x, y, w, h], {
    shape: 'rect',
    fill: '#121418',
    fill2: BOARD,
    angle: 180,
    radius: 10,
    stroke: '#2b2f36',
    stroke_width: 6,
    shadow: 'soft',
    ...enter('rise', 0),
  }),
  box('board-head', [x, y, w, 56], { shape: 'rect', fill: LED, radius: 10 }),
  text('board-head-t', [x + 30, y + 8, w - 60, 44], {
    text: head,
    ...bebas(38, BOARD),
    letter_spacing: 0.2,
  }),
  pattern('board-led', [x + 6, y + h - 26, w - 12, 18], 'dots', '#ffc21a55', { scale: 0.5 }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...stadium(),
    ...board(
      460,
      150,
      1000,
      560,
      key === 'starting_soon' ? 'Tonight  ·  Live' : 'Strategic timeout',
    ),
    brand([1432, 674, 22, 22], 'mark', LED),
    text('title', [480, 230, 960, 170], {
      text: title,
      ...bebas(170),
      align: 'center',
      ...enter('drop', 200),
    }),
    text('sub', [480, 400, 960, 50], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 30,
      weight: 600,
      color: '#c9d3e6',
      align: 'center',
      ...enter('fade', 600),
    }),
    ...(key === 'starting_soon'
      ? [
          text('t-label', [480, 476, 960, 40], {
            text: 'First ball in',
            ...bebas(34, SKY),
            align: 'center',
            letter_spacing: 0.3,
          }),
          countdown(
            'timer',
            [480, 512, 960, 160],
            300,
            '{time}',
            {
              font: 'Teko',
              size: 170,
              weight: 600,
              color: LED,
              align: 'center',
              shadow: 'glow',
              ...enter('zoom', 600),
            },
            'Play!',
          ),
        ]
      : [widget('events', 'events', [500, 520, 920, 70], live.events(tickerEvents))]),
    ...(key === 'brb'
      ? [
          text('brb-note', [480, 610, 960, 50], {
            text: 'Drinks break on the field',
            ...bebas(34, SKY),
            align: 'center',
            letter_spacing: 0.3,
          }),
        ]
      : []),
    rotator('socials', [560, 780, 800, 50], SOCIALS, {
      ...bebas(40),
      align: 'center',
      letter_spacing: 0.12,
      shadow: 'soft',
    }),
    widget('goal', 'goal', [300, 930, 620, 100], live.goal(ledGoal)),
    widget(
      'latest',
      'label',
      [1000, 950, 520, 60],
      live.label('latest_follower', 'New fan: {value}', boardLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'floodlight',
    name: 'Floodlight',
    description:
      'Match night: floodlight towers, a striped pitch, a flashing crowd and an amber LED scoreboard.',
    style: 'bold',
    motion: 'lively',
  },
  [
    scene('in_game', 'In game', [
      box('bug', [40, 40, 560, 64], { shape: 'rect', fill: '#0b0c0ee6', radius: 6 }),
      box('bug-live', [40, 40, 110, 64], { shape: 'rect', fill: LED, radius: 6 }),
      text('bug-live-t', [40, 46, 110, 52], { text: 'Live', ...bebas(44, BOARD), align: 'center' }),
      widget(
        'latest',
        'label',
        [160, 44, 436, 56],
        live.label('latest_follower', 'New fan: {value}', {
          ...boardLabel,
          background: '#0b0c0e00',
        }),
      ),
      widget(
        'sub',
        'label',
        [40, 114, 560, 56],
        live.label('latest_sub', 'Sub: {value}', boardLabel),
      ),
      widget('alerts', 'alerts', [560, 120, 800, 420], live.alerts),
      widget('goal', 'goal', [1380, 40, 500, 100], live.goal(ledGoal)),
      mat('cam-mat', [44, 680, 480, 300], BOARD, 8, 6),
      cam('cam', [44, 680, 480, 300], null, {
        style: 'notch',
        color: LED,
        accent: WHITE,
        thickness: 3,
        radius: 6,
      }),
      brand([496, 994, 22, 22], 'mark', LED),
      widget('events', 'events', [560, 1004, 1320, 60], live.events(tickerEvents)),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 80, 1220, 760], { fill: NIGHT }),
      pattern('crowd', [1300, 0, 620, 1080], 'bokeh', '#ffffff', { moving: true, scale: 0.6 }),
      box('pitch', [0, 880, 1920, 200], {
        shape: 'rect',
        fill: '#17784a',
        fill2: PITCH,
        angle: 180,
      }),
      pattern('mow', [0, 880, 1920, 200], 'stripes', '#ffffff0f', { scale: 4 }),
      box('rope', [0, 876, 1920, 6], { shape: 'rect', fill: WHITE }),
      mat('cam-mat', [60, 80, 1220, 760], BOARD, 10, 10),
      cam('cam', [60, 80, 1220, 760], null, {
        style: 'notch',
        color: LED,
        accent: WHITE,
        thickness: 3,
        radius: 8,
      }),
      box('chat-board', [1320, 80, 560, 760], {
        shape: 'rect',
        fill: '#0b0c0ef2',
        radius: 10,
        stroke: '#2b2f36',
        stroke_width: 6,
      }),
      box('chat-head-bg', [1320, 80, 560, 56], { shape: 'rect', fill: LED, radius: 10 }),
      text('chat-head', [1350, 88, 500, 44], {
        text: 'Fan zone',
        ...bebas(40, BOARD),
        letter_spacing: 0.2,
      }),
      widget(
        'chat',
        'chat',
        [1336, 150, 528, 670],
        live.chat({
          variant: 'lines',
          accent: LED,
          text: WHITE,
          background: '#0b0c0e00',
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [270, 140, 800, 420], live.alerts),
      brand([1848, 96, 22, 22], 'mark', BOARD),
      widget('goal', 'goal', [60, 940, 600, 100], live.goal(ledGoal)),
      widget(
        'latest',
        'label',
        [700, 960, 500, 60],
        live.label('latest_sub', 'Latest sub: {value}', boardLabel),
      ),
      rotator('socials', [1240, 966, 640, 50], SOCIALS, {
        ...bebas(38),
        align: 'right',
        letter_spacing: 0.12,
        shadow: 'soft',
      }),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Covers are off. Teams are walking out.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'Quick break. Stay in your seats.'),
    scene('ending', 'Ending', [
      ...stadium(),
      ...board(460, 120, 1000, 600, 'Full time'),
      brand([1432, 684, 22, 22], 'mark', LED),
      text('title', [480, 190, 960, 160], {
        text: 'What a match',
        ...bebas(150),
        align: 'center',
        ...enter('drop', 200),
      }),
      text('sub', [480, 350, 960, 50], {
        text: 'Thanks for filling the stands tonight.',
        font: 'Hanken Grotesk',
        size: 30,
        weight: 600,
        color: '#c9d3e6',
        align: 'center',
      }),
      text('mom', [480, 420, 960, 40], {
        text: 'Player of the match',
        ...bebas(34, SKY),
        align: 'center',
        letter_spacing: 0.3,
      }),
      widget(
        'top',
        'label',
        [660, 470, 600, 64],
        live.label('top_tip_session', 'Top tip: {value}', boardLabel),
      ),
      widget(
        'subs',
        'label',
        [660, 550, 600, 64],
        live.label('session_subs', 'Subs tonight: {value}', boardLabel),
      ),
      widget(
        'follows',
        'label',
        [660, 630, 600, 64],
        live.label('session_follows', 'New fans: {value}', boardLabel),
      ),
      rotator('socials', [560, 780, 800, 50], SOCIALS, {
        ...bebas(40),
        align: 'center',
        letter_spacing: 0.12,
        shadow: 'soft',
      }),
      widget('events', 'events', [160, 950, 1600, 70], live.events(tickerEvents)),
    ]),
  ],
  'builtin.scoreboard-flash',
)
