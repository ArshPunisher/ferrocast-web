// The motion designer's vocabulary (API.md §4 Designs, `motion`, 1.1): the entrances, text
// effects, exits and idle loops, their names in the designer's words, the defaults a look
// saved before 1.1 reads as, and the timing both the designer's timeline and the overlay use.
// Pure: no DOM, so the dashboard and the OBS overlay share it one to one.

import type {
  AlertIn,
  AlertLook,
  AlertOut,
  AnimIn,
  AnimOut,
  FerroEvent,
  Motion,
  MotionDirection,
  MotionIdle,
  MotionIn,
  MotionOut,
  MotionParticles,
  MotionRecipe,
  MotionSpot,
  ParticleColors,
  TextAnim,
} from './types'
import { majorUnits } from './format'

export interface MotionInfo {
  name: string
  desc: string
}

// ------------------------------------------------------------------ ids and names

export const MOTION_IN: readonly MotionIn[] = [
  'slam',
  'elastic',
  'bolt',
  'glitch',
  'portal',
  'shatter',
  'pour',
  'flip_shine',
  'confetti_pop',
  'dash',
  'neon',
]
export const MOTION_OUT: readonly MotionOut[] = [
  'dissolve',
  'black_hole',
  'zip',
  'fold',
  'shatter',
  'tv_off',
  'fall',
  'iris',
  'glitch',
]
/** The motion designer's text effects, in its order (`type` is 1.0's, now the Typewriter). */
export const MOTION_TEXT: readonly TextAnim[] = [
  'cascade',
  'pop_wave',
  'type',
  'decode',
  'shine',
  'neon',
  'rgb',
  'stretch',
  'spin',
  'none',
]
/** 1.0's entrances, exits and text effects, offered as "Simple" so every saved look stays. */
export const SIMPLE_IN: readonly AnimIn[] = [
  'fade',
  'rise',
  'drop',
  'slide_left',
  'slide_right',
  'zoom',
  'pop',
  'bounce',
  'flip',
  'wipe',
  'magnet',
  'none',
]
export const SIMPLE_OUT: readonly AnimOut[] = [
  'fade',
  'sink',
  'lift',
  'slide_left',
  'slide_right',
  'zoom',
  'shrink',
  'flip',
  'wipe',
  'none',
]
export const SIMPLE_TEXT: readonly TextAnim[] = ['wave', 'wiggle', 'bounce', 'pop', 'glow']
export const IDLES: readonly MotionIdle[] = [
  'none',
  'breathe',
  'float',
  'shimmer',
  'glow',
  'jelly',
  'heartbeat',
]
export const PARTICLES: readonly MotionParticles[] = [
  'auto',
  'none',
  'confetti',
  'sparks',
  'petals',
  'coins',
  'embers',
  'stars',
]
export const PARTICLE_COLORS: readonly ParticleColors[] = [
  'brand',
  'rainbow',
  'gold',
  'white',
  'custom',
]
export const SPOTS: readonly MotionSpot[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']
export const DIRECTIONS: readonly MotionDirection[] = ['auto', 'top', 'left', 'right', 'bottom']

export const IN_INFO: Record<AlertIn, MotionInfo> = {
  slam: { name: 'Slam', desc: 'Crashes into the screen and shakes it' },
  elastic: { name: 'Elastic drop', desc: 'Falls, squashes on landing, springs back' },
  bolt: { name: 'Bolt strike', desc: 'Lightning hits and the alert appears in the flash' },
  glitch: { name: 'Glitch', desc: 'Tears in with an RGB split and scan slices' },
  portal: { name: 'Portal', desc: 'Opens through a spinning ring of light' },
  shatter: { name: 'Shatter in', desc: 'Shards fly together and lock into place' },
  pour: { name: 'Molten pour', desc: 'Liquid metal fills the card, then drains away' },
  flip_shine: { name: 'Flip and shine', desc: 'Turns over in 3D, then a light sweeps across' },
  confetti_pop: { name: 'Confetti pop', desc: 'Pops up and bursts confetti' },
  dash: { name: 'Dash in', desc: 'Speeds in from the side and skids to a stop' },
  neon: { name: 'Neon flicker', desc: 'Buzzes on like a neon sign' },
  fade: { name: 'Fade', desc: 'Fades in, nothing else' },
  rise: { name: 'Rise', desc: 'Rises up a little as it fades in' },
  drop: { name: 'Drop', desc: 'Drops from above and settles' },
  slide_left: { name: 'Slide from left', desc: 'Slides in from the left' },
  slide_right: { name: 'Slide from right', desc: 'Slides in from the right' },
  zoom: { name: 'Zoom', desc: 'Grows into place' },
  pop: { name: 'Pop', desc: 'Pops up with a small overshoot' },
  bounce: { name: 'Bounce', desc: 'Falls and bounces twice' },
  flip: { name: 'Flip', desc: 'Tips forward into view' },
  wipe: { name: 'Wipe', desc: 'Wipes in from the left' },
  magnet: { name: 'Magnet', desc: 'Pulled up from just below' },
  none: { name: 'None', desc: 'Appears at once' },
}
export const OUT_INFO: Record<AlertOut, MotionInfo> = {
  dissolve: { name: 'Dissolve', desc: 'Breaks into drifting dust, left to right' },
  black_hole: { name: 'Black hole', desc: 'Gets sucked into a point and pops' },
  zip: { name: 'Slide and blur', desc: 'Pulls back, then zips off the screen' },
  fold: { name: 'Fold away', desc: 'Folds back like a card into a slot' },
  shatter: { name: 'Shatter', desc: 'Cracks white, then falls apart with gravity' },
  tv_off: { name: 'TV off', desc: 'Collapses to a line, then a dot' },
  fall: { name: 'Drop', desc: 'Hops up, then falls off with gravity' },
  iris: { name: 'Iris close', desc: 'Closes into a circle and winks out' },
  glitch: { name: 'Glitch out', desc: 'Jitters into slices and cuts to nothing' },
  fade: { name: 'Fade', desc: 'Fades out' },
  sink: { name: 'Sink', desc: 'Sinks a little as it fades' },
  lift: { name: 'Lift', desc: 'Lifts away as it fades' },
  slide_left: { name: 'Slide to left', desc: 'Slides off to the left' },
  slide_right: { name: 'Slide to right', desc: 'Slides off to the right' },
  zoom: { name: 'Zoom out', desc: 'Shrinks as it fades' },
  shrink: { name: 'Pop away', desc: 'Swells, then pops small' },
  flip: { name: 'Flip', desc: 'Tips back out of view' },
  wipe: { name: 'Wipe', desc: 'Wipes away to the right' },
  none: { name: 'None', desc: 'Disappears at once' },
}
export const TEXT_INFO: Record<TextAnim, MotionInfo> = {
  cascade: { name: 'Cascade', desc: 'Letters tumble in one after another' },
  pop_wave: { name: 'Pop wave', desc: 'Each letter pops big, then settles' },
  type: { name: 'Typewriter', desc: 'Types out with a blinking cursor' },
  decode: { name: 'Decode', desc: 'Scrambles through symbols and locks in' },
  shine: { name: 'Shine sweep', desc: 'A bright band runs across the words' },
  neon: { name: 'Neon letters', desc: 'Letters buzz on one by one with a glow' },
  rgb: { name: 'RGB glitch', desc: 'Splits into red and blue, jitters, snaps clean' },
  stretch: { name: 'Rubber stretch', desc: 'Letters snap in stretched and spring to size' },
  spin: { name: 'Spin in', desc: 'Each letter turns to face you in 3D' },
  none: { name: 'None', desc: 'The words arrive with the card' },
  wave: { name: 'Wave', desc: 'A wave runs through the letters' },
  wiggle: { name: 'Wiggle', desc: 'The letters wiggle' },
  bounce: { name: 'Bounce in', desc: 'Letters drop in and bounce' },
  pop: { name: 'Pop letters', desc: 'Letters pop in one by one' },
  glow: { name: 'Glow pulse', desc: 'The name and amount glow' },
}
export const IDLE_INFO: Record<MotionIdle, MotionInfo> = {
  none: { name: 'Still', desc: 'Holds steady until it leaves' },
  breathe: { name: 'Breathe', desc: 'A slow, soft pulse' },
  float: { name: 'Float', desc: 'Bobs gently, like it is hovering' },
  shimmer: { name: 'Shimmer', desc: 'A light glint crosses every couple of seconds' },
  glow: { name: 'Glow pulse', desc: 'A warm glow swells and fades' },
  jelly: { name: 'Jelly', desc: 'A quick wobble now and then' },
  heartbeat: { name: 'Heartbeat', desc: 'A double thump, like a pulse' },
}
export const PARTICLE_INFO: Record<MotionParticles, MotionInfo> = {
  auto: { name: 'Match the entrance', desc: 'Each entrance brings its own' },
  none: { name: 'None', desc: 'No particles' },
  confetti: { name: 'Confetti', desc: 'Paper bits that flutter down' },
  sparks: { name: 'Sparks', desc: 'Hot streaks flying outward' },
  petals: { name: 'Petals', desc: 'Soft petals drifting' },
  coins: { name: 'Coins', desc: 'A fountain of spinning coins' },
  embers: { name: 'Embers', desc: 'Glowing bits rising up' },
  stars: { name: 'Stars', desc: 'Little stars that pop out' },
}
export const COLORS_LABEL: Record<ParticleColors, string> = {
  brand: 'Your colours',
  rainbow: 'Rainbow',
  gold: 'Gold',
  white: 'White',
  custom: 'Your colour',
}
export const SPOT_LABEL: Record<MotionSpot, string> = {
  tl: 'Top left',
  tc: 'Top centre',
  tr: 'Top right',
  ml: 'Middle left',
  mc: 'Middle',
  mr: 'Middle right',
  bl: 'Bottom left',
  bc: 'Bottom centre',
  br: 'Bottom right',
}

/** Particle colours for the palettes that don't come from the look. */
export const PALETTES: Record<'rainbow' | 'gold' | 'white', readonly string[]> = {
  rainbow: ['#ff4d6d', '#ffa424', '#ffe14d', '#3dd193', '#33d4ff', '#9a8cff'],
  gold: ['#ffd36b', '#ffb547', '#e09a24', '#fff2c4'],
  white: ['#ffffff', '#dfe4ec', '#a9b1bd'],
}

export const isMotionIn = (v: unknown): v is MotionIn => MOTION_IN.includes(v as MotionIn)
export const isMotionOut = (v: unknown): v is MotionOut => MOTION_OUT.includes(v as MotionOut)
const MOTION_TEXT_ONLY = new Set<string>([
  'cascade',
  'pop_wave',
  'decode',
  'shine',
  'neon',
  'rgb',
  'stretch',
  'spin',
])
/** The 1.1 text effects (Typewriter included, it times like them). */
export const isMotionText = (v: unknown): boolean => MOTION_TEXT_ONLY.has(String(v)) || v === 'type'

// ------------------------------------------------------------------ defaults

/** core::design::Motion::default(): what a look saved before 1.1 reads as. Plays like 1.0. */
export const DEFAULT_MOTION: Readonly<Motion> = Object.freeze({
  idle: 'none',
  particles: 'auto',
  colors: 'brand',
  custom_color: '#ff5aa5',
  bounce: 45,
  speed: 100,
  stagger: 34,
  shake: true,
  flash: true,
  vignette: true,
  zoom_punch: true,
  by_amount: true,
  position: 'mc',
  direction: 'auto',
  impact_sounds: false,
  beat: false,
  bpm: 120,
  recipe: null,
})

/** The look's motion with every missing field filled in (1.0 looks have none). */
export function motionOf(look: Pick<AlertLook, 'motion'> | null | undefined): Motion {
  const m = look?.motion
  return m && typeof m === 'object' ? { ...DEFAULT_MOTION, ...m } : { ...DEFAULT_MOTION }
}

/** core::design MOTION_* limits. */
export const MOTION_BOUNDS = {
  bounce: 100,
  speed: [60, 160],
  stagger: 90,
  bpm: [70, 170],
} as const

export const FEELS = {
  calm: { bounce: 15, speed: 80 },
  lively: { bounce: 45, speed: 100 },
  punchy: { bounce: 70, speed: 130 },
} as const
export type Feel = keyof typeof FEELS
export function feelOf(m: Motion): Feel | null {
  for (const [k, f] of Object.entries(FEELS))
    if (f.bounce === m.bounce && f.speed === m.speed) return k as Feel
  return null
}

// ------------------------------------------------------------------ recipes

export interface RecipeSet {
  in: MotionIn
  text: TextAnim
  out: MotionOut
  motion: Pick<
    Motion,
    'idle' | 'particles' | 'colors' | 'shake' | 'flash' | 'vignette' | 'zoom_punch'
  >
}
export const RECIPES: Record<MotionRecipe, MotionInfo & { set: RecipeSet }> = {
  heavy: {
    name: 'Heavy hitter',
    desc: 'Slam, cascade, shatter',
    set: {
      in: 'slam',
      text: 'cascade',
      out: 'shatter',
      motion: {
        idle: 'breathe',
        particles: 'auto',
        colors: 'brand',
        shake: true,
        flash: true,
        vignette: true,
        zoom_punch: true,
      },
    },
  },
  arcade: {
    name: 'Arcade',
    desc: 'Elastic drop, pop wave, coins',
    set: {
      in: 'elastic',
      text: 'pop_wave',
      out: 'black_hole',
      motion: {
        idle: 'jelly',
        particles: 'coins',
        colors: 'gold',
        shake: true,
        flash: false,
        vignette: false,
        zoom_punch: true,
      },
    },
  },
  cyber: {
    name: 'Cyber',
    desc: 'Glitch, decode, TV off',
    set: {
      in: 'glitch',
      text: 'decode',
      out: 'tv_off',
      motion: {
        idle: 'shimmer',
        particles: 'none',
        colors: 'brand',
        shake: false,
        flash: true,
        vignette: true,
        zoom_punch: false,
      },
    },
  },
  molten: {
    name: 'Molten',
    desc: 'Pour, shine, dissolve, embers',
    set: {
      in: 'pour',
      text: 'shine',
      out: 'dissolve',
      motion: {
        idle: 'glow',
        particles: 'embers',
        colors: 'gold',
        shake: false,
        flash: true,
        vignette: true,
        zoom_punch: true,
      },
    },
  },
  storm: {
    name: 'Storm',
    desc: 'Bolt strike, RGB glitch, slide off',
    set: {
      in: 'bolt',
      text: 'rgb',
      out: 'zip',
      motion: {
        idle: 'heartbeat',
        particles: 'sparks',
        colors: 'brand',
        shake: true,
        flash: true,
        vignette: true,
        zoom_punch: true,
      },
    },
  },
  party: {
    name: 'Party',
    desc: 'Confetti pop, spin, iris close',
    set: {
      in: 'confetti_pop',
      text: 'spin',
      out: 'iris',
      motion: {
        idle: 'float',
        particles: 'confetti',
        colors: 'rainbow',
        shake: false,
        flash: false,
        vignette: false,
        zoom_punch: true,
      },
    },
  },
  clean: {
    name: 'Clean',
    desc: 'Flip and shine, typewriter, fold',
    set: {
      in: 'flip_shine',
      text: 'type',
      out: 'fold',
      motion: {
        idle: 'none',
        particles: 'stars',
        colors: 'white',
        shake: false,
        flash: false,
        vignette: false,
        zoom_punch: false,
      },
    },
  },
}
export const RECIPE_IDS = Object.keys(RECIPES) as MotionRecipe[]

// ------------------------------------------------------------------ springs and timing

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export interface Spring {
  /** Progress 0 → 1 at `ms` (may overshoot). */
  (ms: number): number
  /** How long it takes to settle, in ms. */
  dur: number
  /** An impulse that swings and settles (used for skids). */
  kick: (ms: number) => number
}

/** A damped spring in closed form. `bounce` 0..100 sets the damping. */
export function springOf(bounce: number): Spring {
  const b = Math.min(100, Math.max(0, Number.isFinite(bounce) ? bounce : 45))
  const z = lerp(0.95, 0.2, b / 100)
  const w = 17
  const wd = w * Math.sqrt(1 - z * z)
  const f = ((ms: number) => {
    const t = ms / 1000
    if (t <= 0) return 0
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))
  }) as Spring
  f.dur = Math.round(Math.min(1500, Math.max(280, (4.8 / (z * w)) * 1000)))
  f.kick = (ms: number) => {
    const t = ms / 1000
    return Math.exp(-z * w * t) * Math.sin(wd * t)
  }
  return f
}

/** An entrance's length and the moment it lands, in design ms (before speed). */
export function entranceTiming(id: MotionIn, dur: number): { T: number; hit: number } {
  switch (id) {
    case 'slam':
      return { hit: 170, T: 170 + dur }
    case 'elastic':
      return { hit: 300, T: 300 + dur }
    case 'bolt':
      return { hit: 150, T: 150 + dur }
    case 'glitch':
      return { hit: 420, T: 520 }
    case 'portal':
      return { hit: 230, T: Math.max(620, 120 + dur) }
    case 'shatter':
      return { hit: 470, T: 470 + Math.min(600, dur) }
    case 'pour':
      return { hit: 420, T: 900 }
    case 'flip_shine': {
      const hit = Math.round(dur * 0.42)
      return { hit, T: Math.max(dur, hit + 560) }
    }
    case 'confetti_pop':
      return { hit: 130, T: 130 + dur }
    case 'dash':
      return { hit: 220, T: 220 + dur }
    case 'neon':
      return { hit: 470, T: 1000 }
  }
}

/** How long an exit plays until the card (and its dust) is gone, in design ms. */
export const EXIT_MS: Record<MotionOut, number> = {
  dissolve: 1120,
  black_hole: 800,
  zip: 460,
  fold: 560,
  shatter: 1000,
  tv_off: 440,
  fall: 720,
  iris: 620,
  glitch: 420,
}

/** Milliseconds between letters: the look's stagger, squeezed so a long headline stays quick. */
export function staggerFor(m: Motion, chars: number): number {
  return Math.min(m.stagger, 1200 / Math.max(1, chars - 1))
}

/** A per-letter step that types a long headline in under 1.4 s. */
export function typeStep(m: Motion, chars: number, min: number, k: number): number {
  return Math.min(Math.max(min, m.stagger * k), 1400 / Math.max(1, chars))
}

/** How long a text effect runs from its start, in design ms (0 for 1.0's own). */
export function textLength(id: TextAnim, m: Motion, chars: number): number {
  const n = Math.max(1, chars)
  const stg = staggerFor(m, n)
  const dur = springOf(m.bounce).dur
  switch (id) {
    case 'cascade':
    case 'stretch':
    case 'spin':
      return (n - 1) * stg + dur
    case 'pop_wave':
      return (n - 1) * stg * 1.1 + 440
    case 'type':
      return n * typeStep(m, n, 45, 1.6) + 900
    case 'decode':
      return 160 + (n - 1) * typeStep(m, n, 30, 1.4) + 400
    case 'shine':
      return 1100
    case 'neon':
      return n * stg * 0.8 + 860
    case 'rgb':
      return 580 + n * stg * 0.3
    default:
      return 0
  }
}

export interface MotionPlan {
  /** Wait before the entrance (land on the beat), real ms. */
  delay: number
  /** The entrance, real ms. */
  enter: number
  /** When the entrance lands (from the alert's start, real ms); null without an impact. */
  hit: number | null
  /** When the text effect starts and how long it runs, real ms. */
  textAt: number
  text: number
  /** The exit, real ms. */
  exit: number
  /** One beat, ms, when "Land on the beat" is on. */
  beat: number | null
  /** speed / 100 */
  speed: number
}

/**
 * The look's timing as the overlay plays it. 1.0 entrances and exits keep `in_ms`/`out_ms`;
 * the 1.1 ones take their length from the spring and the speed. `chars` is the headline's
 * letter count (for the per-letter text effects).
 */
export function motionPlan(
  look: AlertLook,
  opts: { chars?: number; reduced?: boolean } = {},
): MotionPlan {
  const m = motionOf(look)
  const speed = Math.min(1.6, Math.max(0.6, m.speed / 100))
  const sp = springOf(m.bounce)
  const a = look.anim
  const chars = opts.chars ?? 12
  const delayMs = Math.max(0, a.text_delay_ms || 0)
  let enter: number
  let hit: number | null
  let textAt: number
  if (opts.reduced) {
    // 1.0's low-motion entrance is always 200 ms (a fade, or nothing for None).
    enter = isMotionIn(a.in) ? 240 : 200
    hit = null
    textAt = enter * 0.35 + delayMs
  } else if (isMotionIn(a.in)) {
    const t = entranceTiming(a.in, sp.dur)
    enter = t.T / speed
    hit = t.hit / speed
    textAt = Math.max(0, t.hit - 40) / speed + delayMs
  } else {
    enter = a.in_ms
    hit = null
    textAt = a.in_ms * 0.35 + delayMs
  }
  const text = opts.reduced ? 0 : textLength(a.text, m, chars) / speed
  const exit = opts.reduced
    ? isMotionOut(a.out)
      ? 220
      : a.out === 'none'
        ? 0
        : 200
    : isMotionOut(a.out)
      ? EXIT_MS[a.out] / speed
      : a.out_ms
  let delay = 0
  let beat: number | null = null
  // Only the motion designer's entrances have a hit to land on the beat; the simple ones
  // keep their 1.0 timing.
  if (m.beat && hit !== null) {
    beat = 60_000 / Math.min(170, Math.max(70, m.bpm))
    const land = hit
    let n = 2
    while (n * beat - land < 60) n++
    delay = n * beat - land
  }
  return {
    delay,
    enter,
    hit: hit === null ? null : delay + hit,
    textAt: delay + textAt,
    text,
    exit,
    beat,
    speed,
  }
}

/**
 * Keeps `in_ms`/`out_ms` (and the alert's length) honest for the 1.1 motion: the engine checks
 * that an alert leaves time between coming in and going out, and the overlay times the exit
 * from the alert's length.
 */
export function withMotionTiming(look: AlertLook): AlertLook {
  const p = motionPlan(look)
  const anim = { ...look.anim }
  if (isMotionIn(anim.in)) anim.in_ms = Math.min(3000, Math.round(p.delay + p.enter))
  if (isMotionOut(anim.out)) anim.out_ms = Math.min(3000, Math.round(p.exit))
  return withFloor(look, anim)
}

/** The simple entrances' and exits' own lengths, for going back to one from the 1.1 ones. */
export const SIMPLE_IN_MS = 650
export const SIMPLE_OUT_MS = 450

/**
 * `withMotionTiming` for a change of entrance or exit: going back to a simple one from one of
 * the motion designer's gets a simple length again (not the spring's, or a 3 s fade).
 */
export function withAnimChange(before: AlertLook, after: AlertLook): AlertLook {
  const anim = { ...after.anim }
  if (isMotionIn(before.anim.in) && !isMotionIn(anim.in)) anim.in_ms = SIMPLE_IN_MS
  if (isMotionOut(before.anim.out) && !isMotionOut(anim.out)) anim.out_ms = SIMPLE_OUT_MS
  return withMotionTiming({ ...after, anim })
}

function withFloor(look: AlertLook, anim: AlertLook['anim']): AlertLook {
  const floor = anim.in_ms + anim.out_ms + 1000
  const duration_ms = Math.min(60_000, Math.max(look.duration_ms, floor))
  if (
    anim.in_ms === look.anim.in_ms &&
    anim.out_ms === look.anim.out_ms &&
    duration_ms === look.duration_ms
  )
    return look
  return { ...look, anim, duration_ms }
}

// ------------------------------------------------------------------ editing helpers

/** A look with a recipe applied (entrance, text, exit, idle, particles and impacts). */
export function applyRecipe(look: AlertLook, id: MotionRecipe): AlertLook {
  const r = RECIPES[id].set
  return withMotionTiming({
    ...look,
    anim: { ...look.anim, in: r.in, text: r.text, out: r.out, text_delay_ms: 0 },
    motion: { ...motionOf(look), ...r.motion, recipe: id },
  })
}

/** `to` with the motion of `from` (another event's look); the card keeps its own spot. */
export function copyMotion(from: AlertLook, to: AlertLook): AlertLook {
  const src = motionOf(from)
  return withMotionTiming({
    ...to,
    anim: { ...from.anim },
    motion: { ...src, position: motionOf(to).position },
  })
}

/** A random combination that still makes sense (no "None" text, always some particles). */
export function surpriseMotion(look: AlertLook, rand: () => number = Math.random): AlertLook {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length) % xs.length] as T
  const colors = pick(PARTICLE_COLORS.filter((c) => c !== 'custom'))
  return withMotionTiming({
    ...look,
    anim: {
      ...look.anim,
      in: pick(MOTION_IN),
      text: pick(MOTION_TEXT.filter((t) => t !== 'none')),
      out: pick(MOTION_OUT),
      text_delay_ms: 0,
    },
    motion: {
      ...motionOf(look),
      idle: pick(IDLES),
      particles: pick(PARTICLES.filter((p) => p !== 'none')),
      colors,
      recipe: null,
    },
  })
}

// ------------------------------------------------------------------ intensity (core port)

/** core::design::intensity_for */
export function intensityFor(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1
  const l = Math.log10(ratio)
  const k = l >= 0 ? 1 + 0.5 * l : 1 + 0.4 * l
  return Math.min(2, Math.max(0.6, k))
}

const USUAL_TIP: Record<string, number> = {
  INR: 500,
  JPY: 700,
  KRW: 7000,
  IDR: 80_000,
  VND: 120_000,
  PHP: 250,
  PKR: 1400,
  BDT: 600,
  THB: 170,
  TWD: 160,
  HUF: 1800,
  CZK: 110,
  TRY: 170,
  RUB: 450,
  MXN: 90,
  BRL: 25,
  ARS: 5000,
  CLP: 4500,
  COP: 20_000,
  ZAR: 90,
  NGN: 7500,
}

/** core::design::intensity_of */
export function intensityOf(e: FerroEvent): number {
  const k = e.kind
  switch (k.type) {
    case 'tip':
    case 'paid_message':
      return intensityFor(majorUnits(k.money) / (USUAL_TIP[k.money.currency.toUpperCase()] ?? 5))
    case 'platform_gift':
      return intensityFor(k.value.amount / 500)
    case 'gift_batch':
      return intensityFor(k.count / 5)
    default:
      return 1
  }
}

/**
 * A usual amount for an event that "Bigger tips hit harder" scales with (the designer's test
 * presets are a tenth, one, ten and a hundred times it); null for events it doesn't scale.
 */
export function usualAmount(e: FerroEvent): {
  amount: number
  currency: string | null
  unit: 'money' | 'bits' | 'kicks' | 'jewels' | 'gifts'
} | null {
  const k = e.kind
  switch (k.type) {
    case 'tip':
    case 'paid_message': {
      const c = k.money.currency.toUpperCase()
      return { amount: USUAL_TIP[c] ?? 5, currency: c, unit: 'money' }
    }
    case 'platform_gift': {
      const u = String((k.value as { unit?: unknown }).unit ?? '').toLowerCase()
      return {
        amount: 500,
        currency: null,
        unit: u.includes('kick') ? 'kicks' : u.includes('jewel') ? 'jewels' : 'bits',
      }
    }
    case 'gift_batch':
      return { amount: 5, currency: null, unit: 'gifts' }
    default:
      return null
  }
}
