// Clean studio: a calm, editorial set for podcasts, IRL and just chatting. Warm off-white
// paper, graphite type in a light grotesk at display size, hairline rules, small mono
// captions and one signal red used only for what is live. Space does the work. The Spark
// sits in the masthead next to the episode number.

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

const PAPER = '#f4f2ee'
const PANEL = '#ebe8e2'
const GRAPHITE = '#1c1d20'
const MUTED = '#77736b'
const RULE = '#d3cec5'
const RED = '#e0482f'
const WHITE = '#ffffff'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'instagram @yourname'] as const

const lineLabel = {
  variant: 'underline',
  accent: RED,
  text: GRAPHITE,
  background: '#00000000',
  font: 'Hanken Grotesk',
}
const rulerGoal = {
  variant: 'ticks',
  accent: GRAPHITE,
  track: RULE,
  text: GRAPHITE,
  background: '#fffffff2',
  radius: 14,
  font: 'Hanken Grotesk',
}
const quietEvents = {
  variant: 'stack',
  accent: RED,
  text: GRAPHITE,
  font: 'Hanken Grotesk',
}
const caption = (size: number, color = MUTED) => ({
  font: 'JetBrains Mono',
  size,
  weight: 500,
  color,
  uppercase: true,
  letter_spacing: 0.2,
})
const display = (size: number) => ({
  font: 'Hanken Grotesk',
  size,
  weight: 300,
  color: GRAPHITE,
  letter_spacing: -0.035,
})

/** Paper, a hairline inset frame and the masthead with the episode number. */
const set = (episode: string, status: string) => [
  box('paper', [0, 0, 1920, 1080], { shape: 'rect', fill: PAPER, fill2: '#efece6', angle: 160 }),
  box('frame', [48, 48, 1824, 984], { shape: 'rect', stroke: RULE, stroke_width: 1 }),
  text('ep', [96, 92, 700, 30], { text: episode, ...caption(20, GRAPHITE) }),
  box('onair-dot', [1572, 99, 14, 14], {
    shape: 'ellipse',
    fill: RED,
    ...enter('fade', 300, 'pulse'),
  }),
  text('status', [1596, 92, 220, 30], { text: status, ...caption(20, GRAPHITE) }),
  brand([1800, 94, 24, 24], 'mark', GRAPHITE),
  box('rule-top', [96, 148, 1728, 1], { shape: 'rect', fill: RULE }),
]

/** The right-hand panel. */
const panel = (y = 200, h = 620) => [
  box('panel', [1320, y, 504, h], {
    shape: 'rect',
    fill: PANEL,
    radius: 28,
    ...enter('fade', 200),
  }),
  pattern('panel-grid', [1320, y, 504, h], 'grid', '#1c1d200a', { scale: 1.6, radius: 28 }),
]

const footer = (labelSource: string, template: string) => [
  box('rule-bot', [96, 880, 1728, 1], { shape: 'rect', fill: RULE }),
  widget('goal', 'goal', [96, 916, 560, 96], live.goal(rulerGoal)),
  widget('latest', 'label', [720, 932, 460, 60], live.label(labelSource, template, lineLabel)),
  rotator('socials', [1220, 948, 604, 30], SOCIALS, { ...caption(20, GRAPHITE), align: 'right' }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...set('Episode 042  ·  The studio', key === 'starting_soon' ? 'Live soon' : 'On a break'),
    text('eyebrow', [96, 250, 900, 30], {
      text: key === 'starting_soon' ? 'Today' : 'Intermission',
      ...caption(22, RED),
      ...enter('fade', 100),
    }),
    text('title', [90, 290, 1200, 200], {
      text: title,
      ...display(176),
      ...enter('rise', 200),
    }),
    text('sub', [96, 500, 1000, 50], {
      text: sub,
      font: 'Hanken Grotesk',
      size: 32,
      weight: 400,
      color: MUTED,
      ...enter('fade', 500),
    }),
    box('accent', [96, 600, 64, 3], { shape: 'rect', fill: RED }),
    ...(key === 'starting_soon'
      ? [
          text('topics-h', [96, 650, 600, 30], { text: 'On the table', ...caption(18) }),
          text('topics', [96, 692, 900, 150], {
            text: '01   What I built this week\n02   Your questions\n03   What comes next',
            font: 'Hanken Grotesk',
            size: 28,
            weight: 400,
            color: GRAPHITE,
            ...enter('fade', 700),
          }),
        ]
      : []),
    ...panel(),
    ...(key === 'starting_soon'
      ? [
          text('t-label', [1370, 250, 404, 30], { text: 'Begins in', ...caption(20) }),
          countdown(
            'timer',
            [1360, 300, 430, 180],
            300,
            '{time}',
            { ...display(150), letter_spacing: -0.04, ...enter('fade', 500) },
            'Now',
          ),
          box('p-rule', [1370, 520, 404, 1], { shape: 'rect', fill: RULE }),
          text('p-note', [1370, 548, 404, 230], {
            text: 'Grab a drink, settle in.\nQuestions welcome in chat\nonce we start.',
            font: 'Hanken Grotesk',
            size: 26,
            weight: 400,
            color: GRAPHITE,
          }),
        ]
      : [
          text('t-label', [1370, 250, 404, 30], { text: 'While you wait', ...caption(20) }),
          widget('events', 'events', [1356, 300, 432, 480], live.events(quietEvents)),
        ]),
    ...footer('latest_follower', 'Latest follower  {value}'),
  ])

export default themeDesign(
  {
    slug: 'clean-studio',
    name: 'Clean studio',
    description:
      'Calm and editorial for podcasts and just chatting: warm paper, light graphite type, hairlines and one red.',
    style: 'minimal',
    motion: 'still',
  },
  [
    scene('in_game', 'In game', [
      box('tag', [40, 40, 460, 120], { shape: 'rect', fill: '#fffffff2', radius: 20 }),
      widget(
        'latest',
        'label',
        [56, 48, 428, 52],
        live.label('latest_follower', 'Follower  {value}', lineLabel),
      ),
      widget(
        'sub',
        'label',
        [56, 100, 428, 52],
        live.label('latest_sub', 'Sub  {value}', { ...lineLabel, accent: GRAPHITE }),
      ),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      box('goal-plate', [1372, 36, 516, 104], { shape: 'rect', fill: '#fffffff2', radius: 20 }),
      widget('goal', 'goal', [1380, 40, 500, 96], live.goal(rulerGoal)),
      mat('cam-mat', [44, 680, 480, 300], WHITE, 6, 22),
      cam('cam', [44, 680, 480, 300], null, {
        style: 'line',
        color: WHITE,
        accent: RED,
        thickness: 1,
        radius: 18,
      }),
      box('live-pill', [44, 632, 110, 34], { shape: 'rect', fill: '#fffffff2', radius: 17 }),
      box('live-dot', [58, 644, 10, 10], { shape: 'ellipse', fill: RED }),
      text('live-t', [76, 637, 74, 26], { text: 'Live', ...caption(16, GRAPHITE) }),
      brand([496, 996, 22, 22], 'mark', GRAPHITE),
      widget('events', 'events', [1500, 680, 380, 300], {
        ...live.events({ ...quietEvents, variant: 'cards', background: '#fffffff2', radius: 14 }),
        max_items: 4,
      }),
      box('soc', [1500, 996, 380, 44], { shape: 'rect', fill: '#fffffff2', radius: 22 }),
      rotator('socials', [1500, 1004, 380, 30], SOCIALS, {
        ...caption(16, GRAPHITE),
        align: 'center',
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [60, 80, 1220, 760], { fill: PAPER }),
      text('ep', [60, 30, 800, 30], {
        text: 'Episode 042  ·  In conversation',
        ...caption(18, GRAPHITE),
      }),
      box('onair-dot', [1584, 39, 12, 12], {
        shape: 'ellipse',
        fill: RED,
        ...enter('fade', 300, 'pulse'),
      }),
      text('status', [1606, 30, 274, 30], { text: 'On air', ...caption(18, GRAPHITE) }),
      mat('cam-mat', [60, 80, 1220, 760], WHITE, 8, 24),
      cam('cam', [60, 80, 1220, 760], null, {
        style: 'line',
        color: RULE,
        accent: RED,
        thickness: 1,
        radius: 20,
      }),
      box('chat-panel', [1320, 80, 560, 760], {
        shape: 'rect',
        fill: WHITE,
        radius: 24,
        stroke: RULE,
        stroke_width: 1,
      }),
      text('chat-head', [1352, 104, 400, 30], { text: 'Chat', ...caption(18, GRAPHITE) }),
      brand([1834, 104, 22, 22], 'mark', GRAPHITE),
      box('chat-rule', [1352, 146, 496, 1], { shape: 'rect', fill: RULE }),
      widget(
        'chat',
        'chat',
        [1340, 160, 520, 664],
        live.chat({
          variant: 'lines',
          accent: RED,
          text: GRAPHITE,
          background: '#00000000',
          font: 'Hanken Grotesk',
        }),
      ),
      widget('alerts', 'alerts', [270, 140, 800, 420], live.alerts),
      box('rule-bot', [60, 880, 1820, 1], { shape: 'rect', fill: RULE }),
      widget('goal', 'goal', [60, 920, 560, 96], live.goal(rulerGoal)),
      widget(
        'latest',
        'label',
        [680, 936, 460, 60],
        live.label('latest_sub', 'Latest sub  {value}', lineLabel),
      ),
      rotator('socials', [1220, 952, 660, 30], SOCIALS, {
        ...caption(18, GRAPHITE),
        align: 'right',
      }),
    ]),
    waiting(
      'starting_soon',
      'Starting soon',
      'Starting soon',
      'A conversation, a coffee and nowhere to be.',
    ),
    waiting(
      'brb',
      'Be right back',
      'Be right back',
      'Short pause. We pick up right where we left off.',
    ),
    scene('ending', 'Ending', [
      ...set('Episode 042  ·  The studio', 'Off air'),
      text('eyebrow', [96, 250, 900, 30], { text: 'That is a wrap', ...caption(22, RED) }),
      text('title', [90, 290, 1200, 200], {
        text: 'Thanks for listening',
        ...display(132),
        ...enter('rise', 200),
      }),
      text('sub', [96, 480, 1000, 50], {
        text: 'Same chair, same time next week.',
        font: 'Hanken Grotesk',
        size: 32,
        weight: 400,
        color: MUTED,
      }),
      box('accent', [96, 580, 64, 3], { shape: 'rect', fill: RED }),
      ...panel(),
      text('t-label', [1370, 250, 404, 30], { text: 'Tonight', ...caption(20) }),
      widget(
        'top',
        'label',
        [1356, 296, 432, 58],
        live.label('top_tip_session', 'Top tip  {value}', lineLabel),
      ),
      widget(
        'subs',
        'label',
        [1356, 362, 432, 58],
        live.label('session_subs', 'New subs  {value}', { ...lineLabel, accent: GRAPHITE }),
      ),
      widget('events', 'events', [1356, 446, 432, 340], {
        ...live.events(quietEvents),
        max_items: 4,
      }),
      ...footer('session_follows', 'New followers  {value}'),
    ]),
  ],
  'builtin.studio-caption',
)
