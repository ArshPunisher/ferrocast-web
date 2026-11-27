import type {
  CustomQualityLimits,
  DestinationQuality,
  DestinationQualityOptions,
  DestinationView,
  EncodeBudgetCheck,
  GoLiveQualityOptionsResponse,
  VideoCodec,
} from '@ferrocast/api'

export interface ResolutionOption {
  width: number
  height: number
  short: number
  label: string
  state: 'ok' | 'soft' | 'hard'
  softNote: string | null
  hardReason: string | null
}

export interface FpsOption {
  fps: number
  locked: boolean
  reason: string | null
}

export interface ModalDraft {
  matchMain: boolean
  width: number
  height: number
  fps: number
  kbps: number
}

export interface ModalPeerCandidate {
  id: string
  name: string
  label: string
  quality: DestinationQuality
}

export interface ModalModel {
  dest: DestinationView
  destOpts: DestinationQualityOptions | null
  canvasMain: {
    width: number
    height: number
    fps: number
    kbps: number
    codec: VideoCodec | string
    audio_kbps: number
  } | null
  budget: GoLiveQualityOptionsResponse['budget'] | null
  limits: CustomQualityLimits
  resolutions: ResolutionOption[]
  fpsOptions: FpsOption[]
  bitrateLadderKbps: number[]
  bitrateMinKbps: number
  bitrateHardMaxKbps: number
  bitrateRangeMaxKbps: number
  hasHardBitrateCeiling: boolean
  softNoteThresholdShort: number | null
  softNoteTemplate: string | null
  sameAsMainResolved: {
    width: number
    height: number
    fps: number
    kbps: number
    codec: VideoCodec | string
    auto_fitted: boolean
    note: string | null
    shares_encoder_with: string[]
    allowed?: boolean
  } | null
  lockedReason: string | null
}

export interface MatchMainEndpoint {
  width: number
  height: number
  fps: number
  kbps: number
  codec?: string
  resFps: string
  rate: string
  dims: string
}

export interface MatchMainSoftTip {
  text: string
  actionLabel: string
  targetDraft: ModalDraft
}

export interface MatchMainSharedCap {
  maxSessions: number
  summary: string
  detail: string
}

export interface MatchMainComparison {
  switchMatchLabel: string
  baseLabel: string
  base: MatchMainEndpoint
  fitted: MatchMainEndpoint
  resCut: boolean
  fpsCut: boolean
  rateCut: boolean
  anyCut: boolean
  sharedCap: MatchMainSharedCap | null
  reasons: string[]
  softTip: MatchMainSoftTip | null
}

export interface EditorHeaderStatus {
  text: string
  tone: 'live' | 'work' | 'warn' | 'bad' | 'muted'
}

export interface HardLimitIssue {
  kind: 'resolution' | 'fps' | 'bitrate'
  reason: string
  fixLabel: string
  fixedDraft: ModalDraft
}

export interface BudgetIssue {
  usedSessions: number
  maxSessions: number
  peer: ModalPeerCandidate | null
  matchLabel: string | null
}

export interface ModalEvaluation {
  effective: {
    width: number
    height: number
    fps: number
    kbps: number
    codec: string
  }
  resultTone: 'neutral' | 'ok' | 'warn' | 'bad'
  badgeKind: 'same' | 'fitted' | 'shared' | 'own'
  badgeText: string
  sharesWith: string[]
  hardLimit: HardLimitIssue | null
  budgetExceeded: BudgetIssue | null
  softNote: string | null
  isReconnecting: boolean
  isDirty: boolean
  canApply: boolean
  applyLabel: string
  footerCopy: string
}

export interface ApiQualityErrorInfo {
  kind: 'locked' | 'limit' | 'budget' | 'timeout' | 'other'
  title: string
  detail: string
  retryable: boolean
  canClamp: boolean
}

const LANDSCAPE_TIERS = [2160, 1440, 1080, 720, 540, 480] as const
const PORTRAIT_TIERS = [1440, 1080, 720, 540] as const

const BITRATE_LADDER = [
  800, 1500, 2500, 3000, 4000, 4500, 6000, 8000, 9000, 12000, 15000, 18000, 24000, 32000, 40000,
  51000,
] as const

export function formatModalRate(kbps: number): string {
  if (kbps < 1000) return `${Math.round(kbps)} kbps`
  const m = kbps / 1000
  return Number.isInteger(m) ? `${m} Mbps` : `${Number(m.toFixed(1))} Mbps`
}

export function formatModalResFps(width: number, height: number, fps: number): string {
  const short = Math.min(width, height)
  return `${short}p${fps}`
}

export interface ResolvedQualitySummary {
  width: number
  height: number
  fps: number
  kbps: number
  auto_fitted?: boolean
}

export function buildQualitySummaryText(
  dest: DestinationView,
  usesObs: boolean,
  _peerNamesById?: Record<string, string>,
  fallbackResolved?: ResolvedQualitySummary | null,
): string {
  if (usesObs) return 'Same as OBS'
  const r = dest.resolved_quality ?? fallbackResolved ?? null
  if (!r) {
    if (dest.quality?.mode === 'custom') {
      return `${formatModalResFps(dest.quality.width, dest.quality.height, dest.quality.fps)} · ${formatModalRate(dest.quality.kbps)}`
    }
    return 'Same as main'
  }
  const resRate = `${formatModalResFps(r.width, r.height, r.fps)} · ${formatModalRate(r.kbps)}`
  if (dest.quality?.mode === 'custom') {
    return resRate
  }
  if (r.auto_fitted) {
    return `${resRate} · auto`
  }
  return 'Same as main'
}

export function formatEditorHeaderStatus(
  dest: DestinationView,
  canvasLive: boolean,
): EditorHeaderStatus {
  if (canvasLive && dest.enabled && !dest.blocked && !dest.standby_for && dest.connected) {
    if (dest.health?.state === 'live') return { text: 'Live now', tone: 'live' }
    if (dest.health?.state === 'reconnecting') return { text: 'Reconnecting', tone: 'work' }
    if (dest.health?.state === 'paused') return { text: 'Paused', tone: 'warn' }
    if (dest.health?.state === 'failed') return { text: 'Failed', tone: 'bad' }
    return { text: 'Not live', tone: 'muted' }
  }
  if (!dest.enabled) return { text: 'Off', tone: 'muted' }
  return { text: 'Not live', tone: 'muted' }
}

function fitDimensionsPreservingAspect(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  if (srcW <= maxW && srcH <= maxH) return { width: srcW, height: srcH }
  const scale = Math.min(maxW / Math.max(1, srcW), maxH / Math.max(1, srcH))
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2)
  return { width: even(srcW), height: even(srcH) }
}

function dimensionsForShortEdge(
  short: number,
  portrait: boolean,
  canvasWidth: number,
  canvasHeight: number,
): { width: number; height: number } {
  const canvasShort = Math.max(1, Math.min(canvasWidth, canvasHeight))
  const canvasLong = Math.max(canvasWidth, canvasHeight)
  const rawAspect = canvasLong / canvasShort
  const standardAspect = 16 / 9
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  const long =
    Math.abs(rawAspect - standardAspect) > 0.08
      ? even(short * rawAspect)
      : Math.round((short * 16) / 9)
  return portrait ? { width: short, height: long } : { width: long, height: short }
}

function fallbackLimitsFor(
  dest: DestinationView,
  canvasWidth: number,
  canvasHeight: number,
  canvasFps: number,
): CustomQualityLimits {
  const portrait = dest.canvas === 'vertical' || canvasHeight > canvasWidth
  const fallbackMaxW = portrait ? 1080 : Math.max(1920, canvasWidth)
  const fallbackMaxH = portrait ? Math.max(1920, canvasHeight) : Math.max(1080, canvasHeight)
  const maxKbps =
    dest.kind === 'twitch' && !dest.enhanced
      ? 6000
      : dest.kind === 'kick'
        ? 8000
        : dest.canvas === 'vertical'
          ? 15000
          : 51000
  return {
    max_width: fallbackMaxW,
    max_height: fallbackMaxH,
    min_kbps: 500,
    max_kbps: maxKbps,
    fps_choices: [24, 30, 60].filter((f) => f <= Math.max(60, canvasFps)),
    codecs: dest.kind === 'twitch' || dest.kind === 'kick' ? ['h264'] : ['h264', 'hevc', 'av1'],
    recommended_width: Math.min(1920, canvasWidth),
    recommended_height: Math.min(1080, canvasHeight),
    recommended_fps: Math.min(60, canvasFps),
    recommended_kbps: Math.min(6000, maxKbps),
  }
}

export function buildModalModel({
  dest,
  destOpts,
  response,
}: {
  dest: DestinationView
  destOpts: DestinationQualityOptions | null
  response: GoLiveQualityOptionsResponse | null
}): ModalModel {
  const resolvedFallback = destOpts?.resolved ?? dest.resolved_quality ?? null
  const canvasMain =
    dest.canvas === 'vertical'
      ? (response?.vertical ??
        (resolvedFallback && resolvedFallback.height > resolvedFallback.width
          ? {
              width: resolvedFallback.width,
              height: resolvedFallback.height,
              fps: resolvedFallback.fps,
              kbps: resolvedFallback.kbps,
              codec: resolvedFallback.codec,
              audio_kbps: 160,
            }
          : response?.main
            ? {
                width: 1080,
                height: 1920,
                fps: response.main.fps,
                kbps: Math.min(response.main.kbps, 6000),
                codec: response.main.codec,
                audio_kbps: response.main.audio_kbps,
              }
            : null))
      : (response?.main ?? null)
  const canvasW =
    canvasMain?.width ?? resolvedFallback?.width ?? (dest.canvas === 'vertical' ? 1080 : 1920)
  const canvasH =
    canvasMain?.height ?? resolvedFallback?.height ?? (dest.canvas === 'vertical' ? 1920 : 1080)
  const canvasFps = canvasMain?.fps ?? resolvedFallback?.fps ?? 60
  const portrait = dest.canvas === 'vertical' || canvasH > canvasW

  const limits = destOpts?.custom_limits ?? fallbackLimitsFor(dest, canvasW, canvasH, canvasFps)

  // Extract soft recommendation limit strictly from engine-supplied option notes.
  const softOptions = (destOpts?.options ?? []).filter((o) => o.note)
  let softNoteThresholdShort: number | null = null
  let softNoteTemplate: string | null = null
  for (const opt of softOptions) {
    const short = Math.min(opt.resolved.width, opt.resolved.height)
    if (softNoteThresholdShort === null || short < softNoteThresholdShort) {
      softNoteThresholdShort = short
      softNoteTemplate = opt.note
    }
  }
  if (softNoteTemplate === null && dest.quality_note) {
    const short = Math.min(resolvedFallback?.width ?? canvasW, resolvedFallback?.height ?? canvasH)
    softNoteThresholdShort = short
    softNoteTemplate = dest.quality_note
  }

  const canvasShort = Math.min(canvasW, canvasH)
  const maxLimitShort = Math.min(limits.max_width, limits.max_height)
  const currentShort = resolvedFallback
    ? Math.min(resolvedFallback.width, resolvedFallback.height)
    : 0
  const tierPool = portrait ? PORTRAIT_TIERS : LANDSCAPE_TIERS
  const maxShownShort = Math.max(canvasShort, currentShort, maxLimitShort < 4000 ? canvasShort : 0)

  const resolutions: ResolutionOption[] = tierPool
    .filter(
      (short) =>
        short <= Math.max(maxShownShort, 1080) && (short <= canvasShort || short === currentShort),
    )
    .map((short) => {
      const dims = dimensionsForShortEdge(short, portrait, canvasW, canvasH)
      const isHard = dims.width > limits.max_width || dims.height > limits.max_height
      const matchedOpt = (destOpts?.options ?? []).find(
        (o) =>
          o.resolved.width === dims.width && o.resolved.height === dims.height && o.note !== null,
      )
      const isSoft =
        !isHard &&
        (matchedOpt !== undefined ||
          (softNoteThresholdShort !== null && short >= softNoteThresholdShort))
      return {
        width: dims.width,
        height: dims.height,
        short,
        label: `${short}p`,
        state: isHard ? 'hard' : isSoft ? 'soft' : 'ok',
        softNote: isSoft ? (matchedOpt?.note ?? softNoteTemplate) : null,
        hardReason: isHard
          ? `${dest.name} takes up to ${Math.min(limits.max_width, limits.max_height)}p.`
          : null,
      }
    })

  // Ensure at least the current or canvas resolution exists cleanly.
  if (resolutions.length === 0) {
    const short = canvasShort
    resolutions.push({
      width: canvasW,
      height: canvasH,
      short,
      label: `${short}p`,
      state: 'ok',
      softNote: null,
      hardReason: null,
    })
  }

  const allowedFpsSet = new Set(limits.fps_choices.length > 0 ? limits.fps_choices : [30, 60])
  const allFpsCandidates = new Set<number>(allowedFpsSet)
  if (canvasFps > Math.max(...allowedFpsSet)) {
    allFpsCandidates.add(canvasFps)
  }
  if (resolvedFallback?.fps && !allFpsCandidates.has(resolvedFallback.fps)) {
    allFpsCandidates.add(resolvedFallback.fps)
  }
  const maxAllowedFps = Math.max(...allowedFpsSet)
  const fpsOptions: FpsOption[] = [...allFpsCandidates]
    .sort((a, b) => a - b)
    .map((fps) => {
      const locked = !allowedFpsSet.has(fps)
      return {
        fps,
        locked,
        reason: locked ? `${dest.name} takes up to ${maxAllowedFps} fps.` : null,
      }
    })

  const bitrateMinKbps = Math.max(500, limits.min_kbps)
  const bitrateHardMaxKbps = Math.max(bitrateMinKbps, limits.max_kbps)
  const hasHardBitrateCeiling = bitrateHardMaxKbps < 45000
  const bitrateRangeMaxKbps = hasHardBitrateCeiling
    ? Math.min(
        51000,
        bitrateHardMaxKbps <= 6000
          ? 9000
          : bitrateHardMaxKbps <= 9000
            ? 12000
            : Math.round((bitrateHardMaxKbps * 1.35) / 1000) * 1000,
      )
    : bitrateHardMaxKbps

  const bitrateLadderKbps: number[] = BITRATE_LADDER.filter(
    (k) => k >= bitrateMinKbps && k <= bitrateRangeMaxKbps,
  )
  if (
    !bitrateLadderKbps.includes(bitrateHardMaxKbps) &&
    bitrateHardMaxKbps <= bitrateRangeMaxKbps
  ) {
    bitrateLadderKbps.push(bitrateHardMaxKbps)
    bitrateLadderKbps.sort((a, b) => a - b)
  }

  const sameOpt = (destOpts?.options ?? []).find((o) => o.quality.mode === 'same_as_main') ?? null
  const sameAsMainResolved = sameOpt
    ? {
        width: sameOpt.resolved.width,
        height: sameOpt.resolved.height,
        fps: sameOpt.resolved.fps,
        kbps: sameOpt.resolved.kbps,
        codec: sameOpt.resolved.codec,
        auto_fitted: sameOpt.auto_fitted,
        note: sameOpt.note,
        shares_encoder_with: sameOpt.shares_encoder_with,
        allowed: sameOpt.allowed,
      }
    : canvasMain
      ? (() => {
          const fit = fitDimensionsPreservingAspect(
            canvasMain.width,
            canvasMain.height,
            limits.max_width,
            limits.max_height,
          )
          const fitFps = Math.min(canvasMain.fps, maxAllowedFps)
          const fitKbps = Math.min(canvasMain.kbps, bitrateHardMaxKbps)
          return {
            width: fit.width,
            height: fit.height,
            fps: fitFps,
            kbps: fitKbps,
            codec: limits.codecs[0] ?? 'h264',
            auto_fitted:
              fit.width < canvasMain.width ||
              fit.height < canvasMain.height ||
              fitFps < canvasMain.fps ||
              fitKbps < canvasMain.kbps,
            note: null,
            shares_encoder_with: [],
          }
        })()
      : resolvedFallback
        ? {
            width: resolvedFallback.width,
            height: resolvedFallback.height,
            fps: resolvedFallback.fps,
            kbps: resolvedFallback.kbps,
            codec: resolvedFallback.codec,
            auto_fitted: resolvedFallback.auto_fitted,
            note: null,
            shares_encoder_with: resolvedFallback.shared_with,
          }
        : null

  return {
    dest,
    destOpts,
    canvasMain,
    budget: response?.budget ?? null,
    limits,
    resolutions,
    fpsOptions,
    bitrateLadderKbps,
    bitrateMinKbps,
    bitrateHardMaxKbps,
    bitrateRangeMaxKbps,
    hasHardBitrateCeiling,
    softNoteThresholdShort,
    softNoteTemplate,
    sameAsMainResolved,
    lockedReason: destOpts?.locked_reason ?? null,
  }
}

export function initialDraftFromModel(model: ModalModel): ModalDraft {
  const current = model.destOpts?.current ?? model.dest.quality ?? { mode: 'same_as_main' as const }
  const resolved =
    model.destOpts?.resolved ?? model.dest.resolved_quality ?? model.sameAsMainResolved
  if (current.mode === 'custom') {
    return {
      matchMain: false,
      width: current.width,
      height: current.height,
      fps: current.fps,
      kbps: current.kbps,
    }
  }
  return {
    matchMain: true,
    width: resolved?.width ?? 1920,
    height: resolved?.height ?? 1080,
    fps: resolved?.fps ?? 60,
    kbps: resolved?.kbps ?? 6000,
  }
}

export function clampDraftToHardLimits(model: ModalModel, draft: ModalDraft): ModalDraft {
  const allowedRes =
    model.resolutions.find(
      (r) =>
        r.state !== 'hard' &&
        r.width <= model.limits.max_width &&
        r.height <= model.limits.max_height &&
        r.width <= draft.width &&
        r.height <= draft.height,
    ) ??
    model.resolutions.find((r) => r.state !== 'hard') ??
    model.resolutions[model.resolutions.length - 1]!

  const allowedFps = model.fpsOptions.filter((f) => !f.locked)
  const clampedFps =
    allowedFps.find((f) => f.fps === draft.fps)?.fps ??
    [...allowedFps].reverse().find((f) => f.fps <= draft.fps)?.fps ??
    allowedFps[allowedFps.length - 1]?.fps ??
    30

  const clampedKbps = Math.min(model.bitrateHardMaxKbps, Math.max(model.bitrateMinKbps, draft.kbps))

  return {
    matchMain: false,
    width:
      draft.width <= model.limits.max_width && draft.height <= model.limits.max_height
        ? draft.width
        : allowedRes.width,
    height:
      draft.width <= model.limits.max_width && draft.height <= model.limits.max_height
        ? draft.height
        : allowedRes.height,
    fps: clampedFps,
    kbps: clampedKbps,
  }
}

function encodeTupleKey(t: {
  canvas: string
  width: number
  height: number
  fps: number
  kbps: number
}): string {
  return `${t.canvas}:${t.width}x${t.height}@${t.fps}:${t.kbps}`
}

export function draftFitsLimits(
  limits: CustomQualityLimits,
  t: { width: number; height: number; fps: number; kbps: number },
): boolean {
  const allowedFps = limits.fps_choices.length === 0 || limits.fps_choices.includes(t.fps)
  return (
    t.width <= limits.max_width &&
    t.height <= limits.max_height &&
    allowedFps &&
    t.kbps >= limits.min_kbps &&
    t.kbps <= limits.max_kbps
  )
}

export function evaluateModalDraft(
  model: ModalModel,
  draft: ModalDraft,
  ctx: {
    dest: DestinationView
    allDestinations: readonly DestinationView[]
    live: boolean
    budget?: EncodeBudgetCheck | null | undefined
    ignoreServiceLimits?: boolean | undefined
  },
): ModalEvaluation {
  const same = model.sameAsMainResolved
  const effective =
    draft.matchMain && same
      ? {
          width: same.width,
          height: same.height,
          fps: same.fps,
          kbps: same.kbps,
          codec: same.codec,
        }
      : {
          width: draft.width,
          height: draft.height,
          fps: draft.fps,
          kbps: draft.kbps,
          codec: model.limits.codecs[0] ?? 'h264',
        }

  const fixedDraft = clampDraftToHardLimits(model, { ...draft, matchMain: false })
  const fixLabel = `Use ${formatModalResFps(fixedDraft.width, fixedDraft.height, fixedDraft.fps)} · ${formatModalRate(fixedDraft.kbps)}`

  let hardLimit: HardLimitIssue | null = null
  if (!draft.matchMain && !ctx.ignoreServiceLimits) {
    if (draft.width > model.limits.max_width || draft.height > model.limits.max_height) {
      hardLimit = {
        kind: 'resolution',
        reason: `${model.dest.name} closes streams above ${Math.min(model.limits.max_width, model.limits.max_height)}p.`,
        fixLabel,
        fixedDraft,
      }
    } else if (
      model.limits.fps_choices.length > 0 &&
      !model.limits.fps_choices.includes(draft.fps)
    ) {
      hardLimit = {
        kind: 'fps',
        reason: `${model.dest.name} accepts up to ${Math.max(...model.limits.fps_choices)} fps.`,
        fixLabel,
        fixedDraft,
      }
    } else if (draft.kbps > model.bitrateHardMaxKbps) {
      hardLimit = {
        kind: 'bitrate',
        reason: `${model.dest.name} closes streams above ${formatModalRate(model.bitrateHardMaxKbps)}.`,
        fixLabel,
        fixedDraft,
      }
    } else if (draft.kbps < model.bitrateMinKbps) {
      hardLimit = {
        kind: 'bitrate',
        reason: `Minimum video bitrate is ${formatModalRate(model.bitrateMinKbps)}.`,
        fixLabel,
        fixedDraft,
      }
    }
  }

  // Soft note check (either from matchMain resolved option note or custom resolution tier note).
  let softNote: string | null = null
  if (!hardLimit) {
    if (draft.matchMain) {
      softNote = same?.note ?? null
    } else {
      const matchedRes = model.resolutions.find(
        (r) => r.width === effective.width && r.height === effective.height,
      )
      softNote = matchedRes?.softNote ?? null
    }
  }

  // Peer sharing & budget computation across enabled destinations on the same canvas.
  const otherEnabled = ctx.allDestinations.filter(
    (other) => other.id !== ctx.dest.id && other.enabled && other.canvas === ctx.dest.canvas,
  )
  const draftKey = encodeTupleKey({
    canvas: ctx.dest.canvas,
    width: effective.width,
    height: effective.height,
    fps: effective.fps,
    kbps: effective.kbps,
  })
  const peerTuples = otherEnabled
    .map((other) => ({
      dest: other,
      resolved: other.resolved_quality,
    }))
    .filter(
      (
        item,
      ): item is {
        dest: DestinationView
        resolved: NonNullable<DestinationView['resolved_quality']>
      } => Boolean(item.resolved),
    )

  const sharesWith = peerTuples
    .filter(
      ({ resolved }) =>
        encodeTupleKey({
          canvas: ctx.dest.canvas,
          width: resolved.width,
          height: resolved.height,
          fps: resolved.fps,
          kbps: resolved.kbps,
        }) === draftKey,
    )
    .map(({ dest }) => dest.name)

  // Budget check using session delta against passed budget or model response budget.
  const activeBudget = ctx.budget ?? model.budget ?? null
  let budgetExceeded: BudgetIssue | null = null
  if (activeBudget && activeBudget.max_sessions !== null && activeBudget.max_sessions > 0) {
    const otherKeys = new Set(
      peerTuples.map(({ resolved }) =>
        encodeTupleKey({
          canvas: ctx.dest.canvas,
          width: resolved.width,
          height: resolved.height,
          fps: resolved.fps,
          kbps: resolved.kbps,
        }),
      ),
    )
    const currentResolved = model.destOpts?.resolved ?? ctx.dest.resolved_quality
    const currentKey = currentResolved
      ? encodeTupleKey({
          canvas: ctx.dest.canvas,
          width: currentResolved.width,
          height: currentResolved.height,
          fps: currentResolved.fps,
          kbps: currentResolved.kbps,
        })
      : draftKey

    const wasShared = ctx.dest.enabled && otherKeys.has(currentKey)
    const willShare = ctx.dest.enabled && otherKeys.has(draftKey)
    const deltaSessions = ctx.dest.enabled ? (wasShared ? 1 : 0) - (willShare ? 1 : 0) : 0
    const estimatedSessions = Math.max(1, (activeBudget.used_sessions ?? 1) + deltaSessions)
    const isSameAsOriginal =
      draftKey === currentKey &&
      ((draft.matchMain &&
        (model.destOpts?.current.mode ?? ctx.dest.quality?.mode ?? 'same_as_main') ===
          'same_as_main') ||
        (!draft.matchMain && (model.destOpts?.current.mode ?? ctx.dest.quality?.mode) === 'custom'))

    if (
      (estimatedSessions > activeBudget.max_sessions && !willShare) ||
      (activeBudget.status === 'over' && isSameAsOriginal && !willShare)
    ) {
      const compatiblePeer = peerTuples.find(({ resolved }) =>
        draftFitsLimits(model.limits, resolved),
      )
      const peer: ModalPeerCandidate | null = compatiblePeer
        ? {
            id: compatiblePeer.dest.id,
            name: compatiblePeer.dest.name,
            label: `${formatModalResFps(compatiblePeer.resolved.width, compatiblePeer.resolved.height, compatiblePeer.resolved.fps)} · ${formatModalRate(compatiblePeer.resolved.kbps)}`,
            quality:
              compatiblePeer.dest.quality?.mode === 'same_as_main' &&
              compatiblePeer.resolved.width === model.sameAsMainResolved?.width &&
              compatiblePeer.resolved.height === model.sameAsMainResolved?.height &&
              compatiblePeer.resolved.fps === model.sameAsMainResolved?.fps &&
              compatiblePeer.resolved.kbps === model.sameAsMainResolved?.kbps
                ? { mode: 'same_as_main' }
                : {
                    mode: 'custom',
                    width: compatiblePeer.resolved.width,
                    height: compatiblePeer.resolved.height,
                    fps: compatiblePeer.resolved.fps,
                    kbps: compatiblePeer.resolved.kbps,
                    codec: null,
                  },
          }
        : null
      budgetExceeded = {
        usedSessions: estimatedSessions,
        maxSessions: activeBudget.max_sessions,
        peer,
        matchLabel: peer ? `Match ${peer.name} · ${peer.label}` : null,
      }
    }
  }

  let badgeKind: ModalEvaluation['badgeKind'] = 'own'
  let badgeText = 'Own encode'
  if (sharesWith.length > 0) {
    badgeKind = 'shared'
    badgeText = `Shares one encode with ${sharesWith.join(' & ')}`
  } else if (draft.matchMain) {
    if (same?.auto_fitted) {
      badgeKind = 'fitted'
      badgeText = `Fitted to ${model.dest.name}`
    } else {
      badgeKind = 'same'
      badgeText = 'Same as main'
    }
  }

  const initial = model.destOpts?.current ?? model.dest.quality ?? { mode: 'same_as_main' as const }
  const isDirty =
    draft.matchMain !== (initial.mode === 'same_as_main') ||
    (!draft.matchMain &&
      initial.mode === 'custom' &&
      (initial.width !== draft.width ||
        initial.height !== draft.height ||
        initial.fps !== draft.fps ||
        initial.kbps !== draft.kbps))

  const isReconnecting = ctx.dest.enabled && ctx.dest.health?.state === 'reconnecting'
  const resultTone: ModalEvaluation['resultTone'] = hardLimit
    ? 'bad'
    : budgetExceeded || softNote || isReconnecting
      ? 'warn'
      : 'neutral'

  const blockedByLock = Boolean(model.lockedReason)
  const blocked = blockedByLock || Boolean(hardLimit) || Boolean(budgetExceeded)
  const canApply = !blocked && (isDirty || isReconnecting)

  return {
    effective,
    resultTone,
    badgeKind,
    badgeText,
    sharesWith,
    hardLimit,
    budgetExceeded,
    softNote,
    isReconnecting,
    isDirty,
    canApply,
    applyLabel: isReconnecting ? 'Apply when back' : 'Apply',
    footerCopy: ctx.live
      ? `Switches only ${model.dest.name}. Your stream keeps going.`
      : 'Applies from your next stream.',
  }
}

export function toDestinationQualityPayload(draft: ModalDraft): DestinationQuality {
  if (draft.matchMain) {
    return { mode: 'same_as_main' }
  }
  return {
    mode: 'custom',
    width: draft.width,
    height: draft.height,
    fps: draft.fps,
    kbps: draft.kbps,
    codec: null,
  }
}

export function buildMatchMainComparison(
  model: ModalModel,
  ignoreServiceLimits = false,
): MatchMainComparison {
  const isVertical = model.dest.canvas === 'vertical'
  const switchMatchLabel = isVertical ? 'Match vertical picture' : 'Match main stream'
  const baseLabel = isVertical ? 'Vertical picture' : 'Main stream'

  const baseRaw = model.canvasMain ??
    model.sameAsMainResolved ?? {
      width: isVertical ? 1080 : 1920,
      height: isVertical ? 1920 : 1080,
      fps: 60,
      kbps: 6000,
      codec: 'h264',
    }

  const hasSharedDetail = Boolean(
    model.dest.capped &&
    !model.dest.capped.separate_encode &&
    (model.dest.capped.detail.includes('Your PC can run') ||
      model.dest.capped.summary.startsWith('Shared cap:') ||
      model.budget?.status === 'over'),
  )
  const overBudgetShared =
    hasSharedDetail ||
    Boolean(model.sameAsMainResolved?.allowed === false && model.budget?.status === 'over') ||
    Boolean(
      model.budget?.status === 'over' &&
      model.budget.max_sessions === 1 &&
      model.sameAsMainResolved?.shares_encoder_with.length,
    )

  const cappedFallback =
    overBudgetShared && model.dest.resolved_quality
      ? {
          width: model.dest.resolved_quality.width,
          height: model.dest.resolved_quality.height,
          fps: model.dest.resolved_quality.fps,
          kbps: Math.min(
            model.dest.resolved_quality.kbps,
            model.dest.capped?.kbps && model.dest.capped.kbps > 0
              ? model.dest.capped.kbps
              : model.dest.resolved_quality.kbps,
          ),
          codec: model.dest.resolved_quality.codec,
        }
      : overBudgetShared && model.dest.capped && model.dest.capped.kbps > 0
        ? {
            width: model.dest.capped.resolution?.[0] ?? baseRaw.width,
            height: model.dest.capped.resolution?.[1] ?? baseRaw.height,
            fps: model.dest.capped.fps ?? baseRaw.fps,
            kbps: model.dest.capped.kbps,
            codec: baseRaw.codec,
          }
        : null

  const fittedRaw =
    cappedFallback &&
    (cappedFallback.kbps < (model.sameAsMainResolved?.kbps ?? baseRaw.kbps) ||
      cappedFallback.width < (model.sameAsMainResolved?.width ?? baseRaw.width))
      ? cappedFallback
      : (model.sameAsMainResolved ?? baseRaw)

  const base: MatchMainEndpoint = {
    width: baseRaw.width,
    height: baseRaw.height,
    fps: baseRaw.fps,
    kbps: baseRaw.kbps,
    codec: baseRaw.codec,
    resFps: formatModalResFps(baseRaw.width, baseRaw.height, baseRaw.fps),
    rate: formatModalRate(baseRaw.kbps),
    dims: `${baseRaw.width} × ${baseRaw.height}`,
  }
  const fitted: MatchMainEndpoint = {
    width: fittedRaw.width,
    height: fittedRaw.height,
    fps: fittedRaw.fps,
    kbps: fittedRaw.kbps,
    codec: fittedRaw.codec,
    resFps: formatModalResFps(fittedRaw.width, fittedRaw.height, fittedRaw.fps),
    rate: formatModalRate(fittedRaw.kbps),
    dims: `${fittedRaw.width} × ${fittedRaw.height}`,
  }

  const resCut = fitted.width < base.width || fitted.height < base.height
  const fpsCut = fitted.fps < base.fps
  const rateCut = fitted.kbps < base.kbps
  const anyCut = resCut || fpsCut || rateCut

  let sharedCap: MatchMainSharedCap | null = null
  if (overBudgetShared) {
    const maxSessions = model.budget?.max_sessions ?? 1
    const fallbackDetail = `Your PC can run ${maxSessions} stream ${maxSessions === 1 ? 'encode' : 'encodes'} at once; lower main quality or turn off a platform.`
    sharedCap = {
      maxSessions,
      summary: model.dest.capped?.summary ?? `Shared cap: ${fitted.resFps} · ${fitted.rate}`,
      detail: model.dest.capped?.detail?.includes('Your PC can run')
        ? model.dest.capped.detail
        : fallbackDetail,
    }
  }

  const reasons: string[] = []
  if (sharedCap) {
    reasons.push(sharedCap.detail)
  } else if (!anyCut) {
    reasons.push('Exactly the same picture, no extra work for your PC.')
  } else {
    if (resCut) {
      reasons.push(
        `Size lowered to ${Math.min(fitted.width, fitted.height)}p, ${model.dest.name}’s limit.`,
      )
    }
    if (fpsCut) {
      reasons.push(`Frame rate lowered to ${fitted.fps} fps, ${model.dest.name}’s limit.`)
    }
    if (rateCut) {
      reasons.push(`Bitrate capped at ${fitted.rate}, ${model.dest.name}’s limit.`)
    }
    const baseKeep = isVertical
      ? `Your vertical picture keeps ${base.resFps}.`
      : `Your recording keeps ${base.resFps}.`
    reasons.push(`Runs as its own encode. ${baseKeep}`)
  }

  let softTip: MatchMainSoftTip | null = null
  const fittedShort = Math.min(fitted.width, fitted.height)
  const hasSoftWarning =
    !ignoreServiceLimits &&
    !sharedCap &&
    fittedShort > 1080 &&
    (Boolean(model.sameAsMainResolved?.note) ||
      (model.softNoteThresholdShort !== null && fittedShort >= model.softNoteThresholdShort))
  if (hasSoftWarning) {
    const portrait = isVertical || fitted.height > fitted.width
    const targetWidth = Math.min(model.limits.max_width, portrait ? 1080 : 1920)
    const targetHeight = Math.min(model.limits.max_height, portrait ? 1920 : 1080)
    const allowedFps = model.fpsOptions.filter(
      (f) => !f.locked && f.fps <= Math.min(fitted.fps, 60),
    )
    const targetFps = allowedFps[allowedFps.length - 1]?.fps ?? Math.min(fitted.fps, 60)
    const targetKbps = Math.min(model.bitrateHardMaxKbps, Math.max(model.bitrateMinKbps, base.kbps))
    const targetResFps = formatModalResFps(targetWidth, targetHeight, targetFps)
    softTip = {
      text: `${fitted.resFps} at ${fitted.rate} can look soft on ${model.dest.name}. ${targetResFps} is sharper at this bitrate.`,
      actionLabel: `Use ${targetResFps}`,
      targetDraft: {
        matchMain: false,
        width: targetWidth,
        height: targetHeight,
        fps: targetFps,
        kbps: targetKbps,
      },
    }
  }

  return {
    switchMatchLabel,
    baseLabel,
    base,
    fitted,
    resCut,
    fpsCut,
    rateCut,
    anyCut,
    sharedCap,
    reasons,
    softTip,
  }
}

export function mapQualityApiError(
  code: string | null | undefined,
  message: string,
  destName: string | null,
): ApiQualityErrorInfo {
  const label = destName ?? 'this platform'
  switch (code) {
    case 'golive_quality_locked':
      return {
        kind: 'locked',
        title: message || 'Quality is locked right now.',
        detail: 'Turn OBS streaming or server override off before changing quality here.',
        retryable: false,
        canClamp: false,
      }
    case 'platform_limit_exceeded':
      return {
        kind: 'limit',
        title: message || `${label} cannot use that quality.`,
        detail: 'Lower the resolution, frame rate, or bitrate to fit this platform.',
        retryable: false,
        canClamp: true,
      }
    case 'encode_budget_exceeded':
      return {
        kind: 'budget',
        title: message || 'Too many different qualities for this PC.',
        detail: 'Match another platform or pick Same as main so they share an encode.',
        retryable: false,
        canClamp: false,
      }
    case 'golive_switch_timeout':
      return {
        kind: 'timeout',
        title: `Couldn't switch ${label}. Kept previous quality.`,
        detail: message || 'No keyframe arrived in time. Nothing else was touched.',
        retryable: true,
        canClamp: false,
      }
    default:
      return {
        kind: 'other',
        title: message || "Couldn't apply that quality change.",
        detail: 'Check your connection to the Studio and try again.',
        retryable: true,
        canClamp: false,
      }
  }
}
