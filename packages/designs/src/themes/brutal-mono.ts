// Brutal mono: a Swiss poster gone loud. Off-white paper, black ink, one signal orange.
// Huge Anton capitals set flush left, heavy rules, a faint grid, index numbers and mono
// metadata, hard offset shadows instead of glows. Nothing drifts; it just lands. The Spark
// sits in the crop mark at the corner like a printer's mark.

import {
  brand,
  box,
  cam,
  countdown,
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

const PAPER = '#f2f0eb'
const INK = '#0a0a0a'
const SIGNAL = '#ff3b00'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname'] as const

const inkLabel = {
  variant: 'underline',
  accent: SIGNAL,
  text: INK,
  background: PAPER,
  radius: 0,
  font: 'JetBrains Mono',
  uppercase: true,
}
const ticksGoal = {
  variant: 'ticks',
  accent: SIGNAL,
  track: '#d9d5cc',
  text: INK,
  background: PAPER,
  radius: 0,
  font: 'JetBrains Mono',
  uppercase: true,
}
const stackEvents = {
  variant: 'stack',
  accent: SIGNAL,
  text: INK,
  background: PAPER,
  font: 'JetBrains Mono',
  uppercase: true,
}
const anton = (size: number, color = INK) => ({
  font: 'Anton',
  size,
  weight: 400,
  color,
  uppercase: true,
  letter_spacing: -0.01,
})
const mono = (size: number, color = INK) => ({
  font: 'JetBrains Mono',
  size,
  weight: 600,
  color,
  uppercase: true,
  letter_spacing: 0.08,
})

/** Paper, a faint grid and the top bar with metadata. */
const sheet = (index: string, label: string) => [
  box('paper', [0, 0, 1920, 1080], { shape: 'rect', fill: PAPER }),
  pattern('grid', [0, 0, 1920, 1080], 'grid', '#0a0a0a0f', { scale: 3 }),
  box('bar', [0, 0, 1920, 64], { shape: 'rect', fill: INK }),
  text('bar-idx', [40, 14, 200, 40], { text: index, ...mono(26, SIGNAL) }),
  text('bar-label', [240, 14, 900, 40], { text: label, ...mono(26, PAPER) }),
  text('bar-date', [1240, 14, 600, 40], {
    text: 'Live broadcast  /  Vol. 01',
    ...mono(26, PAPER),
    align: 'right',
  }),
]

const rule = (id: string, x: number, y: number, w: number, h = 10, c = INK) =>
  box(id, [x, y, w, h], { shape: 'rect', fill: c, ...enter('wipe', 100) })

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...sheet(
      key === 'starting_soon' ? '01' : '02',
      key === 'starting_soon' ? 'Opening' : 'Intermission',
    ),
    text('title', [40, 110, 1300, 600], {
      text: title,
      ...anton(256),
      split: 'words',
      ...enter('rise', 100),
    }),
    rule('rule', 40, 720, 1840),
    text('sub', [40, 750, 1000, 50], { text: sub, ...mono(30), ...enter('fade', 500) }),
    ...(key === 'starting_soon'
      ? [
          box('timer-shadow', [1392, 252, 480, 300], { shape: 'rect', fill: SIGNAL }),
          box('timer-box', [1380, 240, 480, 300], { shape: 'rect', fill: INK }),
          text('timer-label', [1410, 262, 420, 40], { text: 'T minus', ...mono(26, SIGNAL) }),
          countdown(
            'timer',
            [1400, 300, 440, 220],
            300,
            '{time}',
            { ...anton(170, PAPER), align: 'center', ...enter('fade', 400) },
            'Now',
          ),
        ]
      : [widget('events', 'events', [1380, 240, 500, 420], live.events(stackEvents))]),
    widget('goal', 'goal', [1180, 750, 700, 100], live.goal(ticksGoal)),
    rule('rule-b', 40, 900, 1840, 4),
    rotator('socials', [40, 930, 900, 50], SOCIALS, mono(32)),
    widget(
      'latest',
      'label',
      [1180, 924, 700, 60],
      live.label('latest_follower', 'Latest follow: {value}', inkLabel),
    ),
    box('crop-h', [1840, 1040, 60, 4], { shape: 'rect', fill: INK }),
    box('crop-v', [1876, 1004, 4, 60], { shape: 'rect', fill: INK }),
    brand([1840, 1004, 28, 28], 'mark', INK),
  ])

export default themeDesign(
  {
    slug: 'brutal-mono',
    name: 'Brutal mono',
    description:
      'A loud Swiss poster: paper, black ink, one signal orange, huge Anton capitals and heavy rules.',
    style: 'minimal',
    motion: 'still',
  },
  [
    scene('in_game', 'In game', [
      box('tl', [40, 40, 460, 140], { shape: 'rect', fill: PAPER, shadow: 'hard' }),
      box('tl-bar', [40, 40, 460, 10], { shape: 'rect', fill: INK }),
      widget(
        'latest',
        'label',
        [56, 58, 428, 56],
        live.label('latest_follower', 'Follow: {value}', inkLabel),
      ),
      widget(
        'sub',
        'label',
        [56, 116, 428, 56],
        live.label('latest_sub', 'Sub: {value}', inkLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      box('tr', [1400, 40, 480, 120], { shape: 'rect', fill: PAPER, shadow: 'hard' }),
      box('tr-bar', [1400, 40, 480, 10], { shape: 'rect', fill: SIGNAL }),
      widget('goal', 'goal', [1410, 54, 460, 100], live.goal(ticksGoal)),
      mat('cam-mat', [44, 690, 480, 300], INK, 10),
      cam('cam', [44, 690, 480, 300], null, {
        style: 'line',
        color: INK,
        accent: SIGNAL,
        thickness: 2,
      }),
      box('cam-tag', [34, 640, 200, 44], { shape: 'rect', fill: INK }),
      text('cam-tag-t', [48, 646, 180, 34], { text: 'Cam 01', ...mono(24, PAPER) }),
      box('cam-tag-dot', [204, 654, 16, 16], { shape: 'rect', fill: SIGNAL }),
      brand([496, 1006, 26, 26], 'mark', SIGNAL),
      box('soc', [1360, 1000, 520, 52], { shape: 'rect', fill: INK }),
      rotator('socials', [1380, 1006, 480, 40], SOCIALS, { ...mono(24, PAPER), align: 'right' }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [40, 104, 1260, 760], { fill: PAPER }),
      pattern('grid', [1320, 64, 600, 1016], 'grid', '#0a0a0a0f', { scale: 3 }),
      box('bar', [0, 0, 1920, 64], { shape: 'rect', fill: INK }),
      text('bar-idx', [40, 14, 200, 40], { text: '03', ...mono(26, SIGNAL) }),
      text('bar-label', [240, 14, 900, 40], { text: 'In conversation', ...mono(26, PAPER) }),
      mat('cam-mat', [40, 104, 1260, 760], INK, 10),
      cam('cam', [40, 104, 1260, 760], null, {
        style: 'line',
        color: INK,
        accent: SIGNAL,
        thickness: 2,
      }),
      text('chat-head', [1340, 96, 540, 110], { text: 'Chat', ...anton(110) }),
      rule('chat-rule', 1340, 210, 540, 8),
      widget(
        'chat',
        'chat',
        [1340, 230, 540, 640],
        live.chat({
          variant: 'lines',
          accent: SIGNAL,
          text: INK,
          background: '#f2f0eb00',
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [270, 160, 800, 420], live.alerts),
      rule('rule-b', 40, 900, 1840, 4),
      widget('goal', 'goal', [40, 930, 620, 100], live.goal(ticksGoal)),
      widget(
        'latest',
        'label',
        [700, 950, 520, 60],
        live.label('latest_sub', 'Latest sub: {value}', inkLabel),
      ),
      rotator('socials', [1260, 958, 560, 44], SOCIALS, { ...mono(26), align: 'right' }),
      box('crop-h', [1840, 1040, 60, 4], { shape: 'rect', fill: INK }),
      box('crop-v', [1876, 1004, 4, 60], { shape: 'rect', fill: INK }),
      brand([1840, 1004, 28, 28], 'mark', INK),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Doors open in a few minutes. Find a seat.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'Short break. The stream will continue.'),
    scene('ending', 'Ending', [
      ...sheet('04', 'Closing'),
      text('title', [40, 110, 1300, 600], {
        text: 'That is all',
        ...anton(256),
        split: 'words',
        ...enter('rise', 100),
      }),
      rule('rule', 40, 720, 1840),
      text('sub', [40, 750, 1000, 50], {
        text: 'Thank you for watching. Same time next week.',
        ...mono(30),
      }),
      text('credits', [1380, 110, 500, 40], { text: 'Credits', ...mono(28, SIGNAL) }),
      widget('events', 'events', [1380, 160, 500, 400], live.events(stackEvents)),
      widget(
        'top',
        'label',
        [1180, 760, 700, 60],
        live.label('top_tip_session', 'Top tip: {value}', inkLabel),
      ),
      rule('rule-b', 40, 900, 1840, 4),
      rotator('socials', [40, 930, 900, 50], SOCIALS, mono(32)),
      box('crop-h', [1840, 1040, 60, 4], { shape: 'rect', fill: INK }),
      box('crop-v', [1876, 1004, 4, 60], { shape: 'rect', fill: INK }),
      brand([1840, 1004, 28, 28], 'mark', INK),
    ]),
  ],
  'builtin.brutal-stamp',
)
