// Vanguard: esports broadcast. Black and steel with a single red, hard diagonal slashes,
// chevron strips, a crest shield, speed stripes and heavy condensed capitals. Waiting
// screens read like a match graphic ("Match starts in", "Tactical pause", "GG").
// The Spark is the small mark inside the crest, and a notch on the scoreboard bar.

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

const BLACK = '#0c0d10'
const STEEL = '#1c1f26'
const RED = '#e10600'
const RED2 = '#ff2a1f'
const WHITE = '#f5f5f5'
const GREY = '#9aa0ab'
const SOCIALS = [
  'TWITCH.TV/YOURNAME',
  'YOUTUBE / @YOURNAME',
  'X / @YOURNAME',
  'DISCORD.GG/YOURNAME',
] as const

const slabLabel = {
  variant: 'ticker',
  accent: RED2,
  text: WHITE,
  background: '#0c0d10f0',
  radius: 0,
  font: 'Russo One',
  uppercase: true,
}
const chevGoal = {
  variant: 'chevron',
  accent: RED2,
  track: '#2a2d34',
  text: WHITE,
  background: '#0c0d10f0',
  font: 'Russo One',
  uppercase: true,
}
const cardEvents = {
  variant: 'cards',
  accent: RED2,
  text: WHITE,
  background: '#14161bf0',
  radius: 0,
  font: 'Teko',
  uppercase: true,
  font_size: 22,
}

const slash = (id: string, x: number, y: number, w: number, h: number, fill: string) =>
  cut(id, [x, y, w, h], 'parallelogram', { fill })
const crest = (x: number, y: number, s: number) => [
  cut('crest-o', [x - 6, y - 6, s + 12, s * 1.15 + 12], 'shield', { fill: RED2 }),
  cut('crest', [x, y, s, s * 1.15], 'shield', { fill: BLACK, fill2: STEEL, angle: 180 }),
  text('crest-v', [x, y + s * 0.12, s, s * 0.6], {
    text: 'V',
    font: 'Russo One',
    size: s * 0.55,
    color: WHITE,
    align: 'center',
  }),
  brand([x + s / 2 - 14, y + s * 0.72, 28, 28], 'mark', WHITE),
]
const arena = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: STEEL, fill2: BLACK, angle: 135 }),
  pattern('stripes', [0, 0, 1920, 1080], 'stripes', '#ffffff06', { scale: 3, moving: true }),
  slash('slash-a', 980, 0, 940, 1080, '#14161b'),
  slash('slash-b', 1240, 0, 160, 1080, RED),
  slash('slash-c', 1420, 0, 40, 1080, '#ffffff14'),
  box('floor', [0, 960, 1920, 120], {
    shape: 'rect',
    fill: '#000000',
    fill2: '#00000000',
    angle: 0,
  }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, kicker: string, title: string) =>
  scene(key, name, [
    ...arena(),
    ...crest(1560, 260, 220),
    text('kicker', [120, 230, 900, 60], {
      text: kicker,
      font: 'Teko',
      size: 56,
      weight: 600,
      color: RED2,
      uppercase: true,
      letter_spacing: 0.12,
      ...enter('slide_left', 100),
    }),
    text('title', [110, 310, 1100, 300], {
      text: title,
      font: 'Russo One',
      size: 130,
      color: WHITE,
      uppercase: true,
      italic: true,
      effect: 'extrude',
      color2: RED,
      ...enter('slide_left', 250),
    }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [120, 620, 640, 150],
          300,
          '{time}',
          { font: 'Teko', size: 170, weight: 700, color: WHITE, ...enter('slide_left', 450) },
          'LIVE',
        )
      : text('pause', [120, 620, 900, 150], {
          text: 'Back shortly',
          font: 'Teko',
          size: 120,
          weight: 600,
          color: GREY,
          uppercase: true,
          ...enter('slide_left', 450),
        }),
    slash('score-bar', 100, 790, 860, 8, RED2),
    widget('events', 'events', [120, 820, 520, 220], live.events(cardEvents)),
    widget('goal', 'goal', [680, 830, 520, 96], live.goal(chevGoal)),
    rotator(
      'socials',
      [680, 960, 600, 50],
      SOCIALS,
      { font: 'Teko', size: 38, weight: 600, color: WHITE, letter_spacing: 0.1 },
      4,
    ),
  ])

export default themeDesign(
  {
    slug: 'vanguard',
    name: 'Vanguard',
    description:
      'Esports broadcast: hard red slashes, a crest, chevron goals and match-graphic screens.',
    style: 'bold',
    motion: 'lively',
  },
  [
    scene('in_game', 'In game', [
      cam('cam', [56, 660, 480, 330], 'chevron', {
        color: WHITE,
        accent: RED2,
        thickness: 4,
        radius: 0,
        label: 'Player cam',
      }),
      slash('cam-red', 20, 1010, 560, 10, RED2),
      brand([520, 1000, 28, 28], 'mark', WHITE),
      widget(
        'latest',
        'label',
        [40, 40, 460, 56],
        live.label('latest_follower', 'Follower {value}', slabLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 104, 460, 56],
        live.label('latest_sub', 'Sub {value}', slabLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1400, 40, 480, 96], live.goal(chevGoal)),
      widget('events', 'events', [1500, 760, 380, 270], live.events(cardEvents)),
      rotator(
        'socials',
        [620, 1028, 680, 40],
        SOCIALS,
        {
          font: 'Teko',
          size: 32,
          weight: 600,
          color: WHITE,
          align: 'center',
          letter_spacing: 0.1,
          shadow: 'hard',
        },
        4,
      ),
    ]),
    scene('just_chatting', 'Just chatting', [
      cam('cam', [70, 90, 1180, 800], 'chevron', {
        color: WHITE,
        accent: RED2,
        thickness: 5,
        radius: 0,
        label: 'Desk cam',
      }),
      slash('red', 1280, 60, 30, 880, RED2),
      box('chat-back', [1340, 60, 560, 880], { shape: 'rect', fill: '#0c0d10e6' }),
      text('chat-head', [1370, 76, 500, 56], {
        text: 'Comms',
        font: 'Russo One',
        size: 40,
        color: WHITE,
        uppercase: true,
        italic: true,
      }),
      widget(
        'chat',
        'chat',
        [1360, 140, 520, 780],
        live.chat({ variant: 'lines', accent: RED2, text: WHITE, background: BLACK, radius: 0 }),
      ),
      widget('alerts', 'alerts', [260, 140, 800, 420], live.alerts),
      widget('goal', 'goal', [70, 960, 560, 96], live.goal(chevGoal)),
      widget(
        'latest',
        'label',
        [680, 980, 480, 56],
        live.label('latest_sub', 'Sub {value}', slabLabel),
      ),
      rotator(
        'socials',
        [1360, 990, 520, 44],
        SOCIALS,
        { font: 'Teko', size: 32, weight: 600, color: WHITE, align: 'right', letter_spacing: 0.1 },
        4,
      ),
      brand([1846, 82, 28, 28], 'mark', WHITE),
    ]),
    waiting('starting_soon', 'Starting soon', 'Match starts in', 'Get ready'),
    waiting('brb', 'Be right back', 'Timeout called', 'Tactical pause'),
    scene('ending', 'Ending', [
      ...arena(),
      ...crest(1560, 260, 220),
      text('title', [110, 220, 1100, 260], {
        text: 'GG WP',
        font: 'Russo One',
        size: 230,
        color: WHITE,
        italic: true,
        effect: 'extrude',
        color2: RED,
        ...enter('zoom', 150),
      }),
      text('sub', [120, 500, 1000, 60], {
        text: 'Thanks for watching. Same time next match.',
        font: 'Teko',
        size: 50,
        weight: 500,
        color: GREY,
        uppercase: true,
        letter_spacing: 0.06,
      }),
      slash('bar', 100, 590, 860, 8, RED2),
      widget('events', 'events', [120, 620, 560, 300], live.events(cardEvents)),
      widget(
        'top',
        'label',
        [720, 640, 520, 56],
        live.label('top_tip_session', 'MVP tip {value}', slabLabel),
      ),
      rotator(
        'socials',
        [720, 730, 600, 50],
        SOCIALS,
        { font: 'Teko', size: 38, weight: 600, color: WHITE, letter_spacing: 0.1 },
        4,
      ),
    ]),
  ],
  'builtin.vanguard-strike',
)
