// "Add to Studio" for an overlay (Overlays page, the overlay editor): pick a scene, and the
// overlay goes in as a Browser source fitted to the screen, its sounds heard by you and the
// stream. The Studio's counterpart of "Add to OBS".

import { useMemo, useState } from 'react'
import { CardsThree, Check, Play } from '@phosphor-icons/react'
import { studioEngineApi, type Overlay } from '@ferrocast/api'
import { Button, Dialog, cx } from '@ferrocast/ui'
import { done, useAction, useClient, useResource } from '../../../lib/hooks'
import { href } from '../../../lib/router'

/** The Browser source kind this engine has (Ferrocast's own on a Mac, OBS's elsewhere). */
const WEB_KINDS = ['ferrocast_web', 'browser_source']

/** A name not used yet: "Alerts", then "Alerts 2"… */
function free(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`
}

type EngineApi = ReturnType<typeof studioEngineApi>

/**
 * Adds an overlay to a scene as a Browser source fitted to the screen, under a free name, its
 * sounds heard by you and the stream → the source's name.
 */
export async function addOverlayToStudio(
  api: EngineApi,
  overlay: Overlay,
  scene: string,
): Promise<string> {
  const [kinds, sources, scenes] = await Promise.all([api.kinds(), api.sources(), api.scenes()])
  const kind = WEB_KINDS.find((k) => kinds.inputs.some((i) => i.id === k))
  if (!kind) throw new Error('This computer has no Browser source.')
  const taken = new Set([
    ...sources.map((s) => s.name),
    ...scenes.scenes.map((s) => s.name),
    // Names are unique across both pictures.
    ...(scenes.vertical?.scenes ?? []).map((s) => s.name),
  ])
  const name = free(overlay.name, taken)
  await done(
    api.addSource(
      scene,
      { kind, name, settings: { url: overlay.url, width: overlay.width, height: overlay.height } },
      true,
    ),
  )
  // Alert sounds are heard by you too, as OBS's browser source plays them.
  await api.setAudio(name, { monitor: 'me_and_stream' }).catch(() => undefined)
  return name
}

export function AddToStudioDialog({
  overlay,
  onClose,
}: {
  overlay: Overlay | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={overlay !== null}
      onClose={onClose}
      size="sm"
      title={overlay ? `Add ${overlay.name} to the Studio` : 'Add to the Studio'}
    >
      {overlay && <Pick overlay={overlay} onClose={onClose} />}
    </Dialog>
  )
}

function Pick({ overlay, onClose }: { overlay: Overlay; onClose: () => void }) {
  const client = useClient()
  const api = useMemo(() => studioEngineApi(client), [client])
  const status = useResource(() => api.status(), [api])
  const running = !!status.data?.running
  const scenes = useResource(() => (running ? api.scenes() : Promise.resolve(null)), [api, running])
  const [picked, setPicked] = useState<string | null>(null)
  const { run, busy } = useAction()
  const scene = picked ?? scenes.data?.current ?? null

  if (status.data && !running)
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 text-[14.5px] text-text-2">
          Start the Studio first, then add the overlay to one of your scenes.
        </p>
        <a
          href={href({ name: 'studio', section: 'golive' })}
          onClick={onClose}
          className="inline-flex h-10 items-center gap-2 rounded-control bg-btn-primary px-4 text-[15px] font-bold text-white hover:bg-btn-primary-hover"
        >
          <Play size={15} weight="fill" /> Open the Studio
        </a>
      </div>
    )

  const add = () =>
    void run(
      'add',
      async () => {
        if (!scene) return false
        await addOverlayToStudio(api, overlay, scene)
        return true
      },
      { success: `${overlay.name} is in ${scene ?? 'the scene'}.` },
    ).then((ok) => ok && onClose())

  return (
    <div className="flex flex-col gap-4">
      {[
        { label: 'Wide', list: scenes.data?.scenes ?? [] },
        // The vertical picture's scenes too, once it's on: an overlay can go in either.
        { label: 'Vertical', list: scenes.data?.vertical?.scenes ?? [] },
      ]
        .filter((g) => g.list.length > 0)
        .map((g, _i, groups) => (
          <div key={g.label} className="flex flex-col gap-2">
            {groups.length > 1 && (
              <h3 className="m-0 text-[13px] font-bold text-text-3">{g.label}</h3>
            )}
            <div
              role="radiogroup"
              aria-label={groups.length > 1 ? `${g.label} scenes` : 'Scene'}
              className="grid grid-cols-2 gap-2"
            >
              {g.list.map((s) => {
                const on = s.name === scene
                return (
                  <button
                    key={s.name}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPicked(s.name)}
                    className={cx(
                      'flex min-h-11 min-w-0 items-center gap-2.5 rounded-[10px] border px-3 text-left text-[14.5px] font-semibold',
                      on ? 'fc-picked border-transparent' : 'border-line hover:bg-surface-2',
                    )}
                  >
                    <CardsThree size={16} aria-hidden className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {on && <Check size={14} weight="bold" aria-hidden />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" busy={busy === 'add'} disabled={!scene} onClick={add}>
          Add to {scene ?? 'scene'}
        </Button>
      </div>
    </div>
  )
}
