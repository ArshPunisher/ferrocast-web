// Per-destination quality chip and portalled popover: shows the active resolution, fps, and
// bitrate at a glance, offers up to four ready choices plus Custom dropdowns bounded by platform
// and PC limits, and handles mid-stream switches cleanly.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowsClockwise,
  CaretDown,
  Check,
  Info,
  Lock,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react'
import {
  describeError,
  goliveApi,
  type Canvas,
  type CustomQualityLimits,
  type DestinationQuality,
  type DestinationQualityOptions,
  type DestinationView,
  type EncodeBudgetCheck,
  type GoLiveQualityOptionsResponse,
  type GoLiveView,
  type QualityOption,
  type VideoCodec,
} from '@ferrocast/api'
import { Button, InfoTip, Select, Skeleton, cx } from '@ferrocast/ui'
import { useClient } from '../../lib/hooks'
import { HOLES_CHANGED } from './desk/snap-overlay'

type DestKind = DestinationView['kind']

const LANDSCAPE_PRESETS: ReadonlyArray<readonly [number, number]> = [
  [3840, 2160],
  [2560, 1440],
  [1920, 1080],
  [1280, 720],
  [960, 540],
  [854, 480],
]

const PORTRAIT_PRESETS: ReadonlyArray<readonly [number, number]> = [
  [1080, 1920],
  [720, 1280],
  [540, 960],
]

const BITRATE_LADDER_KBPS = [
  800, 1200, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7500, 8000, 9000, 12000, 15000,
  20000, 25000, 35000, 50000,
] as const

const PLATFORM_NAMES: Record<string, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  facebook: 'Facebook',
  trovo: 'Trovo',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  x: 'X',
}

const CODEC_LABELS: Record<VideoCodec, string> = {
  h264: 'H.264',
  hevc: 'HEVC',
  av1: 'AV1',
  vp9: 'VP9',
}

/** Formats resolution and frame rate using short edge (e.g. `1080p60`, `720p30`). */
export function formatResFps(width: number, height: number, fps: number): string {
  const short = Math.min(width, height)
  return fps > 0 ? `${short}p${fps}` : `${short}p`
}

/** Formats video bitrate cleanly (`6 Mbps`, `4.5 Mbps`, `800 kbps`). */
export function formatRate(kbps: number): string {
  if (kbps >= 1000) {
    const mbps = kbps / 1000
    return kbps % 1000 === 0 ? `${kbps / 1000} Mbps` : `${Number(mbps.toFixed(1))} Mbps`
  }
  return `${Math.round(kbps)} kbps`
}

/** Clean display name for a platform or destination. */
export function destDisplayLabel(kind?: DestKind | string, fallbackName?: string): string {
  const mapped = kind ? PLATFORM_NAMES[kind as DestKind] : undefined
  if (mapped) return mapped
  return fallbackName?.trim() || 'platform'
}

/** Resolves peer destination IDs or display names into a comma-separated string. */
export function formatSharedWith(
  entries: readonly string[],
  destinationsById?: Record<string, { name: string; kind?: string }>,
): string {
  const seen = new Set<string>()
  const names: string[] = []
  for (const entry of entries) {
    const label = destinationsById?.[entry]?.name ?? entry
    if (label && !seen.has(label)) {
      seen.add(label)
      names.push(label)
    }
  }
  return names.join(', ')
}

/** True when the PC cannot open another independent encode session cleanly. */
export function isBudgetAtLimit(budget: EncodeBudgetCheck | null | undefined): boolean {
  if (!budget) return false
  if (budget.status === 'limit' || budget.status === 'over') return true
  return budget.max_sessions != null && budget.used_sessions >= budget.max_sessions
}

export interface ChipSummary {
  text: string
  tone: 'default' | 'auto' | 'custom' | 'pending' | 'locked'
  lockReason: string | null
}

/** Computes concise single-line pill text and tone for a destination row. */
export function formatQualityChip(
  dest: DestinationView,
  destOpts?: DestinationQualityOptions | null,
  opts?: { usesObs?: boolean; isRemote?: boolean },
): ChipSummary {
  if (dest.switching_quality) {
    return { text: 'Switching…', tone: 'pending', lockReason: null }
  }

  const backendLock = destOpts?.locked_reason ?? null
  if (backendLock) {
    const lower = backendLock.toLowerCase()
    const chipText = lower.includes('enhanced')
      ? 'Enhanced (auto)'
      : lower.includes('obs')
        ? 'Same as OBS'
        : lower.includes('full') || dest.direct
          ? 'Full stream'
          : backendLock.length <= 20
            ? backendLock
            : 'Locked'
    return { text: chipText, tone: 'locked', lockReason: backendLock }
  }

  if (opts?.usesObs) {
    return {
      text: 'Same as OBS',
      tone: 'locked',
      lockReason: 'Controlled by your OBS output settings.',
    }
  }

  if (dest.direct) {
    return {
      text: 'Full stream',
      tone: 'locked',
      lockReason: 'Custom stream always sends your full picture.',
    }
  }

  const mode = dest.quality?.mode ?? destOpts?.current.mode ?? 'same_as_main'
  const resolved = dest.resolved_quality ?? destOpts?.resolved
  const remoteLock = opts?.isRemote ? 'Change destination quality from your PC.' : null

  if (!resolved) {
    if (dest.light) {
      return {
        text: '720p30 · 3 Mbps',
        tone: remoteLock ? 'locked' : 'custom',
        lockReason: remoteLock,
      }
    }
    return { text: 'Same as main', tone: remoteLock ? 'locked' : 'default', lockReason: remoteLock }
  }

  const spec = `${formatResFps(resolved.width, resolved.height, resolved.fps)} · ${formatRate(resolved.kbps)}`
  if (resolved.auto_fitted) {
    return { text: `${spec} · auto`, tone: remoteLock ? 'locked' : 'auto', lockReason: remoteLock }
  }
  if (mode === 'same_as_main') {
    return { text: 'Same as main', tone: remoteLock ? 'locked' : 'default', lockReason: remoteLock }
  }
  return { text: spec, tone: remoteLock ? 'locked' : 'custom', lockReason: remoteLock }
}

/** Matches a preset quality against the active destination quality. */
export function matchesQualitySelection(a: DestinationQuality, b: DestinationQuality): boolean {
  if (a.mode !== b.mode) return false
  if (a.mode === 'same_as_main') return true
  if (b.mode !== 'custom') return false
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.fps === b.fps &&
    a.kbps === b.kbps &&
    (a.codec == null || b.codec == null || a.codec === b.codec)
  )
}

/** Limits preset list to at most 4 high-value choices while preserving key states. */
export function curateQualityOptions(destOpts: DestinationQualityOptions): QualityOption[] {
  const { options, current } = destOpts
  if (options.length <= 4) return [...options]

  const picked = new Set<number>()
  const addIdx = (idx: number) => {
    if (idx >= 0 && picked.size < 4) picked.add(idx)
  }

  addIdx(options.findIndex((o) => o.quality.mode === 'same_as_main'))
  addIdx(options.findIndex((o) => matchesQualitySelection(o.quality, current)))
  addIdx(options.findIndex((o) => o.recommended))
  addIdx(options.findIndex((o) => o.allowed && o.shares_encoder_with.length > 0))

  for (let i = 0; i < options.length && picked.size < 4; i++) {
    if (options[i]?.allowed) addIdx(i)
  }
  for (let i = options.length - 1; i >= 0 && picked.size < 4; i--) {
    if (options[i]?.allowed) addIdx(i)
  }
  for (let i = 0; i < options.length && picked.size < 4; i++) {
    addIdx(i)
  }

  const result: QualityOption[] = []
  for (const idx of Array.from(picked).sort((a, b) => a - b)) {
    const opt = options[idx]
    if (opt) result.push(opt)
  }
  return result
}

export interface CustomResolutionChoice {
  value: string
  width: number
  height: number
  label: string
  softNote: string | null
}

/** Allowed Custom resolution dropdown entries bounded by `custom_limits` and canvas shape. */
export function buildCustomResolutions(
  limits: CustomQualityLimits,
  canvas: Canvas,
  currentWidth: number,
  currentHeight: number,
  kind?: DestKind | string,
): CustomResolutionChoice[] {
  const candidates = canvas === 'vertical' ? [...PORTRAIT_PRESETS] : [...LANDSCAPE_PRESETS]
  const seen = new Set<string>()
  const pairs: Array<[number, number]> = []

  const pushIfValid = (w: number, h: number) => {
    if (w <= 0 || h <= 0 || w > limits.max_width || h > limits.max_height) return
    const key = `${w}x${h}`
    if (seen.has(key)) return
    seen.add(key)
    pairs.push([w, h])
  }

  for (const [w, h] of candidates) pushIfValid(w, h)
  pushIfValid(currentWidth, currentHeight)

  pairs.sort((a, b) => Math.min(b[0], b[1]) - Math.min(a[0], a[1]))

  const recShort = Math.min(limits.recommended_width, limits.recommended_height)
  const platformName = destDisplayLabel(kind)
  return pairs.map(([w, h]) => {
    const short = Math.min(w, h)
    const aboveRec = short > recShort || (kind === 'twitch' && short > 1080)
    const softNote = aboveRec ? `Above ${platformName}'s recommended ${recShort}p` : null
    return {
      value: `${w}x${h}`,
      width: w,
      height: h,
      label: aboveRec ? `${short}p (recommended max ${recShort}p)` : `${short}p (${w}x${h})`,
      softNote,
    }
  })
}

/** Allowed Custom bitrate steps bounded by `custom_limits`. */
export function buildCustomBitrates(limits: CustomQualityLimits, currentKbps?: number): number[] {
  const set = new Set<number>()
  for (const k of BITRATE_LADDER_KBPS) {
    if (k >= limits.min_kbps && k <= limits.max_kbps) set.add(k)
  }
  const addClamped = (k: number | undefined) => {
    if (!k || k <= 0) return
    if (k >= limits.min_kbps && k <= limits.max_kbps) set.add(k)
  }
  addClamped(limits.recommended_kbps)
  addClamped(limits.min_kbps)
  addClamped(limits.max_kbps)
  addClamped(currentKbps)
  return Array.from(set).sort((a, b) => a - b)
}

export interface CustomCostEvaluation {
  sharedWithNames: string[]
  extraEncodes: number
  overBudget: boolean
  reason: string | null
  softNote: string | null
}

/** Computes encode sharing and GPU budget feedback for an arbitrary Custom selection. */
export function evaluateCustomSelection(
  draft: { width: number; height: number; fps: number; kbps: number; codec: VideoCodec },
  dest: DestinationView,
  destOpts: DestinationQualityOptions,
  response: GoLiveQualityOptionsResponse | null,
  resChoices: CustomResolutionChoice[],
  destinationsById?: Record<string, { name: string; kind?: string }>,
): CustomCostEvaluation {
  const matchedRes = resChoices.find((r) => r.width === draft.width && r.height === draft.height)
  const softNote = matchedRes?.softNote ?? null

  const draftQuality: DestinationQuality = { mode: 'custom', ...draft }
  const matchedOption = destOpts.options.find((o) =>
    matchesQualitySelection(o.quality, draftQuality),
  )

  if (matchedOption) {
    return {
      sharedWithNames: matchedOption.shares_encoder_with.map(
        (entry) => destinationsById?.[entry]?.name ?? entry,
      ),
      extraEncodes:
        matchedOption.quality.mode === 'same_as_main' ||
        matchedOption.shares_encoder_with.length > 0
          ? 0
          : destOpts.resolved.separate_encode
            ? 0
            : 1,
      overBudget: !matchedOption.allowed,
      reason: matchedOption.allowed ? null : (matchedOption.disabled_reason ?? 'PC encode limit.'),
      softNote: matchedOption.note ?? softNote,
    }
  }

  const canvasSummary =
    dest.canvas === 'vertical' ? (response?.vertical ?? response?.main) : response?.main
  const matchesCanvasMain =
    canvasSummary != null &&
    canvasSummary.width === draft.width &&
    canvasSummary.height === draft.height &&
    canvasSummary.fps === draft.fps &&
    canvasSummary.kbps === draft.kbps &&
    canvasSummary.codec === draft.codec

  if (matchesCanvasMain) {
    return {
      sharedWithNames: [],
      extraEncodes: 0,
      overBudget: false,
      reason: null,
      softNote,
    }
  }

  const needsNewSlot = !destOpts.resolved.separate_encode
  const overBudget = needsNewSlot && isBudgetAtLimit(response?.budget)
  return {
    sharedWithNames: [],
    extraEncodes: needsNewSlot ? 1 : 0,
    overBudget,
    reason: overBudget ? 'PC encode limit reached.' : null,
    softNote,
  }
}

function signatureOfView(view: GoLiveView | null | undefined, usesObs: boolean): string {
  if (!view) return 'none'
  const destSig = view.destinations
    .map((d) => {
      const q =
        d.quality?.mode === 'custom'
          ? `${d.quality.width}x${d.quality.height}@${d.quality.fps}:${d.quality.kbps}:${d.quality.codec ?? ''}`
          : (d.quality?.mode ?? (d.light ? 'light' : 'main'))
      const r = d.resolved_quality
        ? `${d.resolved_quality.width}x${d.resolved_quality.height}@${d.resolved_quality.fps}:${d.resolved_quality.kbps}:${d.resolved_quality.group_id}`
        : ''
      return `${d.id}:${d.enabled ? 1 : 0}:${d.blocked ? 1 : 0}:${d.switching_quality ? 1 : 0}:${q}:${r}`
    })
    .join('|')
  return `${view.live ? 1 : 0}:${view.vertical_live ? 1 : 0}:${usesObs ? 1 : 0}:${destSig}`
}

export interface QualityOptionsState {
  data: GoLiveQualityOptionsResponse | null
  error: unknown
  loading: boolean
  reload: () => void
}

/**
 * Fetches `/golive/quality-options` once per relevant Go live state change and provides
 * a fallback refresh while any destination is switching quality mid-stream.
 */
export function useQualityOptions(
  view: GoLiveView | null | undefined,
  enabled = true,
  usesObs = false,
  onPollView?: () => void,
): QualityOptionsState {
  const client = useClient()
  const [data, setData] = useState<GoLiveQualityOptionsResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(enabled)
  const [nonce, setNonce] = useState(0)

  const sig = signatureOfView(view, usesObs)
  const anySwitching = Boolean(view?.destinations.some((d) => d.switching_quality))
  const pollRef = useRef(onPollView)
  pollRef.current = onPollView

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading((prev) => (data === null ? true : prev))
    goliveApi(client)
      .qualityOptions()
      .then((res) => {
        if (!alive) return
        setData(res)
        setError(null)
      })
      .catch((err: unknown) => {
        if (alive) setError(err)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // `data` intentionally omitted so reloads only happen on state changes or explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, enabled, sig, nonce])

  useEffect(() => {
    if (!enabled || !anySwitching) return
    const timer = window.setInterval(() => {
      setNonce((n) => n + 1)
      pollRef.current?.()
    }, 600)
    return () => window.clearInterval(timer)
  }, [enabled, anySwitching])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, reload }
}

function buildChipTooltip(
  dest: DestinationView,
  destOpts: DestinationQualityOptions | null | undefined,
  chip: ChipSummary,
  sharedNames: string,
  curated: QualityOption[],
): string | null {
  if (chip.lockReason) return chip.lockReason
  const resolved = destOpts?.resolved ?? dest.resolved_quality
  const parts: string[] = []

  const activeOpt = destOpts
    ? curated.find((o) => matchesQualitySelection(o.quality, destOpts.current))
    : undefined
  if (activeOpt?.note) {
    parts.push(activeOpt.note)
  } else if (resolved?.auto_fitted) {
    parts.push(
      `Adjusted automatically to ${formatResFps(resolved.width, resolved.height, resolved.fps)} at ${formatRate(resolved.kbps)} to fit ${destDisplayLabel(dest.kind, dest.name)}.`,
    )
  }

  if (sharedNames) {
    parts.push(`Shares one video encode with ${sharedNames}.`)
  } else if (resolved?.separate_encode) {
    parts.push('Uses its own video encode.')
  }

  return parts.length > 0 ? parts.join(' ') : null
}

function initialDraftFor(
  dest: DestinationView,
  destOpts: DestinationQualityOptions,
  limits: CustomQualityLimits,
  resChoices: CustomResolutionChoice[],
  bitrates: number[],
): { width: number; height: number; fps: number; kbps: number; codec: VideoCodec } {
  const base =
    destOpts.current.mode === 'custom'
      ? destOpts.current
      : (destOpts.resolved ?? dest.resolved_quality)
  const fallbackRes = resChoices[0] ?? {
    width: limits.recommended_width,
    height: limits.recommended_height,
  }
  const hasBaseRes = resChoices.some((r) => r.width === base?.width && r.height === base?.height)
  const width = hasBaseRes && base ? base.width : fallbackRes.width
  const height = hasBaseRes && base ? base.height : fallbackRes.height

  const fpsChoices = limits.fps_choices.length > 0 ? limits.fps_choices : [30, 60]
  const fps =
    base && fpsChoices.includes(base.fps)
      ? base.fps
      : fpsChoices.includes(limits.recommended_fps)
        ? limits.recommended_fps
        : (fpsChoices[0] ?? 60)

  const baseKbps = base?.kbps ?? limits.recommended_kbps
  const closestBitrate =
    bitrates.length > 0
      ? bitrates.reduce((best, k) =>
          Math.abs(k - baseKbps) < Math.abs(best - baseKbps) ? k : best,
        )
      : limits.recommended_kbps

  const codecs: VideoCodec[] = limits.codecs.length > 0 ? limits.codecs : ['h264']
  const codec: VideoCodec =
    base?.codec && codecs.includes(base.codec) ? base.codec : (codecs[0] ?? 'h264')

  return { width, height, fps, kbps: closestBitrate, codec }
}

function computePopoverRect(trigger: HTMLElement, popEl: HTMLElement) {
  const rect = trigger.getBoundingClientRect()
  const vw = window.innerWidth || 1024
  const vh = window.innerHeight || 768
  const width = Math.min(312, Math.max(240, vw - 16))
  const measuredHeight = popEl.offsetHeight || 260
  const topSafe = Math.max(
    8,
    Math.round(document.querySelector('header')?.getBoundingClientRect().bottom ?? 8),
  )
  const bottomSafe = vh - 12

  const spaceBelow = bottomSafe - (rect.bottom + 6)
  const spaceAbove = rect.top - 6 - topSafe
  const openAbove = spaceBelow < Math.min(measuredHeight, 260) && spaceAbove > spaceBelow

  const availHeight = Math.max(160, openAbove ? spaceAbove : spaceBelow)
  const usedHeight = Math.min(measuredHeight, availHeight)
  const top = openAbove
    ? Math.max(topSafe, rect.top - 6 - usedHeight)
    : Math.max(topSafe, Math.min(rect.bottom + 6, bottomSafe - usedHeight))
  const left = Math.max(8, Math.min(rect.left, vw - width - 8))

  return { top, left, width, maxHeight: availHeight }
}

export interface DestinationQualityPickerProps {
  dest: DestinationView
  qualityResponse: GoLiveQualityOptionsResponse | null
  optionsLoading?: boolean
  optionsError?: unknown
  onReloadOptions?: () => void
  onUpdated: (view: GoLiveView) => void
  destinationsById?: Record<string, { name: string; kind?: string }>
  usesObs?: boolean
  isRemote?: boolean
  compact?: boolean
}

/**
 * Interactive per-destination quality pill and portalled chooser. Renders cleanly in both the
 * Studio Go live dock (`compact`) and the Your platforms dialog (`<dialog>`).
 */
export function DestinationQualityPicker({
  dest,
  qualityResponse,
  optionsLoading = false,
  optionsError = null,
  onReloadOptions,
  onUpdated,
  destinationsById,
  usesObs = false,
  isRemote = false,
  compact = false,
}: DestinationQualityPickerProps) {
  const client = useClient()
  const headingId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  const [pos, setPos] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)

  const destOpts = qualityResponse?.destinations[dest.id] ?? null
  const chip = useMemo(
    () => formatQualityChip(dest, destOpts, { usesObs, isRemote }),
    [dest, destOpts, usesObs, isRemote],
  )
  const locked = chip.tone === 'locked' || chip.tone === 'pending'

  const curated = useMemo(() => (destOpts ? curateQualityOptions(destOpts) : []), [destOpts])
  const sharedNames = useMemo(() => {
    const entries = dest.resolved_quality?.shared_with ?? destOpts?.resolved.shared_with ?? []
    return formatSharedWith(entries, destinationsById)
  }, [destOpts, dest.resolved_quality, destinationsById])

  const tipText = useMemo(
    () => buildChipTooltip(dest, destOpts, chip, sharedNames, curated),
    [dest, destOpts, chip, sharedNames, curated],
  )

  const limits = destOpts?.custom_limits ?? null
  const currentResForCustom = destOpts?.resolved ?? dest.resolved_quality
  const resChoices = useMemo(
    () =>
      limits
        ? buildCustomResolutions(
            limits,
            destOpts?.canvas ?? dest.canvas,
            currentResForCustom?.width ?? limits.recommended_width,
            currentResForCustom?.height ?? limits.recommended_height,
            dest.kind,
          )
        : [],
    [limits, destOpts?.canvas, dest.canvas, currentResForCustom, dest.kind],
  )

  const [draft, setDraft] = useState<{
    width: number
    height: number
    fps: number
    kbps: number
    codec: VideoCodec
  }>(() =>
    limits && destOpts
      ? initialDraftFor(
          dest,
          destOpts,
          limits,
          resChoices,
          buildCustomBitrates(limits, destOpts.resolved.kbps),
        )
      : { width: 1920, height: 1080, fps: 60, kbps: 6000, codec: 'h264' },
  )

  const bitrateChoices = useMemo(
    () => (limits ? buildCustomBitrates(limits, draft.kbps) : []),
    [limits, draft.kbps],
  )

  useEffect(() => {
    if (!open || !limits || !destOpts) return
    const nextBitrates = buildCustomBitrates(limits, destOpts.resolved.kbps)
    setDraft(initialDraftFor(dest, destOpts, limits, resChoices, nextBitrates))
  }, [open, dest, destOpts, limits, resChoices])

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    setCustomOpen(false)
    setSaveError(null)
    if (restoreFocus) {
      triggerRef.current?.focus()
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      window.dispatchEvent(new Event(HOLES_CHANGED))
      return
    }
    const trigger = triggerRef.current
    if (!trigger) return
    const host = (trigger.closest('dialog') as HTMLElement | null) ?? document.body
    setPortalHost(host)

    const update = () => {
      if (!triggerRef.current || !popoverRef.current) return
      setPos(computePopoverRect(triggerRef.current, popoverRef.current))
      window.dispatchEvent(new Event(HOLES_CHANGED))
    }

    const frame = window.requestAnimationFrame(update)
    const onScroll = (e: Event) => {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) {
        return
      }
      if (e.target === document || e.target === window) update()
      else close(false)
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', onScroll, true)
      window.dispatchEvent(new Event(HOLES_CHANGED))
    }
  }, [open, customOpen, destOpts, saveError, close])

  useEffect(() => {
    if (!open || !destOpts || optionsLoading) return
    const frame = window.requestAnimationFrame(() => {
      const box = listboxRef.current
      if (!box || popoverRef.current?.contains(document.activeElement)) return
      const selected = box.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')
      const first = box.querySelector<HTMLButtonElement>('[role="option"]')
      ;(selected ?? first)?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, destOpts, optionsLoading])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open, close])

  const submitQuality = async (next: DestinationQuality) => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const updatedView = await goliveApi(client).setQuality(dest.id, next)
      onUpdated(updatedView)
      onReloadOptions?.()
      close(true)
    } catch (err) {
      setSaveError(describeError(err).message)
    } finally {
      setSaving(false)
    }
  }

  const onListboxKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    if (items.length === 0) return
    const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(currentIdx + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(currentIdx <= 0 ? items.length : currentIdx) - 1]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    }
  }

  const customEval = useMemo(
    () =>
      destOpts
        ? evaluateCustomSelection(
            draft,
            dest,
            destOpts,
            qualityResponse,
            resChoices,
            destinationsById,
          )
        : { sharedWithNames: [], extraEncodes: 0, overBudget: false, reason: null, softNote: null },
    [draft, dest, destOpts, qualityResponse, resChoices, destinationsById],
  )

  const chipToneClass =
    chip.tone === 'pending'
      ? 'border-accent-text/30 bg-accent-soft text-accent-text cursor-wait'
      : chip.tone === 'locked'
        ? 'border-line bg-surface-2/60 text-text-3 cursor-default'
        : chip.tone === 'custom'
          ? 'border-accent-text/30 bg-accent-soft text-accent-text hover:border-accent-text/50'
          : chip.tone === 'auto'
            ? 'border-line-strong bg-surface-2 text-text hover:border-accent-text/40'
            : 'border-line bg-surface-2 text-text-2 hover:border-line-strong hover:text-text'

  const platformName = destDisplayLabel(dest.brand ?? dest.kind, dest.name)
  const atEncodeLimit = isBudgetAtLimit(qualityResponse?.budget)

  return (
    <div className={cx('mt-1 flex flex-wrap items-center gap-1.5', compact && 'mt-0.5')}>
      <button
        ref={triggerRef}
        type="button"
        disabled={locked}
        aria-haspopup={locked ? undefined : 'dialog'}
        aria-expanded={locked ? undefined : open}
        aria-label={`Quality for ${dest.name}: ${chip.text}`}
        data-quality-trigger={dest.id}
        onClick={() => {
          if (locked) return
          if (open) close(false)
          else {
            setSaveError(null)
            setOpen(true)
          }
        }}
        className={cx(
          'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--fc-focus)]',
          chipToneClass,
        )}
      >
        {chip.tone === 'pending' && (
          <ArrowsClockwise size={11} weight="bold" aria-hidden className="shrink-0 animate-spin" />
        )}
        {chip.tone === 'locked' && (
          <Lock size={11} weight="bold" aria-hidden className="shrink-0" />
        )}
        <span className="truncate">{chip.text}</span>
        {!locked && (
          <CaretDown size={10} weight="bold" aria-hidden className="shrink-0 opacity-75" />
        )}
      </button>

      {sharedNames && !locked && (
        <span className="text-[11px] font-medium text-text-3">shared with {sharedNames}</span>
      )}

      {tipText && <InfoTip label={`Quality details for ${dest.name}`}>{tipText}</InfoTip>}

      {open &&
        portalHost &&
        createPortal(
          <div
            ref={popoverRef}
            data-over-preview=""
            data-quality-popover={dest.id}
            role="dialog"
            aria-modal="false"
            aria-labelledby={headingId}
            style={{
              position: 'fixed',
              zIndex: 500,
              top: pos ? `${pos.top}px` : '12px',
              left: pos ? `${pos.left}px` : '12px',
              width: pos ? `${pos.width}px` : 'min(312px, calc(100vw - 16px))',
              maxHeight: pos ? `${pos.maxHeight}px` : 'calc(100vh - 24px)',
            }}
            className="overflow-y-auto rounded-[12px] border border-line-strong bg-surface-1 p-2.5 text-text shadow-pop"
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
              <p id={headingId} className="m-0 truncate text-[12.5px] font-semibold text-text">
                {dest.name} quality
              </p>
              {atEncodeLimit && (
                <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[10.5px] font-semibold text-warn">
                  Encode limit
                </span>
              )}
            </div>

            {optionsLoading && !destOpts ? (
              <div role="status" aria-label="Loading quality options" className="py-1">
                <Skeleton className="h-28 w-full rounded-[8px]" />
              </div>
            ) : optionsError && !destOpts ? (
              <div className="flex flex-col gap-2 py-1 text-[12px]">
                <p className="m-0 text-text-2">{describeError(optionsError).message}</p>
                {onReloadOptions && (
                  <div>
                    <Button size="sm" variant="outline" onClick={onReloadOptions}>
                      Try again
                    </Button>
                  </div>
                )}
              </div>
            ) : !destOpts ? (
              <p className="m-0 py-1.5 text-[12px] text-text-3">No quality presets available.</p>
            ) : (
              <>
                <div
                  ref={listboxRef}
                  role="listbox"
                  aria-label={`${dest.name} quality options`}
                  onKeyDown={onListboxKeyDown}
                  className="flex flex-col gap-1"
                >
                  {curated.map((opt) => {
                    const selected = matchesQualitySelection(opt.quality, destOpts.current)
                    const optShared = formatSharedWith(opt.shares_encoder_with, destinationsById)
                    const primary = opt.quality.mode === 'same_as_main' ? 'Same as main' : opt.label
                    const subLine = !opt.allowed
                      ? opt.disabled_reason || 'PC limit'
                      : optShared
                        ? `shared with ${optShared}`
                        : opt.note
                          ? opt.note
                          : opt.quality.mode === 'same_as_main'
                            ? `${formatResFps(opt.resolved.width, opt.resolved.height, opt.resolved.fps)} · ${formatRate(opt.resolved.kbps)}`
                            : opt.auto_fitted
                              ? 'Adjusted to fit'
                              : null

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-disabled={!opt.allowed || saving || undefined}
                        onClick={() => {
                          if (!opt.allowed || saving) return
                          void submitQuality(opt.quality)
                        }}
                        className={cx(
                          'flex w-full items-start gap-2 rounded-[8px] px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:shadow-[var(--fc-focus)]',
                          !opt.allowed
                            ? 'cursor-not-allowed opacity-60'
                            : selected
                              ? 'bg-accent-soft text-text'
                              : 'text-text hover:bg-surface-2',
                        )}
                      >
                        <span className="mt-0.5 grid size-4 shrink-0 place-items-center text-accent-text">
                          {selected && <Check size={13} weight="bold" aria-hidden />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold">
                            <span>{primary}</span>
                            {opt.recommended && (
                              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-text-2">
                                Best for {platformName}
                              </span>
                            )}
                          </span>
                          {subLine && (
                            <span
                              className={cx(
                                'mt-0.5 flex items-center gap-1 text-[11px]',
                                !opt.allowed
                                  ? 'text-text-3'
                                  : opt.note
                                    ? 'text-warn'
                                    : optShared
                                      ? 'text-ok'
                                      : 'text-text-3',
                              )}
                            >
                              {opt.allowed && opt.note && (
                                <>
                                  <Info size={11} weight="fill" aria-hidden className="shrink-0" />
                                  <span className="sr-only">(i) </span>
                                </>
                              )}
                              <span className="truncate">{subLine}</span>
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {limits && (
                  <div className="mt-2 border-t border-line pt-2">
                    <button
                      type="button"
                      aria-expanded={customOpen}
                      onClick={() => setCustomOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-[8px] px-2 py-1 text-[12px] font-medium text-text-2 hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:shadow-[var(--fc-focus)]"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <SlidersHorizontal size={13} aria-hidden />
                        <span>Custom…</span>
                      </span>
                      <CaretDown
                        size={11}
                        aria-hidden
                        className={cx('transition-transform', customOpen && 'rotate-180')}
                      />
                    </button>

                    {customOpen && (
                      <div className="mt-2 flex flex-col gap-2 px-0.5">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-text-3">Resolution</span>
                          <Select
                            aria-label="Resolution"
                            value={`${draft.width}x${draft.height}`}
                            onChange={(e) => {
                              const picked = resChoices.find((r) => r.value === e.target.value)
                              if (!picked) return
                              setDraft((d) => ({
                                ...d,
                                width: picked.width,
                                height: picked.height,
                              }))
                            }}
                          >
                            {resChoices.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </Select>
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-text-3">Frame rate</span>
                            <Select
                              aria-label="Frame rate"
                              value={String(draft.fps)}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, fps: Number(e.target.value) }))
                              }
                            >
                              {limits.fps_choices.map((f) => (
                                <option key={f} value={String(f)}>
                                  {f} fps
                                </option>
                              ))}
                            </Select>
                          </label>

                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-text-3">Bitrate</span>
                            <Select
                              aria-label="Bitrate"
                              value={String(draft.kbps)}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, kbps: Number(e.target.value) }))
                              }
                            >
                              {bitrateChoices.map((k) => (
                                <option key={k} value={String(k)}>
                                  {formatRate(k)}
                                </option>
                              ))}
                            </Select>
                          </label>
                        </div>

                        {limits.codecs.length > 1 && (
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-text-3">Codec</span>
                            <Select
                              aria-label="Codec"
                              value={draft.codec}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, codec: e.target.value as VideoCodec }))
                              }
                            >
                              {limits.codecs.map((c) => (
                                <option key={c} value={c}>
                                  {CODEC_LABELS[c] ?? c.toUpperCase()}
                                </option>
                              ))}
                            </Select>
                          </label>
                        )}

                        {customEval.softNote && (
                          <p className="m-0 flex items-center gap-1 text-[11px] text-warn">
                            <Info size={11} weight="fill" aria-hidden className="shrink-0" />
                            <span>{customEval.softNote}</span>
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <span className="text-[11px] text-text-3">
                            {customEval.overBudget
                              ? customEval.reason || 'PC encode limit reached'
                              : customEval.sharedWithNames.length > 0
                                ? `shared with ${customEval.sharedWithNames.join(', ')}`
                                : customEval.extraEncodes > 0
                                  ? '+1 video encode'
                                  : 'Uses active encode'}
                          </span>
                          <Button
                            size="sm"
                            variant="primary"
                            busy={saving}
                            disabled={saving || customEval.overBudget}
                            onClick={() =>
                              void submitQuality({
                                mode: 'custom',
                                width: draft.width,
                                height: draft.height,
                                fps: draft.fps,
                                kbps: draft.kbps,
                                codec: draft.codec,
                              })
                            }
                          >
                            Apply
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {saveError && (
              <div
                role="alert"
                className="mt-2 flex items-start justify-between gap-2 rounded-[8px] border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[11.5px] text-danger"
              >
                <span className="min-w-0 flex-1">{saveError}</span>
                <button
                  type="button"
                  aria-label="Dismiss error"
                  onClick={() => setSaveError(null)}
                  className="shrink-0 rounded p-0.5 hover:bg-danger/10 focus-visible:outline-none focus-visible:shadow-[var(--fc-focus)]"
                >
                  <X size={12} weight="bold" aria-hidden />
                </button>
              </div>
            )}
          </div>,
          portalHost,
        )}
    </div>
  )
}
