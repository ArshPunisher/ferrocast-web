import { HttpError } from '../http-error'
import type {
  BudgetSource,
  BudgetStatus,
  Canvas,
  CappedInfo,
  CustomQuality,
  CustomQualityLimits,
  DestinationConfig,
  DestinationQuality,
  DestinationQualityOptions,
  DirectKind,
  EncodeBudgetCheck,
  EncodeGroupView,
  GoLiveQualityOptionsResponse,
  PasteBrand,
  QualityCanvasSummary,
  QualityOption,
  QualitySource,
  ResolvedQuality,
  Service,
  VideoCodec,
} from '../../golive'

export interface StudioStreamProfile {
  width: number
  height: number
  fps: number
  kbps: number
  codec: VideoCodec
  audio_kbps: number
  vbr: boolean
  keyframe_s: number
  b_frames: number
}

export interface DemoEncodeBudgetConfig {
  source?: BudgetSource
  limit_mpx_s?: number | null
  max_sessions?: number | null
  note?: string | null
}

export interface PlatformLimit {
  label: string
  maxLongEdge: number | null
  maxShortEdge: number | null
  maxFps: number | null
  recLongEdge: number | null
  recShortEdge: number | null
  recFps: number | null
  maxKbps: number
  recKbps: number
  codecs: VideoCodec[]
  strictCbr: boolean
  maxAudioKbps: number
  maxKeyint: number
  facebookMatrix?: boolean
}

const VALID_CODECS: VideoCodec[] = ['h264', 'hevc', 'av1', 'vp9']
const ALLOWED_QUALITY_KEYS = new Set(['mode', 'width', 'height', 'fps', 'kbps', 'codec'])

const TWITCH_LIMIT: PlatformLimit = {
  label: 'Twitch',
  maxLongEdge: null,
  maxShortEdge: null,
  maxFps: null,
  recLongEdge: 1920,
  recShortEdge: 1080,
  recFps: 60,
  maxKbps: 6000,
  recKbps: 6000,
  codecs: ['h264'],
  strictCbr: true,
  maxAudioKbps: 320,
  maxKeyint: 2,
}

const KICK_LIMIT: PlatformLimit = {
  label: 'Kick',
  maxLongEdge: 1920,
  maxShortEdge: 1080,
  maxFps: 60,
  recLongEdge: 1920,
  recShortEdge: 1080,
  recFps: 60,
  maxKbps: 8000,
  recKbps: 8000,
  codecs: ['h264'],
  strictCbr: true,
  maxAudioKbps: 320,
  maxKeyint: 2,
}

const YOUTUBE_LIMIT: PlatformLimit = {
  label: 'YouTube',
  maxLongEdge: 3840,
  maxShortEdge: 2160,
  maxFps: 60,
  recLongEdge: 3840,
  recShortEdge: 2160,
  recFps: 60,
  maxKbps: 51000,
  recKbps: 51000,
  codecs: ['h264', 'hevc', 'av1'],
  strictCbr: false,
  maxAudioKbps: 160,
  maxKeyint: 4,
}

const YOUTUBE_VERTICAL_LIMIT: PlatformLimit = {
  label: 'YouTube Shorts',
  maxLongEdge: 1920,
  maxShortEdge: 1080,
  maxFps: 60,
  recLongEdge: 1920,
  recShortEdge: 1080,
  recFps: 60,
  maxKbps: 15000,
  recKbps: 15000,
  codecs: ['h264', 'hevc', 'av1'],
  strictCbr: false,
  maxAudioKbps: 160,
  maxKeyint: 4,
}

const FACEBOOK_LIMIT: PlatformLimit = {
  label: 'Facebook',
  maxLongEdge: 1920,
  maxShortEdge: 1080,
  maxFps: 60,
  recLongEdge: 1920,
  recShortEdge: 1080,
  recFps: 60,
  maxKbps: 9000,
  recKbps: 6000,
  codecs: ['h264'],
  strictCbr: true,
  maxAudioKbps: 128,
  maxKeyint: 2,
  facebookMatrix: true,
}

const X_LIMIT: PlatformLimit = {
  label: 'X',
  maxLongEdge: 1920,
  maxShortEdge: 1080,
  maxFps: 60,
  recLongEdge: 1920,
  recShortEdge: 1080,
  recFps: 60,
  maxKbps: 12000,
  recKbps: 9000,
  codecs: ['h264'],
  strictCbr: false,
  maxAudioKbps: 128,
  maxKeyint: 3,
}

const INSTAGRAM_LIMIT: PlatformLimit = {
  label: 'Instagram',
  maxLongEdge: 1280,
  maxShortEdge: 720,
  maxFps: 30,
  recLongEdge: 1280,
  recShortEdge: 720,
  recFps: 30,
  maxKbps: 4000,
  recKbps: 3500,
  codecs: ['h264'],
  strictCbr: true,
  maxAudioKbps: 128,
  maxKeyint: 2,
}

const GENERIC_LIMIT: PlatformLimit = {
  label: 'Custom',
  maxLongEdge: null,
  maxShortEdge: null,
  maxFps: null,
  recLongEdge: null,
  recShortEdge: null,
  recFps: null,
  maxKbps: 60000,
  recKbps: 60000,
  codecs: ['h264', 'hevc', 'av1'],
  strictCbr: false,
  maxAudioKbps: 320,
  maxKeyint: 4,
}

export function brandToLimit(brand?: PasteBrand): PlatformLimit | null {
  if (brand === 'facebook') return FACEBOOK_LIMIT
  if (brand === 'x') return X_LIMIT
  if (brand === 'instagram') return INSTAGRAM_LIMIT
  return null
}

export function platformLimitFor(kind: Service, canvas: Canvas, brand?: PasteBrand): PlatformLimit {
  if (kind === 'twitch') return TWITCH_LIMIT
  if (kind === 'kick') return KICK_LIMIT
  if (kind === 'youtube') return canvas === 'vertical' ? YOUTUBE_VERTICAL_LIMIT : YOUTUBE_LIMIT
  return brandToLimit(brand) ?? GENERIC_LIMIT
}

export function facebookMatrixMaxKbps(width: number, height: number, fps: number): number {
  const shortEdge = Math.min(width, height)
  const highFps = fps > 30
  if (shortEdge >= 1080) return highFps ? 9000 : 6000
  if (shortEdge >= 720) return highFps ? 6000 : 4000
  if (shortEdge >= 480) return highFps ? 3000 : 2000
  return highFps ? 1500 : 1000
}

export function fitDimensions(
  srcW: number,
  srcH: number,
  maxLong: number | null,
  maxShort: number | null,
): [number, number] {
  if (maxLong == null || maxShort == null) return [srcW, srcH]
  const long = Math.max(srcW, srcH)
  const short = Math.min(srcW, srcH)
  if (long <= maxLong && short <= maxShort) return [srcW, srcH]
  const scale = Math.min(maxLong / long, maxShort / short)
  const roundEven = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2)
  return [roundEven(srcW), roundEven(srcH)]
}

export function largestFpsDivisor(srcFps: number, maxFps: number | null): number {
  if (maxFps == null || srcFps <= maxFps) return srcFps
  for (let d = maxFps; d >= 1; d--) {
    if (srcFps % d === 0) return d
  }
  return maxFps
}

function softLimitNote(
  limit: PlatformLimit,
  width: number,
  height: number,
  fps: number,
): string | null {
  const recLong = limit.recLongEdge
  const recShort = limit.recShortEdge
  const overRes =
    recLong != null &&
    recShort != null &&
    (Math.max(width, height) > recLong || Math.min(width, height) > recShort)
  const overFps = limit.recFps != null && fps > limit.recFps
  if (overRes && recShort != null) {
    return `Above ${limit.label}'s recommended ${recShort}p`
  }
  if (overFps && limit.recFps != null) {
    return `Above ${limit.label}'s recommended ${limit.recFps} fps`
  }
  return null
}

function effectiveMaxKbps(
  limit: PlatformLimit,
  width: number,
  height: number,
  fps: number,
): number {
  if (limit.facebookMatrix) return facebookMatrixMaxKbps(width, height, fps)
  return limit.maxKbps
}

function fitToLimit(
  src: { width: number; height: number; fps: number; kbps: number; codec: VideoCodec },
  limit: PlatformLimit,
  hostCodecs: VideoCodec[],
  ignoreLimits: boolean,
): {
  width: number
  height: number
  fps: number
  kbps: number
  codec: VideoCodec
  autoFitted: boolean
  note: string | null
} {
  if (ignoreLimits) {
    const codec = hostCodecs.includes(src.codec) ? src.codec : (hostCodecs[0] ?? 'h264')
    return {
      width: src.width,
      height: src.height,
      fps: src.fps,
      kbps: src.kbps,
      codec,
      autoFitted: codec !== src.codec,
      note: null,
    }
  }
  const [width, height] = fitDimensions(
    src.width,
    src.height,
    limit.maxLongEdge,
    limit.maxShortEdge,
  )
  const fps = largestFpsDivisor(src.fps, limit.maxFps)
  const maxKbps = effectiveMaxKbps(limit, width, height, fps)
  const kbps = Math.min(src.kbps, maxKbps)
  const allowedCodecs = limit.codecs.filter((c) => hostCodecs.includes(c))
  const codec = allowedCodecs.includes(src.codec) ? src.codec : (allowedCodecs[0] ?? 'h264')
  const autoFitted =
    width !== src.width ||
    height !== src.height ||
    fps !== src.fps ||
    kbps !== src.kbps ||
    codec !== src.codec
  const note = softLimitNote(limit, width, height, fps)
  return { width, height, fps, kbps, codec, autoFitted, note }
}

export function legacyLightCustomQuality(canvas: StudioStreamProfile): CustomQuality {
  const [width, height] = fitDimensions(canvas.width, canvas.height, 1280, 720)
  return {
    width,
    height,
    fps: largestFpsDivisor(canvas.fps, 30),
    kbps: Math.max(500, Math.min(canvas.kbps, 3000)),
    codec: 'h264',
  }
}

export interface DestPlanMeta {
  cfg: DestinationConfig
  name: string
  direct: DirectKind | null
  blocked: boolean
  standby: boolean
}

export function lockedReasonFor(
  d: DestPlanMeta,
  source: QualitySource,
  cutWanted: boolean,
): string | null {
  if (d.direct) {
    return d.direct === 'whip'
      ? 'WHIP always follows your main picture.'
      : 'Direct streams always follow your main picture.'
  }
  const canvas = d.cfg.canvas ?? 'main'
  if (d.cfg.kind === 'twitch' && d.cfg.enhanced && canvas === 'main') {
    return 'Managed by Twitch Enhanced Broadcasting.'
  }
  if (canvas === 'vertical' && cutWanted) {
    return 'Vertical cut copies your main picture.'
  }
  if (source === 'obs') {
    return 'OBS sends one shared stream. Switch to Studio for per-platform quality.'
  }
  return null
}

export function validateQualityInput(
  body: unknown,
  dest: DestPlanMeta,
  canvas: StudioStreamProfile,
  opts: {
    lockedReason: string | null
    source: QualitySource
    hostCodecs: VideoCodec[]
    ignoreLimits: boolean
  },
): DestinationQuality {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'invalid', 'Send { mode: "same_as_main" | "custom", ... }.')
  }
  const rec = body as Record<string, unknown>
  for (const key of Object.keys(rec)) {
    if (!ALLOWED_QUALITY_KEYS.has(key)) {
      throw new HttpError(400, 'invalid', `Unknown field "${key}" in quality request.`)
    }
  }
  const mode = rec.mode
  if (mode === 'same_as_main') {
    for (const k of ['width', 'height', 'fps', 'kbps', 'codec'] as const) {
      if (rec[k] !== undefined && rec[k] !== null) {
        throw new HttpError(
          400,
          'invalid',
          'same_as_main cannot include width, height, fps, kbps, or codec.',
        )
      }
    }
    return { mode: 'same_as_main' }
  }
  if (mode !== 'custom') {
    throw new HttpError(400, 'invalid', 'mode must be "same_as_main" or "custom".')
  }
  if (opts.lockedReason && opts.source !== 'obs') {
    throw new HttpError(400, 'invalid', opts.lockedReason)
  }

  const width = rec.width
  const height = rec.height
  const fps = rec.fps
  const kbps = rec.kbps
  const rawCodec = rec.codec
  if (
    typeof width !== 'number' ||
    !Number.isInteger(width) ||
    typeof height !== 'number' ||
    !Number.isInteger(height) ||
    typeof fps !== 'number' ||
    !Number.isInteger(fps) ||
    typeof kbps !== 'number' ||
    !Number.isInteger(kbps)
  ) {
    throw new HttpError(
      400,
      'invalid',
      'Custom quality requires integer width, height, fps, and kbps.',
    )
  }
  if (width < 160 || height < 90 || width % 2 !== 0 || height % 2 !== 0) {
    throw new HttpError(400, 'invalid', 'Resolution must be at least 160x90 and use even numbers.')
  }
  if (width > canvas.width || height > canvas.height) {
    throw new HttpError(
      400,
      'invalid',
      `Resolution ${width}x${height} cannot upscale above ${canvas.width}x${canvas.height}.`,
    )
  }
  if (fps <= 0 || canvas.fps % fps !== 0) {
    throw new HttpError(
      400,
      'invalid',
      `Frame rate ${fps} fps must divide main ${canvas.fps} fps cleanly.`,
    )
  }
  if (kbps < 500 || kbps > 60000) {
    throw new HttpError(400, 'invalid', 'Bitrate must be between 500 and 60,000 kbps.')
  }

  let codec: VideoCodec = canvas.codec
  if (rawCodec !== undefined && rawCodec !== null) {
    if (typeof rawCodec !== 'string' || !VALID_CODECS.includes(rawCodec as VideoCodec)) {
      throw new HttpError(400, 'invalid', `Unsupported codec "${String(rawCodec)}".`)
    }
    codec = rawCodec as VideoCodec
  }
  if (codec === 'vp9' || !opts.hostCodecs.includes(codec)) {
    throw new HttpError(400, 'invalid', `Codec "${codec}" is not supported on this computer.`)
  }

  const limit = platformLimitFor(dest.cfg.kind, dest.cfg.canvas ?? 'main', dest.cfg.brand)
  if (!opts.ignoreLimits) {
    if (!limit.codecs.includes(codec)) {
      throw new HttpError(400, 'invalid', `${limit.label} only supports H.264 streams.`)
    }
    if (
      limit.maxLongEdge != null &&
      limit.maxShortEdge != null &&
      (Math.max(width, height) > limit.maxLongEdge || Math.min(width, height) > limit.maxShortEdge)
    ) {
      throw new HttpError(
        400,
        'invalid',
        `${limit.label} accepts at most ${limit.maxLongEdge}x${limit.maxShortEdge}.`,
      )
    }
    if (limit.maxFps != null && fps > limit.maxFps) {
      throw new HttpError(400, 'invalid', `${limit.label} accepts at most ${limit.maxFps} fps.`)
    }
    const maxKbps = effectiveMaxKbps(limit, width, height, fps)
    if (kbps > maxKbps) {
      throw new HttpError(
        400,
        'invalid',
        `${limit.label} accepts at most ${maxKbps.toLocaleString()} kbps.`,
      )
    }
  }

  return {
    mode: 'custom',
    width,
    height,
    fps,
    kbps,
    codec: rawCodec !== undefined && rawCodec !== null ? codec : null,
  }
}

export interface DestPlanOutput {
  current: DestinationQuality
  resolved: ResolvedQuality
  capped?: CappedInfo
  qualityNote: string | null
  lockedReason: string | null
}

export interface EncodePlanResult {
  groups: EncodeGroupView[]
  budget: EncodeBudgetCheck
  perDest: Map<string, DestPlanOutput>
}

interface CandidateState {
  id: string
  name: string
  canvas: Canvas
  active: boolean
  isCustom: boolean
  direct: DirectKind | null
  lockedReason: string | null
  limit: PlatformLimit
  current: DestinationQuality
  canvasProfile: StudioStreamProfile
  width: number
  height: number
  fps: number
  kbps: number
  codec: VideoCodec
  audioKbps: number
  autoFitted: boolean
  noBframes: boolean
  note: string | null
  whipBframesWarning: boolean
}

function keyOf(c: {
  canvas: Canvas
  width: number
  height: number
  fps: number
  kbps: number
  codec: VideoCodec
  noBframes: boolean
}): string {
  return `${c.canvas}:${c.width}x${c.height}@${c.fps}:${c.kbps}:${c.codec}${c.noBframes ? ':nobf' : ''}`
}

function mpxPerSec(w: number, h: number, fps: number): number {
  return (w * h * fps) / 1_000_000
}

function evaluateGroups(
  states: CandidateState[],
  main: StudioStreamProfile,
  vertical: StudioStreamProfile | null,
  source: QualitySource,
  budgetConfig: DemoEncodeBudgetConfig,
  live: boolean,
  liveStats?: { fps: number; kbps: number },
): {
  groups: EncodeGroupView[]
  budget: EncodeBudgetCheck
  groupById: Map<string, EncodeGroupView>
  separateByDest: Map<string, boolean>
} {
  const byKey = new Map<
    string,
    {
      key: string
      canvas: Canvas
      width: number
      height: number
      fps: number
      kbps: number
      codec: VideoCodec
      noBframes: boolean
      members: string[]
      memberNames: string[]
    }
  >()

  for (const s of states) {
    if (!s.active) continue
    const k = keyOf(s)
    let entry = byKey.get(k)
    if (!entry) {
      entry = {
        key: k,
        canvas: s.canvas,
        width: s.width,
        height: s.height,
        fps: s.fps,
        kbps: s.kbps,
        codec: s.codec,
        noBframes: s.noBframes,
        members: [],
        memberNames: [],
      }
      byKey.set(k, entry)
    }
    entry.members.push(s.id)
    entry.memberNames.push(s.name)
  }

  const mainKeyByCanvas = new Map<Canvas, string>()
  for (const canvas of ['main', 'vertical'] as const) {
    const profile = canvas === 'vertical' ? (vertical ?? main) : main
    const exactKey = keyOf({
      canvas,
      width: profile.width,
      height: profile.height,
      fps: profile.fps,
      kbps: profile.kbps,
      codec: profile.codec,
      noBframes: profile.b_frames === 0,
    })
    if (byKey.has(exactKey)) {
      mainKeyByCanvas.set(canvas, exactKey)
      continue
    }
    let best: { key: string; kbps: number } | null = null
    for (const entry of byKey.values()) {
      if (entry.canvas !== canvas || entry.noBframes) continue
      if (!best || entry.kbps > best.kbps) best = { key: entry.key, kbps: entry.kbps }
    }
    if (best) {
      mainKeyByCanvas.set(canvas, best.key)
    } else {
      const firstOnCanvas = [...byKey.values()].find((e) => e.canvas === canvas)
      if (firstOnCanvas) mainKeyByCanvas.set(canvas, firstOnCanvas.key)
    }
  }

  const groups: EncodeGroupView[] = []
  const groupByKey = new Map<string, EncodeGroupView>()
  let idx = 0
  for (const entry of byKey.values()) {
    const anchorKey = mainKeyByCanvas.get(entry.canvas)
    const id = entry.key === anchorKey ? `${entry.canvas}` : `g_${++idx}`
    const g: EncodeGroupView = {
      id,
      canvas: entry.canvas,
      width: entry.width,
      height: entry.height,
      fps: entry.fps,
      kbps: entry.kbps,
      codec: entry.codec,
      members: entry.members,
      live_fps: live ? (liveStats?.fps ?? entry.fps) : null,
      live_kbps: live ? Math.min(liveStats?.kbps ?? entry.kbps, entry.kbps) : null,
      dropped_frames: live ? 0 : null,
      encode_ms: live ? 1.8 : null,
    }
    groups.push(g)
    groupByKey.set(entry.key, g)
  }

  const groupById = new Map<string, EncodeGroupView>()
  const separateByDest = new Map<string, boolean>()
  for (const s of states) {
    const k = keyOf(s)
    const anchorKey = mainKeyByCanvas.get(s.canvas)
    const existingGroup = s.active ? groupByKey.get(k) : undefined
    const fallbackId = existingGroup?.id ?? `preview_${s.id}`
    const fallbackGroup: EncodeGroupView = existingGroup ?? {
      id: fallbackId,
      canvas: s.canvas,
      width: s.width,
      height: s.height,
      fps: s.fps,
      kbps: s.kbps,
      codec: s.codec,
      members: [],
      live_fps: null,
      live_kbps: null,
      dropped_frames: null,
      encode_ms: null,
    }
    groupById.set(s.id, fallbackGroup)
    const isSeparate =
      source === 'studio' &&
      anchorKey !== undefined &&
      (s.active ? k !== anchorKey : k !== anchorKey && s.kbps !== s.canvasProfile.kbps)
    separateByDest.set(s.id, Boolean(isSeparate))
  }

  const usedMpx = Number(
    groups.reduce((acc, g) => acc + mpxPerSec(g.width, g.height, g.fps), 0).toFixed(2),
  )
  const usedSessions = groups.length
  const maxSessions = budgetConfig.max_sessions ?? 8
  const limitMpx = budgetConfig.limit_mpx_s ?? 995
  const budgetSource: BudgetSource = budgetConfig.source ?? 'apple_silicon'

  let status: BudgetStatus = 'ok'
  if (
    (maxSessions != null && usedSessions > maxSessions) ||
    (limitMpx != null && usedMpx > limitMpx)
  ) {
    status = 'over'
  } else if (
    (maxSessions != null && usedSessions === maxSessions && usedSessions > 1) ||
    (limitMpx != null && usedMpx >= limitMpx * 0.9)
  ) {
    status = 'limit'
  }

  const budget: EncodeBudgetCheck = {
    status,
    source: budgetSource,
    used_mpx_s: usedMpx,
    limit_mpx_s: limitMpx,
    used_sessions: usedSessions,
    max_sessions: maxSessions,
    ...(budgetConfig.note !== undefined ? { note: budgetConfig.note } : {}),
  }

  return { groups, budget, groupById, separateByDest }
}

function makeCapSummary(
  s: CandidateState,
  separateEncode: boolean,
  capLabelName: string,
  capKbps: number,
  capDims?: [number, number],
  capFps?: number,
): CappedInfo {
  const kbpsText = `${capKbps.toLocaleString()} kbps`
  const extraParts: string[] = []
  if (capDims) extraParts.push(`${capDims[1]}p`)
  if (capFps) extraParts.push(`${capFps} fps`)
  const capDesc = extraParts.length ? `${kbpsText} (${extraParts.join(' · ')})` : kbpsText
  const srcText = `${s.canvasProfile.kbps.toLocaleString()} kbps`
  const summary = `Capped at ${kbpsText} for ${capLabelName}`
  const detail = separateEncode
    ? `${capLabelName} takes at most ${capDesc}, so Ferrocast sends it its own ${kbpsText} stream while other platforms keep up to ${srcText}.`
    : `${capLabelName} takes at most ${capDesc}, so every platform sharing this picture receives ${kbpsText}.`
  return {
    kbps: capKbps,
    ...(capDims ? { resolution: capDims } : {}),
    ...(capFps ? { fps: capFps } : {}),
    separate_encode: separateEncode,
    summary,
    detail,
  }
}

/** The engine's wording for a PC that cannot run another separate encode. */
function sharedCapText(maxSessions: number | null): string {
  if (maxSessions === null) {
    return "Your PC's video encoder is at capacity for separate encodes; lower main quality or turn off a platform."
  }
  return `Your PC can run ${maxSessions} stream ${maxSessions === 1 ? 'encode' : 'encodes'} at once; lower main quality or turn off a platform.`
}

export function planEncodes(input: {
  destinations: DestPlanMeta[]
  main: StudioStreamProfile
  vertical: StudioStreamProfile | null
  cutWanted: boolean
  source: QualitySource
  ignoreLimits: boolean
  budgetConfig: DemoEncodeBudgetConfig
  hostCodecs: VideoCodec[]
  live: boolean
  liveStats?: { fps: number; kbps: number }
}): EncodePlanResult {
  const {
    destinations,
    main,
    vertical,
    cutWanted,
    source,
    ignoreLimits,
    budgetConfig,
    hostCodecs,
  } = input
  const obsMode = source === 'obs'

  const states: CandidateState[] = destinations.map((d) => {
    const canvas: Canvas = d.cfg.canvas ?? 'main'
    const canvasProfile = canvas === 'vertical' ? (vertical ?? main) : main
    const limit = platformLimitFor(d.cfg.kind, canvas, d.cfg.brand)
    const lockedReason = lockedReasonFor(d, source, cutWanted)
    const active = Boolean(d.cfg.enabled && !d.blocked && !d.standby)

    let current: DestinationQuality = d.cfg.quality
      ? { ...d.cfg.quality }
      : { mode: 'same_as_main' }
    if (d.cfg.light && current.mode === 'same_as_main') {
      current = { mode: 'custom', ...legacyLightCustomQuality(canvasProfile) }
    }

    if (d.direct === 'whip') {
      const bFramesOffNeeded = canvasProfile.b_frames > 0
      return {
        id: d.cfg.id,
        name: d.name,
        canvas,
        active,
        isCustom: false,
        direct: d.direct,
        lockedReason,
        limit,
        current: { mode: 'same_as_main' },
        canvasProfile,
        width: canvasProfile.width,
        height: canvasProfile.height,
        fps: canvasProfile.fps,
        kbps: canvasProfile.kbps,
        codec: canvasProfile.codec,
        audioKbps: canvasProfile.audio_kbps,
        autoFitted: false,
        noBframes: bFramesOffNeeded && !obsMode,
        note: null,
        whipBframesWarning: bFramesOffNeeded,
      }
    }

    if (obsMode || (current.mode === 'same_as_main' && lockedReason !== null)) {
      const obsCheck = fitToLimit(canvasProfile, limit, hostCodecs, ignoreLimits)
      return {
        id: d.cfg.id,
        name: d.name,
        canvas,
        active,
        isCustom: false,
        direct: d.direct,
        lockedReason,
        limit,
        current: obsMode ? current : { mode: 'same_as_main' },
        canvasProfile,
        width: canvasProfile.width,
        height: canvasProfile.height,
        fps: canvasProfile.fps,
        kbps: canvasProfile.kbps,
        codec: canvasProfile.codec,
        audioKbps: Math.min(canvasProfile.audio_kbps, limit.maxAudioKbps),
        autoFitted: obsCheck.autoFitted,
        noBframes: canvasProfile.b_frames === 0,
        note: obsCheck.note,
        whipBframesWarning: false,
      }
    }

    if (current.mode === 'custom') {
      const codec = current.codec ?? canvasProfile.codec
      const clampedCodec = hostCodecs.includes(codec) ? codec : 'h264'
      const note = ignoreLimits
        ? null
        : softLimitNote(limit, current.width, current.height, current.fps)
      return {
        id: d.cfg.id,
        name: d.name,
        canvas,
        active,
        isCustom: true,
        direct: d.direct,
        lockedReason,
        limit,
        current,
        canvasProfile,
        width: current.width,
        height: current.height,
        fps: current.fps,
        kbps: current.kbps,
        codec: clampedCodec,
        audioKbps: Math.min(canvasProfile.audio_kbps, limit.maxAudioKbps),
        autoFitted: false,
        noBframes: canvasProfile.b_frames === 0,
        note,
        whipBframesWarning: false,
      }
    }

    const fitted = fitToLimit(canvasProfile, limit, hostCodecs, ignoreLimits)
    return {
      id: d.cfg.id,
      name: d.name,
      canvas,
      active,
      isCustom: false,
      direct: d.direct,
      lockedReason,
      limit,
      current: { mode: 'same_as_main' },
      canvasProfile,
      width: fitted.width,
      height: fitted.height,
      fps: fitted.fps,
      kbps: fitted.kbps,
      codec: fitted.codec,
      audioKbps: Math.min(canvasProfile.audio_kbps, limit.maxAudioKbps),
      autoFitted: fitted.autoFitted,
      noBframes: canvasProfile.b_frames === 0,
      note: fitted.note,
      whipBframesWarning: false,
    }
  })

  let evalResult = evaluateGroups(
    states,
    main,
    vertical,
    source,
    budgetConfig,
    input.live,
    input.liveStats,
  )

  let usedSharedFallback = false
  // Destinations the shared-cap pass moved onto one picture (only ones following the main stream).
  const sharedCapIds = new Set<string>()
  if (source === 'studio' && evalResult.budget.status === 'over') {
    // Pass-1: coalesce auto-fitted separate groups onto a lower compatible group on the same canvas.
    let progress = true
    while (evalResult.budget.status === 'over' && progress) {
      progress = false
      for (const canvas of ['main', 'vertical'] as const) {
        const separateAuto = states.filter(
          (s) =>
            s.active &&
            s.canvas === canvas &&
            !s.isCustom &&
            !s.direct &&
            evalResult.separateByDest.get(s.id),
        )
        const groupsOnCanvas = evalResult.groups.filter((g) => g.canvas === canvas)
        let merged = false
        for (const cand of separateAuto) {
          const candidates = groupsOnCanvas
            .filter(
              (g) =>
                !g.members.includes(cand.id) &&
                g.kbps <= cand.kbps &&
                g.width === cand.width &&
                g.height === cand.height &&
                g.fps === cand.fps &&
                (ignoreLimits || cand.limit.codecs.includes(g.codec)),
            )
            .sort((a, b) => b.kbps - a.kbps)
          const target = candidates[0]
          if (target) {
            cand.width = target.width
            cand.height = target.height
            cand.fps = target.fps
            cand.kbps = target.kbps
            cand.codec = target.codec
            cand.autoFitted = true
            merged = true
            break
          }
        }
        if (merged) {
          progress = true
          evalResult = evaluateGroups(
            states,
            main,
            vertical,
            source,
            budgetConfig,
            input.live,
            input.liveStats,
          )
          break
        }
      }
    }

    // Pass-2: shared-cap fallback when still over PC budget (e.g. 1-session NVENC/CPU).
    if (evalResult.budget.status === 'over') {
      usedSharedFallback = true
      for (const canvas of ['main', 'vertical'] as const) {
        // An explicit custom quality is never rewritten; only destinations that follow the
        // picture share its cap.
        const onCanvas = states.filter(
          (s) => s.active && s.canvas === canvas && !s.direct && !s.isCustom,
        )
        if (onCanvas.length <= 1) continue
        const sharedKbps = Math.min(...onCanvas.map((s) => s.kbps))
        const sharedW = Math.min(...onCanvas.map((s) => s.width))
        const sharedH = Math.min(...onCanvas.map((s) => s.height))
        const sharedFps = Math.min(...onCanvas.map((s) => s.fps))
        for (const s of onCanvas) {
          sharedCapIds.add(s.id)
          s.width = sharedW
          s.height = sharedH
          s.fps = sharedFps
          s.kbps = sharedKbps
          s.autoFitted =
            sharedKbps < s.canvasProfile.kbps ||
            sharedW < s.canvasProfile.width ||
            sharedH < s.canvasProfile.height ||
            sharedFps < s.canvasProfile.fps
        }
      }
      evalResult = evaluateGroups(
        states,
        main,
        vertical,
        source,
        budgetConfig,
        input.live,
        input.liveStats,
      )
    }
  }

  // Compute lowest active platform cap for OBS / Pass-2 shared cap attribution.
  const sharedLimiterByCanvas = new Map<
    Canvas,
    { names: string[]; kbps: number; w: number; h: number; fps: number }
  >()
  if (obsMode) {
    for (const canvas of ['main', 'vertical'] as const) {
      const limiters = states
        .filter((s) => s.active && s.canvas === canvas && !s.direct && !ignoreLimits)
        .map((s) => {
          const fit = fitToLimit(s.canvasProfile, s.limit, hostCodecs, false)
          return fit.kbps < s.canvasProfile.kbps ||
            fit.width < s.canvasProfile.width ||
            fit.height < s.canvasProfile.height ||
            fit.fps < s.canvasProfile.fps
            ? { s, fit }
            : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
      if (limiters.length > 0) {
        const minKbps = Math.min(...limiters.map((l) => l.fit.kbps))
        const tightest = limiters.filter((l) => l.fit.kbps === minKbps)
        const first = tightest[0]!
        sharedLimiterByCanvas.set(canvas, {
          names: tightest.map((l) => l.s.name),
          kbps: minKbps,
          w: first.fit.width,
          h: first.fit.height,
          fps: first.fit.fps,
        })
      }
    }
  }

  const perDest = new Map<string, DestPlanOutput>()
  for (const s of states) {
    const group = evalResult.groupById.get(s.id)!
    const separateEncode = evalResult.separateByDest.get(s.id) ?? false
    const sharedWith = group.members
      .filter((mId) => mId !== s.id)
      .map((mId) => states.find((x) => x.id === mId)?.name ?? mId)

    const resolved: ResolvedQuality = {
      width: s.width,
      height: s.height,
      fps: s.fps,
      kbps: s.kbps,
      codec: s.codec,
      audio_kbps: s.audioKbps,
      auto_fitted: s.autoFitted,
      separate_encode: separateEncode,
      group_id: group.id,
      shared_with: sharedWith,
    }

    let capped: CappedInfo | undefined
    if (s.direct === 'whip' && s.whipBframesWarning) {
      capped = {
        kbps: resolved.kbps,
        separate_encode: resolved.separate_encode,
        summary: 'B-frames off for WebRTC',
        detail:
          'WebRTC streams cannot use B-frames, so Ferrocast encodes this output without B-frames.',
      }
    } else if (s.active && !ignoreLimits) {
      if (usedSharedFallback && !obsMode) {
        if (sharedCapIds.has(s.id) && s.autoFitted) {
          const resFps = `${Math.min(s.width, s.height)}p${s.fps}`
          const m = s.kbps / 1000
          const rateLabel = Number.isInteger(m) ? `${m} Mbps` : `${m.toFixed(1)} Mbps`
          capped = {
            kbps: s.kbps,
            resolution: [s.width, s.height],
            fps: s.fps,
            separate_encode: false,
            summary: `Shared cap: ${resFps} · ${rateLabel}`,
            detail: sharedCapText(budgetConfig.max_sessions ?? null),
          }
        }
      } else if (obsMode) {
        const sharedLim = sharedLimiterByCanvas.get(s.canvas)
        if (
          sharedLim &&
          fitToLimit(s.canvasProfile, s.limit, hostCodecs, false).kbps === sharedLim.kbps
        ) {
          const dimChanged =
            sharedLim.w !== s.canvasProfile.width || sharedLim.h !== s.canvasProfile.height
          const fpsChanged = sharedLim.fps !== s.canvasProfile.fps
          capped = makeCapSummary(
            s,
            false,
            s.name,
            sharedLim.kbps,
            dimChanged ? [sharedLim.w, sharedLim.h] : undefined,
            fpsChanged ? sharedLim.fps : undefined,
          )
        }
      } else if (!s.isCustom && s.autoFitted) {
        const dimChanged = s.width !== s.canvasProfile.width || s.height !== s.canvasProfile.height
        const fpsChanged = s.fps !== s.canvasProfile.fps
        capped = makeCapSummary(
          s,
          separateEncode,
          s.name,
          s.kbps,
          dimChanged ? [s.width, s.height] : undefined,
          fpsChanged ? s.fps : undefined,
        )
      }
    }

    perDest.set(s.id, {
      current: s.current,
      resolved,
      ...(capped ? { capped } : {}),
      qualityNote: s.note,
      lockedReason: s.lockedReason,
    })
  }

  return {
    groups: evalResult.groups,
    budget: evalResult.budget,
    perDest,
  }
}

export function buildQualityOptionsResponse(input: {
  destinations: DestPlanMeta[]
  main: StudioStreamProfile
  vertical: StudioStreamProfile | null
  cutWanted: boolean
  source: QualitySource
  ignoreLimits: boolean
  budgetConfig: DemoEncodeBudgetConfig
  hostCodecs: VideoCodec[]
  live: boolean
  liveStats?: { fps: number; kbps: number }
}): GoLiveQualityOptionsResponse {
  const basePlan = planEncodes(input)
  const outDests: Record<string, DestinationQualityOptions> = {}

  for (const d of input.destinations) {
    const canvas: Canvas = d.cfg.canvas ?? 'main'
    const canvasProfile = canvas === 'vertical' ? (input.vertical ?? input.main) : input.main
    const baseDest = basePlan.perDest.get(d.cfg.id)!
    const limit = platformLimitFor(d.cfg.kind, canvas, d.cfg.brand)
    const locked = baseDest.lockedReason !== null

    const [maxW, maxH] = input.ignoreLimits
      ? [canvasProfile.width, canvasProfile.height]
      : fitDimensions(
          canvasProfile.width,
          canvasProfile.height,
          limit.maxLongEdge,
          limit.maxShortEdge,
        )
    const maxFps = input.ignoreLimits
      ? canvasProfile.fps
      : largestFpsDivisor(canvasProfile.fps, limit.maxFps)
    const fpsChoices: number[] = []
    for (const f of [120, 60, 48, 30, 24, 15]) {
      if (f <= maxFps && canvasProfile.fps % f === 0) fpsChoices.push(f)
    }
    if (fpsChoices.length === 0) fpsChoices.push(maxFps)

    const [recW, recH] = fitDimensions(
      maxW,
      maxH,
      limit.recLongEdge ?? maxW,
      limit.recShortEdge ?? maxH,
    )
    const recFps = largestFpsDivisor(maxFps, limit.recFps)
    const maxKbps = input.ignoreLimits ? 60000 : effectiveMaxKbps(limit, maxW, maxH, maxFps)

    const candidateSpecs: Array<{
      id: string
      label: string
      quality: DestinationQuality
    }> = [{ id: 'same_as_main', label: 'Same as main', quality: { mode: 'same_as_main' } }]

    if (!locked) {
      const pushTier = (
        id: string,
        label: string,
        longEdge: number,
        shortEdge: number,
        fps: number,
        kbps: number,
      ) => {
        const isVerticalCanvas = canvas === 'vertical' || canvasProfile.height > canvasProfile.width
        const w = isVerticalCanvas ? shortEdge : longEdge
        const h = isVerticalCanvas ? longEdge : shortEdge
        if (w > canvasProfile.width || h > canvasProfile.height) return
        const alignedFps = largestFpsDivisor(canvasProfile.fps, fps)
        if (alignedFps <= 0 || canvasProfile.fps % alignedFps !== 0) return
        if (!input.ignoreLimits) {
          if (
            limit.maxLongEdge != null &&
            limit.maxShortEdge != null &&
            (Math.max(w, h) > limit.maxLongEdge || Math.min(w, h) > limit.maxShortEdge)
          ) {
            return
          }
          if (limit.maxFps != null && alignedFps > limit.maxFps) return
        }
        const maxK = input.ignoreLimits ? 60000 : effectiveMaxKbps(limit, w, h, alignedFps)
        const finalKbps = Math.max(500, Math.min(kbps, maxK))
        candidateSpecs.push({
          id,
          label,
          quality: {
            mode: 'custom',
            width: w,
            height: h,
            fps: alignedFps,
            kbps: finalKbps,
            codec: limit.codecs.includes(canvasProfile.codec) ? null : (limit.codecs[0] ?? 'h264'),
          },
        })
      }

      const isVertical = canvas === 'vertical' || canvasProfile.height > canvasProfile.width
      if (isVertical) {
        pushTier('1080p60', '1080p60', 1920, 1080, 60, Math.min(canvasProfile.kbps, limit.recKbps))
        pushTier('1080p30', '1080p30', 1920, 1080, 30, Math.min(canvasProfile.kbps, 6000))
        pushTier('720p60', '720p60', 1280, 720, 60, Math.min(canvasProfile.kbps, 4500))
        pushTier('720p30', '720p30', 1280, 720, 30, Math.min(canvasProfile.kbps, 3000))
        pushTier('540p30', '540p30', 960, 540, 30, Math.min(canvasProfile.kbps, 1500))
      } else {
        pushTier('2160p60', '2160p60', 3840, 2160, 60, Math.min(canvasProfile.kbps, 25000))
        pushTier('1440p60', '1440p60', 2560, 1440, 60, Math.min(canvasProfile.kbps, 18000))
        pushTier('1080p60', '1080p60', 1920, 1080, 60, Math.min(canvasProfile.kbps, limit.recKbps))
        pushTier('1080p30', '1080p30', 1920, 1080, 30, Math.min(canvasProfile.kbps, 6000))
        pushTier('720p60', '720p60', 1280, 720, 60, Math.min(canvasProfile.kbps, 4500))
        pushTier('720p30', '720p30', 1280, 720, 30, Math.min(canvasProfile.kbps, 3000))
        pushTier('480p30', '480p30', 854, 480, 30, Math.min(canvasProfile.kbps, 1500))
      }

      // Surface active same-canvas encode group shapes so zero-cost shared options stay visible.
      for (const grp of basePlan.groups) {
        if (grp.canvas !== canvas) continue
        if (grp.members.every((m) => m === d.cfg.id)) continue
        if (!input.ignoreLimits && !limit.codecs.includes(grp.codec)) continue
        if (!input.hostCodecs.includes(grp.codec)) continue
        if (grp.width > canvasProfile.width || grp.height > canvasProfile.height) continue
        if (grp.fps <= 0 || canvasProfile.fps % grp.fps !== 0) continue
        if (!input.ignoreLimits) {
          if (
            limit.maxLongEdge != null &&
            limit.maxShortEdge != null &&
            (Math.max(grp.width, grp.height) > limit.maxLongEdge ||
              Math.min(grp.width, grp.height) > limit.maxShortEdge)
          ) {
            continue
          }
          if (limit.maxFps != null && grp.fps > limit.maxFps) continue
          if (grp.kbps > effectiveMaxKbps(limit, grp.width, grp.height, grp.fps)) continue
        }
        candidateSpecs.push({
          id: `${grp.height}p${grp.fps}_${grp.kbps}`,
          label: `${grp.height}p${grp.fps}`,
          quality: {
            mode: 'custom',
            width: grp.width,
            height: grp.height,
            fps: grp.fps,
            kbps: grp.kbps,
            codec: grp.codec,
          },
        })
      }
    }

    const seenResolved = new Set<string>()
    const options: QualityOption[] = []
    let recMarked = false

    for (const spec of candidateSpecs) {
      const simDests = input.destinations.map((other) =>
        other.cfg.id === d.cfg.id
          ? {
              ...other,
              blocked: false,
              standby: false,
              cfg: { ...other.cfg, quality: spec.quality, light: false, enabled: true },
            }
          : other,
      )
      const sim = planEncodes({
        ...input,
        destinations: simDests,
      })
      const simDest = sim.perDest.get(d.cfg.id)!
      const r = simDest.resolved
      const sig = `${r.width}x${r.height}@${r.fps}:${r.kbps}:${r.codec}`
      if (spec.id !== 'same_as_main' && seenResolved.has(sig)) continue
      seenResolved.add(sig)

      const note = simDest.qualityNote
      let recommended = false
      if (spec.id === 'same_as_main') {
        recommended = note === null
        if (recommended) recMarked = true
      } else if (
        !recMarked &&
        note === null &&
        r.width === recW &&
        r.height === recH &&
        r.fps === recFps
      ) {
        recommended = true
        recMarked = true
      }
      const overBudget = sim.budget.status === 'over'

      options.push({
        id: spec.id,
        label: spec.label,
        quality: spec.quality,
        resolved: {
          width: r.width,
          height: r.height,
          fps: r.fps,
          kbps: r.kbps,
          codec: r.codec,
        },
        auto_fitted: r.auto_fitted,
        recommended,
        note,
        shares_encoder_with: r.shared_with,
        allowed: spec.id === 'same_as_main' || !overBudget,
        disabled_reason:
          spec.id !== 'same_as_main' && overBudget
            ? 'Not enough encode headroom on this PC.'
            : null,
      })
    }

    const customLimits: CustomQualityLimits | null = locked
      ? null
      : {
          max_width: maxW,
          max_height: maxH,
          min_kbps: 500,
          max_kbps: maxKbps,
          fps_choices: fpsChoices,
          codecs: input.ignoreLimits
            ? [...input.hostCodecs]
            : limit.codecs.filter((c) => input.hostCodecs.includes(c)),
          recommended_width: recW,
          recommended_height: recH,
          recommended_fps: recFps,
          recommended_kbps: Math.min(limit.recKbps, maxKbps),
        }

    outDests[d.cfg.id] = {
      id: d.cfg.id,
      canvas,
      locked_reason: baseDest.lockedReason,
      current: baseDest.current,
      resolved: baseDest.resolved,
      options,
      custom_limits: customLimits,
    }
  }

  const mainSummary: QualityCanvasSummary = {
    width: input.main.width,
    height: input.main.height,
    fps: input.main.fps,
    kbps: input.main.kbps,
    codec: input.main.codec,
    audio_kbps: input.main.audio_kbps,
  }
  const verticalSummary: QualityCanvasSummary | null = input.vertical
    ? {
        width: input.vertical.width,
        height: input.vertical.height,
        fps: input.vertical.fps,
        kbps: input.vertical.kbps,
        codec: input.vertical.codec,
        audio_kbps: input.vertical.audio_kbps,
      }
    : null

  return {
    source: input.source,
    main: mainSummary,
    vertical: verticalSummary,
    budget: basePlan.budget,
    destinations: outDests,
  }
}
