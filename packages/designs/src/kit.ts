// Helpers for writing built-in designs. One design per file, each a plain `Design` value
// (API.md §4 Designs); these only remove repetition. See docs/CONTRIBUTING-designs.md.

import {
  EVENT_KEYS,
  EVENT_LABEL,
  EVENT_TEXT,
  baseLook,
  type AlertLook,
  type Condition,
  type Design,
  type DesignVariation,
  type EventKey,
  type LayerConfig,
  type MotionTag,
  type Scene,
  type StyleTag,
  type Widget,
  type WidgetKind,
  type WidgetStyle,
} from '@ferrocast/api'

export interface Meta {
  /** The part after `builtin.`: lowercase letters, digits and dashes. */
  slug: string
  name: string
  description: string
  style: StyleTag
  motion: MotionTag
}

function base(meta: Meta) {
  return {
    schema: 1 as const,
    id: `builtin.${meta.slug}`,
    name: meta.name,
    description: meta.description,
    tags: { style: meta.style, motion: meta.motion },
    // Every built-in design is free; the field stays because API.md's Design has it.
    pro: false,
    built_in: true,
    branded: true,
    origin: { type: 'built_in' as const, from: null },
    created_at: 0,
    updated_at: 0,
  }
}

/** A look change for a few events only (a different headline for raids, say). */
export type PerEvent = Partial<Record<EventKey, Partial<AlertLook>>>

/** An extra look for an event that plays when its condition matches (a bigger tip look). */
export interface Extra {
  event: EventKey
  id: string
  name: string
  condition: Condition
  priority?: number
  look: Partial<AlertLook>
}

/**
 * An alert design: one base look, every event filled in with its own words, optional
 * per-event changes, and extra conditional looks.
 */
export function alertDesign(
  meta: Meta,
  look: Partial<AlertLook>,
  perEvent: PerEvent = {},
  extras: Extra[] = [],
): Design {
  const root = baseLook(look)
  const events: Partial<Record<EventKey, { variations: DesignVariation[] }>> = {}
  for (const key of EVENT_KEYS) {
    const own: AlertLook = {
      ...structuredClone(root),
      ...EVENT_TEXT[key],
      ...(perEvent[key] ?? {}),
    }
    const variations: DesignVariation[] = [
      {
        id: `${key}-0`,
        name: `Every ${EVENT_LABEL[key].toLowerCase()}`,
        condition: null,
        priority: 0,
        look: scopedLook(own),
      },
    ]
    for (const x of extras.filter((e) => e.event === key))
      variations.push({
        id: x.id,
        name: x.name,
        condition: x.condition,
        priority: x.priority ?? 10,
        look: scopedLook({ ...structuredClone(own), ...x.look }),
      })
    events[key] = { variations }
  }
  return { ...base(meta), kind: 'alert', content: { events } }
}

/** The look with its CSS tied to its own frame (see `scopeCss`). */
function scopedLook(l: AlertLook): AlertLook {
  return { ...l, css: scopeCss(l.css, l.frame) }
}

/** Splits a selector list on its top-level commas (not the ones inside `:is(…)`). */
function selectors(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i))
      start = i + 1
    }
  }
  out.push(list.slice(start))
  return out.map((x) => x.trim()).filter(Boolean)
}

function scopeSelector(sel: string, scope: string): string {
  // The stage's own decorations (petals, sparks around the card) suit every frame.
  if (sel.startsWith('.fa-stage') || sel.startsWith(':host')) return sel
  // The card itself: `.fa`, `.fa.lay-over`, `.fa::before`…
  if (/^\.fa(?![\w-])/.test(sel)) return `.fa${scope}${sel.slice(3)}`
  // A class the card carries (`.f-plate .fa-text`, `.plate .fa-text`, `.up .fa-title`).
  const own = /^\.(?:f-[a-z]+|lay-[a-z]+|plate|up|it)(?![\w-])/.exec(sel)
  if (own) return `${own[0]}${scope}${sel.slice(own[0].length)}`
  // Anything inside the card.
  return `${scope} ${sel}`
}

/**
 * Ties a built-in look's CSS to the frame it was drawn for. The CSS fine-tunes one frame (a
 * negative margin, a star-shaped art, art that sits over the card's edge); on another frame
 * it drew broken alerts (Sakura petal on Pixel arcade). Scoped, another frame shows its own
 * clean look with the design's colours, font, motion and sound. The layout isn't part of
 * the scope: designs without a frame draw their card in CSS and must keep it on every
 * layout, and the layouts' base rules win where it matters (Text over keeps the art under
 * the words). `:where()` adds no specificity, so on its own frame the design looks exactly
 * as before. The stage's decorations and `@keyframes` stay as they are.
 */
export function scopeCss(src: string, frame: string): string {
  const scope = `:where(.f-${frame})`
  let out = ''
  let i = 0
  while (i < src.length) {
    const open = src.indexOf('{', i)
    if (open < 0) {
      out += src.slice(i)
      break
    }
    let depth = 0
    let end = open
    for (; end < src.length; end++) {
      if (src[end] === '{') depth++
      else if (src[end] === '}' && --depth === 0) break
    }
    const prelude = src.slice(i, open).trim()
    const block = src.slice(open, end + 1)
    out += prelude.startsWith('@')
      ? `${prelude}${block}`
      : `${selectors(prelude)
          .map((s) => scopeSelector(s, scope))
          .join(',')}${block}`
    i = end + 1
  }
  return out
}

export type Box = readonly [x: number, y: number, w: number, h: number]

/** A static layer (image, text, shape, frame, webcam frame or the brand mark). */
export function layer(
  id: string,
  [x, y, w, h]: Box,
  config: LayerConfig,
  extra: Partial<Widget> = {},
): Widget {
  const r = Math.round
  return { id, kind: 'layer', x: r(x), y: r(y), w: r(w), h: r(h), config, ...extra } as Widget
}

/** A live widget placed in a scene (alert box, goal, label, event list, chat…). */
export function widget(
  id: string,
  kind: Exclude<WidgetKind, 'layer'>,
  [x, y, w, h]: Box,
  config: Record<string, unknown>,
): Widget {
  const r = Math.round
  return { id, kind, x: r(x), y: r(y), w: r(w), h: r(h), config } as unknown as Widget
}

export const text = (
  id: string,
  box: Box,
  cfg: Omit<Extract<LayerConfig, { type: 'text' }>, 'type'>,
  extra: Partial<Widget> = {},
) => layer(id, box, { type: 'text', ...cfg }, extra)
export const shape = (
  id: string,
  box: Box,
  cfg: Omit<Extract<LayerConfig, { type: 'shape' }>, 'type'>,
  extra: Partial<Widget> = {},
) => layer(id, box, { type: 'shape', ...cfg }, extra)
export const frame = (
  id: string,
  box: Box,
  cfg: Omit<Extract<LayerConfig, { type: 'frame' | 'webcam' }>, 'type'>,
) => layer(id, box, { type: 'frame', ...cfg })
export const webcam = (
  id: string,
  box: Box,
  cfg: Omit<Extract<LayerConfig, { type: 'frame' | 'webcam' }>, 'type'>,
) => layer(id, box, { type: 'webcam', ...cfg })
/** The small Spark mark every built-in scene carries, placed so it looks part of the design. */
export const brand = (box: Box, variant: 'mark' | 'badge' | 'watermark', color?: string) =>
  layer(
    'ferrocast-mark',
    box,
    color ? { type: 'brand', variant, color } : { type: 'brand', variant },
  )

export function scene(
  key: Scene['key'],
  name: string,
  layers: Widget[],
  background: string | null = null,
): Scene {
  return { key, name, width: 1920, height: 1080, background, layers }
}

export function themeDesign(meta: Meta, scenes: Scene[], alertDesign: string | null): Design {
  return { ...base(meta), kind: 'theme', content: { scenes, alert_design: alertDesign } }
}

type ShapeCfg = Omit<Extract<LayerConfig, { type: 'shape' }>, 'type'>
type TextCfg = Omit<Extract<LayerConfig, { type: 'text' }>, 'type'>

/** An entrance (and optional gentle loop) for a layer. */
export const enter = (
  how: NonNullable<LayerConfig['anim']>['in'],
  delay_ms = 0,
  loop: NonNullable<LayerConfig['anim']>['loop'] = 'none',
) => ({ anim: { in: how, delay_ms, loop } })

/** A shape cut to a silhouette (chevron, ticket, star, flame…). */
export const cut = (
  id: string,
  box: Box,
  clip: NonNullable<ShapeCfg['clip']>,
  cfg: Omit<ShapeCfg, 'clip'>,
  extra: Partial<Widget> = {},
) => shape(id, box, { shape: 'rect', clip, ...cfg }, extra)

/**
 * A decorative fill: `fill` draws the pattern over `ground` (or see-through). With
 * `moving`, particles drift and tiles roll (a loop: off in low motion, paused when hidden).
 */
export const pattern = (
  id: string,
  box: Box,
  kind: NonNullable<ShapeCfg['pattern']>,
  fill: string,
  opts: {
    ground?: string
    scale?: number
    moving?: boolean
    clip?: ShapeCfg['clip']
    radius?: number
    delay?: number
  } = {},
  extra: Partial<Widget> = {},
) =>
  shape(
    id,
    box,
    {
      shape: 'rect',
      pattern: kind,
      fill,
      ...(opts.ground ? { fill2: opts.ground } : {}),
      ...(opts.scale ? { pattern_scale: opts.scale } : {}),
      ...(opts.clip ? { clip: opts.clip } : {}),
      ...(opts.radius ? { radius: opts.radius } : {}),
      ...(opts.moving || opts.delay
        ? enter('fade', opts.delay ?? 0, opts.moving ? 'float' : 'none')
        : {}),
    },
    extra,
  )

/** Social handles (or any lines) shown in turn. */
export const rotator = (
  id: string,
  box: Box,
  lines: readonly [string, ...string[]],
  cfg: Omit<TextCfg, 'text' | 'rotate'>,
  every = 5,
) =>
  text(id, box, {
    text: lines[0],
    rotate: lines.slice(1),
    rotate_s: every,
    ...cfg,
  })

/** A countdown from `seconds` once the scene shows; `{time}` in the words becomes m:ss. */
export const countdown = (
  id: string,
  box: Box,
  seconds: number,
  words: string,
  cfg: Omit<TextCfg, 'text' | 'countdown'>,
  done?: string,
) =>
  text(id, box, {
    text: words,
    countdown: seconds,
    ...(done ? { countdown_done: done } : {}),
    ...cfg,
  })

/**
 * A small standalone scene (a rotator, a timer, a now-playing card): its own canvas, added
 * as its own browser source. One `brand(...)` layer, like every built-in scene.
 */
export function sceneDesign(
  meta: Meta,
  name: string,
  size: { w: number; h: number },
  layers: Widget[],
): Design {
  return {
    ...base(meta),
    kind: 'scene',
    content: {
      key: 'custom_1',
      name,
      width: size.w,
      height: size.h,
      background: null,
      layers,
    },
  }
}

export function widgetDesign(
  meta: Meta,
  kind: Exclude<WidgetKind, 'layer'>,
  size: { w: number; h: number },
  config: Record<string, unknown>,
  style: WidgetStyle,
): Design {
  return {
    ...base(meta),
    kind: 'widget',
    content: { widget: kind, w: size.w, h: size.h, config, style },
  }
}

/** Live widget settings the scenes share. */
export const live = {
  alerts: { theme: 'molten', rule_ids: null },
  goal: (style?: WidgetStyle) => ({ goal_id: '', theme: 'molten', ...(style ? { style } : {}) }),
  label: (source: string, template: string, style?: WidgetStyle) => ({
    source,
    template,
    theme: 'molten',
    ...(style ? { style } : {}),
  }),
  events: (style?: WidgetStyle) => ({
    kinds: ['follow', 'subscription', 'gift_batch', 'platform_gift', 'paid_message', 'tip', 'raid'],
    max_items: 5,
    theme: 'molten',
    ...(style ? { style } : {}),
  }),
  chat: (style?: WidgetStyle) => ({
    platforms: [],
    max_messages: 30,
    fade_after_s: null,
    show_badges: true,
    show_platform: true,
    hide_commands: true,
    hide_bots: true,
    font_size: 22,
    theme: 'molten',
    ...(style ? { style } : {}),
  }),
}

// ---------------------------------------------------------------------- more library helpers

type FrameCfg = Omit<Extract<LayerConfig, { type: 'frame' | 'webcam' }>, 'type'>

/** A plain shape layer (rect, ellipse, line, slant, triangle) with the usual options. */
export const box = (id: string, b: Box, cfg: ShapeCfg, w: Partial<Widget> = {}) =>
  shape(id, b, cfg, w)

/** A frame with a richer variant (HUD, sketch, gold…). */
export const fancyFrame = (
  id: string,
  b: Box,
  variant: NonNullable<FrameCfg['variant']>,
  cfg: Omit<FrameCfg, 'variant'>,
) => layer(id, b, { type: 'frame', style: 'line', ...cfg, variant })

/** A webcam frame, optionally with a richer variant. */
export const cam = (
  id: string,
  b: Box,
  variant: NonNullable<FrameCfg['variant']> | null,
  cfg: Omit<FrameCfg, 'variant'>,
) => layer(id, b, { type: 'webcam', style: 'line', ...cfg, ...(variant ? { variant } : {}) })

const BUNDLED_FAMILIES = ['Bricolage Grotesque', 'Hanken Grotesk', 'JetBrains Mono']

/** A font for alert looks (bundled families say so; the rest are Google Fonts we ship). */
export const font = (
  family: string,
  size: number,
  weight = 800,
  opts: { uppercase?: boolean; italic?: boolean; letter_spacing?: number } = {},
): AlertLook['font'] => ({
  family,
  source: BUNDLED_FAMILIES.includes(family) ? 'bundled' : 'google',
  size,
  weight,
  uppercase: opts.uppercase ?? false,
  italic: opts.italic ?? false,
  letter_spacing: opts.letter_spacing ?? 0,
})

/** Alert colours: text, highlight (names and amounts), plate, accent, outline. */
export const colors = (
  text: string,
  highlight: string,
  plate: string,
  accent: string,
  outline = '#07080a',
): AlertLook['colors'] => ({ text, highlight, plate, accent, outline })

/** Alert motion: entrance, exit, headline animation and timings. */
export const motion = (
  inn: AlertLook['anim']['in'],
  out: AlertLook['anim']['out'],
  textAnim: AlertLook['anim']['text'],
  in_ms = 600,
  out_ms = 450,
  text_delay_ms = 250,
): AlertLook['anim'] => ({ in: inn, out, text: textAnim, in_ms, out_ms, text_delay_ms })

/** Joins CSS and squeezes whitespace, so catalogue entries stay small. */
export const css = (...parts: string[]) =>
  parts
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim()

/**
 * A background with a hole where the camera goes: up to four rectangles around `hole`.
 * The overlay sits above the camera in OBS, so nothing opaque may cover a webcam frame.
 */
export function surround(
  id: string,
  hole: Box,
  cfg: ShapeCfg,
  canvas = { w: 1920, h: 1080 },
): Widget[] {
  const [x, y, w, h] = hole
  const parts: [string, Box][] = [
    ['t', [0, 0, canvas.w, y]],
    ['b', [0, y + h, canvas.w, canvas.h - y - h]],
    ['l', [0, y, x, h]],
    ['r', [x + w, y, canvas.w - x - w, h]],
  ]
  return parts
    .filter(([, b]) => b[2] > 0 && b[3] > 0)
    .map(([k, b]) => shape(`${id}-${k}`, b, { shape: 'rect', ...cfg }))
}

/** A see-through mat around a camera: a thick border only, the middle stays clear. */
export const mat = (id: string, hole: Box, color: string, width: number, radius = 0) => {
  const [x, y, w, h] = hole
  return shape(id, [x - width, y - width, w + width * 2, h + width * 2], {
    shape: 'rect',
    stroke: color,
    stroke_width: width,
    radius,
  })
}

// ---------------------------------------------------------------- motion, music and sound (25 Oct)

type FxCfg = Omit<Extract<LayerConfig, { type: 'fx' }>, 'type'>
type MusicCfg = Omit<Extract<LayerConfig, { type: 'music' }>, 'type'>
type SoundCfg = Omit<Extract<LayerConfig, { type: 'sound' }>, 'type'>

/** A motion background: a game world or motion loop drawn live (moves with the music when reactive). */
export const fx = (id: string, b: Box, cfg: FxCfg, extra: Partial<Widget> = {}) =>
  layer(id, b, { type: 'fx', ...cfg }, extra)

/** The wave player or the heartbeat line with the song; shown only while music plays. */
export const musicPiece = (id: string, b: Box, cfg: MusicCfg) =>
  layer(id, b, { type: 'music', ...cfg })

/** The sound element: heard, not seen, so it sits in a corner at its smallest. */
export const sound = (id: string, cfg: SoundCfg) =>
  layer(id, [0, 0, 8, 8], { type: 'sound', ...cfg })
