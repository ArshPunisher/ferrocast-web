// Gilded: art-deco luxury in emerald and gold. Sunburst rays behind a monogram crest, fan
// corners, double hairlines, diamond ornaments, a single gold sheen, Cinzel capitals with
// Playfair italics. The Spark is a tiny ornament between two diamonds on each scene.

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

const EMERALD = '#071a14'
const EMERALD2 = '#0f3326'
const GOLD = '#d9b45a'
const GOLD2 = '#f6e3a1'
const IVORY = '#f4efe3'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname'] as const

const goldLabel = {
  variant: 'underline',
  accent: GOLD,
  text: IVORY,
  font: 'Cinzel',
  uppercase: true,
}
const goldGoal = {
  variant: 'gold',
  accent: GOLD,
  track: '#ffffff14',
  text: IVORY,
  background: '#071a14e6',
  radius: 0,
  font: 'Cinzel',
  uppercase: true,
}
const goldEvents = {
  variant: 'timeline',
  accent: GOLD,
  text: IVORY,
  font: 'Cinzel',
  uppercase: true,
}

/** Two diamonds with the mark between them: the ornament under every title. */
const ornament = (cx: number, y: number) => [
  box('orn-l', [cx - 260, y + 15, 200, 1], {
    shape: 'rect',
    fill: '#d9b45a00',
    fill2: GOLD,
    angle: 90,
  }),
  cut('orn-d1', [cx - 50, y + 8, 16, 16], 'diamond', { fill: GOLD }),
  brand([cx - 14, y, 28, 28], 'mark', GOLD2),
  cut('orn-d2', [cx + 34, y + 8, 16, 16], 'diamond', { fill: GOLD }),
  box('orn-r', [cx + 60, y + 15, 200, 1], {
    shape: 'rect',
    fill: GOLD,
    fill2: '#d9b45a00',
    angle: 90,
  }),
]
const hall = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: EMERALD2, fill2: EMERALD, angle: 180 }),
  pattern('rays', [0, 0, 1920, 1080], 'rays', '#d9b45a12', { moving: true }),
  fancyFrame('border', [40, 40, 1840, 1000], 'deco', {
    color: GOLD,
    accent: '#d9b45a88',
    thickness: 2,
    radius: 0,
  }),
  pattern('sheen', [0, 0, 1920, 1080], 'shimmer', GOLD2, { moving: true }),
]

const waiting = (
  key: 'starting_soon' | 'brb',
  name: string,
  kicker: string,
  title: string,
  sub: string,
) =>
  scene(key, name, [
    ...hall(),
    cut('crest-o', [890, 130, 140, 160], 'shield', { fill: GOLD, fill2: '#a9822f', angle: 180 }),
    cut('crest', [898, 138, 124, 144], 'shield', { fill: EMERALD2, fill2: EMERALD, angle: 180 }),
    text('crest-m', [898, 150, 124, 90], {
      text: 'Y',
      font: 'Cinzel',
      size: 72,
      weight: 700,
      color: GOLD2,
      align: 'center',
    }),
    text('kicker', [360, 330, 1200, 40], {
      text: kicker,
      font: 'Cinzel',
      size: 26,
      weight: 600,
      color: GOLD,
      align: 'center',
      uppercase: true,
      letter_spacing: 0.5,
      ...enter('fade', 200),
    }),
    text('title', [160, 380, 1600, 170], {
      text: title,
      font: 'Cinzel',
      size: 130,
      weight: 700,
      color: GOLD2,
      color2: '#a9822f',
      effect: 'gradient',
      align: 'center',
      uppercase: true,
      letter_spacing: 0.06,
      ...enter('fade', 400),
    }),
    ...ornament(960, 570),
    key === 'starting_soon'
      ? countdown(
          'timer',
          [560, 620, 800, 110],
          300,
          'The show begins in {time}',
          {
            font: 'Playfair Display',
            size: 48,
            weight: 500,
            italic: true,
            color: IVORY,
            align: 'center',
            ...enter('fade', 700),
          },
          'The show begins',
        )
      : text('sub', [460, 630, 1000, 70], {
          text: sub,
          font: 'Playfair Display',
          size: 44,
          weight: 500,
          italic: true,
          color: IVORY,
          align: 'center',
          ...enter('fade', 700),
        }),
    rotator(
      'socials',
      [560, 760, 800, 44],
      SOCIALS,
      {
        font: 'Cinzel',
        size: 26,
        weight: 600,
        color: GOLD,
        align: 'center',
        uppercase: true,
        letter_spacing: 0.2,
      },
      5,
    ),
    widget('goal', 'goal', [660, 860, 600, 92], live.goal(goldGoal)),
  ])

export default themeDesign(
  {
    slug: 'gilded',
    name: 'Gilded',
    description:
      'Art-deco luxury in emerald and gold: sunburst, fan corners, crest and serif capitals.',
    style: 'minimal',
    motion: 'smooth',
    pro: true,
  },
  [
    scene('in_game', 'In game', [
      cam('cam', [40, 660, 480, 340], 'deco', {
        color: GOLD,
        accent: '#d9b45a88',
        thickness: 3,
        radius: 0,
      }),
      ...ornament(280, 1022),
      widget(
        'latest',
        'label',
        [40, 40, 440, 56],
        live.label('latest_follower', 'Welcome {value}', goldLabel),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1400, 40, 480, 92], live.goal(goldGoal)),
      widget('events', 'events', [1520, 780, 360, 250], live.events(goldEvents)),
      rotator(
        'socials',
        [600, 1024, 720, 40],
        SOCIALS,
        {
          font: 'Cinzel',
          size: 22,
          weight: 600,
          color: GOLD2,
          align: 'center',
          uppercase: true,
          letter_spacing: 0.2,
          shadow: 'soft',
        },
        5,
      ),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [80, 80, 1180, 800], { fill: EMERALD }),
      cam('cam', [80, 80, 1180, 800], 'deco', {
        color: GOLD,
        accent: '#d9b45a88',
        thickness: 3,
        radius: 0,
      }),
      box('chat-back', [1310, 80, 530, 800], {
        shape: 'rect',
        fill: '#071a14e6',
        stroke: '#d9b45a88',
        stroke_width: 1,
      }),
      text('chat-head', [1310, 100, 530, 40], {
        text: 'The salon',
        font: 'Cinzel',
        size: 26,
        weight: 700,
        color: GOLD,
        align: 'center',
        uppercase: true,
        letter_spacing: 0.4,
      }),
      widget(
        'chat',
        'chat',
        [1330, 150, 490, 710],
        live.chat({
          variant: 'lines',
          accent: GOLD,
          text: IVORY,
          background: EMERALD,
          radius: 0,
          font: 'Playfair Display',
        }),
      ),
      widget('alerts', 'alerts', [270, 140, 800, 420], live.alerts),
      ...ornament(670, 920),
      widget('goal', 'goal', [80, 960, 560, 92], live.goal(goldGoal)),
      widget(
        'latest',
        'label',
        [700, 975, 500, 56],
        live.label('latest_sub', 'New patron {value}', goldLabel),
      ),
      rotator(
        'socials',
        [1310, 990, 530, 40],
        SOCIALS,
        {
          font: 'Cinzel',
          size: 22,
          weight: 600,
          color: GOLD2,
          align: 'center',
          uppercase: true,
          letter_spacing: 0.2,
        },
        5,
      ),
    ]),
    waiting('starting_soon', 'Starting soon', 'Tonight', 'Starting soon', ''),
    waiting(
      'brb',
      'Be right back',
      'Intermission',
      'Be right back',
      'A brief interval. Do stay seated.',
    ),
    scene('ending', 'Ending', [
      ...hall(),
      text('kicker', [360, 170, 1200, 40], {
        text: 'Fin',
        font: 'Cinzel',
        size: 30,
        weight: 600,
        color: GOLD,
        align: 'center',
        uppercase: true,
        letter_spacing: 0.6,
      }),
      text('title', [160, 220, 1600, 170], {
        text: 'Thank you',
        font: 'Cinzel',
        size: 140,
        weight: 700,
        color: GOLD2,
        color2: '#a9822f',
        effect: 'gradient',
        align: 'center',
        uppercase: true,
        letter_spacing: 0.06,
        ...enter('fade', 300),
      }),
      ...ornament(960, 410),
      text('sub', [460, 460, 1000, 60], {
        text: 'For a lovely evening. Until next time.',
        font: 'Playfair Display',
        size: 40,
        weight: 500,
        italic: true,
        color: IVORY,
        align: 'center',
      }),
      widget('events', 'events', [660, 560, 600, 280], live.events(goldEvents)),
      widget(
        'top',
        'label',
        [660, 860, 600, 56],
        live.label('top_tip_session', 'Patron of the night {value}', goldLabel),
      ),
      rotator(
        'socials',
        [560, 950, 800, 44],
        SOCIALS,
        {
          font: 'Cinzel',
          size: 24,
          weight: 600,
          color: GOLD,
          align: 'center',
          uppercase: true,
          letter_spacing: 0.2,
        },
        5,
      ),
    ]),
  ],
  'builtin.gilded-deco',
)
