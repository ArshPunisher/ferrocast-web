// Phosphor terminal: an old green-screen monitor. A dark casing with a rounded glass
// screen, scan lines, a boot log, VT323 capitals glowing like phosphor and an amber
// warning colour for the few things that matter. A block cursor blinks. The Spark is the
// little maker's badge on the casing.

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

const CASE = '#121512'
const GLASS = '#04140a'
const GREEN = '#39ff6a'
const DIM = '#1f9a45'
const AMBER = '#ffb000'
const SOCIALS = [
  '> ping twitch.tv/yourname',
  '> ping youtube.com/@yourname',
  '> ping discord.gg/yourname',
] as const

const bracketLabel = {
  variant: 'bracket',
  accent: GREEN,
  text: GREEN,
  background: '#04140ae6',
  radius: 0,
  font: 'VT323',
  font_size: 30,
  uppercase: true,
}
const barGoal = {
  variant: 'bar',
  accent: GREEN,
  track: '#0b2a16',
  text: GREEN,
  background: '#04140ae6',
  radius: 0,
  font: 'VT323',
  font_size: 28,
  uppercase: true,
}
const hudEvents = {
  variant: 'hud',
  accent: AMBER,
  text: GREEN,
  background: '#04140acc',
  font: 'VT323',
  font_size: 28,
  uppercase: true,
}
const vt = (size: number, color = GREEN) => ({
  font: 'VT323',
  size,
  weight: 400,
  color,
  uppercase: true,
})

/** The monitor: casing, a rounded glass screen, scan lines and a soft phosphor bloom. */
const monitor = () => [
  box('case', [0, 0, 1920, 1080], { shape: 'rect', fill: '#1a1e1a', fill2: CASE, angle: 180 }),
  box('screen', [60, 44, 1800, 970], {
    shape: 'rect',
    fill: '#073017',
    fill2: GLASS,
    angle: 180,
    radius: 56,
    stroke: '#000000',
    stroke_width: 6,
  }),
  box('bloom', [360, 140, 1200, 700], {
    shape: 'ellipse',
    fill: '#39ff6a14',
    fill2: '#39ff6a00',
    angle: 180,
  }),
  pattern('grid', [60, 44, 1800, 970], 'grid', '#39ff6a0d', { scale: 2.2, radius: 56 }),
  pattern('scan', [60, 44, 1800, 970], 'scanlines', '#00000066', { scale: 1, radius: 56 }),
  box('glare', [120, 70, 700, 120], {
    shape: 'ellipse',
    fill: '#ffffff0d',
    fill2: '#ffffff00',
    angle: 180,
  }),
  box('led', [1740, 1032, 14, 14], { shape: 'ellipse', fill: GREEN, shadow: 'glow' }),
  brand([1772, 1026, 26, 26], 'mark', '#7a837a'),
]

const bootLog = (lines: string) =>
  text('boot', [140, 100, 900, 150], {
    text: lines,
    ...vt(30, DIM),
    ...enter('fade', 0),
  })

const cursor = (x: number, y: number, h: number) =>
  box('cursor', [x, y, h * 0.5, h], {
    shape: 'rect',
    fill: GREEN,
    shadow: 'glow',
    ...enter('fade', 900, 'pulse'),
  })

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...monitor(),
    bootLog(
      key === 'starting_soon'
        ? 'phosphor os 2.6  memory ok\nmounting /stream ... ok\nwarming tubes ... 87%'
        : 'process paused  pid 4417\nholding buffer ... ok\nawaiting operator',
    ),
    text('title', [140, 300, 1400, 190], {
      text: title,
      ...vt(190),
      effect: 'neon',
      color2: GREEN,
      split: 'letters',
      ...enter('fade', 300),
    }),
    cursor(1150, 330, 130),
    text('sub', [146, 500, 1300, 50], {
      text: sub,
      ...vt(44, '#b8ffcb'),
      ...enter('fade', 800),
    }),
    ...(key === 'starting_soon'
      ? [
          text('t-label', [146, 600, 400, 44], { text: 't-minus', ...vt(40, AMBER) }),
          countdown(
            'timer',
            [146, 640, 700, 170],
            300,
            '{time}',
            { ...vt(180, AMBER), effect: 'neon', color2: AMBER, ...enter('fade', 600) },
            'online',
          ),
        ]
      : [widget('events', 'events', [146, 600, 640, 280], live.events(hudEvents))]),
    box('side-rule', [1300, 600, 2, 300], { shape: 'rect', fill: DIM }),
    text('side-head', [1330, 600, 460, 40], { text: 'sys.status', ...vt(36, AMBER) }),
    widget(
      'latest',
      'label',
      [1330, 660, 470, 56],
      live.label('latest_follower', 'Last follow: {value}', bracketLabel),
    ),
    widget('goal', 'goal', [1330, 740, 470, 96], live.goal(barGoal)),
    rotator('socials', [146, 920, 1200, 50], SOCIALS, { ...vt(40), shadow: 'glow' }),
  ])

export default themeDesign(
  {
    slug: 'phosphor-terminal',
    name: 'Phosphor terminal',
    description:
      'An old green-screen monitor: glowing VT323 capitals, a boot log, scan lines and a blinking cursor.',
    style: 'retro',
    motion: 'still',
  },
  [
    scene('in_game', 'In game', [
      box('cam-shade', [30, 640, 540, 44], { shape: 'rect', fill: '#04140ae6' }),
      text('cam-path', [44, 644, 520, 36], { text: '> cam://feed_01  [rec]', ...vt(30) }),
      mat('cam-mat', [44, 690, 512, 340], '#04140ae6', 8),
      cam('cam', [44, 690, 512, 340], null, {
        style: 'corners',
        color: GREEN,
        accent: AMBER,
        thickness: 3,
      }),
      brand([536, 650, 24, 24], 'mark', GREEN),
      widget(
        'latest',
        'label',
        [40, 40, 460, 56],
        live.label('latest_follower', 'Follow: {value}', bracketLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 106, 460, 56],
        live.label('latest_sub', 'Sub: {value}', bracketLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1400, 40, 480, 96], live.goal(barGoal)),
      box('soc-shade', [1340, 1010, 560, 50], { shape: 'rect', fill: '#04140ae6' }),
      rotator('socials', [1356, 1014, 530, 40], SOCIALS, { ...vt(32), align: 'right' }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 60, 1220, 790], { fill: CASE }),
      mat('cam-bezel', [60, 60, 1220, 790], '#000000', 8, 40),
      cam('cam', [60, 60, 1220, 790], null, {
        style: 'corners',
        color: GREEN,
        accent: AMBER,
        thickness: 3,
        radius: 34,
        label: 'feed_01',
      }),
      box('term', [1310, 60, 570, 790], {
        shape: 'rect',
        fill: '#073017',
        fill2: GLASS,
        angle: 180,
        radius: 34,
        stroke: '#000000',
        stroke_width: 6,
      }),
      pattern('term-scan', [1310, 60, 570, 790], 'scanlines', '#00000066', { radius: 34 }),
      text('term-head', [1344, 80, 500, 44], { text: 'tail -f chat.log', ...vt(36, AMBER) }),
      widget(
        'chat',
        'chat',
        [1334, 130, 522, 700],
        live.chat({
          variant: 'terminal',
          accent: GREEN,
          text: GREEN,
          background: '#04140a00',
          font: 'VT323',
        }),
      ),
      widget('alerts', 'alerts', [260, 120, 800, 420], live.alerts),
      box('led', [1840, 900, 14, 14], { shape: 'ellipse', fill: GREEN, shadow: 'glow' }),
      brand([1806, 894, 26, 26], 'mark', '#7a837a'),
      widget('goal', 'goal', [60, 920, 560, 96], live.goal(barGoal)),
      widget(
        'latest',
        'label',
        [660, 940, 460, 56],
        live.label('latest_sub', 'Last sub: {value}', bracketLabel),
      ),
      rotator('socials', [1160, 946, 640, 50], SOCIALS, { ...vt(36), align: 'right' }),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Booting up. Do not touch the dial.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'Operator stepped away. Stand by.'),
    scene('ending', 'Ending', [
      ...monitor(),
      bootLog('session closed\nsaving memories ... ok\nthank you, operator'),
      text('title', [140, 300, 1400, 190], {
        text: 'Logging off',
        ...vt(190),
        effect: 'neon',
        color2: GREEN,
        split: 'letters',
        ...enter('fade', 300),
      }),
      cursor(990, 330, 130),
      text('sub', [146, 500, 1300, 50], {
        text: 'Same channel, next time. Over and out.',
        ...vt(44, '#b8ffcb'),
      }),
      widget('events', 'events', [146, 590, 680, 300], live.events(hudEvents)),
      box('side-rule', [1300, 600, 2, 300], { shape: 'rect', fill: DIM }),
      text('side-head', [1330, 600, 460, 40], { text: 'session.top', ...vt(36, AMBER) }),
      widget(
        'top',
        'label',
        [1330, 660, 470, 56],
        live.label('top_tip_session', 'Top tip: {value}', bracketLabel),
      ),
      widget(
        'subs',
        'label',
        [1330, 730, 470, 56],
        live.label('session_subs', 'Subs: {value}', bracketLabel),
      ),
      rotator('socials', [146, 920, 1200, 50], SOCIALS, { ...vt(40), shadow: 'glow' }),
    ]),
  ],
  'builtin.terminal-boot',
)
