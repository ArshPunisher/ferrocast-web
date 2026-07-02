import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GiveawayCard, Widget } from '@ferrocast/api/types'
import { createOverlay, type OverlayRuntime } from '../src/runtime'
import { XSS, deepAll, frame, overlay, snapshot } from './helpers'

let root: HTMLElement
let rt: OverlayRuntime

const gw: Widget = {
  id: 'wg',
  kind: 'giveaway',
  x: 0,
  y: 0,
  w: 560,
  h: 200,
  config: { theme: 'molten' },
}
const card = (extra: Partial<GiveawayCard> = {}): GiveawayCard => ({
  id: 'g1',
  prize: 'A game key',
  keyword: '!join',
  open: true,
  entries: 12,
  winner: null,
  ...extra,
})
const winner = {
  platform: 'kick' as const,
  user_id: 'k1',
  login: 'volt',
  display_name: 'VoltViper',
  tickets: 1,
}

beforeEach(() => {
  document.body.replaceChildren()
  root = document.createElement('div')
  document.body.appendChild(root)
  rt = createOverlay(root, { audio: false })
})
afterEach(() => rt.destroy())

const widget = () => root.querySelector<HTMLElement>('.fc-w-giveaway')!

describe('giveaway widget', () => {
  it('shows how to enter, then reveals the winner once per draw', () => {
    rt.apply(snapshot({ giveaway: card() }, overlay([gw])))
    expect(widget().hidden).toBe(false)
    expect(widget().textContent).toContain('Type!joinin chat to enter')
    expect(widget().textContent).toContain('12 entries')
    rt.apply(frame('state', { giveaway: card({ open: false, winner }) }))
    expect(widget().textContent).toContain('VoltViper')
    expect(widget().classList.contains('is-reveal')).toBe(true)
    expect(root.querySelector('[aria-live]')?.textContent).toBe(
      'Giveaway winner: VoltViper. Prize: A game key.',
    )
    const row = root.querySelector('.fc-gw-row')
    rt.apply(frame('state', { giveaway: card({ open: false, winner, entries: 13 }) }))
    expect(root.querySelector('.fc-gw-row')).toBe(row)
  })

  it('shows a known winner after a reconnect without replaying the reveal', () => {
    rt.apply(snapshot({ giveaway: card({ open: false, winner }) }, overlay([gw])))
    expect(widget().textContent).toContain('VoltViper')
    expect(widget().classList.contains('is-reveal')).toBe(false)
    rt.apply(
      frame('state', {
        giveaway: card({ open: false, winner: { ...winner, platform: 'toString' as 'kick' } }),
      }),
    )
    expect(widget().hidden).toBe(true)
  })

  it('hides with nothing to show and keeps viewer text as text', () => {
    rt.apply(snapshot({}, overlay([gw])))
    expect(widget().hidden).toBe(true)
    rt.apply(frame('state', { giveaway: card({ open: false }) }))
    expect(widget().textContent).toContain('Entries closed')
    expect(widget().textContent).toContain('12 entries')
    rt.apply(
      frame('state', {
        giveaway: card({ prize: XSS[0]!, winner: { ...winner, display_name: XSS[2]! } }),
      }),
    )
    expect(deepAll(root, 'script, img, svg[onload], [onerror]')).toEqual([])
    rt.apply(frame('state', { giveaway: null }))
    expect(widget().hidden).toBe(true)
  })
})
