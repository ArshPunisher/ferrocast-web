import { describe, expect, it } from 'vitest'
import { type EngineStats, type MissedRecent } from '@ferrocast/api'
import {
  CAUSE_FIX,
  CAUSE_TEXT,
  FRAME_HEALTH,
  boxLevel,
  causesOf,
  levelFrom,
  readMisses,
} from './frame-health'

const calm = (): MissedRecent => ({
  window_s: 60,
  render: 0,
  encode: 0,
  skipped: 0,
  resize: 0,
  per_second: new Array<number>(60).fill(0),
  upload_trouble: false,
})

/** A minute with `frames` missed `agoS` seconds ago (0: this second). */
function at(agoS: number, frames: number, base = calm().per_second): number[] {
  const next = [...base]
  next[59 - agoS] = (next[59 - agoS] ?? 0) + frames
  return next
}

const engine = (m?: MissedRecent): EngineStats['engine'] => ({
  cpu: 5,
  fps: 60,
  frame_ms: 4,
  lagged: 129,
  frames: 3900,
  memory_mb: 200,
  skipped: 0,
  encoded: 3900,
  ...(m ? { missed_recent: m } : {}),
})

describe('the colour of the Frame rate panel', () => {
  it('keeps the thresholds in one place', () => {
    expect(FRAME_HEALTH.windowSeconds).toBe(60)
    expect(FRAME_HEALTH.stillSeconds).toBe(10)
    expect(FRAME_HEALTH.stillFrames).toBe(3)
  })

  it('is normal when nothing was missed in the last minute', () => {
    expect(levelFrom(calm().per_second)).toBe('ok')
  })

  it('is amber for a short dip that is over', () => {
    // 40 frames in one burst 30 s ago: not still happening.
    expect(levelFrom(at(30, 40))).toBe('warn')
    // Even the newest second of a burst under the line (2 frames now) is a dip.
    expect(levelFrom(at(0, FRAME_HEALTH.stillFrames - 1))).toBe('warn')
  })

  it('is red only while frames are still being missed', () => {
    expect(levelFrom(at(0, FRAME_HEALTH.stillFrames))).toBe('bad')
    // Spread over the last ten seconds counts too.
    expect(levelFrom(at(9, 2, at(1, 1)))).toBe('bad')
    // The same frames 10 s ago (just outside "now") are a dip again.
    expect(levelFrom(at(FRAME_HEALTH.stillSeconds, 50))).toBe('warn')
  })

  it('goes back to normal once the burst leaves the window (an old hiccup is forgotten)', () => {
    const r = readMisses(engine(calm()))
    // The engine totals still say 129 missed since the start: that no longer colours anything.
    expect(r.level).toBe('ok')
    expect(r.recent).toBe(true)
  })

  it('shows the last minute first and takes the totals from the engine as smaller text', () => {
    const m = { ...calm(), render: 12, encode: 3, skipped: 4, per_second: at(5, 19) }
    const r = readMisses(engine(m))
    expect([r.missed, r.skipped]).toEqual([15, 4])
    expect(r.perSecond).toHaveLength(60)
  })

  it('a box stays normal while its own count is zero', () => {
    expect(boxLevel('bad', 0)).toBe('ok')
    expect(boxLevel('bad', 2)).toBe('bad')
    expect(boxLevel('warn', 2)).toBe('warn')
  })

  it('falls back to the totals from an older engine', () => {
    const r = readMisses(engine())
    expect(r.recent).toBe(false)
    expect(r.level).toBe('bad') // 129 / 3900 is 3.3%, over 1%
    expect(r.cause).toBeNull()
    expect(readMisses({ ...engine(), lagged: 3 }).level).toBe('ok')
  })
})

describe('why frames were missed', () => {
  it('names nothing when calm', () => {
    expect(causesOf(calm())).toEqual([])
  })

  it('says drawing fell behind for late frames', () => {
    const c = causesOf({ ...calm(), render: 8 })
    expect(c[0]?.cause).toBe('drawing')
    expect(CAUSE_TEXT.drawing).toBe('Drawing fell behind')
  })

  it('says the encoder is overloaded when it held frames back or skipped them', () => {
    expect(causesOf({ ...calm(), encode: 5 })[0]?.cause).toBe('encoder')
    expect(causesOf({ ...calm(), skipped: 5 })[0]?.cause).toBe('encoder')
    expect(CAUSE_TEXT.encoder).toBe('Encoder overloaded')
  })

  it('blames the upload instead when it struggled in the minute', () => {
    const c = causesOf({ ...calm(), encode: 5, skipped: 2, upload_trouble: true })
    expect(c).toEqual([{ cause: 'upload', frames: 7 }])
    expect(CAUSE_TEXT.upload).toBe('Upload too slow')
    // Drawing late is never the upload's.
    expect(causesOf({ ...calm(), render: 9, upload_trouble: true })[0]?.cause).toBe('drawing')
  })

  it('says window resize when most of the loop misses happened during one', () => {
    const c = causesOf({ ...calm(), render: 6, resize: 5 })
    expect(c[0]?.cause).toBe('resize')
    expect(CAUSE_TEXT.resize).toBe('Window resize')
    // A few during a resize among many that were not: no.
    expect(causesOf({ ...calm(), render: 30, resize: 4 })[0]?.cause).toBe('drawing')
    // Encoder skips that outnumber the loop's misses are the encoder's.
    expect(causesOf({ ...calm(), render: 4, resize: 4, skipped: 20 })[0]?.cause).toBe('encoder')
  })

  it('lists the main cause first and the rest after it', () => {
    const c = causesOf({ ...calm(), render: 3, encode: 6, skipped: 1 })
    expect(c.map((x) => x.cause)).toEqual(['encoder', 'drawing'])
  })

  it('has a fix for every cause', () => {
    for (const k of ['drawing', 'encoder', 'upload', 'resize'] as const) {
      expect(CAUSE_FIX[k].length).toBeGreaterThan(10)
    }
  })
})
