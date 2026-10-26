import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DECAY, Meter, decayed, meterPct, toDb, toPos } from './mixer'
import { KIND_GROUPS, KindTile, PLAIN_TONE, kindTone } from './common'
import { filterItems, projectorItem, type MenuItem } from './menu'
import { scaleFor, shownSize } from './transform'
import { fileName } from './library'
import { historyMenu, tbarEnd } from './preview'
import { balanceLabel } from './advanced-audio'
import { previewName, shortcutGroups } from './settings'
import { kbpsBetween, lastsFor, share, sizeText } from './stats-panel'
import { fileName as baseName, ownerText } from './missing-files'
import { asksFirst } from './desk'
import { levelOf, visibleLines } from './log-viewer'

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

describe('projectors', () => {
  it('offers a window, then full screen on each display', () => {
    const show = vi.fn()
    const screens = [
      { index: 0, name: 'Studio Display', width: 2560, height: 1440, main: true },
      { index: 1, name: 'BenQ', width: 1920, height: 1080, main: false },
    ]
    const item = projectorItem('Projector', screens, show) as Entry
    const sub = (item.items ?? []).filter((m): m is Entry => !('sep' in m))
    expect(sub.map((m) => m.label)).toEqual([
      'In a window',
      'In a window, always on top',
      'Full screen on Studio Display (main)',
      'Full screen on BenQ',
    ])
    sub[0]?.onSelect?.()
    sub[1]?.onSelect?.()
    sub[3]?.onSelect?.()
    expect(show.mock.calls).toEqual([[undefined], [undefined, true], [1]])
    // No displays known yet: just the window.
    const none = projectorItem('Projector', null, show) as Entry
    expect(none.items).toHaveLength(2)
  })
})

describe('edit transform', () => {
  const base = {
    x: 0,
    y: 0,
    rotation: 0,
    scale_x: 0.5,
    scale_y: 0.5,
    alignment: 5,
    bounds: 'none' as const,
    bounds_alignment: 0,
    bounds_width: 0,
    bounds_height: 0,
    crop_left: 100,
    crop_top: 0,
    crop_right: 100,
    crop_bottom: 80,
    width: 1920,
    height: 1080,
  }

  it('shows the size after crop and scale, and finds the scale for a size', () => {
    expect(shownSize(base)).toEqual({ w: 860, h: 500 })
    expect(scaleFor(base, 1720, 1000)).toEqual({ x: 1, y: 1 })
    // A flip stays a flip.
    expect(scaleFor({ ...base, scale_x: -0.5 }, 860, 500)).toEqual({ x: -0.5, y: 0.5 })
    // A source with no size yet can't be sized.
    expect(scaleFor({ ...base, width: 0 }, 100, 100)).toBeNull()
    expect(scaleFor(base, 0, 100)).toBeNull()
  })
})

describe('scene collections and profiles', () => {
  it('exports to a file name any system accepts', () => {
    expect(fileName('Gaming')).toBe('Gaming.json')
    expect(fileName('Show: Live/Late?')).toBe('Show- Live-Late-.json')
    expect(fileName('   ')).toBe('Studio.json')
  })
})

describe('studio mode', () => {
  it('the T-bar finishes near the end, goes back near the start, else holds', () => {
    expect(tbarEnd(0.95)).toBe('finish')
    expect(tbarEnd(0.9)).toBe('finish')
    expect(tbarEnd(0.1)).toBe('back')
    expect(tbarEnd(0)).toBe('back')
    expect(tbarEnd(0.5)).toBe('hold')
    expect(tbarEnd(0.11)).toBe('hold')
  })
})

describe('history', () => {
  it('lists redo steps furthest first, then undo steps newest first, each with its count', () => {
    const steps = vi.fn()
    const items = historyMenu(
      { undo: ['Move Cam', 'Add Cam'], redo: ['Hide Mic', 'Mute Mic'] },
      steps,
    ) as MenuItem[]
    const entries = items.filter((m): m is Entry => !('sep' in m))
    expect(entries.map((m) => m.label)).toEqual([
      'Redo: Mute Mic',
      'Redo: Hide Mic',
      'Move Cam',
      'Add Cam',
    ])
    expect(items.some((m) => 'sep' in m)).toBe(true)
    for (const e of entries) e.onSelect?.()
    expect(steps.mock.calls).toEqual([
      [true, 2],
      [true, 1],
      [false, 1],
      [false, 2],
    ])
    expect(entries[2]?.hint).toBe('⌘Z')
    const empty = historyMenu({ undo: [], redo: [] }, steps) as Entry[]
    expect(empty).toHaveLength(1)
    expect(empty[0]?.disabled).toBe(true)
  })
})

describe('advanced audio', () => {
  it('says balance as left, centre or right', () => {
    expect(balanceLabel(0.5)).toBe('Centre')
    expect(balanceLabel(0)).toBe('L 100%')
    expect(balanceLabel(0.3)).toBe('L 40%')
    expect(balanceLabel(1)).toBe('R 100%')
    expect(balanceLabel(0.501)).toBe('Centre')
  })
})

describe('recording names', () => {
  it('fills OBS’s name pattern like OBS does', () => {
    const at = new Date(2026, 9, 7, 9, 5, 3)
    const s = { fps: 60, width: 1920, height: 1080 }
    expect(previewName('%CCYY-%MM-%DD %hh-%mm-%ss', s, at)).toBe('2026-10-07 09-05-03')
    expect(previewName('Show %YY%MM%DD %FPS %CRES 100%%', s, at)).toBe(
      'Show 261007 60 1920x1080 100%',
    )
    expect(previewName('%unknown stays', s, at)).toBe('%unknown stays')
  })
})

describe('stats', () => {
  it('works out bitrate, sizes, shares and how long a disk lasts', () => {
    expect(kbpsBetween(0, 750_000, 1000)).toBe(6000)
    expect(kbpsBetween(500, 100, 1000)).toBe(0)
    expect(kbpsBetween(0, 100, 0)).toBe(0)
    expect(sizeText(850)).toBe('850 MB')
    expect(sizeText(2048)).toBe('2.0 GB')
    expect(share(3, 3000)).toBe('3 (0.1%)')
    expect(share(0, 0)).toBe('0 (0.0%)')
    // 10 GB at 6 Mbps: about 3 h 58 min.
    expect(lastsFor(10 * 1024, 6000)).toBe('about 3 h 58 min')
    expect(lastsFor(100, 6000)).toBe('about 2 min')
    expect(lastsFor(100, 0)).toBeNull()
  })
})

describe('missing files', () => {
  it('names who uses a file and the file', () => {
    const m = {
      source: 'Logo',
      parent: null,
      kind: 'image_source',
      key: 'file',
      label: 'Image File',
      path: '/a/b/logo.png',
    }
    expect(ownerText(m)).toBe('Logo')
    expect(ownerText({ ...m, source: 'Mask', parent: 'Logo' })).toBe('Mask on Logo')
    expect(ownerText({ ...m, source: '', kind: 'obs_stinger_transition' })).toBe(
      'stinger transition',
    )
    expect(baseName('/a/b/logo.png')).toBe('logo.png')
    expect(baseName('C:\\x\\y.mp4')).toBe('y.mp4')
  })
})

describe('shortcuts', () => {
  it('offers every action OBS has, named for each scene, source, sound, filter and video', () => {
    const groups = shortcutGroups(
      [{ name: 'Gameplay' }],
      [{ scene: 'Gameplay', source: 'Camera' }],
      ['Mic'],
      [{ source: 'Mic', filter: 'Gate' }],
      ['Intro'],
      ['Cut', 'Fade 0.3s'],
    )
    const ids = groups.flatMap((g) => g.actions.map((a) => a.id))
    for (const id of [
      'go_live',
      'split_record',
      'transition',
      'quick:2',
      'scene:Gameplay',
      'show:Gameplay\nCamera',
      'hide:Gameplay\nCamera',
      'push_to_mute:Mic',
      'filter:Mic\nGate',
      'media_restart:Intro',
      'undo',
    ])
      expect(ids).toContain(id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('meter decay', () => {
  it('rises at once and falls no faster than the rate', () => {
    expect(decayed(-40, -10, DECAY.slow, 100)).toBe(-10)
    // Slow: 8.57 dB/s, so 100 ms falls 0.857 dB.
    expect(decayed(-10, -60, DECAY.slow, 100)).toBeCloseTo(-10.857, 3)
    expect(decayed(-10, -60, DECAY.fast, 1000)).toBeCloseTo(-33.53, 2)
    // Never below the new level.
    expect(decayed(-10, -12, DECAY.fast, 1000)).toBe(-12)
  })
})

describe('asking first', () => {
  it('asks before ending a stream by default, and the rest only when switched on', () => {
    expect(asksFirst('stream', true, null)).toBe('end')
    expect(asksFirst('stream', false, null)).toBeNull()
    expect(asksFirst('record', true, null)).toBeNull()
    const all = { confirm_go_live: true, confirm_end_stream: false, confirm_stop_record: true }
    const p = all as Parameters<typeof asksFirst>[2]
    expect(asksFirst('stream', false, p)).toBe('live')
    expect(asksFirst('stream', true, p)).toBeNull()
    expect(asksFirst('record', true, p)).toBe('record')
    // Starting a recording never asks.
    expect(asksFirst('record', false, p)).toBeNull()
  })
})

describe('the log', () => {
  const lines = [
    '2026-10-26T17:13:21Z  INFO ferrocast: Ferrocast starting',
    '2026-10-26T17:13:22Z  WARN libobs: [ coreaudio ]: device not found',
    '2026-10-26T17:13:23Z ERROR ferrocast_studio: encoder failed',
    "thread 'main' panicked at src/x.rs:1",
  ]
  it('tells problems from everyday lines', () => {
    expect(lines.map(levelOf)).toEqual(['info', 'warn', 'error', 'error'])
  })
  it('shows only problems, or lines holding the search', () => {
    expect(visibleLines(lines, 'problems', '')).toHaveLength(3)
    expect(visibleLines(lines, 'all', 'COREAUDIO')).toEqual([lines[1]])
    expect(visibleLines(lines, 'problems', 'starting')).toEqual([])
    expect(visibleLines(lines, 'all', '  ')).toHaveLength(4)
  })
})

