// Where a source is shown: on the stream, in the recording, or both. A clean recording
// without chat and alerts while the stream keeps them, or a face camera only in the recording.
// The row and the badge are plain; what each choice means sits behind the (i).

import { Broadcast, Record as RecordIcon } from '@phosphor-icons/react'
import type { EngineItem, EngineItemEdit, EngineShow } from '@ferrocast/api'
import { InfoTip, Segmented, cx } from '@ferrocast/ui'
import { SOUND_ONLY } from './common'

/** What an item says it is shown for; an engine from before this sends nothing: both. */
export function showOf(item: Pick<EngineItem, 'show'>): EngineShow {
  return item.show === 'stream' || item.show === 'recording' ? item.show : 'both'
}

/**
 * Whether a source can be chosen to show on the stream only or in the recording only: a picture
 * can (a group too); a sound source has none to leave out (sound goes by the mixer's tracks), and
 * the vertical picture has a stream and no recording.
 */
export function canChooseWhere(kind: string, canvas: 'main' | 'vertical'): boolean {
  return canvas === 'main' && !SOUND_ONLY.has(kind)
}

/**
 * The item a settings panel is about: the one picked in the list when it is this source's (the same
 * source can be in a scene twice), else the first with that name, in a group too.
 */
export function itemFor(
  items: EngineItem[],
  name: string,
  selected: number | null,
): EngineItem | null {
  const all = items.flatMap((i) => [i, ...i.children])
  return (
    all.find((i) => i.name === name && i.id === selected) ??
    all.find((i) => i.name === name) ??
    null
  )
}

/** The engine's edit word for each choice. */
export function editForShow(show: EngineShow): EngineItemEdit {
  return show === 'stream'
    ? 'stream_only'
    : show === 'recording'
      ? 'recording_only'
      : 'stream_and_recording'
}

/** The words for each choice (short: the control is a few characters wide at 375 px). */
export const SHOWN_LABEL: Record<EngineShow, string> = {
  both: 'Both',
  stream: 'Stream',
  recording: 'Recording',
}

/** In full, for a tooltip and the menu. */
export const SHOWN_LONG: Record<EngineShow, string> = {
  both: 'Stream and recording',
  stream: 'Stream only',
  recording: 'Recording only',
}

/**
 * A small icon in a source's row when it is for the stream only or the recording only, and
 * nothing when it is shown on both (the usual case keeps the list quiet).
 */
export function ShownBadge({ item }: { item: Pick<EngineItem, 'name' | 'show'> }) {
  const show = showOf(item)
  if (show === 'both') return null
  const Icon = show === 'stream' ? Broadcast : RecordIcon
  return (
    <span
      role="img"
      // Read as part of the row's name: "Chat, shown on the stream only".
      aria-label={`Shown ${show === 'stream' ? 'on the stream' : 'in the recording'} only`}
      title={SHOWN_LONG[show]}
      className="inline-flex shrink-0 items-center text-text-2"
    >
      <Icon size={14} weight="fill" aria-hidden />
    </span>
  )
}

/**
 * The control in the source's settings: Both, Stream or Recording. `onChoose` is told only when
 * the choice changes.
 */
export function ShownIn({
  item,
  busy = false,
  parent,
  onChoose,
}: {
  item: Pick<EngineItem, 'name' | 'show'>
  busy?: boolean
  /** The group this source is in: its choice covers the source too. */
  parent?: { name: string; show: EngineShow } | null
  onChoose: (show: EngineShow) => void
}) {
  const now = showOf(item)
  // A group for one side only covers what is in it: say so, and when the source says the other
  // side it is shown in neither.
  const inherited =
    parent && parent.show !== 'both'
      ? `In ${parent.name}: ${SHOWN_LONG[parent.show].toLowerCase()}.${
          now !== 'both' && now !== parent.show ? ' Shown in neither.' : ''
        }`
      : null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          Shown in
          <InfoTip label="About where it is shown">
            Stream only keeps it out of your recording (chat, alerts). Recording only keeps it off
            the stream (a face camera). Both is the default. This is about the picture only: sound
            goes by the mixer's tracks. The replay buffer follows the recording; the preview and the
            virtual camera show everything.
          </InfoTip>
        </span>
        <fieldset
          disabled={busy}
          aria-busy={busy}
          className={cx('m-0 min-w-0 border-0 p-0 transition-opacity', busy && 'opacity-50')}
        >
          <Segmented
            label="Shown in"
            size="sm"
            value={now}
            options={(['both', 'stream', 'recording'] as const).map((v) => ({
              value: v,
              label: SHOWN_LABEL[v],
              title: SHOWN_LONG[v],
            }))}
            onChange={(to) => to !== now && onChoose(to)}
          />
        </fieldset>
      </div>
      {inherited && (
        <p data-testid="shown-in-parent" className="m-0 text-[12.5px] text-text-2">
          {inherited}
        </p>
      )}
    </div>
  )
}
