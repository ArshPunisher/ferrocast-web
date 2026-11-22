// Aligning and spacing out the sources picked together: the preview bar's Arrange button and
// the sources' right-click menu share this. One request, one undo step.

import {
  AlignBottomSimple,
  AlignCenterHorizontalSimple,
  AlignCenterVerticalSimple,
  AlignLeftSimple,
  AlignRightSimple,
  AlignTopSimple,
  ArrowsHorizontal,
  ArrowsVertical,
} from '@phosphor-icons/react'
import { Button, IconButton } from '@ferrocast/ui'
import type { EngineItem } from '@ferrocast/api'
import { done, useAction } from '../../../lib/hooks'
import { useDesk } from './common'
import { useContextMenu, type MenuItem } from './menu'
import {
  alignDeltas,
  distributeDeltas,
  moved,
  pickedBoxes,
  type Align,
  type Arrangeable,
  type BoxFor,
} from './snap'
import type { Frame } from './stage-edit'

/** What the buttons and the menu can do. */
export type Arrange = Align | 'distribute-x' | 'distribute-y'

/** The picked sources that have a place on the canvas (a hidden one still counts: it is picked). */
export function arrangeable(items: EngineItem[], ids: number[]): Arrangeable[] {
  return pickedBoxes(items, ids).map((i) => ({
    id: i.id,
    frame: i.frame as Frame,
    locked: i.locked,
  }))
}

/** What the engine names the undo step: Align or Space out, not "Move N sources". */
export const reasonOf = (how: Arrange): 'align' | 'distribute' =>
  how === 'distribute-x' || how === 'distribute-y' ? 'distribute' : 'align'

/** The boxes after `how`, for the picked sources. Empty when nothing would move. */
export function arranged(list: Arrangeable[], how: Arrange): BoxFor[] {
  const deltas =
    how === 'distribute-x'
      ? distributeDeltas(list, 'x')
      : how === 'distribute-y'
        ? distributeDeltas(list, 'y')
        : alignDeltas(list, how)
  return moved(
    list,
    deltas.filter((d) => Math.abs(d.dx) > 1e-9 || Math.abs(d.dy) > 1e-9),
  )
}

const ALIGN: { how: Align; label: string; Icon: typeof AlignLeftSimple }[] = [
  { how: 'left', label: 'Align left edges', Icon: AlignLeftSimple },
  { how: 'centre', label: 'Align centres', Icon: AlignCenterHorizontalSimple },
  { how: 'right', label: 'Align right edges', Icon: AlignRightSimple },
  { how: 'top', label: 'Align top edges', Icon: AlignTopSimple },
  { how: 'middle', label: 'Align middles', Icon: AlignCenterVerticalSimple },
  { how: 'bottom', label: 'Align bottom edges', Icon: AlignBottomSimple },
]

/**
 * What can be done to the picked sources now: Align needs two or more that can move, spacing out
 * three or more (the first and the last stay).
 */
export function useArrange() {
  const { api, scene, items, selected, also, refresh } = useDesk()
  const { run, busy } = useAction()
  const ids = [selected, ...also].filter((id): id is number => id !== null)
  const list = arrangeable(items.data ?? [], ids)
  const movable = list.filter((i) => !i.locked).length
  const can = {
    align: list.length >= 2 && movable >= 1,
    distribute: list.length >= 3 && movable >= 1,
  }
  const apply = (how: Arrange) => {
    const boxes = arranged(list, how)
    if (boxes.length === 0) return Promise.resolve()
    return run('arrange', () =>
      done(api.setItemBoxes(scene, { items: boxes, save: true, reason: reasonOf(how) })),
    ).then((ok) => ok && refresh())
  }
  const menu = (): MenuItem[] => [
    {
      label: 'Align',
      icon: AlignLeftSimple,
      disabled: !can.align,
      items: ALIGN.map(({ how, label, Icon }) => ({
        label,
        icon: Icon,
        onSelect: () => void apply(how),
      })),
    },
    {
      label: 'Space out',
      icon: ArrowsHorizontal,
      disabled: !can.distribute,
      items: [
        {
          label: 'Evenly across',
          icon: ArrowsHorizontal,
          onSelect: () => void apply('distribute-x'),
        },
        {
          label: 'Evenly down',
          icon: ArrowsVertical,
          onSelect: () => void apply('distribute-y'),
        },
      ],
    },
  ]
  return { can, apply, menu, busy: busy === 'arrange', count: list.length }
}

/** The preview bar's button: Align and Space out for the sources picked together. */
export function ArrangeButton({ panel = false }: { panel?: boolean } = {}) {
  const arrange = useArrange()
  const { open, menu } = useContextMenu()
  return (
    <>
      {panel ? (
        <Button
          size="xs"
          variant="ghost"
          aria-label="Align and space out the picked sources"
          aria-haspopup="menu"
          disabled={!arrange.can.align || arrange.busy}
          className="text-text-2"
          onClick={(e) => open(e, 'Arrange', arrange.menu())}
        >
          <AlignCenterHorizontalSimple size={16} weight="bold" aria-hidden />
          <span>Arrange</span>
        </Button>
      ) : (
        <IconButton
          size="sm"
          label="Align and space out the picked sources"
          aria-haspopup="menu"
          disabled={!arrange.can.align || arrange.busy}
          className="text-text-2"
          onClick={(e) => open(e, 'Arrange', arrange.menu())}
        >
          <AlignCenterHorizontalSimple size={17} weight="bold" />
        </IconButton>
      )}
      {menu}
    </>
  )
}
