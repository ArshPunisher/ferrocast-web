import { describe, expect, it } from 'vitest'
import type { PreflightCheck } from '@ferrocast/api'
import { captureChecks, recoveredWords, silentMics, studioProblems } from './ready'

const check = (id: string, status: PreflightCheck['status']): PreflightCheck => ({
  id,
  label: id,
  status,
  detail: '',
  fix: null,
})

describe('ready check', () => {
  it('keeps only the Studio’s problems', () => {
    const got = studioProblems([
      check('obs', 'ok'),
      check('mic:Mic', 'fail'),
      check('cam:Cam', 'warn'),
      check('disk', 'warn'),
      check('platforms', 'fail'),
      check('discord', 'warn'),
      check('stream_info', 'fail'),
    ]).map((c) => c.id)
    expect(got).toEqual(['mic:Mic', 'cam:Cam', 'disk'])
  })

  it('warns before Go live about a scene with no picture', () => {
    const got = studioProblems([check('picture:Main', 'warn'), check('picture:Live', 'ok')]).map(
      (c) => c.id,
    )
    expect(got).toEqual(['picture:Main'])
  })

  it('calls a mic silent only when every sample was quiet', () => {
    const got = silentMics({ Quiet: [-90, -75, -61], Talking: [-90, -20], Unsampled: [] })
    expect(got.map((c) => c.label)).toEqual(['Quiet'])
    // A muted mic is already flagged: not twice.
    expect(silentMics({ Mic: [-99] }, [check('mic:Mic', 'fail')])).toEqual([])
    // Exactly at the line isn't silent.
    expect(silentMics({ Mic: [-60] })).toEqual([])
  })

  it('turns captures that show nothing into checks and uses calm waiting wording for waiting cameras', () => {
    const got = captureChecks([
      { source: 'Screen', kind: 'screen_capture', problem: 'black' },
      {
        source: 'iPhone Cam',
        kind: 'av_capture_input_v2',
        problem: 'waiting',
      },
    ])
    expect(got[0]).toMatchObject({ id: 'capture:Screen', status: 'warn' })
    expect(got[1]).toMatchObject({ id: 'capture:iPhone Cam', status: 'warn' })
    expect(got[1]?.detail).toContain('iPhone Cam is waiting for the camera')
    expect(got[1]?.detail).not.toContain('all black')
    expect(captureChecks(undefined)).toEqual([])
  })

  it('says what came back after a crash, and leaves the stream to you', () => {
    const words = recoveredWords({
      record: true,
      replay: true,
      live: true,
      again: ['replay buffer'],
      failed: ['Recording didn’t start: the disk is full.'],
    })
    expect(words).toEqual([
      'Ferrocast closed unexpectedly last time. Your scenes are back.',
      'Back on: replay buffer.',
      'Recording didn’t start: the disk is full.',
      'You were live: press Go live to stream again.',
    ])
    expect(
      recoveredWords({ record: false, replay: false, live: false, again: [], failed: [] }),
    ).toEqual(['Ferrocast closed unexpectedly last time. Your scenes are back.'])
  })
})
