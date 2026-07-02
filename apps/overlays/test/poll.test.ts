import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PollView, Widget } from '@ferrocast/api/types'
import { createOverlay, type OverlayRuntime } from '../src/runtime'
import { XSS, deepAll, frame, overlay, snapshot } from './helpers'

let root: HTMLElement
let rt: OverlayRuntime

const pollWidget: Widget = {
  id: 'wp',
  kind: 'poll',
  x: 0,
  y: 0,
  w: 600,
  h: 320,
  config: { theme: 'molten' },
}
const poll = (extra: Partial<PollView> = {}): PollView => ({
  id: 'p1',
  question: 'Which map?',
  options: [
    { text: 'Ascent', votes: 3 },
    { text: 'Bind', votes: 1 },
  ],
  total: 4,
  started_at: 0,
  ends_at: 60_000,
  closed: false,
  leaders: [0],
  ...extra,
})

beforeEach(() => {
  document.body.replaceChildren()
  root = document.createElement('div')
  document.body.appendChild(root)
  rt = createOverlay(root, { audio: false })
})
afterEach(() => rt.destroy())

const widget = () => root.querySelector<HTMLElement>('.fc-w-poll')!

describe('poll widget', () => {
  it('is hidden without a poll and shows one from the snapshot', () => {
    rt.apply(snapshot({}, overlay([pollWidget])))
    expect(widget().hidden).toBe(true)
    rt.apply(frame('state', { poll: poll() }))
    expect(widget().hidden).toBe(false)
    expect(widget().textContent).toContain('Which map?')
    expect(widget().textContent).toContain('3 · 75%')
    expect(widget().textContent).toContain('Type !vote 1-2')
    const fills = [...root.querySelectorAll<HTMLElement>('.fc-poll-fill')].map(
      (f) => f.style.transform,
    )
    expect(fills).toEqual(['scaleX(0.75)', 'scaleX(0.25)'])
    expect(root.querySelector('[aria-live]')?.textContent).toBe(
      'Poll: Which map? Ascent: 3 votes, Bind: 1 vote.',
    )
  })

  it('updates in place, marks the winner when closed, and hides when removed', () => {
    rt.apply(snapshot({ poll: poll() }, overlay([pollWidget])))
    const firstRow = root.querySelector('.fc-poll-row')
    rt.apply(
      frame('state', {
        poll: poll({
          options: [
            { text: 'Ascent', votes: 3 },
            { text: 'Bind', votes: 5 },
          ],
          leaders: [1],
          closed: true,
        }),
      }),
    )
    expect(root.querySelector('.fc-poll-row')).toBe(firstRow)
    expect(widget().classList.contains('is-closed')).toBe(true)
    expect(root.querySelectorAll('.fc-poll-row')[1]!.classList.contains('is-leader')).toBe(true)
    expect(root.querySelectorAll<HTMLElement>('.fc-poll-winner')[1]!.hidden).toBe(false)
    expect(root.querySelector('[aria-live]')?.textContent).toMatch(/Winner: Bind\.$/)
    expect(widget().textContent).toContain('Final result')
    rt.apply(frame('state', { poll: null }))
    expect(widget().hidden).toBe(true)
  })

  it('keeps viewer-written text as text and survives garbage', () => {
    rt.apply(snapshot({}, overlay([pollWidget])))
    rt.apply(
      frame('state', {
        poll: poll({
          question: XSS[0]!,
          options: [
            { text: XSS[1]!, votes: 1 },
            { text: 'ok', votes: 0 },
          ],
        }),
      }),
    )
    expect(deepAll(root, 'script, img, [onerror]')).toEqual([])
    rt.apply(frame('state', { poll: poll({ options: [] }) }))
    expect(widget().hidden).toBe(true)
    rt.apply(frame('state', 'nope' as unknown as { poll: PollView }))
    rt.apply(frame('state', { poll: { id: 5 } as unknown as PollView }))
    expect(widget().hidden).toBe(true)
  })
})
