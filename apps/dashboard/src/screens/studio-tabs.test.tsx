// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { href, parseRoute } from '../lib/router'
import { markRunningShow, STUDIO_TABS, studioTabs } from './Studio'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const tabs: { value: string; label: ReactNode; title?: string }[] = [
  { value: 'golive', label: 'Go live' },
  { value: 'show', label: 'Show' },
]

describe('the Show tab while a show runs', () => {
  it('is left alone when none runs', () => {
    expect(markRunningShow(tabs, false)).toBe(tabs)
  })

  it('gets a dot, a title, and says (running) to a screen reader', async () => {
    const out = markRunningShow(tabs, true)
    expect(out[0]).toBe(tabs[0])
    expect(out[1]!.title).toBe('A show is running')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => root.render(<>{out[1]!.label}</>))
    expect(host.querySelector('[data-show-running]')).not.toBeNull()
    expect(host.querySelector('.sr-only')?.textContent).toBe('(running)')
    expect(host.textContent).toContain('Show')
    await act(async () => root.unmount())
    host.remove()
  })
})

describe('which Studio tabs a window shows', () => {
  const all = ['golive', 'info', 'vertical', 'show', 'obs', 'moments', 'clips'].map((value) => ({
    value,
    label: value,
  }))
  const names = (usesObs: boolean, onPhone: boolean) =>
    studioTabs(all, { usesObs, onPhone }).map((t) => t.value)

  it('shows Clips on the PC, with or without OBS', () => {
    expect(names(true, false)).toContain('clips')
    expect(names(false, false)).toContain('clips')
  })

  it('hides OBS and Vertical without OBS, as before', () => {
    expect(names(false, false)).toEqual(['golive', 'info', 'show', 'moments', 'clips'])
  })

  it('gives a paired phone no Clips tab (the PC refuses it those calls)', () => {
    expect(names(true, true)).not.toContain('clips')
    expect(names(false, true)).toEqual(['golive', 'info', 'show', 'moments'])
  })
})

describe('the Schedule tab and deep link', () => {
  it('parses and formats the #/studio/schedule deep link', () => {
    expect(parseRoute('#/studio/schedule')).toEqual({ name: 'studio', section: 'schedule' })
    expect(href({ name: 'studio', section: 'schedule' })).toBe('#/studio/schedule')
  })

  it('includes a Schedule tab with an icon + label across OBS and phone views', async () => {
    const sched = STUDIO_TABS.find((t) => t.value === 'schedule')
    expect(sched).toBeDefined()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => root.render(<>{sched!.label}</>))
    expect(host.textContent).toBe('Schedule')
    expect(host.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    await act(async () => root.unmount())
    host.remove()

    expect(studioTabs(STUDIO_TABS, { usesObs: false, onPhone: false }).map((t) => t.value)).toEqual(
      ['golive', 'info', 'show', 'moments', 'clips', 'schedule'],
    )
    expect(studioTabs(STUDIO_TABS, { usesObs: false, onPhone: true }).map((t) => t.value)).toEqual([
      'golive',
      'info',
      'show',
      'moments',
      'schedule',
    ])
  })
})
