// The scenes and sounds the show, BRB and the scene switcher pick from: the Studio's when the
// Studio is the picture source (the engine then runs them there), OBS's otherwise.

import { useMemo } from 'react'
import { studioEngineApi, type ObsScenes } from '@ferrocast/api'
import { useClient, useResource, type Resource } from '../../lib/hooks'
import { useUsesObs } from '../../lib/picture'
import { useStudio } from './common'

export interface RigInput {
  name: string
  kind: string
}

export interface RigLists {
  /** "the Studio" or "OBS", for sentences. */
  app: string
  /** Scene names (OBS's carry their items too); null while the app isn't running. */
  scenes: Resource<ObsScenes | null>
  inputs: Resource<RigInput[]>
}

/** Microphones and other sound devices, by their kind (OBS's and the Studio's ids). */
export const MIC_KIND = /input_capture|coreaudio|pulse_input|alsa|jack/
/** Cameras and capture cards. */
export const CAM_KIND = /dshow|av_capture|avcapture|v4l2|camera/

export function useRigLists(): RigLists {
  const usesObs = useUsesObs()
  const studio = useStudio()
  const client = useClient()
  const engine = useMemo(() => studioEngineApi(client), [client])
  const scenes = useResource<ObsScenes | null>(async () => {
    if (usesObs) return studio.obsScenes()
    if (!(await engine.status()).running) return null
    const s = await engine.scenes()
    return { current: s.current, scenes: s.scenes.map((x) => ({ name: x.name, items: [] })) }
  }, [usesObs, studio, engine])
  const inputs = useResource<RigInput[]>(async () => {
    if (usesObs) return studio.obsInputs().catch(() => [])
    if (!(await engine.status()).running) return []
    const s = await engine.scenes()
    // Sources in scenes, and the global devices (they're in every scene's mixer).
    const [sources, mixer] = await Promise.all([
      engine.sources(),
      engine.audio(s.current).catch(() => []),
    ])
    const seen = new Set<string>()
    return [...mixer.filter((a) => a.channel !== null), ...sources]
      .filter((x) => !seen.has(x.name) && seen.add(x.name))
      .map((x) => ({ name: x.name, kind: x.kind }))
  }, [usesObs, studio, engine])
  return { app: usesObs ? 'OBS' : 'the Studio', scenes, inputs }
}
