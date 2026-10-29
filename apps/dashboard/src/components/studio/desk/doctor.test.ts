import { describe, expect, it } from 'vitest'
import type { StudioSettings } from '@ferrocast/api'
import { LOWEST_KBPS, doctorFix, lighterKbps, lighterScale } from './doctor'

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
