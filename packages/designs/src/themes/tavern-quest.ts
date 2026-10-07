// Tavern quest: the back room of a fantasy inn before the party sets out. Dark oak walls,
// two crimson banners with gold crests, candles burning on the table and embers drifting
// up. The headline is a parchment notice in a gilded frame, sealed in red wax, and events
// read like a quest log. The Spark is pressed into the wax seal.

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

const OAK = '#2a1a10'
const OAK2 = '#120b06'
const PARCH = '#efe0bb'
const PARCH2 = '#d9bf8a'
const INK = '#2b1d10'
const WINE = '#7a1f1a'
const GOLD = '#d4a94a'
const CANDLE = '#ffb347'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'discord.gg/yourname'] as const

const noticeLabel = {
  variant: 'ticket',
  accent: WINE,
  text: INK,
  background: PARCH,
  radius: 4,
  font: 'Cinzel',
  font_size: 24,
}
const goldGoal = {
  variant: 'gold',
  accent: GOLD,
  track: '#2a1a10',
  text: PARCH,
  background: '#120b06e6',
  radius: 6,
  font: 'Cinzel',
}
const logEvents = {
  variant: 'timeline',
  accent: WINE,
  text: INK,
  font: 'Hanken Grotesk',
}
const cinzel = (size: number, color = INK) => ({
  font: 'Cinzel',
  size,
  weight: 800,
  color,
})
const kicker = (size: number, color = WINE) => ({
  font: 'Cinzel',
  size,
  weight: 700,
  color,
  letter_spacing: 0.22,
  uppercase: true,
})
const lore = (size: number, color = '#5a4128') => ({
  font: 'Playfair Display',
  size,
  weight: 500,
  italic: true,
  color,
})

const wall = () => [
  box('wall', [0, 0, 1920, 1080], { shape: 'rect', fill: OAK, fill2: OAK2, angle: 180 }),
  pattern('planks', [0, 0, 1920, 900], 'lines', '#00000038', { scale: 3 }),
  pattern('embers', [0, 240, 1920, 660], 'embers', CANDLE, { moving: true, scale: 0.6 }),
]

/** A crimson banner with a gold edge and a crest, hanging from the top. */
const banner = (id: string, x: number) => [
  cut(`${id}-edge`, [x - 8, 0, 196, 448], 'shield', { fill: GOLD, fill2: '#8f6a22', angle: 180 }),
  cut(`${id}-cloth`, [x, 0, 180, 430], 'shield', {
    fill: '#a32424',
    fill2: '#5e1010',
    angle: 180,
  }),
  cut(`${id}-crest`, [x + 50, 150, 80, 80], 'star', { fill: GOLD, shadow: 'soft' }),
]

/** A candle on the table: wax, a flickering flame and its halo. */
const candle = (id: string, x: number, bottom: number, h = 190) => [
  box(`${id}-halo`, [Math.min(x - 110, 1640), bottom - h - 190, 280, 280], {
    shape: 'ellipse',
    fill: '#ffb3471a',
    fill2: '#ffb34700',
    angle: 180,
    ...enter('fade', 200, 'pulse'),
  }),
  box(`${id}-wax`, [x, bottom - h, 60, h], {
    shape: 'rect',
    fill: '#f3e6c8',
    fill2: '#cdb88f',
    angle: 90,
    radius: 6,
  }),
  cut(`${id}-flame`, [x + 14, bottom - h - 70, 32, 64], 'drop', {
    fill: '#fff1c2',
    fill2: CANDLE,
    angle: 180,
    shadow: 'glow',
    ...enter('fade', 300, 'float'),
  }),
]

const table = (y: number) => [
  box('table', [0, y, 1920, 1080 - y], {
    shape: 'rect',
    fill: '#4a2e1a',
    fill2: '#24160c',
    angle: 180,
  }),
  box('table-edge', [0, y, 1920, 8], { shape: 'rect', fill: '#6b4428' }),
]

/** The parchment notice in a gilded frame. */
const notice = (x: number, y: number, w: number, h: number) => [
  box('parch', [x, y, w, h], {
    shape: 'rect',
    fill: PARCH,
    fill2: PARCH2,
    angle: 180,
    radius: 4,
    shadow: 'soft',
    ...enter('rise', 0),
  }),
  pattern('parch-grain', [x, y, w, h], 'paper', '#7a5a2a1f'),
  fancyFrame('parch-frame', [x - 10, y - 10, w + 20, h + 20], 'gold', {
    color: GOLD,
    accent: '#8f6a22',
    thickness: 6,
    radius: 6,
  }),
]

/** A thin rule with a small diamond in the middle. */
const flourish = (cx: number, y: number) => [
  box('rule', [cx - 220, y + 7, 440, 2], { shape: 'rect', fill: '#7a1f1a80' }),
  cut('rule-gem', [cx - 9, y, 18, 18], 'diamond', { fill: WINE }),
]

const seal = (x: number, y: number) => [
  cut('seal', [x, y, 110, 110], 'blob', {
    fill: '#b02a26',
    fill2: '#6e1210',
    angle: 150,
    shadow: 'soft',
  }),
  brand([x + 42, y + 42, 26, 26], 'mark', PARCH),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...wall(),
    ...banner('ban-l', 110),
    ...banner('ban-r', 1630),
    ...notice(470, 110, 980, 690),
    text('kicker', [520, 150, 880, 34], {
      text: key === 'starting_soon' ? 'A notice to all adventurers' : 'The party rests',
      ...kicker(22),
      align: 'center',
      ...enter('fade', 100),
    }),
    text('title', [500, 196, 920, 130], {
      text: title,
      ...cinzel(98),
      align: 'center',
      ...enter('rise', 200),
    }),
    ...flourish(960, 338),
    text('sub', [540, 370, 840, 44], {
      text: sub,
      ...lore(28),
      align: 'center',
      ...enter('fade', 500),
    }),
    ...(key === 'starting_soon'
      ? [
          text('t-label', [540, 452, 840, 32], {
            text: 'The quest begins in',
            ...kicker(20, INK),
            align: 'center',
          }),
          countdown(
            'timer',
            [540, 490, 840, 160],
            300,
            '{time}',
            { ...cinzel(130, WINE), align: 'center', ...enter('zoom', 600) },
            'Onward!',
          ),
        ]
      : [
          widget('events', 'events', [620, 440, 680, 320], {
            ...live.events(logEvents),
            max_items: 4,
          }),
        ]),
    ...seal(1360, 720),
    ...table(880),
    ...candle('c1', 230, 900),
    ...candle('c2', 1630, 900, 150),
    rotator('socials', [460, 836, 1000, 40], SOCIALS, {
      ...kicker(22, PARCH),
      align: 'center',
      letter_spacing: 0.16,
    }),
    widget('goal', 'goal', [400, 950, 560, 96], live.goal(goldGoal)),
    widget(
      'latest',
      'label',
      [1000, 966, 520, 62],
      live.label('latest_follower', 'New recruit: {value}', noticeLabel),
    ),
  ])

export default themeDesign(
  {
    slug: 'tavern-quest',
    name: 'Tavern quest',
    description:
      'A fantasy inn before the quest: parchment in a gilded frame, crimson banners, candles and a quest log.',
    style: 'retro',
    motion: 'smooth',
  },
  [
    scene('in_game', 'In game', [
      box('log', [40, 40, 480, 176], {
        shape: 'rect',
        fill: PARCH,
        fill2: PARCH2,
        angle: 180,
        radius: 4,
        shadow: 'soft',
      }),
      fancyFrame('log-frame', [34, 34, 492, 188], 'gold', {
        color: GOLD,
        accent: '#8f6a22',
        thickness: 4,
        radius: 6,
      }),
      text('log-head', [64, 54, 432, 30], { text: 'Quest log', ...kicker(20) }),
      widget(
        'latest',
        'label',
        [56, 90, 448, 54],
        live.label('latest_follower', 'New recruit: {value}', {
          ...noticeLabel,
          variant: 'underline',
          background: '#00000000',
          font: 'Hanken Grotesk',
        }),
      ),
      widget(
        'sub',
        'label',
        [56, 148, 448, 54],
        live.label('latest_sub', 'Sworn in: {value}', {
          ...noticeLabel,
          variant: 'underline',
          background: '#00000000',
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1380, 50, 500, 96], live.goal(goldGoal)),
      mat('cam-mat', [44, 680, 480, 300], OAK2, 10, 6),
      cam('cam', [44, 680, 480, 300], 'gold', {
        color: GOLD,
        accent: '#8f6a22',
        thickness: 4,
        radius: 6,
      }),
      brand([496, 994, 24, 24], 'mark', GOLD),
      box('ev-plate', [1500, 620, 380, 340], { shape: 'rect', fill: '#120b06d9', radius: 6 }),
      text('ev-head', [1524, 636, 332, 30], { text: 'Deeds of the day', ...kicker(18, GOLD) }),
      widget('events', 'events', [1516, 674, 348, 270], {
        ...live.events({ ...logEvents, text: PARCH, accent: GOLD }),
        max_items: 4,
      }),
      rotator('socials', [1500, 990, 380, 36], SOCIALS, {
        ...kicker(18, PARCH),
        letter_spacing: 0.12,
        align: 'center',
        shadow: 'soft',
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 80, 1220, 760], { fill: OAK, fill2: OAK2, angle: 180 }),
      mat('cam-mat', [60, 80, 1220, 760], OAK2, 12, 6),
      cam('cam', [60, 80, 1220, 760], 'gold', {
        color: GOLD,
        accent: '#8f6a22',
        thickness: 5,
        radius: 6,
      }),
      ...notice(1330, 90, 540, 740),
      text('chat-head', [1350, 112, 500, 44], {
        text: 'Tavern talk',
        ...cinzel(36),
        align: 'center',
      }),
      box('chat-rule', [1500, 162, 200, 2], { shape: 'rect', fill: '#7a1f1a80' }),
      widget(
        'chat',
        'chat',
        [1346, 178, 508, 636],
        live.chat({
          variant: 'plates',
          accent: GOLD,
          text: PARCH,
          background: '#2a1a10',
          radius: 4,
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [270, 140, 800, 420], live.alerts),
      ...table(880),
      brand([1838, 104, 24, 24], 'mark', WINE),
      widget('goal', 'goal', [60, 950, 560, 96], live.goal(goldGoal)),
      widget(
        'latest',
        'label',
        [660, 966, 480, 62],
        live.label('latest_sub', 'Sworn in: {value}', noticeLabel),
      ),
      rotator('socials', [1180, 980, 500, 36], SOCIALS, {
        ...kicker(18, PARCH),
        letter_spacing: 0.12,
      }),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'Sharpen your blades and pull up a stool.',
    ),
    waiting('brb', 'Be right back', 'Be right back', 'A short rest. The fire keeps burning.'),
    scene('ending', 'Ending', [
      ...wall(),
      ...banner('ban-l', 110),
      ...banner('ban-r', 1630),
      ...notice(470, 110, 980, 690),
      text('kicker', [520, 150, 880, 34], {
        text: 'Here ends the tale',
        ...kicker(22),
        align: 'center',
      }),
      text('title', [500, 196, 920, 130], {
        text: 'Quest complete',
        ...cinzel(92),
        align: 'center',
        ...enter('rise', 200),
      }),
      ...flourish(960, 338),
      text('sub', [540, 370, 840, 44], {
        text: 'Thank you for riding with the party.',
        ...lore(28),
        align: 'center',
      }),
      widget(
        'top',
        'label',
        [660, 440, 600, 62],
        live.label('top_tip_session', 'Top tribute: {value}', noticeLabel),
      ),
      widget(
        'subs',
        'label',
        [660, 512, 600, 62],
        live.label('session_subs', 'Sworn in tonight: {value}', noticeLabel),
      ),
      widget('events', 'events', [660, 590, 600, 190], { ...live.events(logEvents), max_items: 3 }),
      ...seal(1360, 720),
      ...table(880),
      ...candle('c1', 230, 900),
      ...candle('c2', 1630, 900, 150),
      rotator('socials', [460, 836, 1000, 40], SOCIALS, {
        ...kicker(22, PARCH),
        align: 'center',
        letter_spacing: 0.16,
      }),
    ]),
  ],
  'builtin.quest-scroll',
)
