// Glitch district: cyberpunk street signage. Acid yellow slabs on near black, a hot red
// echo knocked out of register behind every headline, cut-corner panels, hazard stripes and
// a few slices of torn signal. Russo One capitals with the glitch effect, mono readouts.
// The Spark is a small mark stamped into the hazard band.

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

const VOID = '#09090e'
const STEEL = '#16171f'
const ACID = '#fcee0a'
const RED = '#ff2a4d'
const CYAN = '#00e5ff'
const WHITE = '#f4f4f6'
const SOCIALS = ['twitch.tv/yourname', 'youtube.com/@yourname', 'kick.com/yourname'] as const

const tagLabel = {
  variant: 'tag',
  accent: ACID,
  text: WHITE,
  background: '#09090ee6',
  radius: 0,
  font: 'Russo One',
  uppercase: true,
}
const segGoal = {
  variant: 'segments',
  accent: ACID,
  track: '#2a2b36',
  text: WHITE,
  background: '#09090ee6',
  radius: 0,
  font: 'Russo One',
  uppercase: true,
}
const hudEvents = {
  variant: 'hud',
  accent: ACID,
  text: WHITE,
  background: '#09090ecc',
  font: 'JetBrains Mono',
  uppercase: true,
}
const mono = {
  font: 'JetBrains Mono',
  weight: 600,
  color: CYAN,
  uppercase: true,
  letter_spacing: 0.16,
}

/** A torn slice of signal: a thin bar knocked sideways. */
const slice = (id: string, x: number, y: number, w: number, h: number, c: string, loop = false) =>
  box(id, [x, y, w, h], {
    shape: 'rect',
    fill: c,
    ...enter('wipe', 400, loop ? 'pulse' : 'none'),
  })

/** Hazard band: yellow and black stripes in a slanted bar. */
const hazard = (id: string, x: number, y: number, w: number, h: number) =>
  pattern(id, [x, y, w, h], 'stripes', VOID, {
    ground: ACID,
    scale: 1.2,
    clip: 'parallelogram',
  })

const street = () => [
  box('bg', [0, 0, 1920, 1080], { shape: 'rect', fill: '#14141c', fill2: VOID, angle: 160 }),
  pattern('grid', [0, 0, 1920, 1080], 'grid', '#ffffff0a', { scale: 2 }),
  pattern('scan', [0, 0, 1920, 1080], 'scanlines', '#00000055', { scale: 1 }),
  cut('beam', [1240, 0, 680, 1080], 'parallelogram', {
    fill: '#fcee0a10',
    fill2: '#fcee0a00',
    angle: 90,
  }),
]

const waiting = (key: 'starting_soon' | 'brb', name: string, title: string, sub: string) =>
  scene(key, name, [
    ...street(),
    cut('echo', [118, 214, 1380, 300], 'parallelogram', { fill: RED, ...enter('slide_left', 60) }),
    cut('slab', [96, 196, 1380, 300], 'parallelogram', {
      fill: ACID,
      shadow: 'hard',
      ...enter('slide_left', 0),
    }),
    text('kicker', [240, 220, 900, 40], {
      text: key === 'starting_soon' ? '// signal incoming' : '// signal lost',
      ...mono,
      size: 26,
      color: VOID,
      ...enter('fade', 300),
    }),
    text('title', [160, 272, 1280, 170], {
      text: title,
      font: 'Russo One',
      size: 118,
      weight: 400,
      color: VOID,
      color2: RED,
      effect: 'glitch',
      uppercase: true,
      letter_spacing: -0.01,
      ...enter('wipe', 200),
    }),
    slice('s1', 1300, 300, 260, 10, RED, true),
    slice('s2', 60, 470, 340, 6, CYAN),
    slice('s3', 1420, 440, 140, 14, ACID, true),
    text('sub', [190, 530, 1100, 50], {
      text: sub,
      font: 'Oswald',
      size: 36,
      weight: 500,
      color: WHITE,
      uppercase: true,
      letter_spacing: 0.06,
      ...enter('fade', 600),
    }),
    ...(key === 'starting_soon'
      ? [
          cut('timer-plate', [190, 620, 560, 170], 'cut', {
            fill: STEEL,
            stroke: ACID,
            stroke_width: 3,
          }),
          text('timer-label', [222, 636, 300, 30], { text: 'T-minus', ...mono, size: 20 }),
          countdown(
            'timer',
            [210, 664, 520, 110],
            300,
            '{time}',
            {
              font: 'JetBrains Mono',
              size: 96,
              weight: 700,
              color: ACID,
              shadow: 'glow',
              ...enter('zoom', 500),
            },
            'LIVE',
          ),
        ]
      : [widget('events', 'events', [190, 620, 620, 300], live.events(hudEvents))]),
    cut('panel', [1480, 560, 380, 260], 'cut', {
      fill: '#16171fe6',
      stroke: '#ffffff22',
      stroke_width: 1,
    }),
    text('panel-a', [1510, 584, 330, 30], { text: 'district 07 / night', ...mono, size: 20 }),
    text('panel-b', [1510, 624, 330, 160], {
      text: 'uplink stable\nchat open\nvibes nominal',
      font: 'JetBrains Mono',
      size: 26,
      weight: 500,
      color: WHITE,
      uppercase: true,
      ...enter('fade', 900),
    }),
    hazard('hazard', 0, 880, 1920, 34),
    brand([1840, 883, 28, 28], 'mark', VOID),
    rotator('socials', [190, 950, 800, 44], SOCIALS, {
      ...mono,
      size: 28,
      color: WHITE,
    }),
    widget('goal', 'goal', [1260, 940, 600, 100], live.goal(segGoal)),
  ])

export default themeDesign(
  {
    slug: 'glitch-district',
    name: 'Glitch district',
    description:
      'Cyberpunk signage: acid yellow slabs, a red echo out of register, hazard stripes and torn signal.',
    style: 'bold',
    motion: 'lively',
  },
  [
    scene('in_game', 'In game', [
      hazard('hazard', 0, 1046, 620, 22),
      mat('cam-edge', [40, 660, 520, 340], ACID, 4),
      cam('cam', [40, 660, 520, 340], 'vhs', { color: ACID, accent: RED, thickness: 3 }),
      cut('cam-tag', [40, 616, 260, 40], 'parallelogram', { fill: ACID }),
      text('cam-tag-t', [70, 621, 220, 32], {
        text: 'cam_01 // live',
        ...mono,
        size: 18,
        color: VOID,
      }),
      brand([520, 1006, 30, 30], 'mark', ACID),
      widget(
        'latest',
        'label',
        [40, 40, 440, 58],
        live.label('latest_follower', 'Follow: {value}', tagLabel),
      ),
      widget(
        'sub',
        'label',
        [40, 108, 440, 58],
        live.label('latest_sub', 'Sub: {value}', tagLabel),
      ),
      slice('s1', 40, 176, 180, 5, RED),
      widget('alerts', 'alerts', [560, 40, 800, 420], live.alerts),
      widget('goal', 'goal', [1380, 40, 500, 100], live.goal(segGoal)),
      slice('s2', 1700, 150, 180, 5, CYAN),
      rotator('socials', [1300, 1010, 580, 40], SOCIALS, {
        ...mono,
        size: 22,
        color: WHITE,
        align: 'right',
      }),
    ]),
    scene('just_chatting', 'Just chatting', [
      ...surround('bg', [40, 90, 1240, 760], { fill: VOID }),
      pattern('grid', [1300, 0, 620, 1080], 'grid', '#ffffff0a', { scale: 2 }),
      mat('cam-edge', [40, 90, 1240, 760], ACID, 4),
      cam('cam', [40, 90, 1240, 760], 'vhs', {
        color: ACID,
        accent: RED,
        thickness: 3,
        label: 'Just chatting',
      }),
      cut('cam-tag', [40, 40, 400, 44], 'parallelogram', { fill: ACID }),
      text('cam-tag-t', [76, 47, 360, 32], {
        text: 'feed // open channel',
        ...mono,
        size: 20,
        color: VOID,
      }),
      slice('s1', 1000, 62, 280, 6, RED, true),
      cut('chat-plate', [1320, 90, 560, 760], 'cut', {
        fill: '#16171fe6',
        stroke: '#fcee0a66',
        stroke_width: 2,
      }),
      text('chat-head', [1350, 108, 500, 40], {
        text: 'Comms',
        font: 'Russo One',
        size: 34,
        weight: 400,
        color: ACID,
        uppercase: true,
      }),
      widget(
        'chat',
        'chat',
        [1340, 160, 520, 670],
        live.chat({
          variant: 'lines',
          accent: ACID,
          text: WHITE,
          background: '#09090e00',
          font: 'JetBrains Mono',
        }),
      ),
      widget('alerts', 'alerts', [260, 140, 800, 420], live.alerts),
      hazard('hazard', 0, 880, 1920, 30),
      brand([1846, 116, 26, 26], 'mark', ACID),
      widget('goal', 'goal', [40, 940, 600, 100], live.goal(segGoal)),
      widget(
        'latest',
        'label',
        [680, 960, 440, 58],
        live.label('latest_sub', 'Sub: {value}', tagLabel),
      ),
      rotator('socials', [1180, 972, 700, 40], SOCIALS, {
        ...mono,
        size: 24,
        color: WHITE,
        align: 'right',
      }),
    ]),
    waiting('starting_soon', 'Starting soon', 'Starting soon', 'Jacking in. Hold the line.'),
    waiting('brb', 'Be right back', 'Be right back', 'Rerouting the signal. Stay tuned.'),
    scene('ending', 'Ending', [
      ...street(),
      cut('echo', [118, 154, 1300, 260], 'parallelogram', {
        fill: RED,
        ...enter('slide_left', 60),
      }),
      cut('slab', [96, 136, 1300, 260], 'parallelogram', {
        fill: ACID,
        shadow: 'hard',
        ...enter('slide_left', 0),
      }),
      text('kicker', [240, 156, 900, 40], {
        text: '// connection closed',
        ...mono,
        size: 26,
        color: VOID,
      }),
      text('title', [170, 196, 1200, 170], {
        text: 'Signing off',
        font: 'Russo One',
        size: 140,
        weight: 400,
        color: VOID,
        color2: RED,
        effect: 'glitch',
        uppercase: true,
        ...enter('wipe', 200),
      }),
      slice('s1', 1180, 240, 260, 10, RED, true),
      text('sub', [190, 440, 1100, 50], {
        text: 'Thanks for running with the crew tonight.',
        font: 'Oswald',
        size: 36,
        weight: 500,
        color: WHITE,
        uppercase: true,
        letter_spacing: 0.06,
      }),
      widget('events', 'events', [190, 520, 660, 320], live.events(hudEvents)),
      widget(
        'top',
        'label',
        [1360, 600, 500, 58],
        live.label('top_tip_session', 'Top tip: {value}', tagLabel),
      ),
      widget(
        'subs',
        'label',
        [1360, 672, 500, 58],
        live.label('session_subs', 'Subs tonight: {value}', tagLabel),
      ),
      hazard('hazard', 0, 880, 1920, 34),
      brand([1840, 883, 28, 28], 'mark', VOID),
      rotator('socials', [190, 950, 1000, 44], SOCIALS, { ...mono, size: 28, color: WHITE }),
    ]),
  ],
  'builtin.glitch-slice',
)
