import {
  mbps,
  type CappedInfo,
  type DestinationView,
  type EncodeBudgetCheck,
  type PasteBrand,
  type QualitySource,
  type Service,
} from '@ferrocast/api'

const DEFAULT_AUDIO_KBPS = 160

export type DestinationCapInput = Pick<
  DestinationView,
  'id' | 'kind' | 'name' | 'enabled' | 'canvas' | 'light' | 'enhanced' | 'blocked'
> & {
  capped?: CappedInfo | null | undefined
  direct?: DestinationView['direct']
  brand?: PasteBrand | undefined
  quality?: DestinationView['quality']
  resolved_quality?: DestinationView['resolved_quality']
  switching_quality?: boolean | undefined
  quality_note?: string | null | undefined
  lighter_for_route?: boolean | undefined
  standby_for?: string | undefined
  backup_for?: string | undefined
  health?: DestinationView['health']
  issues?: DestinationView['issues']
}

export interface StreamCapLimiter {
  id: string
  name: string
  kbps: number
}

export interface StreamCapSummary {
  capped: boolean
  chosenVideoKbps: number | null
  effectiveVideoKbps: number | null
  limiter: StreamCapLimiter | null
  caps: StreamCapLimiter[]
  heldBackIds: string[]
  settingsNote: string | null
  settingsDetail?: string | null
}

export interface StreamCapOptions {
  ignoreServiceLimits?: boolean | undefined
  live?: boolean | undefined
  encodeBudget?: EncodeBudgetCheck | null | undefined
  source?: QualitySource | undefined
  draftWidth?: number | undefined
  draftHeight?: number | undefined
  draftFps?: number | undefined
}

export interface DestinationRateDisplay {
  /** Resolved total send bitrate (video + audio, or live measured) in kbps, or null when off. */
  kbps: number | null
  /** Formatted actual send bitrate when active (for example "6.2 Mbps" or "12 Mbps"), else null. */
  rateLabel: string | null
  /** Calm explanation when a shared stream is limited by another platform, else null. */
  heldBackNote: { summary: string; detail: string } | null
  /** Calm explanation when this destination carries its own cap, else null. */
  ownCapNote: { summary: string; detail: string } | null
}

export interface SettingsBitrateDraft {
  videoKbps: number
  width: number
  height: number
  fps: number
}

export interface SettingsBitrateItem {
  id: string
  name: string
  kbps: number
  width: number
  height: number
  fps: number
  separateEncode: boolean
  reason: 'main' | 'cap' | 'custom' | 'shared_cap' | 'light'
}

export interface SettingsBitrateBreakdown {
  line: string | null
  detail: string | null
  differsFromMain: boolean
  items: SettingsBitrateItem[]
}

/** Hard video bitrate ceiling (kbps) enforced by a platform's RTMP ingest, or null if unlimited. */
export function platformCeilingKbps(kind: Service, enhanced?: boolean): number | null {
  if (enhanced) return null
  if (kind === 'twitch') return 6000
  if (kind === 'kick') return 8000
  return null
}

function isBitrateCapInfo(d: DestinationCapInput): boolean {
  if (!d.capped || d.capped.separate_encode || d.capped.kbps <= 0) return false
  if (d.direct) return false
  const s = (d.capped.summary ?? '').toLowerCase()
  return !s.includes('b-frames') && !s.includes('webrtc')
}

/** Own hard ceiling for a shared main destination: ignores light, direct, blocked, and standby rows. */
export function ownCeilingKbps(d: DestinationCapInput): number | null {
  if (d.direct || d.light || d.lighter_for_route || d.blocked || d.standby_for) return null
  if (isBitrateCapInfo(d)) {
    return d.capped!.kbps
  }
  return platformCeilingKbps(d.kind, d.enhanced)
}

export function formatSendMbps(kbps: number): string {
  return `${(kbps / 1000).toFixed(1)} Mbps`
}

export function formatCapMbps(kbps: number): string {
  const m = kbps / 1000
  return Number.isInteger(m) ? `${m} Mbps` : `${m.toFixed(1)} Mbps`
}

function formatCompactMbpsNumber(kbps: number): string {
  const m = Math.round((kbps / 1000) * 10) / 10
  return Number.isInteger(m) ? String(m) : m.toFixed(1)
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function isMainActive(d: DestinationCapInput): boolean {
  return Boolean(d.enabled && (d.canvas ?? 'main') === 'main' && !d.blocked && !d.standby_for)
}

function sharesMainEncode(d: DestinationCapInput): boolean {
  return isMainActive(d) && !d.light && !d.lighter_for_route && !d.enhanced
}

function canSeparateForContext(
  destinations: readonly DestinationCapInput[],
  opts: { encodeBudget?: EncodeBudgetCheck | null | undefined; source?: QualitySource | undefined },
): boolean {
  if (opts.source === 'obs') return false
  if (opts.encodeBudget?.max_sessions === 1) return false
  const mainActive = destinations.filter(isMainActive)
  if (mainActive.some((d) => isBitrateCapInfo(d))) return false
  if (opts.encodeBudget != null || opts.source === 'studio') return true
  return mainActive.some((d) => d.resolved_quality != null)
}

function uncappedSummary(
  chosenVideoKbps: number | null,
  settingsNote: string | null = null,
  settingsDetail: string | null = null,
): StreamCapSummary {
  return {
    capped: false,
    chosenVideoKbps,
    effectiveVideoKbps: chosenVideoKbps,
    limiter: null,
    caps: [],
    heldBackIds: [],
    settingsNote,
    ...(settingsDetail !== undefined ? { settingsDetail } : {}),
  }
}

function buildCapSettingsNote(
  chosenVideoKbps: number,
  caps: StreamCapLimiter[],
  mainCount: number,
  live: boolean,
): string {
  const lowest = caps[0]!
  const tiedLowest = caps.filter((c) => c.kbps === lowest.kbps)
  const higherCaps = caps.filter((c) => c.kbps > lowest.kbps)
  const send = formatSendMbps(lowest.kbps)
  const lowCap = formatCapMbps(lowest.kbps)
  const chosen = formatCapMbps(chosenVideoKbps)
  const samePicture = mainCount > 1 ? ', and every place gets the same picture' : ''
  const who =
    caps.length === 1
      ? lowest.name
      : tiedLowest.length === caps.length && caps.length === 2
        ? 'them'
        : joinAnd(caps.map((c) => c.name))

  let limitDetail: string
  if (tiedLowest.length > 1 && higherCaps.length === 0) {
    limitDetail = `${joinAnd(tiedLowest.map((c) => c.name))} take at most ${lowCap}${samePicture}`
  } else if (higherCaps.length > 0) {
    const others = joinAnd(
      higherCaps.map((c) => `${c.name} takes at most ${formatCapMbps(c.kbps)}`),
    )
    limitDetail = `${lowest.name} takes at most ${lowCap} (and ${others})${samePicture}`
  } else {
    limitDetail = `${lowest.name} takes at most ${lowCap}${samePicture}`
  }

  if (live) {
    return `Sending ${send} on this stream; turning ${who} off applies from your next stream. ${limitDetail}.`
  }
  const turnVerb = who === 'them' ? 'Turn them off' : `Turn ${who} off`
  return `Will send ${send}. ${limitDetail}. ${turnVerb} to send ${chosen}.`
}

function fitDimensions(
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
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2)
  return [even(srcW), even(srcH)]
}

function largestFpsDivisor(srcFps: number, maxFps: number | null): number {
  if (maxFps == null || srcFps <= maxFps) return srcFps
  for (let d = maxFps; d >= 1; d--) {
    if (srcFps % d === 0) return d
  }
  return maxFps
}

function facebookMaxKbps(width: number, height: number, fps: number): number {
  const shortEdge = Math.min(width, height)
  const high = fps > 30
  if (shortEdge >= 1080) return high ? 9000 : 6000
  if (shortEdge >= 720) return high ? 6000 : 4000
  if (shortEdge >= 480) return high ? 3000 : 2000
  return high ? 1500 : 1000
}

function fitPlatformForDraft(
  draft: SettingsBitrateDraft,
  d: DestinationCapInput,
): { width: number; height: number; fps: number; maxKbps: number; softRecShort: number | null } {
  if (d.kind === 'twitch') {
    return {
      width: draft.width,
      height: draft.height,
      fps: draft.fps,
      maxKbps: 6000,
      softRecShort: Math.min(draft.width, draft.height) > 1080 ? 1080 : null,
    }
  }
  if (d.kind === 'kick') {
    const [width, height] = fitDimensions(draft.width, draft.height, 1920, 1080)
    const fps = largestFpsDivisor(draft.fps, 60)
    return { width, height, fps, maxKbps: 8000, softRecShort: null }
  }
  if (d.kind === 'youtube') {
    const [width, height] = fitDimensions(draft.width, draft.height, 3840, 2160)
    const fps = largestFpsDivisor(draft.fps, 60)
    return { width, height, fps, maxKbps: 51000, softRecShort: null }
  }
  if (d.brand === 'facebook') {
    const [width, height] = fitDimensions(draft.width, draft.height, 1920, 1080)
    const fps = largestFpsDivisor(draft.fps, 60)
    return { width, height, fps, maxKbps: facebookMaxKbps(width, height, fps), softRecShort: null }
  }
  if (d.brand === 'x') {
    const [width, height] = fitDimensions(draft.width, draft.height, 1920, 1080)
    const fps = largestFpsDivisor(draft.fps, 60)
    return { width, height, fps, maxKbps: 12000, softRecShort: null }
  }
  if (d.brand === 'instagram') {
    const [width, height] = fitDimensions(draft.width, draft.height, 1280, 720)
    const fps = largestFpsDivisor(draft.fps, 30)
    return { width, height, fps, maxKbps: 4000, softRecShort: null }
  }
  return {
    width: draft.width,
    height: draft.height,
    fps: draft.fps,
    maxKbps: 60000,
    softRecShort: null,
  }
}

/**
 * Concise single-line per-platform bitrate readout (plus calm detail for `(i)`) for Studio Settings.
 */
export function describeSettingsBitrates(
  draft: SettingsBitrateDraft,
  destinations: readonly DestinationCapInput[],
  opts: {
    ignoreServiceLimits?: boolean | undefined
    encodeBudget?: EncodeBudgetCheck | null | undefined
    source?: QualitySource | undefined
  } = {},
): SettingsBitrateBreakdown {
  const active = destinations.filter(isMainActive)
  if (active.length === 0) {
    return { line: null, detail: null, differsFromMain: false, items: [] }
  }

  const canSeparate = canSeparateForContext(destinations, opts)
  const items: SettingsBitrateItem[] = active.map((d) => {
    if (d.light || d.lighter_for_route) {
      const [width, height] = fitDimensions(draft.width, draft.height, 1280, 720)
      const fps = largestFpsDivisor(draft.fps, 30)
      return {
        id: d.id,
        name: d.name,
        kbps: Math.min(draft.videoKbps, 3000),
        width,
        height,
        fps,
        separateEncode: canSeparate,
        reason: 'light',
      }
    }
    if (d.quality?.mode === 'custom') {
      return {
        id: d.id,
        name: d.name,
        kbps: d.quality.kbps,
        width: d.quality.width,
        height: d.quality.height,
        fps: d.quality.fps,
        separateEncode:
          canSeparate &&
          (d.quality.kbps !== draft.videoKbps ||
            d.quality.width !== draft.width ||
            d.quality.height !== draft.height ||
            d.quality.fps !== draft.fps),
        reason: 'custom',
      }
    }
    if (opts.ignoreServiceLimits || d.enhanced || d.direct) {
      return {
        id: d.id,
        name: d.name,
        kbps: draft.videoKbps,
        width: draft.width,
        height: draft.height,
        fps: draft.fps,
        separateEncode: false,
        reason: 'main',
      }
    }
    const fit = fitPlatformForDraft(draft, d)
    const kbps = Math.min(draft.videoKbps, fit.maxKbps)
    const changed =
      kbps < draft.videoKbps ||
      fit.width !== draft.width ||
      fit.height !== draft.height ||
      fit.fps !== draft.fps
    return {
      id: d.id,
      name: d.name,
      kbps,
      width: fit.width,
      height: fit.height,
      fps: fit.fps,
      separateEncode: canSeparate && changed,
      reason: changed ? 'cap' : 'main',
    }
  })

  if (!canSeparate) {
    const cappedShared = items.filter(
      (i) => i.reason === 'cap' && active.find((d) => d.id === i.id)?.direct == null,
    )
    if (cappedShared.length > 0) {
      cappedShared.sort((a, b) => a.kbps - b.kbps)
      const lowest = cappedShared[0]!
      for (const item of items) {
        if (item.reason !== 'light' && item.reason !== 'custom' && item.id !== lowest.id) {
          item.kbps = Math.min(item.kbps, lowest.kbps)
          item.width = lowest.width
          item.height = lowest.height
          item.fps = lowest.fps
          item.separateEncode = false
          if (item.reason === 'main') item.reason = 'shared_cap'
        }
      }
      const line =
        items.length === 1
          ? `${lowest.name} ${formatCompactMbpsNumber(lowest.kbps)} Mbps (max)`
          : `Shared ${formatCompactMbpsNumber(lowest.kbps)} Mbps (${lowest.name} max)`
      const detail =
        `${lowest.name} takes at most ${formatCapMbps(lowest.kbps)}` +
        (items.length > 1 ? ', so every main platform shares that stream.' : '.')
      return { line, detail, differsFromMain: true, items }
    }
  }

  const differsFromMain = items.some(
    (i) =>
      i.kbps !== draft.videoKbps ||
      i.width !== draft.width ||
      i.height !== draft.height ||
      i.fps !== draft.fps,
  )

  let line: string
  if (!differsFromMain) {
    line = `${items.map((i) => i.name).join(', ')} ${formatCompactMbpsNumber(draft.videoKbps)} Mbps`
  } else if (items.length === 1) {
    const only = items[0]!
    const resDiff =
      only.width !== draft.width || only.height !== draft.height
        ? ` (${Math.min(only.width, only.height)}p)`
        : ''
    const maxTag = only.reason === 'cap' ? ' (max)' : ''
    line = `${only.name} ${formatCompactMbpsNumber(only.kbps)} Mbps${maxTag}${resDiff}`
  } else {
    let anySuffix = false
    const parts = items.map((i) => {
      const resDiff =
        i.width !== draft.width || i.height !== draft.height
          ? ` (${Math.min(i.width, i.height)}p)`
          : ''
      if (resDiff) anySuffix = true
      return `${i.name} ${formatCompactMbpsNumber(i.kbps)}${resDiff}`
    })
    line = anySuffix ? parts.join(' · ') : `${parts.join(' · ')} Mbps`
  }

  const detailParts = items.map((i) => {
    const shortRes = `${Math.min(i.width, i.height)}p${i.fps === draft.fps ? '' : i.fps}`
    const rate = formatCapMbps(i.kbps)
    const src = active.find((d) => d.id === i.id)
    const soft =
      !opts.ignoreServiceLimits && src ? fitPlatformForDraft(draft, src).softRecShort : null
    if (i.reason === 'cap') {
      const softSuffix = soft ? `, below ${i.name} recommended ${soft}p` : ''
      return `${i.name} takes at most ${rate} (${shortRes}${softSuffix}).`
    }
    if (i.reason === 'custom') return `${i.name} is set to ${shortRes} at ${rate}.`
    if (i.reason === 'light') return `${i.name} uses the lighter 720p stream (${rate}).`
    return `${i.name} gets ${shortRes} at ${rate}.`
  })

  return {
    line,
    detail: detailParts.join(' '),
    differsFromMain,
    items,
  }
}

/**
 * Pure cap summary across enabled main-canvas destinations for a chosen video bitrate.
 */
export function describeStreamCap(
  chosenVideoKbps: number,
  destinations: readonly DestinationCapInput[],
  opts: StreamCapOptions = {},
): StreamCapSummary {
  if (opts.ignoreServiceLimits) return uncappedSummary(chosenVideoKbps)

  const mainActive = destinations.filter(sharesMainEncode)
  if (mainActive.length === 0) return uncappedSummary(chosenVideoKbps)

  const caps: StreamCapLimiter[] = []
  for (const d of mainActive) {
    const ceil = ownCeilingKbps(d)
    if (ceil !== null && ceil < chosenVideoKbps) {
      caps.push({ id: d.id, name: d.name, kbps: ceil })
    }
  }
  caps.sort((a, b) => a.kbps - b.kbps)

  if (caps.length === 0) return uncappedSummary(chosenVideoKbps)

  // Live stream whose cap failed (`cap_failed`): engine keeps bitrate issues and drops `d.capped`.
  if (
    opts.live &&
    mainActive.every((d) => !isBitrateCapInfo(d)) &&
    mainActive.some((d) => d.issues?.some((i) => i.code === 'bitrate'))
  ) {
    return uncappedSummary(chosenVideoKbps)
  }

  if (canSeparateForContext(destinations, opts)) {
    const breakdown = describeSettingsBitrates(
      {
        videoKbps: chosenVideoKbps,
        width: opts.draftWidth ?? 1920,
        height: opts.draftHeight ?? 1080,
        fps: opts.draftFps ?? 60,
      },
      destinations,
      opts,
    )
    return uncappedSummary(
      chosenVideoKbps,
      breakdown.differsFromMain ? breakdown.line : null,
      breakdown.differsFromMain ? breakdown.detail : null,
    )
  }

  const limiter = caps[0]!
  const heldBackIds = mainActive
    .filter((d) => {
      if (d.id === limiter.id) return false
      const own = ownCeilingKbps(d)
      return own === null || own > limiter.kbps
    })
    .map((d) => d.id)

  return {
    capped: true,
    chosenVideoKbps,
    effectiveVideoKbps: limiter.kbps,
    limiter,
    caps,
    heldBackIds,
    settingsNote: buildCapSettingsNote(
      chosenVideoKbps,
      caps,
      mainActive.length,
      Boolean(opts.live),
    ),
    settingsDetail: null,
  }
}

/**
 * Pure cap summary derived directly from a `GoLiveView` snapshot.
 */
export function describeStreamCapFromView(
  destinations: readonly DestinationCapInput[],
  chosenVideoKbps: number | null = null,
  opts: StreamCapOptions = {},
): StreamCapSummary {
  const validChosen = chosenVideoKbps !== null && chosenVideoKbps > 0 ? chosenVideoKbps : null
  if (opts.ignoreServiceLimits) return uncappedSummary(validChosen)

  const mainActive = destinations.filter(sharesMainEncode)
  const sharedCapped = mainActive.filter(isBitrateCapInfo)

  // Explicit shared fallback (Pass-2 or OBS) carries `d.capped` with `separate_encode: false`.
  if (sharedCapped.length > 0) {
    const caps: StreamCapLimiter[] = sharedCapped
      .map((d) => ({ id: d.id, name: d.name, kbps: d.capped!.kbps }))
      .sort((a, b) => a.kbps - b.kbps)
    const limiter = caps[0]!
    const heldBackIds = mainActive
      .filter((d) => {
        if (d.id === limiter.id) return false
        const own = ownCeilingKbps(d)
        return own === null || own > limiter.kbps
      })
      .map((d) => d.id)
    const chosenForNote = validChosen ?? limiter.kbps
    return {
      capped: true,
      chosenVideoKbps: validChosen,
      effectiveVideoKbps: limiter.kbps,
      limiter,
      caps,
      heldBackIds,
      settingsNote:
        validChosen !== null && validChosen > limiter.kbps
          ? buildCapSettingsNote(chosenForNote, caps, mainActive.length, Boolean(opts.live))
          : null,
      settingsDetail: null,
    }
  }

  // When every active main destination reports `resolved_quality` and none has `separate_encode: false`
  // capping, separate encodes handle limits independently without lowering the main encode.
  const hasAnyResolved = mainActive.some((d) => d.resolved_quality != null)
  if (hasAnyResolved && opts.source !== 'obs' && opts.encodeBudget?.max_sessions !== 1) {
    const mainDest =
      mainActive.find((d) => !d.resolved_quality?.separate_encode && d.resolved_quality) ??
      mainActive.find((d) => d.resolved_quality)
    const effective = validChosen ?? mainDest?.resolved_quality?.kbps ?? null
    if (validChosen !== null) return describeStreamCap(validChosen, destinations, opts)
    return uncappedSummary(effective)
  }

  if (validChosen !== null) return describeStreamCap(validChosen, destinations, opts)
  return uncappedSummary(null)
}

/**
 * Pure per-row bitrate label and calm explanation for `GoLiveDock` and `Your platforms`.
 */
export function describeDestinationRate(
  d: DestinationCapInput,
  summary: StreamCapSummary,
  opts: {
    streamKbps?: number | null
    verticalKbps?: number | null
    videoKbps?: number | null
    audioKbps?: number
    ignoreServiceLimits?: boolean
    live?: boolean
  } = {},
): DestinationRateDisplay {
  const sendingBackup = !d.enabled && !!d.backup_for && d.health?.state === 'live'
  if ((!d.enabled && !sendingBackup) || d.blocked || d.standby_for) {
    return { kbps: null, rateLabel: null, heldBackNote: null, ownCapNote: null }
  }

  const audioKbps = opts.audioKbps ?? DEFAULT_AUDIO_KBPS
  const capActive =
    !opts.ignoreServiceLimits && summary.capped && summary.effectiveVideoKbps !== null

  let effectiveKbps: number | null = null
  if (d.health?.state === 'live' && d.health.kbps > 0) {
    effectiveKbps = d.health.kbps
  } else if (d.resolved_quality && d.resolved_quality.kbps > 0) {
    effectiveKbps = d.resolved_quality.kbps + d.resolved_quality.audio_kbps
  } else if (d.canvas === 'vertical') {
    effectiveKbps =
      opts.verticalKbps && opts.verticalKbps > 0 ? opts.verticalKbps : 4500 + audioKbps
  } else if (d.light || d.lighter_for_route) {
    const videoBase =
      opts.videoKbps && opts.videoKbps > 0
        ? opts.videoKbps
        : (summary.chosenVideoKbps ??
          (opts.streamKbps && opts.streamKbps > audioKbps
            ? opts.streamKbps - audioKbps
            : (summary.effectiveVideoKbps ?? 6000)))
    effectiveKbps = Math.min(videoBase, 3000) + audioKbps
  } else if (opts.live && opts.streamKbps && opts.streamKbps > 0) {
    effectiveKbps = opts.streamKbps
  } else if (capActive && summary.effectiveVideoKbps !== null) {
    effectiveKbps = summary.effectiveVideoKbps + audioKbps
  } else if (opts.videoKbps && opts.videoKbps > 0) {
    effectiveKbps = opts.videoKbps + audioKbps
  } else if (opts.streamKbps && opts.streamKbps > 0) {
    effectiveKbps = opts.streamKbps
  } else if (summary.effectiveVideoKbps !== null) {
    effectiveKbps = summary.effectiveVideoKbps + audioKbps
  }

  const rateLabel = effectiveKbps !== null ? mbps(effectiveKbps) : null
  const limiter = summary.limiter

  const hasCoalescedLowerShare =
    Boolean(d.resolved_quality?.separate_encode) &&
    Boolean(d.resolved_quality?.auto_fitted) &&
    !d.capped &&
    (d.resolved_quality?.shared_with.length ?? 0) > 0

  if (d.resolved_quality && !summary.capped) {
    const ownCapNote =
      !opts.ignoreServiceLimits && d.capped
        ? { summary: d.capped.summary, detail: d.capped.detail }
        : null
    const heldBackNote =
      hasCoalescedLowerShare && rateLabel
        ? {
            summary: `Same stream as ${joinAnd(d.resolved_quality.shared_with)}: ${rateLabel}`,
            detail: `Ferrocast shares one ${rateLabel} stream with ${joinAnd(d.resolved_quality.shared_with)} to stay within your PC's encode budget.`,
          }
        : null
    return { kbps: effectiveKbps, rateLabel, heldBackNote, ownCapNote }
  }

  const isHeldBack =
    capActive && limiter !== null && sharesMainEncode(d) && summary.heldBackIds.includes(d.id)

  const sharedTotalLabel = capActive ? mbps(summary.effectiveVideoKbps! + audioKbps) : null
  const chosenPart =
    capActive &&
    summary.chosenVideoKbps !== null &&
    summary.chosenVideoKbps > summary.effectiveVideoKbps!
      ? ` instead of ${mbps(summary.chosenVideoKbps + audioKbps)}`
      : ''

  const hasLimiterExplanation =
    !!d.capped && (!limiter || (d.capped.summary ?? '').includes(limiter.name))

  const heldBackNote =
    isHeldBack && !hasLimiterExplanation && limiter && sharedTotalLabel
      ? {
          summary: `Same stream as ${limiter.name}: ${sharedTotalLabel}`,
          detail: `Ferrocast sends one shared main picture to every ticked platform. Because ${limiter.name} takes at most ${formatCapMbps(limiter.kbps)} for video, ${d.name} gets ${sharedTotalLabel} (${formatSendMbps(summary.effectiveVideoKbps!)} video + ${audioKbps} kbps sound)${chosenPart}. Turn ${limiter.name} off to lift this limit.`,
        }
      : null

  const ownCap = ownCeilingKbps(d)
  const ownCapNote =
    !opts.ignoreServiceLimits && d.capped
      ? { summary: d.capped.summary, detail: d.capped.detail }
      : capActive &&
          limiter &&
          ownCap !== null &&
          ownCap === limiter.kbps &&
          summary.chosenVideoKbps !== null &&
          summary.chosenVideoKbps > ownCap
        ? {
            summary: `Capped at ${ownCap.toLocaleString()} kbps for ${d.name}`,
            detail: `Your ${summary.chosenVideoKbps.toLocaleString()} kbps stream is capped at ${ownCap.toLocaleString()} kbps H.264 (2 s keyframes, 1x VBV) so ${d.name} viewers don't stutter.`,
          }
        : null

  return { kbps: effectiveKbps, rateLabel, heldBackNote, ownCapNote }
}

function roundedMbpsValue(kbps: number): number {
  const m = kbps / 1000
  return m < 10 ? Math.round(m * 10) / 10 : Math.round(m)
}

function formatMbpsValue(clean: number): string {
  return clean >= 10 && Number.isInteger(clean) ? `${clean} Mbps` : `${clean.toFixed(1)} Mbps`
}

export function describeUploadNeed(
  ticked: readonly (Pick<DestinationView, 'health' | 'name'> & {
    kbps?: number | null
    resolved_quality?: DestinationView['resolved_quality']
  })[],
  opts: {
    planKbps: number
    vertical: boolean
    limiterName?: string | null | undefined
    limiterKbps?: number | null | undefined
    audioKbps?: number
  },
): { line: string; detail: string } | null {
  const count = ticked.length
  if (count === 0) return null
  const audioKbps = opts.audioKbps ?? DEFAULT_AUDIO_KBPS
  const rawRates = ticked.map((d) =>
    d.health?.kbps && d.health.kbps > 0
      ? d.health.kbps
      : d.kbps && d.kbps > 0
        ? d.kbps
        : d.resolved_quality && d.resolved_quality.kbps > 0
          ? d.resolved_quality.kbps + d.resolved_quality.audio_kbps
          : opts.planKbps,
  )
  const shown = rawRates.map(roundedMbpsValue)
  const allEqual = shown.every((v) => v === shown[0])
  const placeWord = count === 1 ? 'place' : 'places'
  const line = allEqual
    ? `${count} ${placeWord} x ${formatMbpsValue(shown[0]!)} = ${formatMbpsValue(Math.round(count * shown[0]! * 10) / 10)} upload`
    : `${shown.map(formatMbpsValue).join(' + ')} = ${formatMbpsValue(shown.reduce((a, b) => Math.round((a + b) * 10) / 10, 0))} upload`
  if (opts.vertical) {
    return {
      line,
      detail: `Your vertical stream goes separately to each ticked place (${line}). Upload protection counts the vertical stream too: it pauses before the platforms on the Go live tab.`,
    }
  }
  const hasSeparate = ticked.some((d) => d.resolved_quality?.separate_encode)
  if (hasSeparate && !opts.limiterName) {
    return {
      line,
      detail: `Ferrocast sends each ticked platform its own stream rate (${line}).`,
    }
  }
  const capText =
    opts.limiterName && opts.limiterKbps
      ? ` Because ${opts.limiterName} caps video at ${formatCapMbps(opts.limiterKbps)}, every main place shares that ${formatSendMbps(opts.limiterKbps)} picture (${mbps(opts.limiterKbps + audioKbps)} with sound).`
      : ''
  return {
    line,
    detail: `Ferrocast encodes your main picture once, then sends a separate copy to each ticked platform (${line}).${capText}`,
  }
}
