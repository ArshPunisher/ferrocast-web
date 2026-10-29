import { describe, expect, it } from 'vitest'
import type { StudioSettings } from '@ferrocast/api'
import type { EngineCaptureProblem } from '@ferrocast/api'
import {
  LOWEST_KBPS,
  captureWords,
  doctorFix,
  lastingProblem,
  lighterKbps,
  lighterScale,
} from './doctor'

const base = {
  encoder: 'hardware',
  video_kbps: 6000,
  scale: null,
  fps: 60,
} as unknown as StudioSettings
const hd = { width: 1920, height: 1080 }

describe('the stream doctor', () => {
  it('steps the bitrate down a quarter, in 250 kbps steps, never below the floor', () => {
    expect(lighterKbps(6000)).toBe(4500)
    expect(lighterKbps(3100)).toBe(2500)
    expect(lighterKbps(LOWEST_KBPS)).toBeNull()
    expect(lighterKbps(1000)).toBeNull()
    expect(lighterKbps(Number.NaN)).toBeNull()
  })

  it('scales the short side to 720, keeping the shape and even sides', () => {
    expect(lighterScale(hd)).toEqual([1280, 720])
    expect(lighterScale({ width: 2560, height: 1080 })).toEqual([1706, 720])
    expect(lighterScale({ width: 1080, height: 1920 })).toEqual([720, 1280])
    expect(lighterScale({ width: 1280, height: 720 })).toBeNull()
    expect(lighterScale({ width: 0, height: 0 })).toBeNull()
  })

  it('a slow upload gets a lower bitrate, unless it is already at the floor', () => {
    expect(doctorFix('network', base, hd, true)?.patch).toEqual({ video_kbps: 4500 })
    expect(doctorFix('network', { ...base, video_kbps: 2500 }, hd, true)).toBeNull()
  })

  it('a busy encoder moves to the graphics card first, then 720p, then a lower bitrate', () => {
    expect(doctorFix('encode', { ...base, encoder: 'software' }, hd, true)?.patch).toEqual({
      encoder: 'hardware',
    })
    expect(doctorFix('encode', base, hd, true)?.patch).toEqual({ scale: [1280, 720] })
    expect(doctorFix('encode', { ...base, scale: [1280, 720] }, hd, true)?.patch).toEqual({
      video_kbps: 4500,
    })
    expect(
      doctorFix('encode', { ...base, scale: [1280, 720], video_kbps: 2500 }, hd, true),
    ).toBeNull()
  })

  it('late frames get 30 fps, but never while live (the canvas is fixed then)', () => {
    expect(doctorFix('render', base, hd, false)?.patch).toEqual({ fps: 30 })
    expect(doctorFix('render', base, hd, true)).toBeNull()
    expect(doctorFix('render', { ...base, fps: 30 }, hd, false)).toBeNull()
  })
})

describe('the black screen fixer', () => {
  const black: EngineCaptureProblem = { source: 'Game', kind: 'screen_capture', problem: 'black' }
  const none: EngineCaptureProblem = {
    source: 'Cam',
    kind: 'macos-avcapture',
    problem: 'no_picture',
  }

  it('waits until a problem has lasted, then names it', () => {
    const seen = new Map<string, number>()
    expect(lastingProblem([black], seen, 0)).toBeNull()
    expect(lastingProblem([black], seen, 4999)).toBeNull()
    expect(lastingProblem([black], seen, 5000)).toEqual(black)
  })

  it('forgets one that went away, so it waits again when it comes back', () => {
    const seen = new Map<string, number>()
    lastingProblem([black], seen, 0)
    expect(lastingProblem([], seen, 6000)).toBeNull()
    expect(seen.size).toBe(0)
    expect(lastingProblem([black], seen, 7000)).toBeNull()
    expect(lastingProblem([black], seen, 12_000)).toEqual(black)
  })

  it('a new kind of trouble with the same source starts its own wait', () => {
    const seen = new Map<string, number>()
    lastingProblem([black], seen, 0)
    const fixedThenGone = { ...black, problem: 'no_picture' as const }
    expect(lastingProblem([fixedThenGone], seen, 6000)).toBeNull()
  })

  it('shows the first lasting one when several are', () => {
    const seen = new Map<string, number>()
    lastingProblem([black], seen, 0)
    lastingProblem([black, none], seen, 3000)
    expect(lastingProblem([none, black], seen, 6000)).toEqual(black)
    expect(lastingProblem([none, black], seen, 8000)).toEqual(none)
  })

  it('says why and what to do for each', () => {
    expect(captureWords({ ...black, problem: 'permission' })).toMatch(/Allow, then restart/)
    expect(captureWords(none)).toMatch(/^“Cam” has no picture/)
    expect(captureWords(black)).toMatch(/all black/)
  })
})
