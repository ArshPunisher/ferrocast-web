import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installPreviewInput, type PreviewInput } from './preview-input'

const at = (
  kind: PreviewInput['kind'],
  x: number,
  y: number,
  more: Partial<PreviewInput> = {},
): PreviewInput => ({
  kind,
  button: 0,
  buttons: 0,
  x,
  y,
  dx: 0,
  dy: 0,
  shift: false,
  ctrl: false,
  alt: false,
  ...more,
})

describe('installPreviewInput', () => {
  let stage: HTMLDivElement
  let menu: HTMLButtonElement
  let seen: string[]
  let cursors: string[]
  let undo: () => void

  beforeEach(() => {
    document.body.innerHTML = ''
    stage = document.createElement('div')
    stage.style.cursor = 'move'
    menu = document.createElement('button')
    document.body.append(stage, menu)
    seen = []
    cursors = []
    for (const el of [stage, menu])
      for (const t of [
        'pointerover',
        'pointerdown',
        'pointermove',
        'pointerup',
        'click',
        'contextmenu',
        'dblclick',
        'wheel',
      ])
        el.addEventListener(t, (e) =>
          seen.push(`${el === stage ? 'stage' : 'menu'}:${t}:${(e as MouseEvent).clientX}`),
        )
    // jsdom lays nothing out: the stage is left of x 100, the menu right of it.
    document.elementFromPoint = (x: number) => (x < 100 ? stage : menu)
    undo = installPreviewInput((c) => cursors.push(c))
  })
  afterEach(() => undo())

  it('plays a press, a drag off the stage and the let-go on the stage, then a click', () => {
    const play = window.__ferrocastPreviewInput!
    play(at('move', 10, 5))
    play(at('down', 10, 5, { buttons: 1 }))
    play(at('move', 150, 5, { buttons: 1 }))
    play(at('up', 20, 5))
    expect(seen).toEqual([
      'stage:pointerover:10',
      'stage:pointermove:10',
      'stage:pointerdown:10',
      // Held: the drag stays with the stage even over the menu.
      'stage:pointermove:150',
      'stage:pointerup:20',
      'stage:click:20',
    ])
    expect(cursors).toEqual(['move'])
  })

  it('opens a context menu on the right button let go, and passes double clicks and the wheel', () => {
    const play = window.__ferrocastPreviewInput!
    play(at('down', 120, 1, { button: 2, buttons: 2 }))
    play(at('up', 120, 1, { button: 2 }))
    play(at('dblclick', 10, 1))
    play(at('wheel', 10, 1, { dy: 100 }))
    expect(seen).toContain('menu:contextmenu:120')
    expect(seen).toContain('stage:dblclick:10')
    expect(seen).toContain('stage:wheel:10')
    expect(seen).not.toContain('menu:click:120')
  })

  it('cancels a press whose let-go never came', () => {
    const play = window.__ferrocastPreviewInput!
    stage.addEventListener('pointercancel', () => seen.push('stage:pointercancel'))
    play(at('down', 10, 5, { buttons: 1 }))
    play(at('move', 150, 5))
    expect(seen.slice(-3)).toEqual([
      'stage:pointercancel',
      'menu:pointerover:150',
      'menu:pointermove:150',
    ])
  })

  it('goes away when undone', () => {
    undo()
    expect(window.__ferrocastPreviewInput).toBeUndefined()
  })
})
