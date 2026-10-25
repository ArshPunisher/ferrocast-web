// TypeScript port of `core::design` and `core::layer` (API.md §4 Designs): which look an
// event gets, how its text renders with highlights, the branding rule, and every check the
// engine makes, with the same messages. The engine stays the source of truth; this lets the
// designer preview and validate before saving, and the demo engine answer like the real one.

import { amountOf, defaultRules, matches, render, select } from './alert'
import { exponent } from './format'
import {
  DIRECTIONS,
  IDLES,
  MOTION_BOUNDS,
  PARTICLES,
  PARTICLE_COLORS,
  RECIPE_IDS,
  SPOTS,
  intensityOf,
  motionOf,
} from './motion'
import { anySample, sample } from './samples'
import { Template, eventVars, withPlurals } from './template'
import type {
  AlertContent,
  AlertDesignView,
  AlertLook,
  AnimIn,
  AnimOut,
  BrandSpot,
  BuiltinSound,
  CountdownLook,
  FxPreset,
  LegacySound,
  PlayableSound,
  Condition,
  Design,
  DesignKind,
  DesignVariation,
  EventKey,
  FerroEvent,
  Frame,
  FrameVariant,
  LookLayout,
  MotionTag,
  OriginKind,
  RenderedAlert,
  Scene,
  ShapeClip,
  ShapePattern,
  SoundLoop,
  Stinger,
  StyleTag,
  TextAnim,
  TextEffect,
  TextPart,
  Widget,
} from './types'

export const DESIGN_SCHEMA = 1
export const MAX_DESIGN_NAME = 60
export const MAX_DESCRIPTION = 200
export const MAX_VARIATIONS = 10
export const MAX_SCENES = 8
export const MAX_TITLE = 300
export const MAX_BODY = 500
export const MAX_CSS = 20_000
export const MAX_LAYER_TEXT = 500
export const MAX_OVERLAY_WIDGETS = 40
/** The alert canvas the designer and the overlay share. */
export const ALERT_CANVAS = { w: 800, h: 450 } as const
export const BUILTIN_PREFIX = 'builtin.'

export const EVENT_KEYS: readonly EventKey[] = [
  'follow',
  'sub',
  'resub',
  'gift',
  'member',
  'bits',
  'kicks',
  'tip',
  'superchat',
  'raid',
  'redeem',
]
export const SCENE_KEYS = [
  'in_game',
  'just_chatting',
  'starting_soon',
  'getting_ready',
  'brb',
  'paused',
  'offline',
  'ending',
] as const
/** core::design::BREAK_KEYS: screens shown while away from the game. */
export const BREAK_KEYS: readonly string[] = [
  'starting_soon',
  'getting_ready',
  'brb',
  'paused',
  'offline',
  'ending',
]
export const FRAMES: readonly Frame[] = [
  'plate',
  'neon',
  'comic',
  'glass',
  'pixel',
  'banner',
  'pill',
  'none',
]
export const LAYOUTS: readonly LookLayout[] = ['above', 'left', 'right', 'over', 'text', 'custom']
export const ANIM_IN: readonly AnimIn[] = [
  'none',
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
]
export const ANIM_OUT: readonly AnimOut[] = [
  'none',
  'fade',
  'sink',
  'lift',
  'slide_left',
  'slide_right',
  'zoom',
  'shrink',
  'flip',
  'wipe',
]
export const TEXT_ANIMS: readonly TextAnim[] = [
  'none',
  'wave',
  'wiggle',
  'bounce',
  'pop',
  'type',
  'glow',
]
/** The sound groups the picker shows, in order (Crystal, Felt, then Sparkle classic). */
export const SOUND_GROUPS: readonly { label: string; sounds: readonly PlayableSound[] }[] = [
  {
    label: 'Crystal',
    sounds: ['sparkle', 'glint', 'cascade', 'bloom', 'lift', 'tally', 'halo', 'droplet'],
  },
  {
    label: 'Felt',
    sounds: ['kalimba', 'marimba', 'glow', 'ember', 'pebble', 'feather', 'hearth', 'wink'],
  },
  { label: 'Classic', sounds: ['sparkle_classic'] },
]
/** Every sound a design can pick (old ids still load, see `LEGACY_SOUND`). */
export const BUILTIN_SOUNDS: readonly BuiltinSound[] = [
  'none',
  ...SOUND_GROUPS.flatMap((g) => g.sounds),
]
/**
 * Chime, Coin, Whoosh, Boing and Bass hit retired in 1.1. A design that still names one plays
 * the closest new sound, so saved alerts never go quiet: Chime's two-note ping → Glint,
 * Coin's B-to-E → Tally (the same interval on glass), Whoosh → Lift (air rising into a
 * chord), Boing → Droplet (the playful one), Bass hit → Ember (weight without the boom).
 */
export const LEGACY_SOUND: Record<LegacySound, PlayableSound> = {
  chime: 'glint',
  coin: 'tally',
  whoosh: 'lift',
  boing: 'droplet',
  bass: 'ember',
}
/** The sound that actually plays for a saved id. */
export function resolveSound(s: BuiltinSound): PlayableSound | 'none' {
  return s in LEGACY_SOUND ? LEGACY_SOUND[s as LegacySound] : (s as PlayableSound | 'none')
}
/** Any id a saved design may carry (current or retired). */
export function isBuiltinSound(v: unknown): v is BuiltinSound {
  return typeof v === 'string' && (BUILTIN_SOUNDS.includes(v as BuiltinSound) || v in LEGACY_SOUND)
}
export const BRAND_SPOTS: readonly BrandSpot[] = [
  'corner',
  'divider',
  'watermark',
  'notch',
  'badge',
  'edge',
]
export const STYLE_TAGS: readonly StyleTag[] = [
  'minimal',
  'bold',
  'retro',
  'playful',
  'tech',
  'cozy',
]
export const MOTION_TAGS: readonly MotionTag[] = ['still', 'smooth', 'lively', 'bouncy']
export const DESIGN_KINDS: readonly DesignKind[] = ['alert', 'theme', 'scene', 'widget']
export const LAYER_TYPES = [
  'image',
  'text',
  'shape',
  'frame',
  'webcam',
  'brand',
  'fx',
  'music',
  'sound',
] as const
/** core::layer::FX_PRESETS: the motion backgrounds an `fx` layer draws. */
export const FX_PRESETS: readonly FxPreset[] = [
  'hex',
  'nightdrive',
  'wasteland',
  'circuit',
  'tunnel',
  'dunes',
  'forge',
  'arena',
  'coderain',
  'orbit',
  'sonar',
]
export const FX_LABEL: Record<FxPreset, string> = {
  hex: 'Hex pulse',
  nightdrive: 'Night drive',
  wasteland: 'Wasteland',
  circuit: 'Circuit',
  tunnel: 'Neon tunnel',
  dunes: 'Night dunes',
  forge: 'Lava forge',
  arena: 'Arena lights',
  coderain: 'Code rain city',
  orbit: 'Orbit',
  sonar: 'Deep sonar',
}
/** core::layer::STINGERS and SOUND_LOOPS: sounds the overlay page makes itself. */
export const STINGERS: readonly Stinger[] = ['whoosh', 'riser', 'impact', 'tick', 'chime', 'glitch']
export const SOUND_LOOPS: readonly SoundLoop[] = ['rain', 'wind', 'pad', 'hum']
export const SCREEN_SOUND_LABEL: Record<Stinger | SoundLoop, string> = {
  whoosh: 'Whoosh',
  riser: 'Riser',
  impact: 'Impact',
  tick: 'Tick',
  chime: 'Chime',
  glitch: 'Glitch',
  rain: 'Rain',
  wind: 'Wind',
  pad: 'Synth pad',
  hum: 'City hum',
}
/** core::layer::COUNTDOWN_LOOKS */
export const COUNTDOWN_LOOKS: readonly CountdownLook[] = [
  'digital',
  'thin',
  'ring',
  'bar',
  'flip',
  'words',
]
export const COUNTDOWN_LOOK_LABEL: Record<CountdownLook, string> = {
  digital: 'Digital',
  thin: 'Thin',
  ring: 'Ring',
  bar: 'Bar',
  flip: 'Flip',
  words: 'Words',
}
const SHADOWS = ['none', 'soft', 'hard', 'glow'] as const
const LOOPS = ['none', 'float', 'pulse', 'shimmer'] as const
/** Richer layer options (API-REQUESTS R20). The engine passes them through untouched. */
export const SHAPE_CLIPS: readonly ShapeClip[] = [
  'chevron',
  'arrow',
  'hexagon',
  'octagon',
  'diamond',
  'star',
  'burst',
  'ticket',
  'ribbon',
  'tag',
  'parallelogram',
  'cut',
  'shield',
  'wave',
  'torn',
  'cloud',
  'blob',
  'heart',
  'drop',
  'leaf',
  'moon',
  'bolt',
  'pennant',
  'trapezoid',
  'steps',
  'sparkle',
  'cross',
  'bat',
]
/** Tiled patterns (CSS backgrounds). */
export const TILE_PATTERNS = [
  'dots',
  'grid',
  'lines',
  'scanlines',
  'stripes',
  'checker',
  'halftone',
  'waves',
  'zigzag',
  'rays',
  'rings',
  'paper',
  'perspective',
  'blinds',
] as const satisfies readonly ShapePattern[]
/** Particle patterns (a few dozen small shapes that drift when the layer loops). */
export const PARTICLE_PATTERNS = [
  'stars',
  'sparkles',
  'confetti',
  'bokeh',
  'snow',
  'embers',
  'rain',
  'petals',
  'leaves',
  'lights',
  'bubbles',
  'fireflies',
  'pixels',
  'eq',
  'shimmer',
] as const satisfies readonly ShapePattern[]
export const SHAPE_PATTERNS: readonly ShapePattern[] = [...TILE_PATTERNS, ...PARTICLE_PATTERNS]
export const FRAME_VARIANTS: readonly FrameVariant[] = [
  'hud',
  'sketch',
  'tube',
  'pixel',
  'film',
  'polaroid',
  'gold',
  'tape',
  'chevron',
  'holo',
  'vhs',
  'circle',
  'bulbs',
  'stitch',
  'brush',
  'deco',
]
export const TEXT_EFFECTS: readonly TextEffect[] = [
  'gradient',
  'chrome',
  'neon',
  'extrude',
  'outline',
  'glitch',
  'sticker',
  'marker',
  'long_shadow',
  'stamp',
]
export const MAX_ROTATE_ITEMS = 8
export const MAX_ROTATE_TEXT = 80

// ---------------------------------------------------------------------- labels (UI copy)

export const EVENT_LABEL: Record<EventKey, string> = {
  follow: 'Follow',
  sub: 'Sub',
  resub: 'Resub',
  gift: 'Gift',
  member: 'Member',
  bits: 'Bits',
  kicks: 'KICKs',
  tip: 'Tip',
  superchat: 'Super Chat',
  raid: 'Raid',
  redeem: 'Redeem',
}
/** The engine event kind (and a platform) each look key is tested with. */
export const EVENT_SAMPLE: Record<
  EventKey,
  { kind: string; platform?: 'twitch' | 'youtube' | 'kick'; months?: number }
> = {
  follow: { kind: 'follow' },
  sub: { kind: 'subscription', platform: 'twitch', months: 1 },
  resub: { kind: 'subscription', platform: 'twitch' },
  gift: { kind: 'gift_batch' },
  member: { kind: 'subscription', platform: 'youtube' },
  bits: { kind: 'platform_gift', platform: 'twitch' },
  kicks: { kind: 'platform_gift', platform: 'kick' },
  tip: { kind: 'tip' },
  superchat: { kind: 'paid_message' },
  raid: { kind: 'raid' },
  redeem: { kind: 'reward_redemption' },
}
export const FRAME_LABEL: Record<Frame, string> = {
  plate: 'Molten plate',
  neon: 'Neon sign',
  comic: 'Comic burst',
  glass: 'Glass card',
  pixel: 'Pixel arcade',
  banner: 'Esports banner',
  pill: 'Slim pill',
  none: 'Text only',
}
export const LAYOUT_LABEL: Record<LookLayout, string> = {
  above: 'Image above',
  left: 'Image left',
  right: 'Image right',
  over: 'Text over',
  text: 'Text only',
  custom: 'Custom',
}
export const ANIM_IN_LABEL: Record<AnimIn, string> = {
  none: 'None',
  fade: 'Fade',
  rise: 'Rise',
  drop: 'Drop',
  slide_left: 'Slide from left',
  slide_right: 'Slide from right',
  zoom: 'Zoom',
  pop: 'Pop',
  bounce: 'Bounce',
  flip: 'Flip',
  wipe: 'Wipe',
  magnet: 'Magnet',
}
export const ANIM_OUT_LABEL: Record<AnimOut, string> = {
  none: 'None',
  fade: 'Fade',
  sink: 'Sink',
  lift: 'Lift',
  slide_left: 'Slide to left',
  slide_right: 'Slide to right',
  zoom: 'Zoom out',
  shrink: 'Pop away',
  flip: 'Flip',
  wipe: 'Wipe',
}
export const TEXT_ANIM_LABEL: Record<TextAnim, string> = {
  none: 'None',
  wave: 'Wave',
  wiggle: 'Wiggle',
  bounce: 'Bounce in',
  pop: 'Pop letters',
  type: 'Typewriter',
  glow: 'Glow pulse',
  cascade: 'Cascade',
  pop_wave: 'Pop wave',
  decode: 'Decode',
  shine: 'Shine sweep',
  neon: 'Neon letters',
  rgb: 'RGB glitch',
  stretch: 'Rubber stretch',
  spin: 'Spin in',
}
const PLAYABLE_LABEL: Record<PlayableSound | 'none', string> = {
  none: 'No sound',
  sparkle: 'Sparkle',
  glint: 'Glint',
  cascade: 'Cascade',
  bloom: 'Bloom',
  lift: 'Lift',
  tally: 'Tally',
  halo: 'Halo',
  droplet: 'Droplet',
  kalimba: 'Kalimba',
  marimba: 'Marimba',
  glow: 'Glow',
  ember: 'Ember',
  pebble: 'Pebble',
  feather: 'Feather',
  hearth: 'Hearth',
  wink: 'Wink',
  sparkle_classic: 'Sparkle classic',
}
/** A sound's name; a retired id is named by the sound it plays now. */
export const SOUND_LABEL: Record<BuiltinSound, string> = {
  ...PLAYABLE_LABEL,
  ...(Object.fromEntries(
    Object.entries(LEGACY_SOUND).map(([k, v]) => [k, PLAYABLE_LABEL[v]]),
  ) as Record<LegacySound, string>),
}
/** What each sound suits, as the picker's second line. */
export const SOUND_USE: Record<PlayableSound, string> = {
  sparkle: 'Any alert',
  glint: 'Follow',
  cascade: 'Sub, membership',
  bloom: 'Big tip, gift bomb',
  lift: 'Raid, host',
  tally: 'Tip, Bits, Super Chat',
  halo: 'Milestone, hype train',
  droplet: 'Playful alerts, redeems',
  kalimba: 'Follow',
  marimba: 'Sub, membership',
  glow: 'Tip, Super Chat',
  ember: 'Big tip',
  pebble: 'Chat highlight, redeem',
  feather: 'Before a message is read',
  hearth: 'Raid, gift bomb',
  wink: 'Frequent events',
  sparkle_classic: 'Sparkle before 1.1',
}
/**
 * The pre-matched sound for each event (the sound board's option C). Offered as one click,
 * "Use suggested sounds"; it never changes what a new design starts with.
 */
export const SUGGESTED_SOUND: Record<EventKey, PlayableSound> = {
  follow: 'glint',
  sub: 'cascade',
  resub: 'cascade',
  member: 'cascade',
  gift: 'bloom',
  bits: 'tally',
  kicks: 'tally',
  tip: 'tally',
  superchat: 'tally',
  raid: 'lift',
  redeem: 'pebble',
}
/** A variation for big amounts (an amount condition on a paid event) gets Bloom. */
export function suggestedSound(
  key: EventKey,
  v: Pick<DesignVariation, 'condition'>,
): PlayableSound {
  const paid = key === 'tip' || key === 'superchat' || key === 'bits' || key === 'kicks'
  return paid && v.condition?.type === 'amount_at_least' ? 'bloom' : SUGGESTED_SOUND[key]
}
/**
 * The design with every event's suggested sound. Events without their own look get one (a
 * copy of the look they used), so each can sound different. Own sound files stay; volume,
 * and everything else, stays.
 */
export function withSuggestedSounds<D extends Design>(d: D): D {
  if (d.kind !== 'alert') return d
  const events: AlertContent['events'] = { ...d.content.events }
  for (const key of EVENT_KEYS) {
    const own = d.content.events[key]?.variations
    const vs = own ?? structuredClone(looksFor(d, key)).map((v, i) => ({ ...v, id: `${key}-${i}` }))
    if (vs.length === 0) continue
    events[key] = {
      variations: vs.map((v) =>
        v.look.sound.ref
          ? v
          : {
              ...v,
              look: { ...v.look, sound: { ...v.look.sound, builtin: suggestedSound(key, v) } },
            },
      ),
    }
  }
  return { ...d, content: { ...d.content, events } } as D
}
export const STYLE_LABEL: Record<StyleTag, string> = {
  minimal: 'Minimal',
  bold: 'Bold',
  retro: 'Retro',
  playful: 'Playful',
  tech: 'Tech',
  cozy: 'Cozy',
}
export const MOTION_LABEL: Record<MotionTag, string> = {
  still: 'Still',
  smooth: 'Smooth',
  lively: 'Lively',
  bouncy: 'Bouncy',
}
export const KIND_LABEL_DESIGN: Record<DesignKind, string> = {
  alert: 'Alerts',
  theme: 'Themes',
  scene: 'Scenes',
  widget: 'Widgets',
}
export const CLIP_LABEL: Record<ShapeClip, string> = {
  chevron: 'Chevron',
  arrow: 'Arrow',
  hexagon: 'Hexagon',
  octagon: 'Octagon',
  diamond: 'Diamond',
  star: 'Star',
  burst: 'Burst',
  ticket: 'Ticket',
  ribbon: 'Ribbon',
  tag: 'Tag',
  parallelogram: 'Slanted bar',
  cut: 'Cut corners',
  shield: 'Shield',
  wave: 'Wavy top',
  torn: 'Torn paper',
  cloud: 'Cloud',
  blob: 'Blob',
  heart: 'Heart',
  drop: 'Flame',
  leaf: 'Leaf',
  moon: 'Moon',
  bolt: 'Bolt',
  pennant: 'Pennant',
  trapezoid: 'Trapezoid',
  steps: 'Pixel steps',
  sparkle: 'Sparkle',
  cross: 'Plus',
  bat: 'Bat',
}
export const PATTERN_LABEL: Record<ShapePattern, string> = {
  dots: 'Dots',
  grid: 'Grid',
  lines: 'Lines',
  scanlines: 'Scan lines',
  stripes: 'Stripes',
  checker: 'Checker',
  halftone: 'Halftone',
  waves: 'Waves',
  zigzag: 'Zigzag',
  rays: 'Sun rays',
  rings: 'Rings',
  paper: 'Paper',
  perspective: 'Horizon grid',
  blinds: 'Sunset bands',
  stars: 'Stars',
  sparkles: 'Sparkles',
  confetti: 'Confetti',
  bokeh: 'Bokeh',
  snow: 'Snow',
  embers: 'Embers',
  rain: 'Rain',
  petals: 'Petals',
  leaves: 'Leaves',
  lights: 'String lights',
  bubbles: 'Bubbles',
  fireflies: 'Fireflies',
  pixels: 'Pixels',
  eq: 'Music bars',
  shimmer: 'Shimmer',
}
export const FRAME_VARIANT_LABEL: Record<FrameVariant, string> = {
  hud: 'HUD brackets',
  sketch: 'Sketch',
  tube: 'Neon tube',
  pixel: 'Pixel',
  film: 'Film strip',
  polaroid: 'Instant photo',
  gold: 'Gold bevel',
  tape: 'Taped',
  chevron: 'Chevrons',
  holo: 'Holographic',
  vhs: 'VHS',
  circle: 'Circle',
  bulbs: 'Light bulbs',
  stitch: 'Stitched',
  brush: 'Brush stroke',
  deco: 'Art deco',
}
export const TEXT_EFFECT_LABEL: Record<TextEffect, string> = {
  gradient: 'Gradient',
  chrome: 'Chrome',
  neon: 'Neon',
  extrude: '3D extrude',
  outline: 'Outline only',
  glitch: 'Glitch',
  sticker: 'Sticker',
  marker: 'Highlighter',
  long_shadow: 'Long shadow',
  stamp: 'Stamp',
}
export const SCENE_LABEL: Record<string, string> = {
  in_game: 'In game',
  just_chatting: 'Just chatting',
  starting_soon: 'Starting soon',
  getting_ready: 'Getting ready',
  brb: 'Be right back',
  paused: 'Paused',
  offline: 'Offline',
  ending: 'Ending',
}

// ---------------------------------------------------------------------- picking

/** core::design::event_key */
export function eventKey(e: FerroEvent): EventKey | null {
  const k = e.kind
  switch (k.type) {
    case 'follow':
      return 'follow'
    case 'subscription':
      if (e.platform === 'youtube') return 'member'
      return k.months >= 2 ? 'resub' : 'sub'
    case 'gift_batch':
      return 'gift'
    case 'platform_gift':
      return k.value.unit === 'kicks' ? 'kicks' : 'bits'
    case 'paid_message':
      return 'superchat'
    case 'tip':
      return 'tip'
    case 'raid':
      return 'raid'
    case 'reward_redemption':
      return 'redeem'
    default:
      return null
  }
}

/** Looks tried in order: its own, then the plainer one it resembles. */
export function fallbacks(key: EventKey): EventKey[] {
  switch (key) {
    case 'resub':
    case 'member':
    case 'gift':
      return [key, 'sub']
    case 'kicks':
      return [key, 'bits']
    case 'superchat':
      return [key, 'tip']
    default:
      return [key]
  }
}

/** core::design::pick: the look a design gives an event, or null (the rule's look plays). */
export function pickLook(
  d: Design,
  e: FerroEvent,
): { key: EventKey; variation: DesignVariation } | null {
  if (d.kind !== 'alert') return null
  const key = eventKey(e)
  if (!key) return null
  let looks: { variations: DesignVariation[] } | undefined
  for (const k of fallbacks(key)) {
    looks = d.content.events[k]
    if (looks) break
  }
  if (!looks) return null
  let best: DesignVariation | null = null
  for (const v of looks.variations)
    if (v.condition && matches(v.condition, e) && (best === null || v.priority >= best.priority))
      best = v
  const v = best ?? looks.variations.find((x) => x.condition === null) ?? null
  return v ? { key, variation: v } : null
}

/** The variation for a design event key directly (the designer's "Preview as"). */
export function looksFor(d: Design, key: EventKey): DesignVariation[] {
  if (d.kind !== 'alert') return []
  for (const k of fallbacks(key)) {
    const l = d.content.events[k]
    if (l) return l.variations
  }
  return []
}

/** core::design::allows_tts: the minimum applies to paid amounts only (money, Bits/KICKs). */
export function allowsTts(look: AlertLook, e: FerroEvent): boolean {
  const paid =
    e.kind.type === 'tip' || e.kind.type === 'paid_message' || e.kind.type === 'platform_gift'
  const a = paid ? amountOf(e, null) : null
  return look.tts.enabled && (a === null || a >= look.tts.min_amount)
}

export const HIGHLIGHT_VARS = [
  'name',
  'amount',
  'value',
  'count',
  'count_text',
  'viewers',
  'viewers_text',
  'reward',
] as const

/** Renders a look's template into highlighted runs for an event. */
export function textParts(src: string, e: FerroEvent): TextPart[] {
  try {
    return Template.parse(withPlurals(src)).renderParts(eventVars(e), HIGHLIGHT_VARS)
  } catch {
    return [{ text: src, hl: false }]
  }
}

const joinParts = (p: TextPart[]) => p.map((x) => x.text).join('')

/** core::design::render_onto */
export function renderOnto(
  alert: RenderedAlert,
  d: Design,
  key: EventKey,
  v: DesignVariation,
  e: FerroEvent,
): RenderedAlert {
  const look = v.look
  const title_parts = textParts(look.title, e)
  const body_parts = textParts(look.body, e)
  const user = (r: string | null) => (r && !r.startsWith('asset:') ? r : null)
  const view: AlertDesignView = {
    design_id: d.id,
    variation_id: v.id,
    event_key: key,
    branded: d.branded,
    look: structuredClone(look),
    title_parts,
    body_parts,
    intensity: intensityOf(e),
  }
  return {
    ...alert,
    title: joinParts(title_parts),
    body: joinParts(body_parts),
    image: look.media.kind === 'image' || look.media.kind === 'video' ? user(look.media.ref) : null,
    sound: user(look.sound.ref),
    volume: Math.min(Math.max(look.sound.volume, 0), 100),
    duration_ms: Math.min(Math.max(look.duration_ms, 1000), 60_000),
    layout: 'design',
    css: look.css,
    design: view,
  }
}

// ---------------------------------------------------------------------- branding

export const isBrandLayer = (l: Widget) => l.kind === 'layer' && l.config.type === 'brand'

/** Removes the Spark mark layers (and a widget design's mark) from a copy. */
export function stripBrand<T extends Design>(d: T): T {
  const c = structuredClone(d)
  if (c.kind === 'theme')
    for (const s of c.content.scenes) s.layers = s.layers.filter((l) => !isBrandLayer(l))
  if (c.kind === 'scene') c.content.layers = c.content.layers.filter((l) => !isBrandLayer(l))
  if (c.kind === 'widget') delete c.content.style.brand
  return c
}

/** core::design::Design::into_user: never built-in, branded or Pro; fresh id and times. */
export function intoUser<T extends Design>(
  d: T,
  id: string,
  origin: { type: OriginKind; from: string | null },
  now: number,
): T {
  const c = stripBrand(d)
  return {
    ...c,
    id,
    built_in: false,
    branded: false,
    pro: false,
    origin,
    created_at: now,
    updated_at: now,
    schema: 1,
  }
}

/** Library media ids a design uses (not bundled `asset:` files). */
export function designMediaIds(d: Design): string[] {
  const out: string[] = []
  const push = (r: unknown) => {
    if (typeof r === 'string' && r && !r.startsWith('asset:') && !out.includes(r)) out.push(r)
  }
  if (d.kind === 'alert')
    for (const l of Object.values(d.content.events))
      for (const v of l?.variations ?? []) {
        push(v.look.media.ref)
        push(v.look.sound.ref)
      }
  const layers =
    d.kind === 'theme'
      ? d.content.scenes.flatMap((s) => s.layers)
      : d.kind === 'scene'
        ? d.content.layers
        : []
  for (const l of layers) if (l.kind === 'layer' && l.config.type === 'image') push(l.config.media)
  return out
}

export function remapMedia<T extends Design>(d: T, map: Record<string, string>): T {
  const c = structuredClone(d)
  const swap = (r: string | null) => (r && map[r] ? map[r] : r)
  if (c.kind === 'alert')
    for (const l of Object.values(c.content.events))
      for (const v of l?.variations ?? []) {
        v.look.media.ref = swap(v.look.media.ref)
        v.look.sound.ref = swap(v.look.sound.ref)
      }
  const layers =
    c.kind === 'theme'
      ? c.content.scenes.flatMap((s) => s.layers)
      : c.kind === 'scene'
        ? c.content.layers
        : []
  for (const l of layers)
    if (l.kind === 'layer' && l.config.type === 'image') l.config.media = swap(l.config.media) ?? ''
  return c
}

// ---------------------------------------------------------------------- value checks

export function isColor(s: unknown): boolean {
  if (typeof s !== 'string') return false
  if (s === 'transparent') return true
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)
}

export function isMediaRef(s: unknown): boolean {
  if (typeof s !== 'string') return false
  if (s.startsWith('asset:')) {
    const p = s.slice(6)
    return (
      p.length > 0 &&
      p.length <= 200 &&
      /^[a-z0-9/_.-]+$/.test(p) &&
      !p.includes('..') &&
      !p.includes('//') &&
      !p.startsWith('/')
    )
  }
  return s.length > 0 && s.length <= 64 && /^[A-Za-z0-9]+$/.test(s)
}

export function isFontFamily(s: unknown): boolean {
  if (typeof s !== 'string') return false
  const n = Array.from(s).length
  return n >= 1 && n <= 60 && s.trim() === s && /^[\p{L}\p{N} -]+$/u.test(s) && !s.includes('  ')
}

const clip = (s: string) => Array.from(s).slice(0, 40).join('')

/** core::layer::normalize_css: comments removed, escapes decoded, lowercase. */
export function normalizeCss(css: string): string {
  // Comments are removed the way a browser reads them: a `/*` inside a quoted string is
  // text, not a comment, so `content:"/*"` can't hide a later `url(...)` from the check.
  let noComments = ''
  let quote: string | null = null
  for (let i = 0; i < css.length; i++) {
    const c = css[i] as string
    if (quote) {
      noComments += c
      if (c === '\\') noComments += css[++i] ?? ''
      else if (c === quote || c === '\n') quote = null
    } else if (c === '"' || c === "'") {
      quote = c
      noComments += c
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      i = end === -1 ? css.length : end + 1
    } else noComments += c
  }
  let out = ''
  for (let i = 0; i < noComments.length; i++) {
    const c = noComments[i] as string
    if (c !== '\\') {
      out += c
      continue
    }
    let hex = ''
    while (
      hex.length < 6 &&
      i + 1 < noComments.length &&
      /[0-9a-fA-F]/.test(noComments[i + 1] as string)
    )
      hex += noComments[++i]
    if (!hex) {
      const n = noComments[++i]
      if (n !== undefined && n !== '\n') out += n
      continue
    }
    if (/\s/.test(noComments[i + 1] ?? '')) i += 1
    const cp = parseInt(hex, 16)
    out += cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '\ufffd'
  }
  return out.toLowerCase()
}

export function checkCss(path: string, css: string): string | null {
  if (Array.from(css).length > MAX_CSS)
    return `${path}: custom CSS can be up to ${MAX_CSS} characters.`
  const lower = normalizeCss(css)
  if (lower.includes('@import')) return `${path}: @import isn't allowed; paste the CSS itself.`
  for (const bad of [
    'expression(',
    'javascript:',
    '-moz-binding',
    'behavior:',
    'image-set(',
    'src(',
  ])
    if (lower.includes(bad)) return `${path}: "${bad}" isn't allowed in custom CSS.`
  let rest = lower
  let at = rest.indexOf('url(')
  while (at >= 0) {
    const inner = rest
      .slice(at + 4)
      .trimStart()
      .replace(/^["']+/, '')
    if (!inner.startsWith('data:image/'))
      return `${path}: url() can only use data:image/… pictures; files from the internet aren't allowed.`
    rest = rest.slice(at + 4)
    at = rest.indexOf('url(')
  }
  return null
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const present = (o: Obj, k: string) => o[k] !== undefined && o[k] !== null

function optStr(o: Obj, path: string, key: string): string | null | { err: string } {
  if (!present(o, key)) return null
  return typeof o[key] === 'string' ? (o[key] as string) : { err: `${path}.${key}: must be text.` }
}
function numIn(o: Obj, path: string, key: string, lo: number, hi: number): string | null {
  if (!present(o, key)) return null
  const n = o[key]
  return typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi
    ? null
    : `${path}.${key}: must be a number from ${lo} to ${hi}.`
}
function oneOf(o: Obj, path: string, key: string, allowed: readonly string[]): string | null {
  const v = optStr(o, path, key)
  if (v === null) return null
  if (typeof v !== 'string') return v.err
  return allowed.includes(v)
    ? null
    : `${path}.${key}: "${clip(v)}" isn't one of ${allowed.join(', ')}.`
}
function optColor(o: Obj, path: string, key: string): string | null {
  const v = optStr(o, path, key)
  if (v === null) return null
  if (typeof v !== 'string') return v.err
  return isColor(v) ? null : `${path}.${key}: "${clip(v)}" isn't a colour; use #rrggbb.`
}
function optBool(o: Obj, path: string, key: string): string | null {
  return !present(o, key) || typeof o[key] === 'boolean'
    ? null
    : `${path}.${key}: must be true or false.`
}
function textLen(o: Obj, path: string, key: string, max: number): string | null {
  const v = optStr(o, path, key)
  if (v === null) return null
  if (typeof v !== 'string') return v.err
  return Array.from(v).length > max ? `${path}.${key}: can be up to ${max} characters.` : null
}
const first = (...checks: (string | null)[]) => checks.find((c) => c !== null) ?? null

/** A text layer's extra rotator lines: up to 8 lines of up to 80 characters. */
function rotateItems(o: Obj, path: string): string | null {
  if (!present(o, 'rotate')) return null
  const v = o.rotate
  if (!Array.isArray(v) || v.length > MAX_ROTATE_ITEMS)
    return `${path}.rotate: give up to ${MAX_ROTATE_ITEMS} lines to show in turn.`
  for (const [i, s] of v.entries())
    if (typeof s !== 'string' || Array.from(s).length > MAX_ROTATE_TEXT)
      return `${path}.rotate[${i}]: each line is text of up to ${MAX_ROTATE_TEXT} characters.`
  return null
}

/** core::layer::validate */
export function validateLayer(config: unknown): string | null {
  const path = 'config'
  if (!isObj(config)) return 'config: must be an object.'
  const t = optStr(config, path, 'type')
  if (t === null) return 'config.type: say which kind of layer this is.'
  if (typeof t !== 'string') return t.err
  if (!(LAYER_TYPES as readonly string[]).includes(t))
    return `config.type: "${clip(t)}" isn't one of ${LAYER_TYPES.join(', ')}.`
  let e: string | null
  switch (t) {
    case 'image': {
      const m = optStr(config, path, 'media')
      if (m === null) return 'config.media: pick a picture for this layer.'
      if (typeof m !== 'string') return m.err
      if (!isMediaRef(m)) return `config.media: "${clip(m)}" isn't a file from your media library.`
      e = first(
        oneOf(config, path, 'fit', ['cover', 'contain', 'fill']),
        numIn(config, path, 'radius', 0, 2000),
      )
      break
    }
    case 'text': {
      const f = optStr(config, path, 'font')
      if (f !== null && typeof f !== 'string') return f.err
      if (typeof f === 'string' && !isFontFamily(f))
        return `config.font: "${clip(f)}" isn't a font name (letters, digits, spaces and hyphens).`
      e = first(
        textLen(config, path, 'text', MAX_LAYER_TEXT),
        numIn(config, path, 'size', 6, 400),
        numIn(config, path, 'weight', 100, 900),
        optColor(config, path, 'color'),
        oneOf(config, path, 'align', ['left', 'center', 'right']),
        optBool(config, path, 'uppercase'),
        optBool(config, path, 'italic'),
        numIn(config, path, 'letter_spacing', -0.2, 1),
        oneOf(config, path, 'shadow', SHADOWS),
        numIn(config, path, 'outline', 0, 20),
        optColor(config, path, 'outline_color'),
        oneOf(config, path, 'effect', TEXT_EFFECTS),
        optColor(config, path, 'color2'),
        oneOf(config, path, 'split', ['letters', 'words']),
        rotateItems(config, path),
        numIn(config, path, 'rotate_s', 2, 60),
        numIn(config, path, 'countdown', 1, 86_400),
        textLen(config, path, 'countdown_done', MAX_ROTATE_TEXT),
        optBool(config, path, 'countdown_restart'),
        optBool(config, path, 'countdown_show'),
        optBool(config, path, 'countdown_up'),
        oneOf(config, path, 'countdown_look', COUNTDOWN_LOOKS),
      )
      break
    }
    case 'fx': {
      const p = optStr(config, path, 'preset')
      if (p === null) return 'config.preset: pick a motion background.'
      if (typeof p !== 'string') return p.err
      e = first(
        oneOf(config, path, 'preset', FX_PRESETS),
        ...['color', 'color2', 'background'].map((c) => optColor(config, path, c)),
        numIn(config, path, 'speed', 0.25, 3),
        numIn(config, path, 'density', 0.5, 2),
        optBool(config, path, 'reactive'),
      )
      break
    }
    case 'music': {
      const f = optStr(config, path, 'font')
      if (f !== null && typeof f !== 'string') return f.err
      if (typeof f === 'string' && !isFontFamily(f))
        return `config.font: "${clip(f)}" isn't a font name (letters, digits, spaces and hyphens).`
      e = first(
        oneOf(config, path, 'look', ['wave', 'pulse']),
        ...['color', 'color2', 'text_color', 'background'].map((c) => optColor(config, path, c)),
        numIn(config, path, 'title_size', 8, 160),
        optBool(config, path, 'show_title'),
        optBool(config, path, 'only_playing'),
      )
      break
    }
    case 'sound': {
      e = first(
        oneOf(config, path, 'on_show', STINGERS),
        oneOf(config, path, 'at_zero', STINGERS),
        oneOf(config, path, 'loop', SOUND_LOOPS),
        ...['on_show_media', 'loop_media'].map((k) => {
          const m = optStr(config, path, k)
          if (m === null) return null
          if (typeof m !== 'string') return m.err
          return isMediaRef(m)
            ? null
            : `config.${k}: "${clip(m)}" isn't a file from your media library.`
        }),
        optBool(config, path, 'last_ticks'),
        optBool(config, path, 'duck'),
        numIn(config, path, 'volume', 0, 1),
      )
      break
    }
    case 'shape':
      e = first(
        oneOf(config, path, 'shape', ['rect', 'ellipse', 'line', 'slant', 'triangle']),
        optColor(config, path, 'fill'),
        optColor(config, path, 'fill2'),
        numIn(config, path, 'angle', 0, 360),
        optColor(config, path, 'stroke'),
        numIn(config, path, 'stroke_width', 0, 50),
        numIn(config, path, 'radius', 0, 2000),
        oneOf(config, path, 'clip', SHAPE_CLIPS),
        oneOf(config, path, 'pattern', SHAPE_PATTERNS),
        numIn(config, path, 'pattern_scale', 0.25, 4),
        oneOf(config, path, 'shadow', SHADOWS),
      )
      break
    case 'frame':
    case 'webcam':
      e = first(
        oneOf(config, path, 'style', ['line', 'double', 'corners', 'notch', 'glow']),
        optColor(config, path, 'color'),
        optColor(config, path, 'accent'),
        numIn(config, path, 'thickness', 1, 40),
        numIn(config, path, 'radius', 0, 400),
        textLen(config, path, 'label', 40),
        oneOf(config, path, 'variant', FRAME_VARIANTS),
      )
      break
    default:
      e = first(
        oneOf(config, path, 'variant', ['mark', 'badge', 'watermark']),
        optColor(config, path, 'color'),
      )
  }
  if (e) return e
  if (present(config, 'anim')) {
    const a = config.anim
    if (!isObj(a)) return 'config.anim: must be an object.'
    e = first(
      oneOf(a, 'config.anim', 'in', ANIM_IN),
      numIn(a, 'config.anim', 'delay_ms', 0, 10_000),
      oneOf(a, 'config.anim', 'loop', LOOPS),
    )
    if (e) return e
  }
  const css = optStr(config, path, 'css')
  if (css !== null) {
    if (typeof css !== 'string') return css.err
    return checkCss('config.css', css)
  }
  return null
}

/** core::layer::validate_widget_style */
export function validateWidgetStyle(style: unknown, path = 'config.style'): string | null {
  if (!isObj(style)) return `${path}: must be an object.`
  const v = optStr(style, path, 'variant')
  if (v !== null) {
    if (typeof v !== 'string') return v.err
    if (v.length === 0 || v.length > 24 || !/^[a-z_]+$/.test(v))
      return `${path}.variant: use a short name in lowercase letters.`
  }
  const f = optStr(style, path, 'font')
  if (f !== null) {
    if (typeof f !== 'string') return f.err
    if (!isFontFamily(f))
      return `${path}.font: "${clip(f)}" isn't a font name (letters, digits, spaces and hyphens).`
  }
  return first(
    ...['text', 'accent', 'background', 'track', 'muted'].map((c) => optColor(style, path, c)),
    numIn(style, path, 'radius', 0, 64),
    numIn(style, path, 'font_size', 8, 120),
    optBool(style, path, 'uppercase'),
    oneOf(style, path, 'brand', BRAND_SPOTS),
  )
}

/** core::overlay::Overlay::validate, for a layout of widgets (a scene or an overlay). */
export function validateLayout(
  name: string,
  width: number,
  height: number,
  widgets: Widget[],
): string | null {
  const n = Array.from(name.trim()).length
  if (n === 0 || n > 60) return "the name can't be empty or longer than 60 characters"
  if (!(width >= 320 && width <= 7680 && height >= 180 && height <= 4320))
    return 'the canvas must be between 320×180 and 7680×4320'
  if (widgets.length > MAX_OVERLAY_WIDGETS)
    return `an overlay can hold at most ${MAX_OVERLAY_WIDGETS} widgets`
  const ids = new Set<string>()
  for (const w of widgets) {
    if (ids.has(w.id)) return `two widgets share the id '${w.id}'`
    ids.add(w.id)
    const fits =
      [w.x, w.y, w.w, w.h].every(Number.isInteger) &&
      w.w > 0 &&
      w.h > 0 &&
      w.x >= 0 &&
      w.y >= 0 &&
      w.x + w.w <= width &&
      w.y + w.h <= height
    if (!fits) return `widget '${w.id}' is outside the canvas or has no size`
    if (!isObj(w.config) || JSON.stringify(w.config).length > 64 * 1024)
      return `widget '${w.id}': settings must be an object under 64 KB`
    const rot = w.rotation ?? 0
    const op = w.opacity ?? 1
    if (!(
      Number.isFinite(rot) &&
      rot >= -360 &&
      rot <= 360 &&
      Number.isFinite(op) &&
      op >= 0 &&
      op <= 1
    ))
      return `widget '${w.id}': rotation must be -360 to 360 degrees and opacity 0 to 1`
    if (w.kind === 'layer') {
      const e = validateLayer(w.config)
      if (e) return `layer '${w.id}': ${e}`
    } else if (isObj(w.config) && 'style' in w.config && w.config.style !== undefined) {
      const e = validateWidgetStyle(w.config.style)
      if (e) return `widget '${w.id}': ${e}`
    }
  }
  return null
}

// ---------------------------------------------------------------------- design checks

const slug = (s: unknown, max: number): s is string =>
  typeof s === 'string' && s.length > 0 && s.length <= max && /^[A-Za-z0-9._-]+$/.test(s)

function within(path: string, v: number, lo: number, hi: number, unit = ''): string | null {
  return Number.isFinite(v) && v >= lo && v <= hi ? null : `${path}: must be ${lo} to ${hi}${unit}.`
}

function checkTemplate(path: string, src: string, max: number): string | null {
  if (Array.from(src).length > max) return `${path}: can be up to ${max} characters.`
  try {
    Template.parse(src)
    return null
  } catch (e) {
    return `${path}: ${e instanceof Error ? e.message : String(e)}.`
  }
}

function checkCondition(path: string, c: Condition, depth: number): string | null {
  if (depth > 4) return `${path}: conditions can be nested at most 4 deep.`
  switch (c.type) {
    case 'amount_at_least':
    case 'amount_below':
      if (!Number.isFinite(c.value) || c.value < 0 || c.value > 1e12)
        return `${path}.value: must be a number from 0 up.`
      if (c.currency !== null && !/^[A-Za-z]{3}$/.test(c.currency))
        return `${path}.currency: use a 3-letter currency code like INR.`
      return null
    case 'tier_at_least':
      return within(`${path}.tier`, c.tier, 1, 3)
    case 'months_at_least':
      return within(`${path}.months`, c.months, 0, 1200, ' months')
    case 'message_contains':
      return Array.from(c.text).length > 100 ? `${path}.text: can be up to 100 characters.` : null
    case 'all':
    case 'any':
      if (c.of.length === 0 || c.of.length > 10) return `${path}.of: combine 1 to 10 conditions.`
      for (const [i, x] of c.of.entries()) {
        const e = checkCondition(`${path}.of[${i}]`, x, depth + 1)
        if (e) return e
      }
      return null
    default:
      return null
  }
}

export function validateLook(path: string, l: AlertLook): string | null {
  const e = first(
    within(`${path}.media_size`, l.media_size, 24, 480, ' px'),
    (l.media.kind === 'image' || l.media.kind === 'video') && !l.media.ref
      ? `${path}.media.ref: pick the picture or video to show.`
      : null,
    l.media.ref !== null && !isMediaRef(l.media.ref)
      ? `${path}.media.ref: "${clip(l.media.ref)}" isn't a file from your media library.`
      : null,
    ...(['text_x', 'text_y', 'media_x', 'media_y'] as const).map((k) =>
      within(`${path}.offsets.${k}`, l.offsets[k], -400, 400, ' px'),
    ),
    checkTemplate(`${path}.title`, l.title, MAX_TITLE),
    checkTemplate(`${path}.body`, l.body, MAX_BODY),
    isFontFamily(l.font.family)
      ? null
      : `${path}.font.family: "${clip(l.font.family)}" isn't a font name (letters, digits, spaces and hyphens).`,
    within(`${path}.font.size`, l.font.size, 10, 160, ' px'),
    within(`${path}.font.weight`, l.font.weight, 100, 900),
    within(`${path}.font.letter_spacing`, l.font.letter_spacing, -0.2, 0.5),
    ...(['text', 'highlight', 'plate', 'accent', 'outline'] as const).map((k) =>
      isColor(l.colors[k])
        ? null
        : `${path}.colors.${k}: "${clip(String(l.colors[k]))}" isn't a colour; use #rrggbb.`,
    ),
    within(`${path}.outline`, l.outline, 0, 12),
    within(`${path}.anim.in_ms`, l.anim.in_ms, 0, 3000, ' ms'),
    within(`${path}.anim.out_ms`, l.anim.out_ms, 0, 3000, ' ms'),
    within(`${path}.anim.text_delay_ms`, l.anim.text_delay_ms, 0, 10_000, ' ms'),
    validateMotion(`${path}.motion`, l),
    l.sound.ref !== null && !isMediaRef(l.sound.ref)
      ? `${path}.sound.ref: "${clip(l.sound.ref)}" isn't a file from your media library.`
      : null,
    within(`${path}.sound.volume`, l.sound.volume, 0, 100),
    l.duration_ms < 1000 || l.duration_ms > 60_000
      ? `${path}.duration_ms: an alert stays 1 to 60 seconds.`
      : null,
    l.anim.in_ms + l.anim.out_ms >= l.duration_ms
      ? `${path}.duration_ms: leave time to read it between coming in and going out.`
      : null,
    !Number.isFinite(l.tts.min_amount) || l.tts.min_amount < 0 || l.tts.min_amount > 1e9
      ? `${path}.tts.min_amount: must be a number from 0 up.`
      : null,
    checkCss(`${path}.css`, l.css),
  )
  return e
}

/** core::design::Motion::validate (a look without motion reads as the defaults). */
function validateMotion(path: string, l: AlertLook): string | null {
  if (l.motion === undefined) return null
  if (l.motion === null || typeof l.motion !== 'object' || Array.isArray(l.motion))
    return `${path}: must be an object of motion settings.`
  const m = motionOf(l)
  const b = MOTION_BOUNDS
  const pick = (k: string, v: unknown, ok: readonly unknown[]) =>
    ok.includes(v) ? null : `${path}.${k}: "${clip(String(v))}" isn't one of ${ok.join(', ')}.`
  const bool = (k: keyof typeof m) =>
    typeof m[k] === 'boolean' ? null : `${path}.${k}: must be true or false.`
  return first(
    pick('idle', m.idle, IDLES),
    pick('particles', m.particles, PARTICLES),
    pick('colors', m.colors, PARTICLE_COLORS),
    pick('position', m.position, SPOTS),
    pick('direction', m.direction, DIRECTIONS),
    m.recipe === null ? null : pick('recipe', m.recipe, RECIPE_IDS),
    ...(
      ['shake', 'flash', 'vignette', 'zoom_punch', 'by_amount', 'impact_sounds', 'beat'] as const
    ).map(bool),
    isColor(m.custom_color)
      ? null
      : `${path}.custom_color: "${clip(String(m.custom_color))}" isn't a colour; use #rrggbb.`,
    within(`${path}.bounce`, m.bounce, 0, b.bounce),
    within(`${path}.speed`, m.speed, b.speed[0], b.speed[1], '%'),
    within(`${path}.stagger`, m.stagger, 0, b.stagger, ' ms'),
    within(`${path}.bpm`, m.bpm, b.bpm[0], b.bpm[1], ' BPM'),
  )
}

function validateScene(path: string, s: Scene): string | null {
  const custom = /^custom_\d{1,3}$/.test(s.key)
  if (!(SCENE_KEYS as readonly string[]).includes(s.key) && !custom)
    return `${path}.key: use one of ${SCENE_KEYS.join(', ')} (or custom_1 to custom_999).`
  const n = Array.from(s.name.trim()).length
  if (n === 0 || n > 40) return `${path}.name: give the scene a name of 1 to 40 characters.`
  if (s.background !== null && !isColor(s.background))
    return `${path}.background: "${clip(s.background)}" isn't a colour; use #rrggbb.`
  const e = validateLayout(s.name, s.width, s.height, s.layers)
  return e ? `${path}.layers: ${e}.` : null
}

/** core::design::Design::validate: the message (naming the field) or null when fine. */
export function validateDesign(d: Design): string | null {
  if (d.schema > DESIGN_SCHEMA)
    return `This design was made by a newer Ferrocast (design format ${d.schema}). Update Ferrocast, then try again.`
  if (!slug(d.id, 80)) return 'id: use letters, digits, dots, dashes or underscores (up to 80).'
  const n = Array.from(d.name.trim()).length
  if (n === 0 || n > MAX_DESIGN_NAME)
    return `name: give the design a name of 1 to ${MAX_DESIGN_NAME} characters.`
  if (Array.from(d.description).length > MAX_DESCRIPTION)
    return `description: can be up to ${MAX_DESCRIPTION} characters.`
  if (d.branded && !d.built_in) return 'branded: only built-in designs carry the Ferrocast mark.'
  const layers =
    d.kind === 'theme'
      ? d.content.scenes.flatMap((s) => s.layers)
      : d.kind === 'scene'
        ? d.content.layers
        : []
  if (!d.branded && layers.some(isBrandLayer))
    return 'content: the Ferrocast mark layer is only in built-in designs; remove it.'
  switch (d.kind) {
    case 'alert': {
      const entries = Object.entries(d.content.events) as [
        EventKey,
        { variations: DesignVariation[] },
      ][]
      if (entries.length === 0) return 'content.events: add a look for at least one event.'
      for (const [key, looks] of entries) {
        const base = `content.events.${key}`
        if (!EVENT_KEYS.includes(key)) return `${base}: that isn't an event Ferrocast alerts on.`
        if (looks.variations.length === 0 || looks.variations.length > MAX_VARIATIONS)
          return `${base}: needs 1 to ${MAX_VARIATIONS} looks.`
        if (looks.variations.filter((v) => v.condition === null).length !== 1)
          return `${base}: needs exactly one default look (a look without a condition).`
        const ids = new Set<string>()
        for (const [i, v] of looks.variations.entries()) {
          const p = `${base}.variations[${i}]`
          if (!slug(v.id, 64)) return `${p}.id: use letters, digits, dots, dashes or underscores.`
          if (ids.has(v.id)) return `${p}.id: two looks share the id "${v.id}".`
          ids.add(v.id)
          const vn = Array.from(v.name.trim()).length
          if (vn === 0 || vn > 40) return `${p}.name: give the look a name of 1 to 40 characters.`
          if (v.condition) {
            const e = checkCondition(`${p}.condition`, v.condition, 0)
            if (e) return e
          }
          const e = validateLook(`${p}.look`, v.look)
          if (e) return e
        }
      }
      return null
    }
    case 'theme': {
      const t = d.content
      if (t.scenes.length === 0 || t.scenes.length > MAX_SCENES)
        return `content.scenes: a theme has 1 to ${MAX_SCENES} scenes.`
      const keys = new Set<string>()
      for (const [i, s] of t.scenes.entries()) {
        if (keys.has(s.key)) return `content.scenes[${i}].key: two scenes are both "${s.key}".`
        keys.add(s.key)
        const e = validateScene(`content.scenes[${i}]`, s)
        if (e) return e
      }
      if (t.alert_design !== null && !slug(t.alert_design, 80))
        return "content.alert_design: that isn't a design id."
      return null
    }
    case 'scene':
      return validateScene('content', d.content)
    case 'widget': {
      const w = d.content
      if ((w.widget as string) === 'layer')
        return 'content.widget: a widget design styles a live widget, not a layer.'
      return first(
        within('content.w', w.w, 40, 1920, ' px'),
        within('content.h', w.h, 20, 1080, ' px'),
        !isObj(w.config) || 'style' in w.config
          ? "content.config: must be the widget's settings, without its style."
          : null,
        validateWidgetStyle(w.style, 'content.style'),
      )
    }
  }
}

// ---------------------------------------------------------------------- builders

/** A plain look to start a design from (the designer's "Start from scratch"). */
export function baseLook(over: Partial<AlertLook> = {}): AlertLook {
  return {
    frame: 'plate',
    layout: 'above',
    media: { kind: 'emblem', ref: null },
    media_size: 150,
    offsets: { text_x: 0, text_y: 0, media_x: 0, media_y: 0 },
    title: '{name} did something',
    body: '{message}',
    font: {
      family: 'Bricolage Grotesque',
      source: 'bundled',
      size: 42,
      weight: 800,
      uppercase: false,
      italic: false,
      letter_spacing: 0,
    },
    colors: {
      text: '#eef0f4',
      highlight: '#ffa424',
      plate: '#101216',
      accent: '#33d4ff',
      outline: '#07080a',
    },
    plate: true,
    shadow: 'soft',
    outline: 0,
    anim: { in: 'magnet', out: 'sink', text: 'wave', in_ms: 650, out_ms: 450, text_delay_ms: 300 },
    sound: { ref: null, builtin: 'chime', volume: 70 },
    duration_ms: 6000,
    tts: { enabled: false, min_amount: 0 },
    brand: 'corner',
    css: '',
    ...over,
  }
}

/** Default headline and message for each event, in the designer's words. */
export const EVENT_TEXT: Record<EventKey, { title: string; body: string }> = {
  follow: { title: '{name} just followed', body: 'Welcome in!' },
  sub: { title: '{name} subscribed', body: '{message}' },
  resub: { title: '{name} subscribed for {months_text}', body: '{message}' },
  gift: { title: '{name} gifted {count_text}', body: 'Thank you!' },
  member: { title: '{name} became a member', body: '{message}' },
  bits: { title: '{name} cheered {value}', body: '{message}' },
  kicks: { title: '{name} sent {value}', body: '{message}' },
  tip: { title: '{name} tipped {amount}', body: '{message}' },
  superchat: { title: '{name} sent {amount}', body: '{message}' },
  raid: { title: '{name} is raiding with {viewers_text}', body: 'Say hi to the raiders' },
  redeem: { title: '{name} redeemed {reward}', body: '{message}' },
}

/** Every event's default look from one base look (per-event text filled in). */
export function eventsFrom(
  base: AlertLook,
  perEvent: Partial<Record<EventKey, Partial<AlertLook>>> = {},
) {
  const events: Partial<Record<EventKey, { variations: DesignVariation[] }>> = {}
  for (const key of EVENT_KEYS) {
    const look: AlertLook = {
      ...structuredClone(base),
      ...EVENT_TEXT[key],
      ...(perEvent[key] ?? {}),
    }
    events[key] = {
      variations: [
        {
          id: `${key}-0`,
          name: `Every ${EVENT_LABEL[key].toLowerCase()}`,
          condition: null,
          priority: 0,
          look,
        },
      ],
    }
  }
  return events
}

/** A new design from scratch; each event starts with its suggested sound (owner, 20 Oct). */
export function newAlertDesign(name: string, base: AlertLook = baseLook()): Design {
  return withSuggestedSounds({
    schema: 1,
    id: 'new',
    kind: 'alert',
    name,
    description: '',
    tags: { style: 'bold', motion: 'smooth' },
    pro: false,
    built_in: false,
    branded: false,
    origin: { type: 'scratch', from: null },
    content: { events: eventsFrom(base) },
    created_at: 0,
    updated_at: 0,
  })
}

// ---------------------------------------------------------------------- previews

/** A worst-case viewer name for "Long name" previews. */
export const LONG_NAME = 'TheLegendaryChaiDrinker_9000xX'

/** core engine `set_amount`: puts an amount (major units) into a sample event. */
export function withAmount(e: FerroEvent, amount: number): FerroEvent {
  const c = structuredClone(e)
  const whole = Math.max(1, Math.round(amount))
  const k = c.kind
  switch (k.type) {
    case 'tip':
    case 'paid_message':
      k.money = {
        minor: Math.max(1, Math.round(amount * 10 ** exponent(k.money.currency))),
        currency: k.money.currency,
      }
      break
    case 'platform_gift':
      k.value = { ...k.value, amount: whole }
      break
    case 'gift_batch':
      k.count = whole
      break
    case 'raid':
      k.viewers = whole
      break
    case 'subscription':
      k.months = Math.min(whole, 1200)
      break
    default:
      break
  }
  return c
}

/** Whether a look key's events carry an amount the test bar can change. */
export function hasAmount(key: EventKey): boolean {
  return key !== 'follow' && key !== 'redeem' && key !== 'member' && key !== 'sub'
}

/** A sample event for a look key, as the designer previews and tests it. */
export function designSample(
  key: EventKey,
  opts: { amount?: number | null; longName?: boolean } = {},
): FerroEvent | null {
  const s = EVENT_SAMPLE[key]
  let e = s.platform ? sample(s.kind, s.platform) : anySample(s.kind)
  if (!e) return null
  if (s.months !== undefined && e.kind.type === 'subscription') e.kind.months = s.months
  if (opts.amount !== undefined && opts.amount !== null && opts.amount > 0)
    e = withAmount(e, opts.amount)
  if (opts.longName) {
    const k = e.kind as {
      actor?: { display_name: string }
      gifter?: { display_name: string }
      from?: { display_name: string }
    }
    const who = k.actor ?? k.gifter ?? k.from
    if (who) who.display_name = LONG_NAME
  }
  return e
}

/**
 * The alert a design shows for a look key, like the engine would render it. `variationId`
 * forces one look (the designer's variation tabs) instead of letting conditions pick.
 */
export function previewAlert(
  d: Design,
  key: EventKey,
  opts: {
    amount?: number | null
    longName?: boolean
    variationId?: string | null
    id?: string
  } = {},
): RenderedAlert | null {
  const e = designSample(key, opts)
  if (!e) return null
  const rules = defaultRules()
  const sel = select(rules, { ...e, origin: 'test' })
  const rule = sel?.rule ?? rules[0]
  const variation = sel?.variation ?? rule?.variations[0]
  if (!rule || !variation) return null
  const base = render(opts.id ?? `preview-${key}`, rule, variation, e)
  const forced = opts.variationId
    ? looksFor(d, key).find((v) => v.id === opts.variationId)
    : undefined
  if (forced) return renderOnto(base, d, key, forced, e)
  const picked = pickLook(d, e)
  return picked ? renderOnto(base, d, picked.key, picked.variation, e) : base
}
