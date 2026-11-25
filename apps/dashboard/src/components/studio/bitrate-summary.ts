import { mbps, type CappedInfo, type DestinationView, type Service } from '@ferrocast/api'

const DEFAULT_AUDIO_KBPS = 160

export type DestinationCapInput = Pick<
  DestinationView,
  'id' | 'kind' | 'name' | 'enabled' | 'canvas' | 'light' | 'enhanced' | 'blocked'
> & {
  capped?: CappedInfo | null | undefined
  direct?: DestinationView['direct']
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
}

export interface StreamCapOptions {
  ignoreServiceLimits?: boolean | undefined
  live?: boolean | undefined
}

export interface DestinationRateDisplay {
  /** Resolved total send bitrate (video + audio, or live measured) in kbps, or null when off. */
  kbps: number | null
  /** Formatted actual send bitrate when active (for example "6.2 Mbps" or "12 Mbps"), else null. */
  rateLabel: string | null
  /** Calm explanation when a shared stream is limited by another platform, else null. */
  heldBackNote: { summary: string; detail: string } | null
  /** Synthesized cap notice when the platform itself caps the stream and no engine `d.capped` exists yet. */
  ownCapNote: { summary: string; detail: string } | null
}

/** Platform video ceiling in kbps (`crates/golive/src/probe.rs:168-186`), or null when uncapped. */
export function platformCeilingKbps(kind: Service, enhanced?: boolean): number | null {
  if (enhanced) return null
  if (kind === 'twitch') return 6000
  if (kind === 'kick') return 8000
  return null
}

/** True only when `d.capped` represents a shared bitrate cap, never a WebRTC B-frames notice. */
function isBitrateCapInfo(d: DestinationCapInput): boolean {
  if (!d.capped || d.capped.separate_encode || d.capped.kbps <= 0) return false
  if (d.direct) return false
  const s = (d.capped.summary ?? '').toLowerCase()
  return !s.includes('b-frames') && !s.includes('webrtc')
}

/** Own video cap for one destination, ignoring shared group caps caused by another platform. */
export function ownCeilingKbps(d: DestinationCapInput): number | null {
  if (d.direct || d.light || d.lighter_for_route || d.blocked || d.standby_for) return null
  if (isBitrateCapInfo(d) && (!d.capped!.summary || d.capped!.summary.includes(d.name))) {
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

function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function sharesMainEncode(d: DestinationCapInput): boolean {
  return (
    d.enabled &&
    (d.canvas ?? 'main') === 'main' &&
    !d.direct &&
    !d.light &&
    !d.lighter_for_route &&
    !d.blocked &&
    !d.standby_for
  )
}

function uncappedSummary(chosenVideoKbps: number | null): StreamCapSummary {
  return {
    capped: false,
    chosenVideoKbps,
    effectiveVideoKbps: chosenVideoKbps,
    limiter: null,
    caps: [],
    heldBackIds: [],
    settingsNote: null,
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

/**
 * Pure cap summary across enabled shared main-canvas destinations for a chosen video bitrate.
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
    settingsNote: buildCapSettingsNote(chosenVideoKbps, caps, mainActive.length, !!opts.live),
  }
}

/**
 * Derives a shared-stream cap summary either from chosen StudioSettings video bitrate or directly
 * from engine-provided `d.capped` entries (used in OBS mode or before StudioSettings loads).
 */
export function describeStreamCapFromView(
  destinations: readonly DestinationCapInput[],
  chosenVideoKbps?: number | null,
  opts: StreamCapOptions = {},
): StreamCapSummary {
  const validChosen =
    chosenVideoKbps !== undefined && chosenVideoKbps !== null && chosenVideoKbps > 0
      ? chosenVideoKbps
      : null
  if (opts.ignoreServiceLimits) return uncappedSummary(validChosen)
  if (validChosen !== null) return describeStreamCap(validChosen, destinations, opts)

  const mainActive = destinations.filter(sharesMainEncode)
  const capped = mainActive.filter(isBitrateCapInfo)
  if (capped.length === 0) return uncappedSummary(null)

  const minKbps = Math.min(...capped.map((d) => d.capped!.kbps))
  const ownLimiter = mainActive.find((d) => ownCeilingKbps(d) === minKbps)
  const namedInSummary = (() => {
    for (const d of capped) {
      const m = /\bfor\s+(.+)$/.exec(d.capped?.summary ?? '')
      if (m?.[1]) {
        const hit = mainActive.find((x) => x.name === m[1]!.trim())
        if (hit) return hit
      }
    }
    return capped[0]!
  })()
  const limiterDest = ownLimiter ?? namedInSummary
  const limiter: StreamCapLimiter = { id: limiterDest.id, name: limiterDest.name, kbps: minKbps }
  const heldBackIds = mainActive
    .filter((d) => {
      if (d.id === limiter.id) return false
      const own = ownCeilingKbps(d)
      return own === null || own > limiter.kbps
    })
    .map((d) => d.id)

  return {
    capped: true,
    chosenVideoKbps: null,
    effectiveVideoKbps: minKbps,
    limiter,
    caps: [limiter],
    heldBackIds,
    settingsNote: null,
  }
}

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
  const isHeldBack =
    capActive && limiter !== null && sharesMainEncode(d) && summary.heldBackIds.includes(d.id)

  const sharedTotalLabel = capActive ? mbps(summary.effectiveVideoKbps! + audioKbps) : null
  const chosenPart =
    capActive &&
    summary.chosenVideoKbps !== null &&
    summary.chosenVideoKbps > summary.effectiveVideoKbps!
      ? ` instead of ${mbps(summary.chosenVideoKbps + audioKbps)}`
      : ''

  // Only add our calm explanation when the row doesn't already have its own engine `d.capped` badge
  // or when its engine badge doesn't mention the limiting platform.
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
    capActive &&
    !d.capped &&
    limiter &&
    d.id === limiter.id &&
    ownCap !== null &&
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

function formatMbpsValue(v: number): string {
  const clean = Math.round(v * 10) / 10
  return clean >= 10 && Number.isInteger(clean) ? `${clean} Mbps` : `${clean.toFixed(1)} Mbps`
}

export function describeUploadNeed(
  ticked: readonly (Pick<DestinationView, 'health' | 'name'> & { kbps?: number | null })[],
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
  const capText =
    opts.limiterName && opts.limiterKbps
      ? ` Because ${opts.limiterName} caps video at ${formatCapMbps(opts.limiterKbps)}, every main place shares that ${formatSendMbps(opts.limiterKbps)} picture (${mbps(opts.limiterKbps + audioKbps)} with sound).`
      : ''
  return {
    line,
    detail: `Ferrocast encodes your main picture once, then sends a separate copy to each ticked platform (${line}).${capText}`,
  }
}
