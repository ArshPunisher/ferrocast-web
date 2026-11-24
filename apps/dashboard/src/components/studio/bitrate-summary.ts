import { mbps, type CappedInfo, type DestinationView, type Service } from '@ferrocast/api'

export type DestinationCapInput = Pick<
  DestinationView,
  'id' | 'kind' | 'name' | 'enabled' | 'canvas' | 'light' | 'enhanced' | 'blocked'
> & {
  capped?: CappedInfo | null | undefined
  standby_for?: string | undefined
  backup_for?: string | undefined
  health?: DestinationView['health']
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

export interface DestinationRateDisplay {
  /** Formatted actual send bitrate when enabled (for example "6.0 Mbps" or "12 Mbps"), else null. */
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

/** Own video cap for one destination, ignoring shared group caps caused by another platform. */
export function ownCeilingKbps(d: DestinationCapInput): number | null {
  if (
    d.capped &&
    !d.capped.separate_encode &&
    d.capped.kbps > 0 &&
    (!d.capped.summary || d.capped.summary.includes(d.name))
  ) {
    return d.capped.kbps
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
  return d.enabled && (d.canvas ?? 'main') === 'main' && !d.light && !d.blocked && !d.standby_for
}

function buildCapSettingsNote(
  chosenVideoKbps: number,
  caps: StreamCapLimiter[],
  mainCount: number,
): string {
  const lowest = caps[0]!
  const tiedLowest = caps.filter((c) => c.kbps === lowest.kbps)
  const higherCaps = caps.filter((c) => c.kbps > lowest.kbps)
  const send = formatSendMbps(lowest.kbps)
  const lowCap = formatCapMbps(lowest.kbps)
  const chosen = formatCapMbps(chosenVideoKbps)
  const samePicture = mainCount > 1 ? ', and every place gets the same picture' : ''
  const turnOff =
    caps.length === 1
      ? `Turn ${lowest.name} off`
      : tiedLowest.length === caps.length && caps.length === 2
        ? 'Turn them off'
        : `Turn ${joinAnd(caps.map((c) => c.name))} off`

  if (tiedLowest.length > 1 && higherCaps.length === 0) {
    return `Sending ${send} right now. ${joinAnd(tiedLowest.map((c) => c.name))} take at most ${lowCap}${samePicture}. ${turnOff} to send ${chosen}.`
  }
  if (higherCaps.length > 0) {
    const others = joinAnd(
      higherCaps.map((c) => `${c.name} takes at most ${formatCapMbps(c.kbps)}`),
    )
    return `Sending ${send} right now. ${lowest.name} takes at most ${lowCap} (and ${others})${samePicture}. ${turnOff} to send ${chosen}.`
  }
  return `Sending ${send} right now. ${lowest.name} takes at most ${lowCap}${samePicture}. ${turnOff} to send ${chosen}.`
}

/**
 * Pure cap summary across enabled shared main-canvas destinations for a chosen video bitrate.
 */
export function describeStreamCap(
  chosenVideoKbps: number,
  destinations: readonly DestinationCapInput[],
): StreamCapSummary {
  const mainActive = destinations.filter(sharesMainEncode)
  if (mainActive.length === 0) {
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

  const caps: StreamCapLimiter[] = []
  for (const d of mainActive) {
    const ceil = ownCeilingKbps(d)
    if (ceil !== null && ceil < chosenVideoKbps) {
      caps.push({ id: d.id, name: d.name, kbps: ceil })
    }
  }
  caps.sort((a, b) => a.kbps - b.kbps)

  if (caps.length === 0) {
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
    settingsNote: buildCapSettingsNote(chosenVideoKbps, caps, mainActive.length),
  }
}

/**
 * Derives a shared-stream cap summary either from chosen StudioSettings video bitrate or directly
 * from engine-provided `d.capped` entries (used in OBS mode or before StudioSettings loads).
 */
export function describeStreamCapFromView(
  destinations: readonly DestinationCapInput[],
  chosenVideoKbps?: number | null,
): StreamCapSummary {
  if (chosenVideoKbps !== undefined && chosenVideoKbps !== null && chosenVideoKbps > 0) {
    return describeStreamCap(chosenVideoKbps, destinations)
  }
  const mainActive = destinations.filter(sharesMainEncode)
  const capped = mainActive.filter(
    (d) => d.capped && !d.capped.separate_encode && d.capped.kbps > 0,
  )
  if (capped.length === 0) {
    return {
      capped: false,
      chosenVideoKbps: null,
      effectiveVideoKbps: null,
      limiter: null,
      caps: [],
      heldBackIds: [],
      settingsNote: null,
    }
  }
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
  opts: { streamKbps?: number | null; verticalKbps?: number | null; audioKbps?: number } = {},
): DestinationRateDisplay {
  const sendingBackup = !d.enabled && !!d.backup_for && d.health?.state === 'live'
  if ((!d.enabled && !sendingBackup) || d.blocked || d.standby_for) {
    return { rateLabel: null, heldBackNote: null, ownCapNote: null }
  }

  let effectiveKbps: number | null = null
  if (d.health?.state === 'live' && d.health.kbps > 0) {
    effectiveKbps = d.health.kbps
  } else if (d.canvas === 'vertical') {
    effectiveKbps = opts.verticalKbps && opts.verticalKbps > 0 ? opts.verticalKbps : 4500
  } else if (d.light) {
    const base = summary.effectiveVideoKbps ?? opts.streamKbps ?? 4500
    effectiveKbps = Math.min(base, 4500)
  } else if (summary.capped && summary.effectiveVideoKbps !== null) {
    effectiveKbps = summary.effectiveVideoKbps
  } else if (opts.streamKbps && opts.streamKbps > 0) {
    effectiveKbps = opts.streamKbps
  } else if (summary.effectiveVideoKbps !== null) {
    effectiveKbps = summary.effectiveVideoKbps
  }

  const rateLabel = effectiveKbps !== null ? mbps(effectiveKbps) : null
  const limiter = summary.limiter
  const isHeldBack =
    summary.capped &&
    limiter !== null &&
    summary.effectiveVideoKbps !== null &&
    sharesMainEncode(d) &&
    summary.heldBackIds.includes(d.id)

  const rateText =
    summary.effectiveVideoKbps !== null ? formatSendMbps(summary.effectiveVideoKbps) : null
  const chosenPart =
    summary.chosenVideoKbps !== null &&
    summary.effectiveVideoKbps !== null &&
    summary.chosenVideoKbps > summary.effectiveVideoKbps
      ? ` instead of ${formatCapMbps(summary.chosenVideoKbps)}`
      : ''

  // Only add our calm explanation when the row doesn't already have its own engine `d.capped` badge
  // or when its engine badge doesn't mention the limiting platform.
  const hasLimiterExplanation =
    !!d.capped && (!limiter || (d.capped.summary ?? '').includes(limiter.name))

  const heldBackNote =
    isHeldBack && !hasLimiterExplanation && limiter && rateText
      ? {
          summary: `Same stream as ${limiter.name}: ${rateText}`,
          detail: `Ferrocast sends one shared main picture to every ticked platform. Because ${limiter.name} takes at most ${formatCapMbps(limiter.kbps)}, ${d.name} gets ${rateText}${chosenPart}. Turn ${limiter.name} off to lift this limit.`,
        }
      : null

  const ownCap = ownCeilingKbps(d)
  const ownCapNote =
    !d.capped &&
    summary.capped &&
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

  return { rateLabel, heldBackNote, ownCapNote }
}

export function describeUploadNeed(
  ticked: readonly Pick<DestinationView, 'health' | 'name'>[],
  opts: {
    planKbps: number
    vertical: boolean
    limiterName?: string | null | undefined
    limiterKbps?: number | null | undefined
  },
): { line: string; detail: string } | null {
  const count = ticked.length
  if (count === 0) return null
  const rates = ticked.map((d) => d.health?.kbps || opts.planKbps)
  const total = rates.reduce((a, b) => a + b, 0)
  const each = Math.round(total / count)
  const placeWord = count === 1 ? 'place' : 'places'
  const line = `${count} ${placeWord} x ${mbps(each)} = ${mbps(total)} upload`
  if (opts.vertical) {
    return {
      line,
      detail: `Your vertical stream goes separately to each ticked place (${line}). Upload protection counts the vertical stream too: it pauses before the platforms on the Go live tab.`,
    }
  }
  const capText =
    opts.limiterName && opts.limiterKbps
      ? ` Because ${opts.limiterName} caps video at ${formatCapMbps(opts.limiterKbps)}, every main place shares that ${formatSendMbps(opts.limiterKbps)} picture (${mbps(each)} with sound).`
      : ''
  return {
    line,
    detail: `Ferrocast encodes your main picture once, then sends a separate copy to each ticked platform (${line}).${capText}`,
  }
}
