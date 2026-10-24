// A whole theme into OBS (API.md §4 Designs, "Theme in OBS"; the 24 Oct board). The types,
// the same guesses and checks as the engine (`crates/engine/src/obs_theme.rs`), and the calls.

import type { FerroClient } from './client'
import type { ObsScenes, ShowStep } from './studio'
import type { Scene } from './types'

export type ThemeRole = 'starting' | 'live' | 'brb' | 'ending'

export type ThemePlace =
  | { kind: 'new' }
  | { kind: 'on_top'; scene: string }
  | { kind: 'replace'; scene: string }
  | { kind: 'skip' }

export interface ScreenPlan {
  /** The theme's scene key (`in_game`, `brb`…). */
  key: string
  place: ThemePlace
  /** A scene or source OBS has, put at the bottom (the streamer's game or camera). */
  under?: string | null
  role?: ThemeRole | null
}

export interface ThemePlan {
  /** New scenes are named this plus the screen's name ("Forge · In game"). */
  prefix: string
  screens: ScreenPlan[]
  switch_to_starting?: boolean
  /** Old widgets (source names) to hide, not delete. */
  hide_old?: string[]
  alert_style?: boolean
}

export interface OldWidget {
  source: string
  vendor: 'StreamElements' | 'Streamlabs'
  scenes: string[]
}

export interface ObsThemeScreen {
  key: string
  name: string
  scene: string
  role: ThemeRole | null
  /** Still in OBS (null while OBS can't be asked). */
  found: boolean | null
}

/** The theme Ferrocast put into OBS ("Your theme in OBS"). */
export interface ObsTheme {
  design_id: string
  design_name: string
  at: number
  screens: ObsThemeScreen[]
}

/** `GET /designs/{id}/obs`. */
export interface ThemeObsPlan {
  plan: ThemePlan
  screens: { key: string; name: string }[]
  obs_scenes: string[]
  obs_cameras: string[]
  old_widgets: OldWidget[]
  applied: ObsTheme | null
}

export interface ThemeObsResult {
  steps: ShowStep[]
  applied: ObsTheme | null
}

export const ROLE_LABEL: Record<ThemeRole, string> = {
  starting: 'Starting',
  live: 'Live',
  brb: 'BRB',
  ending: 'Ending',
}

/** Input kinds that capture a game, a window or a screen. */
export const CAPTURE_KINDS = [
  'game_capture',
  'window_capture',
  'monitor_capture',
  'screen_capture',
  'display_capture',
  'xcomposite_input',
  'pipewire-screen-capture-source',
  'pipewire-window-capture-source',
]

/** Input kinds for a camera. */
export const CAMERA_KINDS = [
  'dshow_input',
  'av_capture_input',
  'av_capture_input_v2',
  'macos-avcapture',
  'macos-avcapture-fast',
  'v4l2_input',
]

const MAX_PREFIX = 40

function roleOf(key: string): ThemeRole | null {
  switch (key) {
    case 'starting_soon':
      return 'starting'
    case 'in_game':
      return 'live'
    case 'brb':
      return 'brb'
    case 'ending':
      return 'ending'
    default:
      return null
  }
}

const has = (text: string, words: string[]) => {
  const t = text.toLowerCase()
  return words.some((w) => t.includes(w))
}
const breaky = (name: string) =>
  has(name, [
    'start',
    'brb',
    'be right',
    'ending',
    'end screen',
    'offline',
    'intermission',
    'pause',
    'outro',
  ])

/** The scene a screen goes in, or null when it's left out. */
export function screenTarget(plan: ThemePlan, screen: { name: string }, p: ScreenPlan) {
  switch (p.place.kind) {
    case 'new':
      return `${plan.prefix}${screen.name.trim()}`
    case 'on_top':
    case 'replace':
      return p.place.scene
    case 'skip':
      return null
  }
}

/** Ferrocast's guesses, as the engine makes them. */
export function guessThemePlan(
  themeName: string,
  screens: Pick<Scene, 'key' | 'name'>[],
  obs: ObsScenes,
  old: OldWidget[],
  skip: string[] = [],
): ThemePlan {
  const prefix = `${[...themeName.trim()]
    .slice(0, MAX_PREFIX - 3)
    .join('')
    .trimEnd()} · `
  const own = obs.scenes.filter((s) => !s.name.startsWith(prefix) && !skip.includes(s.name))
  const captures = (s: (typeof own)[number], on: boolean) =>
    s.items.some((i) => (i.enabled || !on) && !!i.kind && CAPTURE_KINDS.includes(i.kind))
  const camera = (s: (typeof own)[number]) =>
    s.items.some((i) => !!i.kind && CAMERA_KINDS.includes(i.kind))
  const score = (s: (typeof own)[number]) => {
    if (breaky(s.name) || has(s.name, ['record'])) return 0
    return (
      4 * Number(has(s.name, ['game', 'main', 'live', 'play', 'stream'])) +
      3 * Number(captures(s, false)) +
      2 * Number(camera(s)) +
      Number(captures(s, true)) +
      Number(obs.current === s.name)
    )
  }
  let best: (typeof own)[number] | undefined
  for (const s of own) if (score(s) > 0 && (!best || score(s) > score(best))) best = s
  best ??= own.find((s) => !breaky(s.name) && !has(s.name, ['record']))
  const game = best?.name ?? null
  const chat =
    own.find((s) => has(s.name, ['chat', 'talk', 'just']) && s.name !== game)?.name ??
    own.find((s) => camera(s) && !captures(s, false) && !breaky(s.name) && s.name !== game)?.name ??
    own.flatMap((s) => s.items).find((i) => !!i.kind && CAMERA_KINDS.includes(i.kind))?.source ??
    null
  return {
    prefix,
    screens: screens.map((s) => ({
      key: s.key,
      place: { kind: 'new' },
      under: s.key === 'in_game' ? game : s.key === 'just_chatting' ? chat : null,
      role: roleOf(s.key),
    })),
    switch_to_starting: true,
    hide_old: old.map((w) => w.source),
    alert_style: true,
  }
}

/** The engine's checks: null when the plan can run, else the message (field first). */
export function checkThemePlan(
  plan: ThemePlan,
  screens: Pick<Scene, 'key' | 'name'>[],
  obsScenes: string[],
  sources: string[],
): string | null {
  if ([...plan.prefix].length > MAX_PREFIX || /\p{Cc}/u.test(plan.prefix))
    return `prefix: up to ${MAX_PREFIX} letters, on one line.`
  const seen: string[] = []
  const roles: ThemeRole[] = []
  const targets: string[] = []
  for (const [i, p] of plan.screens.entries()) {
    const at = `screens.${i}`
    const screen = screens.find((s) => s.key === p.key)
    if (!screen) return `${at}.key: this theme has no screen "${p.key}".`
    if (seen.includes(p.key)) return `${at}.key: "${p.key}" is listed twice.`
    seen.push(p.key)
    const scene = screenTarget(plan, screen, p)
    if (scene === null) {
      if (p.role || p.under)
        return `${at}: a screen left out can't have a job or anything under it.`
      continue
    }
    if (!scene.trim() || [...scene].length > 100)
      return `${at}: the scene name must be 1 to 100 letters.`
    if (p.place.kind !== 'new' && !obsScenes.includes(scene))
      return `${at}.place: OBS has no scene called "${scene}".`
    if (targets.includes(scene)) return `${at}.place: two screens can't go in "${scene}".`
    targets.push(scene)
    if (p.under) {
      if (p.under === scene) return `${at}.under: a scene can't go under itself.`
      if (!obsScenes.includes(p.under) && !sources.includes(p.under))
        return `${at}.under: OBS has no scene or source called "${p.under}".`
    }
    if (p.role) {
      if (roles.includes(p.role)) return `${at}.role: only one screen can be used for each job.`
      roles.push(p.role)
    }
  }
  return null
}

/** How many new scenes and changed ones a plan makes, for the button ("Add 4 scenes"). */
export function planCounts(
  plan: ThemePlan,
  obsScenes: string[],
  screens: { key: string; name: string }[],
) {
  let added = 0
  let changed = 0
  for (const p of plan.screens) {
    const s = screens.find((x) => x.key === p.key)
    if (!s) continue
    const target = screenTarget(plan, s, p)
    if (target === null) continue
    if (p.place.kind === 'new' && !obsScenes.includes(target)) added += 1
    else changed += 1
  }
  return { added, changed }
}

export function obsThemeApi(c: FerroClient) {
  const enc = encodeURIComponent
  return {
    plan: (designId: string) =>
      c.request<ThemeObsPlan>('GET', `/api/v1/designs/${enc(designId)}/obs`),
    /** Puts the theme into OBS; no plan uses Ferrocast's guesses. */
    apply: (designId: string, plan?: ThemePlan) =>
      c.request<ThemeObsResult>('POST', `/api/v1/designs/${enc(designId)}/obs`, plan),
    current: () => c.request<ObsTheme | null>('GET', '/api/v1/obs/theme'),
    /** Takes it out again: only what Ferrocast added. */
    takeOut: () => c.request<ThemeObsResult>('DELETE', '/api/v1/obs/theme'),
  }
}
