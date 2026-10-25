import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Meter, meterPct, toDb, toPos } from './mixer'
import { KIND_GROUPS, KindTile, PLAIN_TONE, kindTone } from './common'
import { filterItems, type MenuItem } from './menu'

type Entry = Exclude<MenuItem, { sep: true }>

describe('the mixer', () => {
  it('fader positions and dB go both ways like OBS (cubic)', () => {
    expect(toDb(1)).toBe(0)
    expect(toDb(0)).toBe(-100)
    expect(toPos(-100)).toBe(0)
    expect(toPos(0)).toBe(1)
    for (const db of [-60, -30, -18, -6, -0.5]) expect(toDb(toPos(db))).toBeCloseTo(db, 6)
    // Halfway is about -18 dB.
    expect(toDb(0.5)).toBeCloseTo(-18.06, 1)
    // Above 0 dB stays at the top.
    expect(toPos(6)).toBe(1)
  })

  it('meters run from -60 dB to 0 with OBS’s zone edges', () => {
    expect(meterPct(-60)).toBe(0)
    expect(meterPct(-100)).toBe(0)
    expect(meterPct(0)).toBe(100)
    expect(meterPct(12)).toBe(100)
    expect(meterPct(-20)).toBeCloseTo(66.67, 1)
    expect(meterPct(-9)).toBeCloseTo(85, 5)
  })

  it('draws two meters, a peak line and a dB scale, and a slider that says its value', () => {
    const html = renderToStaticMarkup(
      <Meter
        level={{ peak: [-6, -12], magnitude: [-9, -15] }}
        muted={false}
        volumeDb={-6}
        label="Mic volume"
        onVolume={() => undefined}
        scale
      />,
    )
    expect(html).toContain('role="slider"')
    expect(html).toContain('aria-label="Mic volume"')
    expect(html).toContain('aria-valuetext="-6.0 dB"')
    // The six dB marks (0 to 60).
    for (const d of ['60', '30', '0']) expect(html).toContain(`>${d}<`)
    // A locked fader can't be moved or reached by Tab.
    const locked = renderToStaticMarkup(
      <Meter
        level={undefined}
        muted
        volumeDb={-100}
        label="Mic volume"
        onVolume={() => undefined}
        locked
        vertical
      />,
    )
    expect(locked).toContain('aria-disabled="true"')
    expect(locked).toContain('tabindex="-1"')
    expect(locked).toContain('aria-valuetext="Silent"')
    expect(locked).toContain('aria-orientation="vertical"')
  })
})

describe('kind colours', () => {
  it('every kind in Add a source has its group’s colour; others are plain', () => {
    for (const g of KIND_GROUPS)
      for (const e of g.entries)
        for (const k of e.kinds) if (k !== 'scene') expect(kindTone(k)).toBeTruthy()
    expect(kindTone('macos-avcapture')).toBe('var(--fc-accent-text)')
    expect(kindTone('coreaudio_input_capture')).toBe('var(--fc-ok)')
    expect(kindTone('some_plugin_audio_thing')).toBe('var(--fc-ok)')
    expect(kindTone('some_plugin_thing')).toBe(PLAIN_TONE)
    expect(kindTone('scene')).toBe('var(--fc-warn)')
  })

  it('a tile greys out when dimmed', () => {
    expect(renderToStaticMarkup(<KindTile kind="macos-avcapture" />)).toContain(
      'color:var(--fc-accent-text)',
    )
    expect(renderToStaticMarkup(<KindTile kind="macos-avcapture" dim />)).toContain(
      'color:var(--fc-text-3)',
    )
  })
})

describe('copy and paste filters', () => {
  it('pastes only what was copied from another source', () => {
    const setFilterClip = vi.fn()
    const paste = vi.fn()
    const none = filterItems('Mic', { filterClip: null, setFilterClip, paste }) as Entry[]
    expect(none.map((m) => m.label)).toEqual(['Copy filters', 'Paste filters'])
    expect(none[1]?.disabled).toBe(true)
    none[0]?.onSelect?.()
    expect(setFilterClip).toHaveBeenCalledWith('Mic')

    const self = filterItems('Mic', { filterClip: 'Mic', setFilterClip, paste }) as Entry[]
    expect(self[1]?.disabled).toBe(true)

    const other = filterItems('Mic', { filterClip: 'Cam', setFilterClip, paste }) as Entry[]
    expect(other[1]?.label).toBe('Paste filters from Cam')
    expect(other[1]?.disabled).toBe(false)
    other[1]?.onSelect?.()
    expect(paste).toHaveBeenCalledWith('Cam')
  })
})
