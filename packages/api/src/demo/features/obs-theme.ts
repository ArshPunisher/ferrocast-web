// Theme in OBS in the demo engine, matching the engine (`crates/engine/src/obs_theme.rs`,
// API.md §4 Designs): the guesses, apply against the demo's OBS scenes, the record of what was
// added, and Undo that takes only that away.

import {
  CAMERA_KINDS,
  MIC_KINDS,
  defaultPrefix,
  checkThemePlan,
  guessThemePlan,
  screenTarget,
  type ObsTheme,
  type OldWidget,
  type ThemeObsPlan,
  type ThemeObsResult,
  type ThemePlan,
  type ThemeRole,
} from '../../obs-theme'
import type { ShowStep } from '../../studio'
import type { Overlay, Scene } from '../../types'
import { HttpError } from '../http-error'
import type { DemoDesigns } from './designs'
import { NOT_MINE, clone, type Routed } from './host'
import type { DemoStudio } from './studio'

export interface ObsThemeHost {
  studio: DemoStudio
  designs: DemoDesigns
  overlays(): Overlay[]
  renameOverlay(id: string, name: string): Overlay
  obsConnected(): boolean
  now(): number
}

interface Roles {
  starting: string | null
  live: string | null
  brb: string | null
  ending: string | null
}

interface Record {
  design_id: string
  design_name: string
  at: number
  screens: {
    key: string
    name: string
    scene: string
    overlay_id: string
    role: ThemeRole | null
  }[]
  made_scenes: string[]
  made_inputs: string[]
  added_items: [string, string][]
  hidden: [string, number][]
  roles_before: Roles
  roles_set: Roles
  alert_changed: boolean
  alert_before: string | null
  scene_before: string | null
  /** Mics Ferrocast added for "Mic on break screens". */
  mic_items: [string, string][]
  /** The last plan, so another theme keeps every choice. */
  plan?: ThemePlan
}

/** Old widgets in the demo's OBS: none at first; `seedOldWidget` adds one for tests and demos. */
const OLD: { source: string; vendor: OldWidget['vendor'] }[] = []

export class DemoObsTheme {
  private rec: Record | null = null
  private old = clone(OLD)

  constructor(private readonly host: ObsThemeHost) {}

  /** Puts a StreamElements or Streamlabs widget in a demo scene (tests and demos). */
  seedOldWidget(scene: string, source: string, vendor: OldWidget['vendor']) {
    const s = this.host.studio.obs.scenes.find((x) => x.name === scene)
    if (!s) return
    s.items.push({ id: nextId(s.items), source, enabled: true, kind: 'browser_source' })
    this.old.push({ source, vendor })
  }

  route(method: string, seg: string[], body: unknown): Routed {
    const [a, b, c] = seg
    if (a === 'designs' && b && c === 'obs' && seg.length === 3) {
      if (method === 'GET') return this.plan(b)
      if (method === 'POST') return this.apply(b, body)
    }
    if (a === 'obs' && b === 'theme' && seg.length === 2) {
      if (method === 'GET') return this.rec ? this.view(this.rec) : null
      if (method === 'DELETE') return this.undo()
    }
    return NOT_MINE
  }

  private obs() {
    if (!this.host.obsConnected())
      throw new HttpError(
        422,
        'obs_unreachable',
        'OBS isn’t running, or its WebSocket server is off (Tools → WebSocket Server Settings).',
        'Open OBS on this computer, then check Settings, OBS.',
      )
    return this.host.studio.obs
  }

  private theme(id: string): { name: string; id: string; screens: Scene[]; alert: string | null } {
    const d = this.host.designs.find(id)
    if (d.kind !== 'theme')
      throw new HttpError(
        400,
        'invalid',
        'design: only a theme can be put into OBS; use Add to OBS on an overlay instead.',
      )
    return {
      id: d.id,
      name: d.name,
      screens: d.content.scenes,
      alert: d.content.alert_design ?? null,
    }
  }

  private oldWidgets(): OldWidget[] {
    const obs = this.host.studio.obs
    return this.old.map((w) => ({
      ...w,
      scenes: obs.scenes
        .filter((s) => s.items.some((i) => i.source === w.source))
        .map((s) => s.name),
    }))
  }

  /**
   * With a theme in OBS, a fresh guess becomes last time's choices, as the engine does; scene
   * names follow the new theme unless they were the streamer's own.
   */
  private carry(plan: ThemePlan): ThemePlan {
    const prev = this.rec
    if (!prev) return plan
    const last = prev.plan
    plan.screens = plan.screens.map((p) => {
      const was = last?.screens.find((s) => s.key === p.key)
      if (was) return structuredClone(was)
      return prev.screens.some((s) => s.key === p.key)
        ? p
        : { key: p.key, place: { kind: 'skip' }, under: null, role: null }
    })
    if (last) {
      if (last.prefix !== defaultPrefix(prev.design_name)) plan.prefix = last.prefix
      plan.mic_on_breaks = last.mic_on_breaks === true
      plan.switch_to_starting = last.switch_to_starting !== false
      plan.alert_style = last.alert_style !== false
      plan.hide_old = [...(last.hide_old ?? [])]
    }
    return plan
  }

  /** Start show's mic check list, else the game scene's mics, never OBS's global devices. */
  private mics(plan: ThemePlan): string[] {
    const global = ['Mic/Aux', 'Desktop Audio']
    const obs = this.host.studio.obs
    const isMic = (n: string) =>
      !global.includes(n) &&
      obs.scenes.some((s) => s.items.some((i) => i.source === n && MIC_KINDS.includes(i.kind)))
    const listed = (this.host.studio.showCfg.mic_sources ?? []).filter((m) => !global.includes(m))
    if (listed.length) return listed
    const live = plan.screens.find((p) => p.role === 'live')
    const game =
      live?.under ??
      (live && (live.place.kind === 'on_top' || live.place.kind === 'replace')
        ? live.place.scene
        : undefined)
    const inGame = obs.scenes
      .find((s) => s.name === game)
      ?.items.map((i) => i.source)
      .filter(isMic)
    return inGame?.length ? inGame : ['Mic']
  }

  private sources(): string[] {
    return [...new Set(this.host.studio.obs.scenes.flatMap((s) => s.items.map((i) => i.source)))]
  }

  private plan(id: string): ThemeObsPlan {
    const t = this.theme(id)
    const obs = this.obs()
    const scenes = {
      current: obs.current,
      scenes: obs.scenes.map((s) => ({ ...s, items: s.items })),
    }
    return {
      plan: this.carry(
        guessThemePlan(t.name, t.screens, scenes, this.oldWidgets(), this.rec?.made_scenes ?? []),
      ),
      screens: t.screens.map((s) => ({ key: s.key, name: s.name })),
      obs_scenes: obs.scenes.map((s) => s.name),
      obs_cameras: [
        ...new Set(
          obs.scenes.flatMap((s) =>
            s.items.filter((i) => CAMERA_KINDS.includes(i.kind)).map((i) => i.source),
          ),
        ),
      ],
      old_widgets: this.oldWidgets(),
      applied: this.rec ? this.view(this.rec) : null,
    }
  }

  private roles(): Roles {
    const st = this.host.studio
    return {
      starting: st.showCfg.starting_scene ?? null,
      live: st.showCfg.live_scene ?? null,
      brb: st.scenesCfg.brb_scene ?? null,
      ending: st.showCfg.ending_scene ?? null,
    }
  }

  private setRoles(r: Roles) {
    const st = this.host.studio
    st.showCfg = {
      ...st.showCfg,
      starting_scene: r.starting,
      live_scene: r.live,
      ending_scene: r.ending,
    }
    st.scenesCfg = { ...st.scenesCfg, brb_scene: r.brb }
  }

  private apply(id: string, body: unknown): ThemeObsResult {
    const t = this.theme(id)
    const switching = !!this.rec && this.rec.design_id !== t.id
    const obs = this.obs()
    const empty =
      body === undefined || body === null || (typeof body === 'object' && !Object.keys(body).length)
    const plan: ThemePlan = empty ? this.plan(id).plan : readPlan(body)
    const problem = checkThemePlan(
      plan,
      t.screens,
      obs.scenes.map((s) => s.name),
      this.sources(),
    )
    if (problem) throw new HttpError(400, 'invalid', problem)
    const rec: Record = this.rec ?? {
      design_id: t.id,
      design_name: t.name,
      at: this.host.now(),
      screens: [],
      made_scenes: [],
      made_inputs: [],
      added_items: [],
      hidden: [],
      roles_before: this.roles(),
      roles_set: { starting: null, live: null, brb: null, ending: null },
      alert_changed: false,
      alert_before: null,
      scene_before: obs.current,
      mic_items: [],
    }
    // Turned off: the mics Ferrocast added come out again.
    if (!plan.mic_on_breaks && rec.mic_items.length) {
      for (const [scene, m] of rec.mic_items) {
        const sc = obs.scenes.find((x) => x.name === scene)
        if (sc) sc.items = sc.items.filter((it) => it.source !== m)
        rec.added_items = rec.added_items.filter(([x, n]) => !(x === scene && n === m))
      }
      rec.mic_items = []
    }
    rec.at = this.host.now()
    rec.design_id = t.id
    rec.design_name = t.name
    const steps: ShowStep[] = []
    if (switching)
      steps.push({
        id: 'switch_theme',
        label: 'Theme',
        status: 'done',
        detail: `${t.name} takes the old theme’s place.`,
      })
    const roles = this.roles()
    let starting: string | null = null
    for (const p of plan.screens) {
      const screen = t.screens.find((s) => s.key === p.key)
      if (!screen) continue
      const scene = screenTarget(plan, screen, p)
      const sid = `screen.${p.key}`
      if (scene === null) {
        // In OBS from last time and unticked now: it comes out.
        const out = this.takeScreenOut(p.key, rec, roles)
        steps.push({
          id: sid,
          label: screen.name,
          status: out ? 'done' : 'skipped',
          detail: out ? 'Taken out.' : 'Left out.',
        })
        continue
      }
      const before = rec.screens.find((s) => s.key === p.key)?.overlay_id
      const existing =
        (before && this.host.overlays().some((o) => o.id === before) ? before : null) ??
        this.host.overlays().find((o) => o.design?.id === t.id && o.design.scene === p.key)?.id ??
        null
      let overlay = this.host.designs.placeScreen(t.id, p.key, existing)
      // Switching theme: the overlay, its source and a scene Ferrocast made take new names.
      const name = `${screen.name} (${t.name})`.slice(0, 60).trim()
      if (overlay.name !== name) {
        const [from, to] = [`Ferrocast: ${overlay.name}`, `Ferrocast: ${name}`]
        overlay = this.host.renameOverlay(overlay.id, name)
        for (const sc of obs.scenes)
          for (const it of sc.items) if (it.source === from) it.source = to
        rec.made_inputs = rec.made_inputs.map((n) => (n === from ? to : n))
        rec.added_items = rec.added_items.map(([sc, n]) => [sc, n === from ? to : n])
      }
      const old = rec.screens.find((s) => s.key === p.key)?.scene
      if (
        p.place.kind === 'new' &&
        old &&
        old !== scene &&
        rec.made_scenes.includes(old) &&
        !obs.scenes.some((s) => s.name === scene)
      ) {
        const sc = obs.scenes.find((s) => s.name === old)
        if (sc) {
          sc.name = scene
          for (const x of obs.scenes)
            for (const it of x.items) if (it.source === old) it.source = scene
          if (obs.current === old) obs.current = scene
          rec.made_scenes = rec.made_scenes.map((n) => (n === old ? scene : n))
        }
      }
      let target = obs.scenes.find((s) => s.name === scene)
      if (!target) {
        target = { name: scene, items: [] }
        obs.scenes.unshift(target)
        rec.made_scenes.push(scene)
      }
      const mine = rec.made_scenes.includes(scene)
      let hid = 0
      if (p.place.kind === 'replace')
        for (const it of target.items)
          if (
            it.enabled &&
            (it.kind === 'browser_source' || it.kind === 'image_source') &&
            !it.source.startsWith('Ferrocast:')
          ) {
            it.enabled = false
            rec.hidden.push([scene, it.id])
            hid += 1
          }
      const source = `Ferrocast: ${overlay.name}`
      const known = obs.scenes.some((s) => s.items.some((i) => i.source === source))
      if (!target.items.some((i) => i.source === source)) {
        target.items.push({
          id: nextId(target.items),
          source,
          enabled: true,
          kind: 'browser_source',
        })
        if (!known) rec.made_inputs.push(source)
        else if (!mine) rec.added_items.push([scene, source])
      } else {
        // Kept on top.
        const i = target.items.findIndex((x) => x.source === source)
        target.items.push(...target.items.splice(i, 1))
      }
      let underAdded = false
      if (p.under && !target.items.some((i) => i.source === p.under)) {
        const kind = obs.scenes.some((s) => s.name === p.under)
          ? ''
          : (obs.scenes.flatMap((s) => s.items).find((i) => i.source === p.under)?.kind ?? '')
        target.items.unshift({ id: nextId(target.items), source: p.under, enabled: true, kind })
        underAdded = true
        if (!mine) rec.added_items.push([scene, p.under])
      }
      const breakScreen =
        ['starting', 'brb', 'ending'].includes(p.role ?? '') ||
        ['starting_soon', 'brb', 'ending'].includes(p.key)
      let micAdded = false
      // A scene under it that has the mic already brings it: no second copy.
      const underHas = (m: string) =>
        !!p.under &&
        (p.under === m ||
          obs.scenes.some((x) => x.name === p.under && x.items.some((i) => i.source === m)))
      if (plan.mic_on_breaks && breakScreen)
        for (const m of this.mics(plan).filter((m) => !underHas(m)))
          if (!target.items.some((i) => i.source === m)) {
            target.items.unshift({
              id: nextId(target.items),
              source: m,
              enabled: true,
              kind: 'wasapi_input_capture',
            })
            micAdded = true
            rec.mic_items.push([scene, m])
            if (!mine) rec.added_items.push([scene, m])
          }
      rec.screens = rec.screens.filter((s) => s.key !== p.key)
      rec.screens.push({
        key: p.key,
        name: screen.name,
        scene,
        overlay_id: overlay.id,
        role: p.role ?? null,
      })
      let detail =
        p.place.kind === 'new' && mine ? `In the scene "${scene}"` : `On top of "${scene}"`
      if (p.under) detail += `, with "${p.under}" under it${underAdded ? '' : ' (already there)'}`
      if (micAdded) detail += ', with your mic'
      if (hid) detail += `, ${hid} old source${hid === 1 ? '' : 's'} hidden`
      steps.push({ id: sid, label: screen.name, status: 'done', detail: `${detail}.` })
      if (p.role) roles[p.role] = scene
      if (p.role === 'starting') starting = scene
    }
    this.setRoles(roles)
    rec.roles_set = roles
    const n = Object.values(roles).filter(Boolean).length
    steps.push({
      id: 'roles',
      label: 'Start show’s scenes',
      status: 'done',
      detail: `Start show uses ${n} of them.`,
    })
    const hide = plan.hide_old ?? []
    if (hide.length) {
      let n = 0
      for (const s of obs.scenes)
        for (const it of s.items)
          if (
            hide.includes(it.source) &&
            it.enabled &&
            this.old.some((w) => w.source === it.source)
          ) {
            it.enabled = false
            rec.hidden.push([s.name, it.id])
            n += 1
          }
      steps.push({
        id: 'old',
        label: 'Old widgets',
        status: 'done',
        detail: `Hid ${n} (not deleted).`,
      })
    }
    if (plan.alert_style !== false && t.alert) {
      const before = this.host.designs.activeAlert()
      try {
        this.host.designs.setActiveAlert(t.alert)
        if (!rec.alert_changed) {
          rec.alert_changed = true
          rec.alert_before = before
        }
        steps.push({
          id: 'alerts',
          label: 'Alert style',
          status: 'done',
          detail: `Alerts play with ${t.name}’s look.`,
        })
      } catch (e) {
        // Like the engine: the theme's alert design is gone, so alerts stay as they are.
        steps.push({ id: 'alerts', label: 'Alert style', status: 'failed', detail: failure(e) })
      }
    }
    if (plan.switch_to_starting !== false && starting) {
      // Like the engine: live, viewers keep seeing what's on air.
      if (obs.streaming)
        steps.push({
          id: 'switch',
          label: 'OBS',
          status: 'skipped',
          detail: 'You’re live, so OBS stays on the scene it’s on.',
        })
      else {
        obs.current = starting
        steps.push({
          id: 'switch',
          label: 'OBS',
          status: 'done',
          detail: `OBS is on "${starting}".`,
        })
      }
    }
    rec.plan = structuredClone(plan)
    this.rec = rec
    return { steps, applied: this.view(rec) }
  }

  private takeScreenOut(key: string, rec: Record, roles: Roles): boolean {
    const was = rec.screens.find((s) => s.key === key)
    if (!was) return false
    const obs = this.host.studio.obs
    const source = `Ferrocast: ${this.host.overlays().find((o) => o.id === was.overlay_id)?.name ?? ''}`
    if (rec.made_scenes.includes(was.scene)) {
      if (obs.current === was.scene)
        throw new HttpError(
          409,
          'screen_on_air',
          `"${was.scene}" is on air.`,
          'Switch OBS to another scene first.',
        )
      obs.scenes = obs.scenes.filter((s) => s.name !== was.scene)
      rec.made_scenes = rec.made_scenes.filter((s) => s !== was.scene)
    } else {
      const sc = obs.scenes.find((s) => s.name === was.scene)
      if (sc) {
        const mics = rec.mic_items.filter(([s]) => s === was.scene).map(([, m]) => m)
        sc.items = sc.items.filter((i) => i.source !== source && !mics.includes(i.source))
        for (const [s, id] of rec.hidden)
          if (s === was.scene) {
            const it = sc.items.find((i) => i.id === id)
            if (it) it.enabled = true
          }
      }
      rec.hidden = rec.hidden.filter(([s]) => s !== was.scene)
    }
    if (rec.made_inputs.includes(source)) {
      for (const sc of obs.scenes) sc.items = sc.items.filter((i) => i.source !== source)
      rec.made_inputs = rec.made_inputs.filter((n) => n !== source)
    }
    rec.added_items = rec.added_items.filter(([s]) => s !== was.scene)
    rec.mic_items = rec.mic_items.filter(([s]) => s !== was.scene)
    rec.screens = rec.screens.filter((s) => s.key !== key)
    for (const k of ['starting', 'live', 'brb', 'ending'] as const)
      if (roles[k] === was.scene) roles[k] = rec.roles_before[k]
    return true
  }

  private undo(): ThemeObsResult {
    const rec = this.rec
    if (!rec)
      throw new HttpError(
        404,
        'no_theme_in_obs',
        'Ferrocast hasn’t put a theme into OBS.',
        'Put a theme into OBS from Designs first.',
      )
    const obs = this.obs()
    if (obs.streaming && rec.made_scenes.includes(obs.current))
      throw new HttpError(
        409,
        'theme_on_air',
        `You’re live on "${obs.current}", one of the theme’s scenes.`,
        'Switch OBS to one of your own scenes first, or take it out after the stream.',
      )
    for (const [scene, id] of rec.hidden) {
      const it = obs.scenes.find((s) => s.name === scene)?.items.find((i) => i.id === id)
      if (it) it.enabled = true
    }
    for (const [scene, source] of rec.added_items) {
      const s = obs.scenes.find((x) => x.name === scene)
      if (s) s.items = s.items.filter((i) => i.source !== source)
    }
    for (const input of rec.made_inputs)
      for (const s of obs.scenes) s.items = s.items.filter((i) => i.source !== input)
    const rest = obs.scenes.filter((s) => !rec.made_scenes.includes(s.name))
    if (rest.length) {
      if (rec.made_scenes.includes(obs.current))
        obs.current =
          [rec.scene_before, rec.roles_before.live].find(
            (s): s is string => !!s && rest.some((x) => x.name === s),
          ) ?? rest[0]!.name
      obs.scenes = rest
    }
    const n = rec.made_scenes.length
    const steps: ShowStep[] = [
      {
        id: 'obs',
        label: 'OBS',
        status: rest.length ? 'done' : 'failed',
        detail: rest.length
          ? `Took out ${n} scene${n === 1 ? '' : 's'} and Ferrocast’s sources.`
          : 'The theme’s scenes are the only ones in OBS, and OBS needs one. Add a scene of your own, then take it out again.',
      },
    ]
    const now = this.roles()
    const pick = (k: keyof Roles) => (now[k] === rec.roles_set[k] ? rec.roles_before[k] : now[k])
    this.setRoles({
      starting: pick('starting'),
      live: pick('live'),
      brb: pick('brb'),
      ending: pick('ending'),
    })
    steps.push({
      id: 'roles',
      label: 'Start show’s scenes',
      status: 'done',
      detail: 'Back as they were.',
    })
    if (rec.alert_changed) {
      let themeAlert: string | null = null
      try {
        themeAlert = this.theme(rec.design_id).alert
      } catch {
        /* the theme is gone: leave the alert look */
      }
      if (this.host.designs.activeAlert() === themeAlert) {
        let detail = 'Back as it was.'
        let status: ShowStep['status'] = 'done'
        try {
          this.host.designs.setActiveAlert(rec.alert_before)
        } catch {
          // The alert design from before was deleted meanwhile: back to none.
          this.host.designs.setActiveAlert(null)
          detail = 'The one from before was deleted, so alerts use the default look.'
          status = 'skipped'
        }
        steps.push({ id: 'alerts', label: 'Alert style', status, detail })
      }
    }
    if (!rest.length) {
      rec.made_inputs = []
      rec.added_items = []
      rec.hidden = []
      rec.roles_set = rec.roles_before
      rec.alert_changed = false
      return { steps, applied: this.view(rec) }
    }
    this.rec = null
    return { steps, applied: null }
  }

  private view(rec: Record): ObsTheme {
    const names = this.host.obsConnected() ? this.host.studio.obs.scenes.map((s) => s.name) : null
    return {
      design_id: rec.design_id,
      design_name: rec.design_name,
      at: rec.at,
      screens: rec.screens.map((s) => ({
        key: s.key,
        name: s.name,
        scene: s.scene,
        role: s.role,
        found: names ? names.includes(s.scene) : null,
      })),
    }
  }
}

function failure(e: unknown): string {
  return e instanceof HttpError ? e.message : 'It couldn’t be changed.'
}

function nextId(items: { id: number }[]): number {
  return items.reduce((m, i) => Math.max(m, i.id), 0) + 1
}

/** A plan from a request body, with the engine's strictness on its shape. */
function readPlan(body: unknown): ThemePlan {
  const bad = (m: string) => new HttpError(400, 'invalid', `A field is missing or wrong: ${m}`)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('the plan.')
  const o = body as { [k: string]: unknown }
  const allowed = [
    'prefix',
    'screens',
    'switch_to_starting',
    'hide_old',
    'alert_style',
    'mic_on_breaks',
  ]
  const extra = Object.keys(o).find((k) => !allowed.includes(k))
  if (extra) throw bad(`unknown field \`${extra}\`.`)
  if (typeof o.prefix !== 'string') throw bad('prefix.')
  if (!Array.isArray(o.screens)) throw bad('screens.')
  for (const s of o.screens as unknown[]) {
    const p = s as { [k: string]: unknown } | null
    if (!p || typeof p !== 'object' || typeof p.key !== 'string') throw bad('screens.key.')
    const place = p.place as { kind?: unknown; scene?: unknown } | null
    if (!place || !['new', 'on_top', 'replace', 'skip'].includes(String(place.kind)))
      throw bad('screens.place.')
    if ((place.kind === 'on_top' || place.kind === 'replace') && typeof place.scene !== 'string')
      throw bad('screens.place.scene.')
    if (p.under !== undefined && p.under !== null && typeof p.under !== 'string')
      throw bad('screens.under.')
    if (
      p.role !== undefined &&
      p.role !== null &&
      !['starting', 'live', 'brb', 'ending'].includes(String(p.role))
    )
      throw bad('screens.role.')
  }
  if (
    o.hide_old !== undefined &&
    !(Array.isArray(o.hide_old) && o.hide_old.every((x) => typeof x === 'string'))
  )
    throw bad('hide_old.')
  return clone(o) as unknown as ThemePlan
}
