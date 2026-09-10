// Arcade night: a purple-black cabinet room. Marquee bulbs around the cam, a checkered
// floor, CRT scan lines, drifting pixels, pixel capitals in gold and pink, an "Insert coin"
// countdown. The Spark is a sticker badge on the cabinet in game, and sits in the marquee on
// the waiting screens.

import {
  brand,
  box,
  cam,
  countdown,
  cut,
  enter,
  fancyFrame,
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

const GOLD = '#ffd23f'
const PINK = '#ff3fa4'
const CYAN = '#33d4ff'
const CREAM = '#fff7c2'
const NIGHT = '#0d0618'
const SOCIALS = ['TWITCH.TV/YOURNAME', 'YOUTUBE @YOURNAME', 'KICK.COM/YOURNAME'] as const
const px = { font: 'Press Start 2P', weight: 400 } as const
const goalStyle = {
  variant: 'segments',
  accent: GOLD,
  track: '#2a1446',
  text: CREAM,
  background: '#1a0b2ee6',
  radius: 0,
  font: 'JetBrains Mono',
  uppercase: true,
}
const tag = {
  variant: 'tag',
  accent: PINK,
  text: CREAM,
  background: '#1a0b2e',
  radius: 0,
  font: 'JetBrains Mono',
  uppercase: true,
}
const cards = {
  variant: 'cards',
  accent: GOLD,
  text: CREAM,
  background: '#1a0b2ee6',
  radius: 0,
  font: 'JetBrains Mono',
}

const cabinet = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: NIGHT, fill2: '#1f0b33', angle: 180 }),
  pattern(
    'pixels',
    [0, 0, 1920, 780],
    'pixels',
    PINK,
    { moving: true, scale: 0.7 },
    { opacity: 0.6 },
  ),
  box('floor', [0, 780, 1920, 300], { shape: 'rect', fill: '#1a0b2e', fill2: NIGHT, angle: 180 }),
  pattern('checks', [0, 780, 1920, 300], 'checker', '#ff3fa422', { scale: 3 }),
  box('floor-line', [0, 776, 1920, 4], { shape: 'rect', fill: CYAN, shadow: 'glow' }),
  pattern('crt', [0, 0, 1920, 1080], 'scanlines', '#00000040'),
]
const marquee = (title: string, y: number) => [
  box('marquee', [460, y, 1000, 190], { shape: 'rect', fill: '#1a0b2e', radius: 6 }),
  fancyFrame('bulbs', [460, y, 1000, 190], 'bulbs', {
    color: PINK,
    accent: GOLD,
    thickness: 4,
    radius: 6,
    ...enter('fade', 0, 'pulse'),
  }),
  text('title', [480, y + 30, 960, 130], {
    ...px,
    text: title,
    size: 64,
    color: GOLD,
    align: 'center',
    effect: 'neon',
    color2: PINK,
    split: 'letters',
    ...enter('pop', 200),
  }),
  brand([944, y + 196, 32, 32], 'badge', GOLD),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...cabinet(),
    ...marquee(title, 200),
    text('sub', [360, 450, 1200, 40], {
      ...px,
      text: sub,
      size: 20,
      color: CREAM,
      align: 'center',
      ...enter('fade', 500),
    }),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [610, 540, 700, 90],
          300,
          'INSERT COIN {time}',
          {
            ...px,
            size: 34,
            color: CYAN,
            align: 'center',
            shadow: 'glow',
            ...enter('fade', 700, 'pulse'),
          },
          'PLAYER 1 READY',
        )
      : text('blink', [610, 540, 700, 90], {
          ...px,
          text: 'CONTINUE? 9',
          size: 34,
          color: CYAN,
          align: 'center',
          shadow: 'glow',
          ...enter('fade', 700, 'pulse'),
        }),
    widget('goal', 'goal', [660, 860, 600, 72], live.goal(goalStyle)),
    widget('latest', 'label', [60, 60, 460, 64], live.label('latest_follower', 'P1: {value}', tag)),
    rotator('socials', [560, 960, 800, 40], SOCIALS, {
      ...px,
      size: 18,
      color: CREAM,
      align: 'center',
    }),
  ])

export default themeDesign(
  {
    slug: 'arcade-night',
    name: 'Arcade night',
    description:
      'A neon cabinet room: marquee bulbs, checkered floor, scan lines and an Insert coin countdown.',
    style: 'retro',
    motion: 'lively',
  },
  [
    scene('in_game', 'In game', [
      cam('cam', [40, 640, 480, 360], 'bulbs', {
        style: 'corners',
        color: GOLD,
        accent: PINK,
        thickness: 4,
        radius: 0,
        label: 'Player 1',
        ...enter('fade', 0, 'pulse'),
      }),
      brand([500, 980, 40, 40], 'badge', PINK),
      widget('alerts', 'alerts', [560, 60, 800, 400], live.alerts),
      widget('goal', 'goal', [600, 1000, 720, 64], live.goal(goalStyle)),
      widget(
        'latest',
        'label',
        [40, 40, 460, 60],
        live.label('latest_follower', 'Last player: {value}', tag),
      ),
      widget('events', 'events', [1500, 40, 380, 320], live.events(cards)),
      rotator('socials', [1380, 1020, 500, 36], SOCIALS, {
        ...px,
        size: 14,
        color: CREAM,
        align: 'right',
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [40, 100, 1240, 820], { fill: NIGHT }),
      pattern(
        'pixels',
        [1300, 0, 620, 1080],
        'pixels',
        PINK,
        { moving: true, scale: 0.5 },
        { opacity: 0.6 },
      ),
      mat('cam-mat', [40, 100, 1240, 820], '#1a0b2e', 10),
      cam('cam', [40, 100, 1240, 820], 'bulbs', {
        style: 'corners',
        color: PINK,
        accent: GOLD,
        thickness: 4,
        radius: 0,
        ...enter('fade', 0, 'pulse'),
      }),
      text('chat-head', [1320, 100, 560, 40], {
        ...px,
        text: 'HIGH SCORES',
        size: 22,
        color: GOLD,
      }),
      widget(
        'chat',
        'chat',
        [1320, 160, 560, 760],
        live.chat({
          variant: 'lines',
          accent: PINK,
          text: CREAM,
          background: '#1a0b2ee6',
          radius: 0,
          font: 'JetBrains Mono',
        }),
      ),
      brand([1842, 960, 38, 38], 'badge', PINK),
      widget('alerts', 'alerts', [260, 140, 800, 400], live.alerts),
      widget(
        'latest',
        'label',
        [40, 30, 460, 56],
        live.label('latest_sub', 'New sub: {value}', tag),
      ),
      widget('goal', 'goal', [40, 960, 640, 72], live.goal(goalStyle)),
      rotator('socials', [720, 980, 560, 36], SOCIALS, { ...px, size: 14, color: CREAM }),
    ]),
    waiting('starting_soon', 'Starting soon', 'STARTING SOON', 'GAME STARTS IN A MOMENT'),
    waiting('brb', 'Be right back', 'PAUSED', 'PLAYER 1 WILL BE RIGHT BACK'),
    scene('ending', 'Ending', [
      ...cabinet(),
      ...marquee('GAME OVER', 120),
      text('sub', [360, 370, 1200, 40], {
        ...px,
        text: 'THANKS FOR PLAYING. CONTINUE NEXT STREAM?',
        size: 18,
        color: CREAM,
        align: 'center',
      }),
      widget('events', 'events', [660, 440, 600, 300], live.events(cards)),
      widget(
        'top',
        'label',
        [660, 800, 600, 64],
        live.label('top_tip_session', 'High score: {value}', tag),
      ),
      rotator('socials', [560, 920, 800, 40], SOCIALS, {
        ...px,
        size: 18,
        color: CREAM,
        align: 'center',
      }),
      cut('coin', [1300, 820, 44, 44], 'octagon', { fill: GOLD }),
    ]),
  ],
  'builtin.pixel-arcade',
)
