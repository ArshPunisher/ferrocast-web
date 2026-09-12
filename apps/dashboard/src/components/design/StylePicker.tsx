import { useMemo } from 'react'
import { looksFor, previewAlert, type AlertLook, type Design, type EventKey } from '@ferrocast/api'
import { cx } from '@ferrocast/ui'
import { DesignStage } from './DesignStage'
import { useResource } from '../../lib/hooks'
import type { SetLook } from './inspector'

/**
 * "Start from a style": every built-in alert design as a small live tile. Picking one takes
 * its whole look for this event and keeps your words and your own picture.
 */
export function StylePicker({ ev, look, set }: { ev: EventKey; look: AlertLook; set: SetLook }) {
  const res = useResource((c) => c.designs('alert'))
  const builtins = (res.data ?? []).filter((d) => d.built_in)
  if (!builtins.length) return null
  return (
    <div role="group" aria-label="Start from a style" className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-text-2">Start from a style</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {builtins.map((d) => (
          <StyleTile key={d.id} design={d} ev={ev} current={look} onPick={(l) => set(l)} />
        ))}
      </div>
    </div>
  )
}

function StyleTile({
  design,
  ev,
  current,
  onPick,
}: {
  design: Design
  ev: EventKey
  current: AlertLook
  onPick: (l: Partial<AlertLook>) => void
}) {
  const alert = useMemo(() => previewAlert(design, ev, { id: `style-${design.id}` }), [design, ev])
  const theirs = looksFor(design, ev)[0]?.look
  const on =
    !!theirs &&
    theirs.frame === current.frame &&
    theirs.layout === current.layout &&
    theirs.colors.highlight === current.colors.highlight
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        if (!theirs) return
        // Your words stay, and so does a picture you uploaded.
        const { title: _t, body: _b, ...rest } = theirs
        void _t
        void _b
        onPick({ ...structuredClone(rest), media: current.media.ref ? current.media : rest.media })
      }}
      className={cx(
        'fc-press flex flex-col gap-1.5 rounded-[12px] border p-1.5 text-left text-[13px] font-semibold text-text',
        on
          ? 'border-accent-line bg-accent-soft'
          : 'border-line bg-surface-2 hover:border-line-strong',
      )}
    >
      <span className="pointer-events-none block overflow-hidden rounded-[8px]">
        <DesignStage
          alert={alert}
          className="rounded-none border-0"
          label={`${design.name} style`}
        />
      </span>
      <span className="px-0.5 pb-0.5">{design.name}</span>
    </button>
  )
}
