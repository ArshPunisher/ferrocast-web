// Pure helpers and state derivations for the pre-start Studio-Desk Silhouette (S3).

import {
  scheduleStartLabel,
  type Connectors,
  type DestinationView,
  type ObsHealth,
  type Preflight,
  type PreflightCheck,
  type ScheduledStream,
  type ShowConfig,
  type StudioSettings,
} from '@ferrocast/api'

export type StartChoice = 'default' | 'scenes' | 'normal' | 'blank'
export type StandbyPhase = 'not_started' | 'starting' | 'failed'
export type QuickCheckId = 'mic' | 'camera' | 'disk' | 'connections'
export type QuickCheckTone = 'ok' | 'warn' | 'danger' | 'neutral'

export interface StartFailure {
  message: string
  hint?: string
}

export interface QuickCheckItem {
  id: QuickCheckId
  label: string
  value: string
  tone: QuickCheckTone
  detail: string
}

export interface StandbySnapshot {
  scene: string | null
  collection: string | null
  image: string | null
  updatedAt: number
}

const STANDBY_STORAGE_KEY = 'fc-studio-standby-scene'

const SAFE_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/=_-]+$/i

/** Allow only validated data:image URIs so cached scene artwork cannot inject unsafe URLs. */
export function safeThumbUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  return SAFE_IMAGE_RE.test(s) ? s : null
}

/** Resolve the primary pre-start lifecycle phase across status, in-flight start, and failure. */
export function resolveStandbyPhase({
  available,
  starting,
  startError,
}: {
  available: boolean
  starting: StartChoice | null
  startError: StartFailure | null
}): StandbyPhase {
  if (starting !== null) return 'starting'
  if (!available || startError !== null) return 'failed'
  return 'not_started'
}

export function readStandbySnapshot(): StandbySnapshot | null {
  try {
    const raw = window.localStorage.getItem(STANDBY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StandbySnapshot>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      scene: typeof parsed.scene === 'string' ? parsed.scene : null,
      collection: typeof parsed.collection === 'string' ? parsed.collection : null,
      image: safeThumbUrl(parsed.image),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return null
  }
}

export function writeStandbySnapshot(next: Omit<StandbySnapshot, 'updatedAt'>): void {
  try {
    const payload: StandbySnapshot = {
      scene: next.scene,
      collection: next.collection,
      image: safeThumbUrl(next.image),
      updatedAt: Date.now(),
    }
    window.localStorage.setItem(STANDBY_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Storage quota or private browsing must never block Studio standby.
  }
}

export function formatResolutionSummary(
  settings: StudioSettings | null | undefined,
): string | null {
  if (!settings) return null
  const { width, height, fps } = settings
  if (!width || !height || !fps) return null
  return `${width}x${height} · ${fps} fps`
}

/**
 * Pair each thumbnail strictly with its scene identity so stale artwork from one scene never
 * renders beneath another scene's label.
 */
export function resolveStandbyPreview({
  targetScene,
  fetchedThumb,
  cached,
}: {
  targetScene: string | null
  fetchedThumb: { scene: string; image: string } | null
  cached: StandbySnapshot | null
}): { scene: string | null; image: string | null } {
  if (targetScene) {
    if (fetchedThumb && fetchedThumb.scene === targetScene) {
      return { scene: targetScene, image: safeThumbUrl(fetchedThumb.image) }
    }
    if (cached && cached.scene === targetScene) {
      return { scene: targetScene, image: safeThumbUrl(cached.image) }
    }
    return { scene: targetScene, image: null }
  }
  if (cached && (cached.scene || cached.image)) {
    return { scene: cached.scene, image: safeThumbUrl(cached.image) }
  }
  return { scene: null, image: null }
}

/** Summarize quick checks honestly, reserving Ready for explicitly verified checks. */
export function summarizeQuickChecks(checks: readonly QuickCheckItem[]): {
  label: string
  tone: QuickCheckTone
} {
  if (checks.some((c) => c.tone === 'danger')) return { label: 'Action needed', tone: 'danger' }
  if (checks.some((c) => c.tone === 'warn')) return { label: 'Review', tone: 'warn' }
  if (checks.length > 0 && checks.every((c) => c.tone === 'ok')) {
    return { label: 'Ready', tone: 'ok' }
  }
  return { label: 'Standby', tone: 'neutral' }
}

function mapPreflightTone(status: PreflightCheck['status']): QuickCheckTone {
  if (status === 'fail') return 'danger'
  if (status === 'warn') return 'warn'
  if (status === 'ok') return 'ok'
  return 'neutral'
}

function findCheck(
  preflight: Preflight | null | undefined,
  pattern: RegExp,
): PreflightCheck | undefined {
  return preflight?.checks.find((c) => pattern.test(`${c.id} ${c.label}`))
}

/**
 * Derive compact pre-start hardware, storage, and connection checks without duplicating platform
 * names outside the primary "Go live to" section.
 */
export function buildQuickChecks({
  preflight,
  showConfig,
  obsHealth,
  connectors,
  destinations = [],
  studioSettings,
  startError,
  engineAvailable,
  engineDetail,
}: {
  preflight?: Preflight | null | undefined
  showConfig?: ShowConfig | null | undefined
  obsHealth?: ObsHealth | null | undefined
  connectors?: Connectors | null | undefined
  destinations?: DestinationView[]
  studioSettings?: StudioSettings | null | undefined
  startError?: StartFailure | null | undefined
  engineAvailable: boolean
  engineDetail?: string | null | undefined
}): QuickCheckItem[] {
  const errBlob = `${startError?.message ?? ''} ${startError?.hint ?? ''}`
  const failBlob = !engineAvailable ? `${engineDetail ?? ''} ${errBlob}` : errBlob

  // 1. Mic
  const micFail =
    Boolean(failBlob.trim()) &&
    /\b(mic|microphone|audio|coreaudio|wasapi|alsa|pulse)\b/i.test(failBlob)
  const micCheck = findCheck(preflight, /mic|audio/)
  const micSources = showConfig?.mic_sources ?? []
  const mic: QuickCheckItem = micFail
    ? {
        id: 'mic',
        label: 'Mic',
        value: 'Needs attention',
        tone: 'danger',
        detail: `${startError?.message ?? engineDetail ?? 'Audio input failed.'}${startError?.hint ? ` ${startError.hint}` : ''}`,
      }
    : micCheck
      ? {
          id: 'mic',
          label: 'Mic',
          value:
            micCheck.status === 'ok'
              ? 'Ready'
              : micCheck.status === 'warn'
                ? 'Muted / check'
                : micCheck.status === 'fail'
                  ? 'Missing'
                  : 'Standby',
          tone: mapPreflightTone(micCheck.status),
          detail: micCheck.detail,
        }
      : micSources.length > 0
        ? {
            id: 'mic',
            label: 'Mic',
            value: micSources.length === 1 ? 'Configured' : `${micSources.length} configured`,
            tone: 'ok',
            detail: `Monitoring: ${micSources.join(', ')}.`,
          }
        : {
            id: 'mic',
            label: 'Mic',
            value: 'Standby',
            tone: 'neutral',
            detail: 'Audio mixer and mic inputs open when you start the Studio.',
          }

  // 2. Camera
  const camFail =
    Boolean(failBlob.trim()) &&
    /\b(cam|camera|video|capture|avcapture|gpu|metal|opengl|vulkan)\b/i.test(failBlob)
  const camCheck = findCheck(preflight, /cam|camera|video/)
  const camSources = showConfig?.cam_sources ?? []
  const camera: QuickCheckItem = camFail
    ? {
        id: 'camera',
        label: 'Camera',
        value: 'Needs attention',
        tone: 'danger',
        detail: `${startError?.message ?? engineDetail ?? 'Capture device error.'}${startError?.hint ? ` ${startError.hint}` : ''}`,
      }
    : camCheck
      ? {
          id: 'camera',
          label: 'Camera',
          value:
            camCheck.status === 'ok'
              ? 'Ready'
              : camCheck.status === 'warn'
                ? 'Check source'
                : camCheck.status === 'fail'
                  ? 'Unavailable'
                  : 'Standby',
          tone: mapPreflightTone(camCheck.status),
          detail: camCheck.detail,
        }
      : camSources.length > 0
        ? {
            id: 'camera',
            label: 'Camera',
            value: camSources.length === 1 ? 'Configured' : `${camSources.length} configured`,
            tone: 'ok',
            detail: `Camera sources: ${camSources.join(', ')}.`,
          }
        : {
            id: 'camera',
            label: 'Camera',
            value: 'Standby',
            tone: 'neutral',
            detail: 'Capture devices initialize as soon as the Studio starts.',
          }

  // 3. Disk
  const diskFail =
    Boolean(failBlob.trim()) && /\b(disk|space|storage|folder|write|enospc)\b/i.test(failBlob)
  const diskCheck = findCheck(preflight, /disk|space|storage/)
  const minGb = showConfig?.min_disk_gb ?? 5
  const folder = studioSettings?.record_folder ?? studioSettings?.record_folder_default ?? null
  const disk: QuickCheckItem = diskFail
    ? {
        id: 'disk',
        label: 'Disk',
        value: 'Needs attention',
        tone: 'danger',
        detail: `${startError?.message ?? engineDetail ?? 'Recording path error.'}${startError?.hint ? ` ${startError.hint}` : ''}`,
      }
    : diskCheck
      ? {
          id: 'disk',
          label: 'Disk',
          value:
            diskCheck.status === 'ok'
              ? 'Ready'
              : diskCheck.status === 'warn'
                ? 'Low space'
                : diskCheck.status === 'fail'
                  ? 'Full'
                  : 'Checking',
          tone: mapPreflightTone(diskCheck.status),
          detail: folder ? `${diskCheck.detail} Recordings folder: ${folder}` : diskCheck.detail,
        }
      : obsHealth
        ? {
            id: 'disk',
            label: 'Disk',
            value: `${Math.round(obsHealth.disk_gb)} GB free`,
            tone: obsHealth.disk_gb < minGb ? 'warn' : 'ok',
            detail: `${obsHealth.disk_gb.toFixed(1)} GB available (minimum recommended: ${minGb} GB).${folder ? ` Recordings folder: ${folder}` : ''}`,
          }
        : {
            id: 'disk',
            label: 'Disk',
            value: `Min ${minGb} GB`,
            tone: 'neutral',
            detail: folder
              ? `Requires at least ${minGb} GB free in ${folder} (space not measured yet).`
              : `Requires at least ${minGb} GB free for recordings and replay buffer (space not measured yet).`,
          }

  // 4. Connections (keep platform names out of visible tile text so platforms appear once in dock)
  const mainDests = destinations.filter((d) => d.canvas === 'main')
  const armed = mainDests.filter((d) => d.enabled)
  const blockedArmed = armed.filter((d) => Boolean(d.blocked))
  const readyArmed = armed.filter((d) => d.connected && !d.blocked)
  const connEntries = connectors
    ? ([
        ['twitch', connectors.twitch],
        ['youtube', connectors.youtube],
        ['kick', connectors.kick],
      ] as const)
    : []
  const connErrorEntries = connEntries.filter(
    ([, c]) =>
      c.state === 'sign_in_needed' || c.state === 'scopes_missing' || c.state === 'reconnecting',
  )
  const connLive = connEntries.filter(([, c]) => c.state === 'connected')

  let connections: QuickCheckItem
  if (blockedArmed.length > 0 || connErrorEntries.length > 0) {
    const issueKeys = new Set<string>([
      ...blockedArmed.map((d) => (d.kind === 'custom' ? `dest:${d.id}` : `platform:${d.kind}`)),
      ...connErrorEntries.map(([name]) => `platform:${name}`),
    ])
    const issueCount = issueKeys.size
    const detailParts = [
      ...blockedArmed.map((d) => d.blocked).filter((x): x is string => Boolean(x)),
      ...connErrorEntries
        .filter(([name]) => !blockedArmed.some((d) => d.kind === name))
        .map(([, c]) => c.detail ?? 'Check account status under Settings -> Accounts.'),
    ]
    connections = {
      id: 'connections',
      label: 'Connections',
      value: issueCount === 1 ? '1 needs check' : `${issueCount} need check`,
      tone: 'warn',
      detail:
        detailParts.join(' ') || 'Check account status under Settings -> Accounts or Destinations.',
    }
  } else if (armed.length > 0) {
    connections = {
      id: 'connections',
      label: 'Connections',
      value:
        readyArmed.length === armed.length
          ? `${readyArmed.length} ready`
          : `${readyArmed.length} of ${armed.length} ready`,
      tone: readyArmed.length === armed.length ? 'ok' : 'warn',
      detail: `${readyArmed.length} of ${armed.length} armed output${armed.length === 1 ? '' : 's'} connected and ready.`,
    }
  } else if (connLive.length > 0) {
    connections = {
      id: 'connections',
      label: 'Connections',
      value: `${connLive.length} connected`,
      tone: 'neutral',
      detail: `${connLive.length} account${connLive.length === 1 ? '' : 's'} linked. Enable an output above before going live.`,
    }
  } else {
    connections = {
      id: 'connections',
      label: 'Connections',
      value: 'None armed',
      tone: 'neutral',
      detail: 'Connect an account in Settings or add a destination under Go live to.',
    }
  }

  return [mic, camera, disk, connections]
}

/** Pick the next upcoming scheduled stream first; fall back to the most recent past plan. */
export function pickNextPlan(
  plans: readonly ScheduledStream[],
  now: number,
): ScheduledStream | null {
  if (plans.length === 0) return null
  const upcoming = plans.filter((p) => p.start_ms >= now).sort((a, b) => a.start_ms - b.start_ms)
  if (upcoming.length > 0) return upcoming[0] ?? null
  const past = [...plans].sort((a, b) => b.start_ms - a.start_ms)
  return past[0] ?? null
}

/** Short label describing when a scheduled stream starts for compact dock cards. */
export function planTimingSummary(plan: ScheduledStream, now: number): string {
  return scheduleStartLabel(plan.start_ms, now)
}
