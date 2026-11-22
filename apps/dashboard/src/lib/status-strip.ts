// Top-bar connection chip building and responsive priority-degrade logic (F1).
// Pure functions so layout thresholds, priority ordering and overflow attention are unit-tested
// without requiring a real browser layout pass.

import {
  formatCount,
  plural,
  type ConnectionState,
  type ConnectorName,
  type ConnectorState,
  type Connectors,
  type GoLiveFrame,
  type GoLiveView,
  type Platform,
} from '@ferrocast/api'
import { href } from './router'

export const CONNECTOR_ORDER = ['twitch', 'youtube', 'kick', 'facebook', 'obs'] as const
export type StripConnectorName = (typeof CONNECTOR_ORDER)[number]

export const CONNECTOR_NAMES: Record<ConnectorName, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  facebook: 'Facebook',
  obs: 'OBS',
  relay: 'Relay',
}

export type ChipTone = 'ok' | 'warn' | 'danger' | 'off'

export interface StatusChipItem {
  name: StripConnectorName
  label: string
  stateLabel: string
  tone: ChipTone
  attention: boolean
  late: boolean
  streamIssue: { text: string; danger: boolean } | null
  viewers: number | undefined
  viewersCompact: string | undefined
  title: string
  href: string
}

export type StripMode = 'full' | 'icons' | 'overflow'
export type StripCandidateKey = 'full-unit' | 'full-short' | 'icons' | 'overflow'

export interface StatusStripLayout {
  mode: StripMode
  showViewerUnit: boolean
  visibleItems: StatusChipItem[]
  overflowItems: StatusChipItem[]
  overflowAttention: 'none' | 'warn' | 'danger'
  compactTopChip: boolean
  compactSocket: boolean
}

/** Translates a connector state into plain words and a semantic tone. */
export function stateCopy(c: ConnectorState): {
  label: string
  tone: ChipTone
} {
  switch (c.state) {
    case 'connected':
      return { label: 'Connected', tone: 'ok' }
    case 'reconnecting':
      // Never connected yet (no account, nothing heard): it's the first connect.
      return c.account === null && c.last_event_at === null
        ? { label: 'Connecting', tone: 'warn' }
        : { label: 'Reconnecting', tone: 'warn' }
    case 'disconnected':
      return { label: 'Disconnected', tone: 'danger' }
    case 'sign_in_needed':
      return { label: 'Sign in again', tone: 'danger' }
    case 'scopes_missing':
      return { label: 'Needs permission', tone: 'warn' }
    case 'off':
      return { label: 'Not connected', tone: 'off' }
  }
}

/** Builds ordered top-bar connection items from live store state. */
export function buildStatusChips({
  connectors,
  viewers,
  golive,
  usesObs,
  cloud,
}: {
  connectors: Connectors
  viewers: Partial<Record<Platform, number>>
  golive:
    | Pick<GoLiveFrame, 'live' | 'destinations'>
    | Pick<GoLiveView, 'live' | 'destinations'>
    | null
    | undefined
  usesObs: boolean
  cloud: boolean
}): StatusChipItem[] {
  const items: StatusChipItem[] = []
  for (const name of CONNECTOR_ORDER) {
    const c = connectors[name]
    if (c === undefined) continue
    if (name === 'obs' && !usesObs) continue
    // Facebook is optional: it shows once connected or needing attention, not as an empty pill.
    if (name === 'facebook' && c.state === 'off') continue

    const { label: stateLabel, tone } = stateCopy(c)
    // Kick's events come through the relay link: only warn while that link is down.
    const late =
      name === 'kick' &&
      c.state === 'connected' &&
      connectors.relay !== undefined &&
      connectors.relay.state !== 'connected'
    const dest = golive?.live
      ? golive.destinations.find(
          (d) => d.kind === name && d.enabled && (d.canvas ?? 'main') === 'main',
        )
      : undefined
    const issueText = dest?.blocked
      ? 'stream can’t start'
      : dest?.health?.state === 'failed'
        ? 'stream failed'
        : dest?.health?.state === 'reconnecting'
          ? 'stream reconnecting'
          : dest?.health?.state === 'paused'
            ? 'stream paused to save upload'
            : null
    const streamIssue = issueText
      ? {
          text: issueText,
          danger: Boolean(dest?.blocked || dest?.health?.state === 'failed'),
        }
      : null
    const attention =
      tone === 'danger' || tone === 'warn' || tone === 'off' || late || streamIssue !== null
    const v = name === 'obs' || c.state !== 'connected' ? undefined : viewers[name]
    const watching = v !== undefined ? `, ${plural(v, 'viewer', 'viewers')}` : ''
    const title = `${CONNECTOR_NAMES[name]}: ${stateLabel}${c.account ? ` as ${c.account.name}` : ''}${watching}${c.detail ? `. ${c.detail}` : ''}${issueText ? `. Go live: ${issueText}` : ''}`
    const targetHref = cloud
      ? href({ name: 'cloud' })
      : href({ name: 'settings', section: name === 'obs' ? 'obs' : 'accounts' })

    items.push({
      name,
      label: CONNECTOR_NAMES[name],
      stateLabel,
      tone,
      attention,
      late,
      streamIssue,
      viewers: v,
      viewersCompact: v !== undefined ? formatCount(v) : undefined,
      title,
      href: targetHref,
    })
  }
  return items
}

/**
 * Chooses the primary chip kept visible when narrow mode collapses the rest into `+N`.
 * Prefers connected streaming platforms (highest viewer count first), then connected OBS,
 * then any chip needing attention, then index 0.
 */
export function pickTopChipIndex(items: readonly StatusChipItem[]): number {
  if (items.length <= 1) return 0
  let bestIdx = -1
  let bestScore = -1
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!it) continue
    let score: number
    if (it.tone === 'ok' && it.name !== 'obs') {
      // Connected streaming platforms take priority; break ties by viewer count.
      score = 10_000_000 + (it.viewers ?? 0)
    } else if (it.tone === 'ok') {
      score = 1_000_000
    } else if (it.tone === 'danger' || it.streamIssue?.danger) {
      score = 500_000
    } else if (it.tone === 'warn' || it.late || it.streamIssue) {
      score = 100_000
    } else {
      score = 1
    }
    // Keep original order on exact ties (`>` rather than `>=`).
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  return bestIdx >= 0 ? bestIdx : 0
}

const CHAR_PX = 7.4
const MONO_CHAR_PX = 7.6
const CHIP_PAD_FULL = 22
const CHIP_PAD_COMPACT = 18
const ICON_PX = 14
const DOT_PX = 8
const ITEM_GAP_PX = 6

/** Conservative pixel width estimate for one chip at a given degradation tier. */
export function estimateChipWidth(
  item: StatusChipItem,
  mode: StripMode,
  showViewerUnit: boolean,
  compactTopChip = false,
): number {
  if (mode === 'icons' || mode === 'overflow') {
    let w = CHIP_PAD_COMPACT + ICON_PX + 6 + DOT_PX
    if (item.viewersCompact !== undefined && !compactTopChip) {
      w += 6 + item.viewersCompact.length * MONO_CHAR_PX
    }
    return Math.ceil(w)
  }

  // Full tier: icon + name + dot + optional status text + optional delayed/issue + viewers
  let w = CHIP_PAD_FULL + ICON_PX + 8 + item.label.length * CHAR_PX + 8 + DOT_PX
  if (item.tone !== 'ok' || item.name === 'obs') {
    w += 8 + item.stateLabel.length * CHAR_PX
  }
  if (item.late) w += 8 + 'delayed'.length * CHAR_PX
  if (item.streamIssue) w += 8 + 8 + 6 + item.streamIssue.text.length * CHAR_PX
  if (item.viewersCompact !== undefined) {
    w += 8 + item.viewersCompact.length * MONO_CHAR_PX
    if (showViewerUnit) {
      w += (item.viewers === 1 ? ' viewer' : ' viewers').length * CHAR_PX
    }
  }
  return Math.ceil(w)
}

/** Conservative width estimate for the live-socket status pill when disconnected. */
export function estimateSocketWidth(
  socket: ConnectionState,
  mode: StripMode,
  compact = false,
): number {
  if (socket === 'open') return 0
  const label =
    socket === 'retrying'
      ? compact
        ? 'Reconnecting…'
        : mode === 'full'
          ? 'Reconnecting to Ferrocast…'
          : 'Reconnecting…'
      : 'Connecting…'
  return Math.ceil(CHIP_PAD_FULL + DOT_PX + 8 + label.length * CHAR_PX)
}

/** Conservative width estimate for the `+N` overflow button. */
export function estimateOverflowTriggerWidth(
  hiddenCount: number,
  attention: 'none' | 'warn' | 'danger',
): number {
  if (hiddenCount <= 0) return 0
  const digits = String(hiddenCount).length + 1 // "+3"
  return Math.ceil(22 + digits * MONO_CHAR_PX + (attention !== 'none' ? 6 + DOT_PX : 0))
}

function sumRowWidth(widths: number[]): number {
  const positive = widths.filter((w) => w > 0)
  if (positive.length === 0) return 0
  return positive.reduce((a, b) => a + b, 0) + (positive.length - 1) * ITEM_GAP_PX
}

/** Computes which tier (`full` -> `icons` -> `overflow`) fits inside `availableWidth`. */
export function computeStatusStripLayout({
  items,
  socket,
  availableWidth,
  minWidths,
}: {
  items: readonly StatusChipItem[]
  socket: ConnectionState
  availableWidth: number | null
  minWidths?: Partial<Record<StripCandidateKey, number>>
}): StatusStripLayout {
  const allItems = [...items]
  if (availableWidth === null || availableWidth <= 0) {
    return {
      mode: 'full',
      showViewerUnit: true,
      visibleItems: allItems,
      overflowItems: [],
      overflowAttention: 'none',
      compactTopChip: false,
      compactSocket: false,
    }
  }

  const fits = (key: StripCandidateKey, estimated: number): boolean => {
    const measuredMin = minWidths?.[key] ?? 0
    return Math.max(estimated, measuredMin) <= availableWidth
  }

  const fullUnitEstimate = sumRowWidth([
    ...allItems.map((it) => estimateChipWidth(it, 'full', true)),
    estimateSocketWidth(socket, 'full'),
  ])
  if (fits('full-unit', fullUnitEstimate)) {
    return {
      mode: 'full',
      showViewerUnit: true,
      visibleItems: allItems,
      overflowItems: [],
      overflowAttention: 'none',
      compactTopChip: false,
      compactSocket: false,
    }
  }

  const fullShortEstimate = sumRowWidth([
    ...allItems.map((it) => estimateChipWidth(it, 'full', false)),
    estimateSocketWidth(socket, 'full'),
  ])
  if (fits('full-short', fullShortEstimate)) {
    return {
      mode: 'full',
      showViewerUnit: false,
      visibleItems: allItems,
      overflowItems: [],
      overflowAttention: 'none',
      compactTopChip: false,
      compactSocket: false,
    }
  }

  const iconsEstimate = sumRowWidth([
    ...allItems.map((it) => estimateChipWidth(it, 'icons', false)),
    estimateSocketWidth(socket, 'icons'),
  ])
  if (fits('icons', iconsEstimate)) {
    return {
      mode: 'icons',
      showViewerUnit: false,
      visibleItems: allItems,
      overflowItems: [],
      overflowAttention: 'none',
      compactTopChip: false,
      compactSocket: false,
    }
  }

  // Overflow tier: keep the single highest-priority chip and tuck the rest under `+N`.
  const topIdx = pickTopChipIndex(allItems)
  const topItem = allItems[topIdx]
  const visibleItems = topItem ? [topItem] : []
  const overflowItems = allItems.filter((_, i) => i !== topIdx)
  const overflowAttention: 'none' | 'warn' | 'danger' = overflowItems.some(
    (it) => it.tone === 'danger' || it.streamIssue?.danger,
  )
    ? 'danger'
    : overflowItems.some((it) => it.attention)
      ? 'warn'
      : 'none'

  const baseOverflowEst = sumRowWidth([
    ...(topItem ? [estimateChipWidth(topItem, 'overflow', false, false)] : []),
    estimateOverflowTriggerWidth(overflowItems.length, overflowAttention),
    estimateSocketWidth(socket, 'overflow', false),
  ])
  const compactTopChip = baseOverflowEst > availableWidth
  const compactEst = sumRowWidth([
    ...(topItem ? [estimateChipWidth(topItem, 'overflow', false, true)] : []),
    estimateOverflowTriggerWidth(overflowItems.length, overflowAttention),
    estimateSocketWidth(socket, 'overflow', true),
  ])
  const compactSocket = socket !== 'open' && compactEst > availableWidth

  return {
    mode: 'overflow',
    showViewerUnit: false,
    visibleItems,
    overflowItems,
    overflowAttention,
    compactTopChip,
    compactSocket,
  }
}
