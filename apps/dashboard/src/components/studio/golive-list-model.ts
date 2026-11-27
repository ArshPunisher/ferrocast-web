import {
  allDestinationsFailed,
  healthText,
  reconnectingText,
  type DestinationQuality,
  type DestinationQualityOptions,
  type DestinationView,
  type GoLiveQualityOptionsResponse,
  type GoLiveView,
} from '@ferrocast/api'
import {
  buildModalModel,
  buildQualitySummaryText,
  clampDraftToHardLimits,
  formatModalRate as formatRate,
  formatModalResFps,
} from './quality-modal-model'

export type ListTagKind = 'live' | 'reconnecting' | 'error' | 'switching' | 'off'
export type ListPipTone = 'live' | 'warn' | 'error' | 'work' | 'off'

export type RowAction =
  | { kind: 'connect'; label: string }
  | { kind: 'retry'; label: string }
  | { kind: 'test_connection'; label: string }
  | { kind: 'open_quality'; label: string }
  | { kind: 'set_quality'; label: string; quality: DestinationQuality }
  | { kind: 'manage'; label: string }

export type RowLine2 =
  | { kind: 'quality'; text: string; disabled: boolean }
  | {
      kind: 'status'
      tone: 'work' | 'warn' | 'error' | 'muted'
      spinner: boolean
      icon: 'warn' | 'spin' | null
      text: string
    }

export interface RowPopoverModel {
  title: string
  body: string
  tone: 'neutral' | 'warn' | 'error' | 'work'
  primaryAction: RowAction | null
}

export interface DestinationRowVM {
  dest: DestinationView
  liveFor: boolean
  tagKind: ListTagKind
  tagLabel: 'LIVE' | 'RECONNECTING' | 'ERROR' | 'SWITCHING' | 'OFF'
  pipTone: ListPipTone
  pipPulse: boolean
  rowTint: 'none' | 'warn' | 'error'
  line2: RowLine2
  barPct: number
  barMode: 'rate' | 'progress'
  barDimmed: boolean
  barLabel: string
  switchDisabled: boolean
  popover: RowPopoverModel | null
  problemItem: FooterProblemItem | null
}

export interface FooterProblemItem {
  destId: string
  destName: string
  reason: string
  tone: 'warn' | 'error'
  action: RowAction
}

export type FooterAction =
  | { kind: 'retry_save'; label: string }
  | { kind: 'match_to_share'; label: string; destId: string; quality: DestinationQuality }
  | { kind: 'retry_all'; label: string; destIds: string[] }
  | { kind: 'manage'; label: string }

export type FooterVM =
  | {
      mode: 'strip'
      text: string
      action: FooterAction
      breakdown: string | null
    }
  | {
      mode: 'summary'
      summaryText: string
      problemLinkText: string | null
      problemLinkTone: 'warn' | 'error' | null
      problems: FooterProblemItem[]
      breakdown: string | null
    }

export interface GoLiveDockVM {
  mainRows: DestinationRowVM[]
  verticalRows: DestinationRowVM[]
  footer: FooterVM
}

export interface BuildDockContext {
  usesObs: boolean
  qualityOptionsById: Record<string, DestinationQualityOptions>
  optionsResponse?: GoLiveQualityOptionsResponse | null | undefined
  switchingTargets?: Record<string, string> | undefined
  saveError?: string | null | undefined
}

export interface EncodeGroupSummary {
  places: number
  totalKbps: number
  encodes: number
  breakdown: string
}

function destUploadKbps(d: DestinationView, view: GoLiveView): number {
  if (d.health?.state === 'live' && d.health.kbps > 0) return d.health.kbps
  if (d.resolved_quality && d.resolved_quality.kbps > 0) {
    return d.resolved_quality.kbps + d.resolved_quality.audio_kbps
  }
  if (d.canvas === 'vertical') return view.cut.config.kbps + 160
  return Math.max(0, view.stats.kbps)
}

function formatSummaryMbps(kbps: number): string {
  const m = Number((kbps / 1000).toFixed(1))
  return Number.isInteger(m) ? `${m} Mbps` : `${m.toFixed(1)} Mbps`
}

export function summarizeEncodeGroups(view: GoLiveView): EncodeGroupSummary | null {
  const enabled = view.destinations.filter((d) => d.enabled && !d.standby_for)
  if (enabled.length === 0) return null

  const totalKbps = enabled.reduce((acc, d) => acc + destUploadKbps(d, view), 0)
  const groups = view.encode_groups ?? []
  const enabledIds = new Set(enabled.map((d) => d.id))
  const coveredGroups = groups.filter((g) => g.members.some((id) => enabledIds.has(id)))

  let encodes = coveredGroups.length
  let breakdownLines: string[]
  if (coveredGroups.length > 0) {
    const namesById = new Map(view.destinations.map((d) => [d.id, d.name]))
    breakdownLines = coveredGroups.map((g) => {
      const members = g.members
        .filter((id) => enabledIds.has(id))
        .map((id) => namesById.get(id) ?? id)
      return `${members.join(' & ')}: ${formatModalResFps(g.width, g.height, g.fps)} · ${formatRate(g.kbps)}`
    })
  } else {
    const bucketMap = new Map<string, { names: string[]; label: string }>()
    for (const d of enabled) {
      const q = d.resolved_quality
      const key = q
        ? `${d.canvas}:${q.width}x${q.height}@${q.fps}:${q.kbps}:${q.codec}`
        : `${d.canvas}:main`
      const label = q
        ? `${formatModalResFps(q.width, q.height, q.fps)} · ${formatRate(q.kbps)}`
        : 'Main stream'
      const cur = bucketMap.get(key)
      if (cur) cur.names.push(d.name)
      else bucketMap.set(key, { names: [d.name], label })
    }
    encodes = bucketMap.size
    breakdownLines = [...bucketMap.values()].map((b) => `${b.names.join(' & ')}: ${b.label}`)
  }

  return {
    places: enabled.length,
    totalKbps,
    encodes: Math.max(1, encodes),
    breakdown: breakdownLines.join(' · '),
  }
}

function findBudgetMatchPeer(
  dest: DestinationView,
  allDestinations: readonly DestinationView[],
  optsById: Record<string, DestinationQualityOptions>,
): { peerName: string; quality: DestinationQuality } | null {
  const sameCanvasPeers = allDestinations.filter(
    (p) => p.id !== dest.id && p.enabled && p.canvas === dest.canvas && p.resolved_quality,
  )
  const limits = optsById[dest.id]?.custom_limits
  const ownGroup = dest.resolved_quality?.group_id ?? null
  for (const peer of sameCanvasPeers) {
    const pq = peer.resolved_quality!
    // Joining an encode this destination is already part of changes nothing for the PC.
    if (ownGroup && pq.group_id === ownGroup) continue
    const fits =
      !limits ||
      ((limits.codecs.length === 0 || limits.codecs.includes(pq.codec)) &&
        pq.width <= limits.max_width &&
        pq.height <= limits.max_height &&
        pq.kbps >= limits.min_kbps &&
        pq.kbps <= limits.max_kbps &&
        (limits.fps_choices.length === 0 || limits.fps_choices.includes(pq.fps)))
    if (!fits) continue
    const targetQuality: DestinationQuality =
      peer.quality?.mode === 'same_as_main' && !pq.auto_fitted
        ? { mode: 'same_as_main' }
        : {
            mode: 'custom',
            width: pq.width,
            height: pq.height,
            fps: pq.fps,
            kbps: pq.kbps,
            codec: pq.codec,
          }
    return { peerName: peer.name, quality: targetQuality }
  }
  return null
}

/** A destination is LIVE only while its own push reports it is delivering. */
function isSending(d: DestinationView, canvasLive: boolean): boolean {
  return Boolean(canvasLive && d.enabled && d.health?.state === 'live')
}

function findBudgetOffenderIds(view: GoLiveView): Set<string> {
  if (view.encode_budget?.status !== 'over') return new Set()
  const enabled = view.destinations.filter((d) => d.enabled)
  const separate = enabled.filter((d) => d.resolved_quality?.separate_encode)
  const customOffenders = separate.filter((d) => d.quality?.mode === 'custom')
  if (customOffenders.length > 0) return new Set(customOffenders.map((d) => d.id))
  const nonMain = separate.filter((d) => d.resolved_quality?.group_id !== 'main')
  if (nonMain.length > 0) return new Set([nonMain[nonMain.length - 1]!.id])
  return enabled.length > 0 ? new Set([enabled[enabled.length - 1]!.id]) : new Set()
}

export function buildDestinationRowVM(
  d: DestinationView,
  view: GoLiveView,
  ctx: {
    usesObs: boolean
    maxUploadKbps: number
    destOpts?: DestinationQualityOptions | undefined
    optionsResponse?: GoLiveQualityOptionsResponse | null | undefined
    switchingTarget?: string | undefined
    isBudgetOffender?: boolean | undefined
  },
): DestinationRowVM {
  const liveFor = d.canvas === 'vertical' ? view.vertical_live : view.live
  const qualityText = buildQualitySummaryText(d, ctx.usesObs)
  const kbps = d.enabled ? destUploadKbps(d, view) : 0
  const maxKbps = Math.max(1000, ctx.maxUploadKbps)
  const ratePct = kbps > 0 ? Math.max(10, Math.min(100, Math.round((kbps / maxKbps) * 100))) : 28
  const barLabel = d.enabled && kbps > 0 ? `${formatRate(kbps)} upload share` : 'Off'
  const switchDisabled = Boolean(!d.enabled && d.blocked)

  // 1. FFmpeg downloading for vertical cut.
  if (
    d.canvas === 'vertical' &&
    view.cut.source === 'cut' &&
    view.cut.ffmpeg.state === 'downloading' &&
    d.enabled
  ) {
    const pct = Math.max(1, Math.min(100, Math.round(view.cut.ffmpeg.percent)))
    return {
      dest: d,
      liveFor,
      tagKind: 'switching',
      tagLabel: 'SWITCHING',
      pipTone: 'work',
      pipPulse: true,
      rowTint: 'none',
      line2: {
        kind: 'status',
        tone: 'work',
        spinner: true,
        icon: 'spin',
        text: `FFmpeg downloading ${pct}%`,
      },
      barPct: pct,
      barMode: 'progress',
      barDimmed: false,
      barLabel: `FFmpeg downloading ${pct}%`,
      switchDisabled,
      popover: {
        title: `Getting video tools (${pct}%)`,
        body: 'Ferrocast downloads FFmpeg once so vertical cuts can run. Goes live as soon as it finishes.',
        tone: 'work',
        primaryAction: { kind: 'open_quality', label: 'Open quality' },
      },
      problemItem: null,
    }
  }

  // 2. Live quality switch in progress.
  if (d.switching_quality) {
    const text = ctx.switchingTarget ? `Switching to ${ctx.switchingTarget}…` : 'Switching quality…'
    return {
      dest: d,
      liveFor,
      tagKind: 'switching',
      tagLabel: 'SWITCHING',
      pipTone: 'work',
      pipPulse: true,
      rowTint: 'none',
      line2: { kind: 'status', tone: 'work', spinner: true, icon: 'spin', text },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: !liveFor,
      barLabel,
      switchDisabled,
      popover: {
        title: `Switching ${d.name}`,
        body: `Only ${d.name} switches. Your stream and recording keep going.`,
        tone: 'work',
        primaryAction: null,
      },
      problemItem: null,
    }
  }

  // 3. Disconnected account while enabled + live.
  if (!d.connected && d.enabled && liveFor) {
    const reason =
      d.blocked || `Your ${d.name} sign-in expired or was disconnected. Other platforms stay live.`
    const action: RowAction = { kind: 'connect', label: 'Reconnect' }
    return {
      dest: d,
      liveFor,
      tagKind: 'error',
      tagLabel: 'ERROR',
      pipTone: 'error',
      pipPulse: false,
      rowTint: 'error',
      line2: { kind: 'status', tone: 'error', spinner: false, icon: 'warn', text: 'Disconnected' },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: true,
      barLabel: 'Disconnected',
      switchDisabled,
      popover: {
        title: `${d.name} disconnected`,
        body: reason,
        tone: 'error',
        primaryAction: action,
      },
      problemItem: {
        destId: d.id,
        destName: d.name,
        reason: 'Disconnected',
        tone: 'error',
        action,
      },
    }
  }

  // 4. Not connected (offline / turned off).
  if (!d.connected) {
    const action: RowAction = { kind: 'connect', label: 'Connect' }
    return {
      dest: d,
      liveFor,
      tagKind: 'off',
      tagLabel: 'OFF',
      pipTone: 'off',
      pipPulse: false,
      rowTint: 'none',
      line2: {
        kind: 'status',
        tone: 'muted',
        spinner: false,
        icon: null,
        text: 'Not connected · Connect',
      },
      barPct: 24,
      barMode: 'rate',
      barDimmed: true,
      barLabel: 'Not connected',
      switchDisabled,
      popover: {
        title: `${d.name} isn't connected`,
        body: d.blocked || `Sign in with ${d.name} once in Settings so Ferrocast can stream here.`,
        tone: 'neutral',
        primaryAction: action,
      },
      problemItem: null,
    }
  }

  // 5. Blocked by engine config while connected.
  if (d.blocked) {
    const isErr = liveFor && d.enabled
    const action: RowAction = { kind: 'manage', label: 'Open platforms' }
    return {
      dest: d,
      liveFor,
      tagKind: isErr ? 'error' : 'off',
      tagLabel: isErr ? 'ERROR' : 'OFF',
      pipTone: isErr ? 'error' : 'off',
      pipPulse: false,
      rowTint: isErr ? 'error' : 'none',
      line2: { kind: 'status', tone: 'error', spinner: false, icon: 'warn', text: d.blocked },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: true,
      barLabel: d.blocked,
      switchDisabled,
      popover: {
        title: `Can't send to ${d.name}`,
        body: d.blocked,
        tone: 'error',
        primaryAction: action,
      },
      problemItem: isErr
        ? { destId: d.id, destName: d.name, reason: d.blocked, tone: 'error', action }
        : null,
    }
  }

  // 6. Push failed (terminal error state from engine).
  if (d.enabled && d.health?.state === 'failed') {
    const lineReason = d.health.reason || "Couldn't connect"
    const detail =
      d.health.detail ||
      healthText(d.health, d.blocked, d.kind).detail ||
      `${d.name} refused the stream.`
    const action: RowAction = { kind: 'retry', label: 'Retry' }
    return {
      dest: d,
      liveFor,
      tagKind: 'error',
      tagLabel: 'ERROR',
      pipTone: 'error',
      pipPulse: false,
      rowTint: 'error',
      line2: { kind: 'status', tone: 'error', spinner: false, icon: 'warn', text: lineReason },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: true,
      barLabel: lineReason,
      switchDisabled,
      popover: {
        title: `Couldn't reach ${d.name}`,
        body: detail,
        tone: 'error',
        primaryAction: action,
      },
      problemItem: { destId: d.id, destName: d.name, reason: lineReason, tone: 'error', action },
    }
  }

  // 7. PC encode budget over limit on this destination.
  if (ctx.isBudgetOffender && d.enabled) {
    const peerFix = findBudgetMatchPeer(
      d,
      view.destinations,
      ctx.destOpts ? { [d.id]: ctx.destOpts } : {},
    )
    const maxSessions = view.encode_budget?.max_sessions
    const action: RowAction = peerFix
      ? { kind: 'set_quality', label: `Match ${peerFix.peerName}`, quality: peerFix.quality }
      : { kind: 'open_quality', label: 'Open quality' }
    return {
      dest: d,
      liveFor,
      tagKind: 'error',
      tagLabel: 'ERROR',
      pipTone: 'error',
      pipPulse: false,
      rowTint: 'error',
      line2: {
        kind: 'status',
        tone: 'error',
        spinner: false,
        icon: 'warn',
        text: 'Too many qualities',
      },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: !liveFor,
      barLabel,
      switchDisabled,
      popover: {
        title: 'Too many qualities for this PC',
        body: maxSessions
          ? `Your PC can run ${maxSessions} at once. Match another platform's quality and they share one.`
          : "Match another platform's quality so they share one encode.",
        tone: 'error',
        primaryAction: action,
      },
      problemItem: {
        destId: d.id,
        destName: d.name,
        reason: 'Too many qualities',
        tone: 'error',
        action,
      },
    }
  }

  // 8. Structured quality/limit issue from engine.
  const firstIssue = d.issues?.[0] ?? null
  if (d.enabled && firstIssue) {
    const baseQuality = d.resolved_quality
    const clampedQuality: DestinationQuality | null =
      baseQuality && firstIssue.fix_kbps
        ? {
            mode: 'custom',
            width: baseQuality.width,
            height: baseQuality.height,
            fps: baseQuality.fps,
            kbps: firstIssue.fix_kbps,
            codec: baseQuality.codec,
          }
        : null
    const fixLabel = firstIssue.fix_kbps ? `Use ${formatRate(firstIssue.fix_kbps)}` : 'Open quality'
    const action: RowAction = clampedQuality
      ? { kind: 'set_quality', label: fixLabel, quality: clampedQuality }
      : { kind: 'open_quality', label: 'Open quality' }
    return {
      dest: d,
      liveFor,
      tagKind: 'error',
      tagLabel: 'ERROR',
      pipTone: 'error',
      pipPulse: false,
      rowTint: 'error',
      line2: {
        kind: 'status',
        tone: 'error',
        spinner: false,
        icon: 'warn',
        text: firstIssue.summary,
      },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: !liveFor,
      barLabel,
      switchDisabled,
      popover: {
        title: `Over ${d.name}'s limit`,
        body: firstIssue.detail || firstIssue.summary,
        tone: 'error',
        primaryAction: action,
      },
      problemItem: {
        destId: d.id,
        destName: d.name,
        reason: firstIssue.summary,
        tone: 'error',
        action,
      },
    }
  }

  // Also check if resolved custom quality somehow exceeds platform limits while enabled.
  const customLimits = ctx.destOpts?.custom_limits
  if (
    d.enabled &&
    !ctx.usesObs &&
    !view.advanced.ignore_service_limits &&
    customLimits &&
    d.resolved_quality &&
    (d.resolved_quality.kbps > customLimits.max_kbps ||
      d.resolved_quality.width > customLimits.max_width ||
      d.resolved_quality.height > customLimits.max_height)
  ) {
    const model = buildModalModel({
      dest: d,
      destOpts: ctx.destOpts ?? null,
      response: ctx.optionsResponse ?? null,
    })
    const fixed = clampDraftToHardLimits(model, {
      matchMain: false,
      width: d.resolved_quality.width,
      height: d.resolved_quality.height,
      fps: d.resolved_quality.fps,
      kbps: d.resolved_quality.kbps,
      codec: null,
    })
    const fixRes = formatModalResFps(fixed.width, fixed.height, fixed.fps)
    const reason =
      d.resolved_quality.kbps > customLimits.max_kbps
        ? `Over ${d.name}'s ${formatRate(customLimits.max_kbps)} limit`
        : `Over ${d.name}'s ${Math.min(customLimits.max_width, customLimits.max_height)}p limit`
    const action: RowAction = {
      kind: 'set_quality',
      label: `Use ${fixRes}`,
      quality: {
        mode: 'custom',
        width: fixed.width,
        height: fixed.height,
        fps: fixed.fps,
        kbps: fixed.kbps,
        codec: null,
      },
    }
    return {
      dest: d,
      liveFor,
      tagKind: 'error',
      tagLabel: 'ERROR',
      pipTone: 'error',
      pipPulse: false,
      rowTint: 'error',
      line2: { kind: 'status', tone: 'error', spinner: false, icon: 'warn', text: reason },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: !liveFor,
      barLabel,
      switchDisabled,
      popover: {
        title: reason,
        body: `${d.name} closes streams above ${formatRate(customLimits.max_kbps)} / ${Math.min(customLimits.max_width, customLimits.max_height)}p.`,
        tone: 'error',
        primaryAction: action,
      },
      problemItem: { destId: d.id, destName: d.name, reason, tone: 'error', action },
    }
  }

  // 9. Reconnecting / connecting / paused while enabled & live.
  if (d.enabled && liveFor && d.health?.state === 'reconnecting') {
    const lineText =
      d.health.attempt > 0 ? `Reconnecting · try ${d.health.attempt}` : 'Reconnecting'
    const reconInfo = reconnectingText(d.health)
    const sec =
      d.health.retry_in_ms > 0 ? Math.max(1, Math.round(d.health.retry_in_ms / 1000)) : null
    const retryPart = sec ? `Trying again in ${sec} s` : reconInfo.heading || 'Trying again soon'
    const body =
      `${d.health.reason ? `${d.health.reason} ` : ''}${retryPart}. Your stream keeps going.`.trim()
    const action: RowAction = { kind: 'test_connection', label: 'Check connection' }
    return {
      dest: d,
      liveFor,
      tagKind: 'reconnecting',
      tagLabel: 'RECONNECTING',
      pipTone: 'warn',
      pipPulse: true,
      rowTint: 'warn',
      line2: { kind: 'status', tone: 'warn', spinner: true, icon: 'spin', text: lineText },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: true,
      barLabel: lineText,
      switchDisabled,
      popover: {
        title: 'Reconnecting',
        body,
        tone: 'warn',
        primaryAction: action,
      },
      problemItem: { destId: d.id, destName: d.name, reason: lineText, tone: 'warn', action },
    }
  }

  if (d.enabled && liveFor && d.health?.state === 'paused') {
    const hText = healthText(d.health, d.blocked, d.kind)
    const action: RowAction = { kind: 'retry', label: 'Resume now' }
    return {
      dest: d,
      liveFor,
      tagKind: 'reconnecting',
      tagLabel: 'RECONNECTING',
      pipTone: 'warn',
      pipPulse: false,
      rowTint: 'warn',
      line2: { kind: 'status', tone: 'warn', spinner: false, icon: 'warn', text: hText.label },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: true,
      barLabel: hText.label,
      switchDisabled,
      popover: {
        title: `${d.name} paused`,
        body: hText.detail || 'Paused to protect your stream on slower upload.',
        tone: 'warn',
        primaryAction: action,
      },
      problemItem: { destId: d.id, destName: d.name, reason: hText.label, tone: 'warn', action },
    }
  }

  if (d.enabled && liveFor && d.health?.state === 'connecting') {
    return {
      dest: d,
      liveFor,
      tagKind: 'switching',
      tagLabel: 'SWITCHING',
      pipTone: 'work',
      pipPulse: true,
      rowTint: 'none',
      line2: { kind: 'status', tone: 'work', spinner: true, icon: 'spin', text: 'Connecting…' },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: false,
      barLabel: 'Connecting',
      switchDisabled,
      popover: {
        title: `Connecting to ${d.name}`,
        body: `Opening the stream to ${d.name}. Your stream keeps going.`,
        tone: 'work',
        primaryAction: null,
      },
      problemItem: null,
    }
  }

  // 10. Custom choice above soft recommendation (line 2 warning -> popover Open quality).
  if (d.quality?.mode === 'custom' && d.quality_note && !ctx.usesObs && d.enabled) {
    const isLive = isSending(d, liveFor)
    return {
      dest: d,
      liveFor,
      tagKind: isLive ? 'live' : 'off',
      tagLabel: isLive ? 'LIVE' : 'OFF',
      pipTone: isLive ? 'live' : 'off',
      pipPulse: false,
      rowTint: 'none',
      line2: {
        kind: 'status',
        tone: 'warn',
        spinner: false,
        icon: 'warn',
        text: d.quality_note,
      },
      barPct: ratePct,
      barMode: 'rate',
      barDimmed: !isLive,
      barLabel,
      switchDisabled,
      popover: {
        title: 'Not recommended',
        body: `${d.quality_note}. Viewers on slower internet may buffer.`,
        tone: 'warn',
        primaryAction: { kind: 'open_quality', label: 'Open quality' },
      },
      problemItem: null,
    }
  }

  // 11. Normal LIVE or OFF row: line 2 is the clickable quality trigger opening Modal A.
  const isLive = isSending(d, liveFor)
  return {
    dest: d,
    liveFor,
    tagKind: isLive ? 'live' : 'off',
    tagLabel: isLive ? 'LIVE' : 'OFF',
    pipTone: isLive ? 'live' : 'off',
    pipPulse: false,
    rowTint: 'none',
    line2: {
      kind: 'quality',
      text: qualityText,
      disabled: ctx.usesObs,
    },
    barPct: ratePct,
    barMode: 'rate',
    barDimmed: !isLive,
    barLabel,
    switchDisabled,
    popover: null,
    problemItem: null,
  }
}

export function buildGoLiveDockVM(view: GoLiveView, ctx: BuildDockContext): GoLiveDockVM {
  const maxUploadKbps = Math.max(
    6000,
    ...view.destinations.filter((d) => d.enabled).map((d) => destUploadKbps(d, view)),
  )
  const budgetOffenders = findBudgetOffenderIds(view)

  const toRow = (d: DestinationView) =>
    buildDestinationRowVM(d, view, {
      usesObs: ctx.usesObs,
      maxUploadKbps,
      destOpts: ctx.qualityOptionsById[d.id],
      optionsResponse: ctx.optionsResponse,
      switchingTarget: ctx.switchingTargets?.[d.id],
      isBudgetOffender: budgetOffenders.has(d.id),
    })

  const mainRows = view.destinations.filter((d) => d.canvas === 'main').map(toRow)
  const verticalRows = view.destinations.filter((d) => d.canvas === 'vertical').map(toRow)
  const allRows = [...mainRows, ...verticalRows]

  const encodeSummary = ctx.usesObs ? null : summarizeEncodeGroups(view)
  const breakdown = encodeSummary?.breakdown ?? null

  // Whole-stream problem -> compact footer strip.
  if (ctx.saveError) {
    return {
      mainRows,
      verticalRows,
      footer: {
        mode: 'strip',
        text: 'Couldn’t save. Changes weren’t applied.',
        action: { kind: 'retry_save', label: 'Try again' },
        breakdown,
      },
    }
  }

  if (!ctx.usesObs && view.encode_budget?.status === 'over') {
    const firstOffenderId = [...budgetOffenders][0] ?? view.destinations.find((d) => d.enabled)?.id
    const offender = view.destinations.find((d) => d.id === firstOffenderId)
    const peerFix = offender
      ? findBudgetMatchPeer(offender, view.destinations, ctx.qualityOptionsById)
      : null
    const maxQ = view.encode_budget.max_sessions ?? 0
    return {
      mainRows,
      verticalRows,
      footer: {
        mode: 'strip',
        text:
          maxQ > 0
            ? `PC limit: ${maxQ} ${maxQ === 1 ? 'quality' : 'qualities'}`
            : 'PC encode limit reached',
        action:
          offender && peerFix
            ? {
                kind: 'match_to_share',
                label: 'Match to share',
                destId: offender.id,
                quality: peerFix.quality,
              }
            : { kind: 'manage', label: 'Manage' },
        breakdown,
      },
    }
  }

  const enabledRows = allRows.filter((r) => r.dest.enabled)
  const mainAllFailed = !ctx.usesObs && Boolean(allDestinationsFailed(view.destinations, 'main'))
  const allLiveFailed =
    mainAllFailed ||
    (view.live &&
      enabledRows.length > 0 &&
      // A quality problem is not a stopped push: a row still delivering keeps the stream going.
      enabledRows.every((r) => r.tagKind === 'error' && r.dest.health?.state !== 'live'))
  if (allLiveFailed) {
    const retryIds = enabledRows
      .filter((r) => r.dest.health?.state === 'failed' || r.dest.health?.state === 'paused')
      .map((r) => r.dest.id)
    return {
      mainRows,
      verticalRows,
      footer: {
        mode: 'strip',
        text: 'Nothing is sending',
        action:
          retryIds.length > 0
            ? { kind: 'retry_all', label: 'Retry all', destIds: retryIds }
            : { kind: 'manage', label: 'Manage' },
        breakdown,
      },
    }
  }

  // Normal footer summary + clickable problem count.
  const placesText =
    encodeSummary && encodeSummary.places > 0
      ? `${encodeSummary.places} ${encodeSummary.places === 1 ? 'place' : 'places'} · ${formatSummaryMbps(encodeSummary.totalKbps)} · ${encodeSummary.encodes} ${encodeSummary.encodes === 1 ? 'encode' : 'encodes'}`
      : view.destinations.filter((d) => d.enabled).length === 0
        ? 'Nothing on'
        : `${view.destinations.filter((d) => d.enabled).length} ${view.destinations.filter((d) => d.enabled).length === 1 ? 'place' : 'places'}`

  const problems = allRows
    .map((r) => r.problemItem)
    .filter((p): p is FooterProblemItem => p !== null)

  let problemLinkText: string | null = null
  let problemLinkTone: 'warn' | 'error' | null = null
  if (problems.length > 0) {
    const hasError = problems.some((p) => p.tone === 'error')
    problemLinkTone = hasError ? 'error' : 'warn'
    problemLinkText = hasError
      ? `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`
      : `${problems.length} reconnecting`
  }

  return {
    mainRows,
    verticalRows,
    footer: {
      mode: 'summary',
      summaryText: placesText,
      problemLinkText,
      problemLinkTone,
      problems,
      breakdown,
    },
  }
}
