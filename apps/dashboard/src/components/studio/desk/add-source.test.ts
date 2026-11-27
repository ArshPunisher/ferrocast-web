import { describe, expect, it } from 'vitest'
import { KIND_GROUPS, friendlyKind, kindMatches, pickKind } from './common'
import { looksLikeCaptureCard, reusedNote } from './add-source'

const entries = KIND_GROUPS.flatMap((g) => g.entries)

describe('Video device in Add a source', () => {
  it('is one entry for cameras and capture cards, named exactly Video device', () => {
    const labels = entries.map((e) => e.label)
    expect(labels.filter((l) => l === 'Video device')).toHaveLength(1)
    expect(labels).not.toContain('Camera')
    expect(labels).not.toContain('Capture card')
  })

  it('is found by camera, webcam, capture, capture card and Elgato', () => {
    const e = entries.find((x) => x.label === 'Video device')!
    for (const word of ['camera', 'webcam', 'capture', 'capture card', 'Elgato', 'video dev']) {
      expect(kindMatches(e, word), word).toBe(true)
    }
    expect(kindMatches(e, 'microphone')).toBe(false)
  })

  it('still opens a source saved as a camera or as a capture card, under any engine kind', () => {
    for (const kind of [
      'macos-avcapture',
      'macos-avcapture-fast',
      'av_capture_input_v2',
      'dshow_input',
      'v4l2_input',
    ]) {
      expect(friendlyKind(kind), kind).toBe('Video device')
    }
    const e = entries.find((x) => x.label === 'Video device')!
    // Whichever of those kinds the engine has is the one the dialog adds.
    expect(
      pickKind(e, { inputs: [{ id: 'dshow_input', name: 'Video Capture Device' }] } as never),
    ).toBe('dshow_input')
    expect(
      pickKind(e, { inputs: [{ id: 'macos-avcapture-fast', name: 'Capture' }] } as never),
    ).toBe('macos-avcapture-fast')
  })

  it('brings its sound along by default for a capture card, not for a webcam', () => {
    expect(looksLikeCaptureCard('Cam Link 4K')).toBe(true)
    expect(looksLikeCaptureCard('Elgato HD60 X')).toBe(true)
    expect(looksLikeCaptureCard('USB3 Video')).toBe(true)
    expect(looksLikeCaptureCard('FaceTime HD Camera')).toBe(false)
    expect(looksLikeCaptureCard(null)).toBe(false)
  })
})

describe('a second source on a device already open', () => {
  it('says calmly that it shares the same picture, not that something went wrong', () => {
    const note = reusedNote('USB Camera')
    expect(note).toContain('shares the same picture')
    expect(note).not.toMatch(/error|couldn|failed|sorry/i)
  })
})
