import { describe, expect, it } from 'vitest'
import { arrangeable, arranged, reasonOf } from './arrange'
import type { Frame } from './stage-edit'

const box = (x: number, y: number, w: number, h: number): Frame => [w, 0, 0, h, x, y]
const item = (id: number, frame: Frame | undefined, more: Record<string, unknown> = {}) =>
  ({
    id,
    name: `s${id}`,
    kind: 'x',
    visible: true,
    locked: false,
    audio: false,
    group: false,
    blend: 'normal',
    scale_filter: 'off',
    children: [],
    frame,
    ...more,
  }) as never

describe('what the buttons and the menu send', () => {
  const items = [
    item(1, box(100, 50, 200, 100)),
    item(2, box(400, 300, 100, 50)),
    item(3, box(250, 500, 40, 60), { locked: true }),
    item(4, undefined),
    item(5, box(0, 0, 10, 10), { children: [item(6, box(5, 5, 4, 4))] }),
  ]
  it('takes the picked sources that have a place, a locked one and one inside a group too', () => {
    expect(arrangeable(items, [1, 3, 4, 6]).map((i) => [i.id, i.locked])).toEqual([
      [1, false],
      [3, true],
      [6, false],
    ])
  })
  it('lines up left: a box for each source that moves, none for the one already there or locked', () => {
    const list = arrangeable(items, [1, 2, 3])
    const boxes = arranged(list, 'left')
    // The selection's left is 100 (source 1): 2 moves to 100, 3 is locked, 1 is there.
    expect(boxes).toEqual([{ id: 2, x: 100, y: 300, w: 100, h: 50 }])
  })
  it('says nothing when nothing would move', () => {
    expect(arranged(arrangeable(items, [1, 2]), 'top').length).toBe(1)
    const aligned = arrangeable([item(1, box(0, 0, 10, 10)), item(2, box(20, 0, 10, 10))], [1, 2])
    expect(arranged(aligned, 'top')).toEqual([])
  })
  it('spaces three out evenly across, and down', () => {
    const three = [
      item(1, box(0, 0, 100, 10)),
      item(2, box(150, 0, 50, 10)),
      item(3, box(500, 0, 100, 10)),
    ]
    expect(arranged(arrangeable(three, [1, 2, 3]), 'distribute-x')).toEqual([
      { id: 2, x: 275, y: 0, w: 50, h: 10 },
    ])
    expect(arranged(arrangeable(three, [1, 2]), 'distribute-x')).toEqual([])
    const tall = [
      item(1, box(0, 0, 10, 100)),
      item(2, box(0, 130, 10, 40)),
      item(3, box(0, 600, 10, 100)),
    ]
    expect(arranged(arrangeable(tall, [1, 2, 3]), 'distribute-y')).toEqual([
      { id: 2, x: 0, y: 330, w: 10, h: 40 },
    ])
  })
  it('leaves out a source with no size, and a source of a group picked with it', () => {
    const kid = item(11, box(0, 0, 10, 10))
    const group = item(10, box(0, 0, 100, 100), { group: true, children: [kid] })
    const list = [group, item(20, [0, 0, 0, 0, 0, 0]), item(30, box(300, 0, 10, 10))]
    expect(arrangeable(list, [10, 11, 20, 30]).map((a) => a.id)).toEqual([10, 30])
  })
  it('names the undo step for what was clicked', () => {
    expect(reasonOf('left')).toBe('align')
    expect(reasonOf('middle')).toBe('align')
    expect(reasonOf('distribute-x')).toBe('distribute')
    expect(reasonOf('distribute-y')).toBe('distribute')
  })
})
