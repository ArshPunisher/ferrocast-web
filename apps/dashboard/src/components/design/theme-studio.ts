// A theme in Ferrocast's Studio: each screen becomes a scene ("Lo-fi loft · In game") with the
// screen's overlay on top, fitted. On the gameplay screens the scene on air (your game and
// camera) goes underneath, as the OBS set-up does, so nothing is set up twice.

import type { Overlay, ThemeDesign } from '@ferrocast/api'
import { SCENE_LABEL } from '@ferrocast/api'

type Engine = {
  status: () => Promise<{ running: boolean }>
  scenes: () => Promise<{ current: string; scenes: { name: string }[] }>
  kinds: () => Promise<{ inputs: { id: string }[] }>
  sources: () => Promise<{ name: string }[]>
  addScene: (name: string) => Promise<void>
  addExisting: (scene: string, name: string) => Promise<unknown>
  addSource: (
    scene: string,
    source: { kind: string; name: string; settings?: Record<string, unknown> },
    fit?: boolean,
  ) => Promise<unknown>
  setAudio: (name: string, a: { monitor: 'me_and_stream' }) => Promise<void>
}

/** Screens your own game and camera show under. */
const GAMEPLAY = new Set(['in_game', 'just_chatting'])
const WEB_KINDS = ['ferrocast_web', 'browser_source']

function free(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`
}

export interface StudioThemeResult {
  /** The scenes made, in the theme's order. */
  scenes: string[]
  /** Why nothing was made (the Studio isn't running), or null. */
  skipped: string | null
}

/**
 * Makes the theme's scenes in the Studio from the overlays the theme just made (`overlays`, in
 * the theme's screen order).
 */
export async function themeIntoStudio(
  api: Engine,
  theme: ThemeDesign,
  overlays: readonly Overlay[],
): Promise<StudioThemeResult> {
  const status = await api.status()
  if (!status.running)
    return { scenes: [], skipped: 'Start the Studio, then add the overlays with Add to Studio.' }
  const [kinds, list, sources] = await Promise.all([api.kinds(), api.scenes(), api.sources()])
  const kind = WEB_KINDS.find((k) => kinds.inputs.some((i) => i.id === k))
  if (!kind) return { scenes: [], skipped: 'This computer has no Browser source.' }
  const taken = new Set([...list.scenes.map((s) => s.name), ...sources.map((s) => s.name)])
  // The scene on air before: what you play and your camera.
  const yours = list.current
  const made: string[] = []
  for (const [i, screen] of theme.content.scenes.entries()) {
    const overlay = overlays[i]
    if (!overlay) continue
    const label = screen.name || SCENE_LABEL[screen.key] || screen.key
    const scene = free(`${theme.name} · ${label}`, taken)
    taken.add(scene)
    await api.addScene(scene)
    if (GAMEPLAY.has(screen.key) && yours) await api.addExisting(scene, yours)
    const name = free(overlay.name, taken)
    taken.add(name)
    await api.addSource(
      scene,
      { kind, name, settings: { url: overlay.url, width: overlay.width, height: overlay.height } },
      true,
    )
    // Alert sounds heard by you as well as the stream.
    await api.setAudio(name, { monitor: 'me_and_stream' }).catch(() => undefined)
    made.push(scene)
  }
  return { scenes: made, skipped: null }
}
