import { describe, expect, it } from 'vitest'
import {
  DAILY_UPLOADS,
  clipLength,
  clipNameProblem,
  clipSize,
  clock,
  compileProblem,
  cuesProblem,
  jobActive,
  parseClock,
  renderSrt,
  shortsProblem,
  trimProblem,
  uploadProblem,
} from '../src/clips'

describe('clip names', () => {
  it('accepts plain names and refuses what the engine refuses', () => {
    for (const ok of ['Best play', 'Replay 2026-11-22 21-00-00', 'a.b', 'console', 'com10'])
      expect(clipNameProblem(ok), ok).toBeNull()
    for (const bad of [
      '',
      '  ',
      ' a',
      'a ',
      '.hidden',
      'a.',
      'a/b',
      'a\\b',
      'a:b',
      'a..b',
      'x?',
      'x|y',
      'a\u0007',
      'CON',
      'nul.mp4',
      'com1',
      'x'.repeat(121),
    ])
      expect(clipNameProblem(bad), JSON.stringify(bad)).not.toBeNull()
  })
})

describe('trim', () => {
  it('needs a part inside the clip of at least 0.2 s', () => {
    expect(trimProblem(1000, 3000, 6000)).toBeNull()
    expect(trimProblem(1000, 99_000, 6000)).toBeNull() // past the end is the end
    expect(trimProblem(7000, 9000, 6000)).toMatch(/past the end/)
    expect(trimProblem(4000, 2000, 6000)).toMatch(/after the start/)
    expect(trimProblem(3000, 3100, 6000)).toMatch(/fifth of a second/)
    expect(trimProblem(-1, 3000, 6000)).toMatch(/before/)
    expect(trimProblem(NaN, 3000, 6000)).toMatch(/Set the start/)
    expect(trimProblem(1000, 3000, null)).toBeNull() // length unknown: the engine decides
  })
})

describe('compile', () => {
  const two = { clips: ['a.mp4', 'b.mp4'] }
  it('needs 2 to 20 clips, a fade of 0 to 3 s that fits each clip', () => {
    expect(compileProblem(two, [4000, 4000])).toBeNull()
    expect(compileProblem({ clips: ['a.mp4'] }, [1])).toMatch(/2 to 20/)
    expect(compileProblem({ clips: Array(21).fill('a.mp4') }, [])).toMatch(/2 to 20/)
    expect(compileProblem({ ...two, crossfade_s: 4 }, [9000, 9000])).toMatch(/0 to 3/)
    expect(compileProblem({ ...two, crossfade_s: Number.NaN }, [9000, 9000])).toMatch(/0 to 3/)
    expect(compileProblem({ ...two, crossfade_s: 1.5 }, [2000, 9000])).toMatch(/shorter than twice/)
    expect(compileProblem({ ...two, crossfade_s: 1.5 }, [null, 9000])).toBeNull()
    expect(compileProblem({ ...two, name: 'a/b' }, [])).not.toBeNull()
    expect(compileProblem({ ...two, name: '  ' }, [])).toBeNull() // empty: the default name
  })
})

describe('upload', () => {
  it('checks the details like the engine', () => {
    expect(uploadProblem({ title: 'Best play' })).toBeNull()
    expect(uploadProblem({ title: ' ' })).toMatch(/title/)
    expect(uploadProblem({ title: 'x'.repeat(101) })).toMatch(/100/)
    expect(uploadProblem({ title: 'a<b' })).toMatch(/< or >/)
    expect(uploadProblem({ title: 'a', description: '<i>' })).toMatch(/< or >/)
    expect(uploadProblem({ title: 'a', description: 'x'.repeat(5001) })).toMatch(/5000/)
    expect(uploadProblem({ title: 'a', tags: Array(31).fill('t') })).toMatch(/30 tags/)
    expect(uploadProblem({ title: 'a', tags: ['a,b'] })).toMatch(/tag/)
  })
  it('knows what a Short needs and what an upload costs', () => {
    const p = { duration_ms: 30_000, width: 1080, height: 1920, has_audio: true, has_video: true }
    expect(shortsProblem(p)).toBeNull()
    expect(shortsProblem({ ...p, width: 1920, height: 1080 })).toMatch(/square or tall/)
    expect(shortsProblem({ ...p, duration_ms: 181_000 })).toMatch(/3 minutes/)
    expect(shortsProblem(undefined)).toBeNull()
    expect(DAILY_UPLOADS).toBe(100)
  })
})

describe('captions', () => {
  const cue = (s: number, e: number, t = 'hi') => ({ start_ms: s, end_ms: e, text: t })
  it('checks the cues like the engine', () => {
    expect(cuesProblem([cue(0, 1000), cue(500, 2000)])).toBeNull()
    expect(cuesProblem([cue(1000, 1000)])).toMatch(/Caption 1 ends before/)
    expect(cuesProblem([cue(0, 1000, '  ')])).toMatch(/1 to 300/)
    expect(cuesProblem([cue(0, 1000, 'a\u0007')])).toMatch(/character/)
    expect(cuesProblem([cue(0, 1000, 'a\n\nb')])).toMatch(/character/)
    expect(cuesProblem([cue(5000, 6000), cue(1000, 2000)])).toMatch(/Caption 2 starts before/)
    expect(cuesProblem([cue(0, 25 * 3_600_000)])).toMatch(/24 hours/)
    // Whole milliseconds, not before 0: an .srt can't hold anything else.
    expect(cuesProblem([cue(-1000, 1000)])).toMatch(/whole milliseconds/)
    expect(cuesProblem([cue(0.5, 1000)])).toMatch(/whole milliseconds/)
    expect(cuesProblem([cue(0, 1000.5)])).toMatch(/whole milliseconds/)
    expect(cuesProblem([cue(0, 1)])).toBeNull()
    expect(cuesProblem([cue(0, 1000, 'two\nlines')])).toBeNull()
  })
  it('writes an .srt the engine reads back', () => {
    expect(renderSrt([cue(0, 1500, 'Hello'), cue(1500, 3_661_250, 'Two\nlines')])).toBe(
      '1\n00:00:00,000 --> 00:00:01,500\nHello\n\n2\n00:00:01,500 --> 01:01:01,250\nTwo\nlines\n\n',
    )
    expect(renderSrt([])).toBe('')
  })
})

describe('times and sizes', () => {
  it('reads and writes a clock', () => {
    expect(parseClock('1:02.5')).toBe(62_500)
    expect(parseClock('62.5')).toBe(62_500)
    expect(parseClock('0:00:01.250')).toBe(1250)
    expect(parseClock('1:02,500')).toBe(62_500)
    expect(parseClock('1:75')).toBeNull()
    expect(parseClock('abc')).toBeNull()
    expect(parseClock('')).toBeNull()
    expect(parseClock('-1')).toBeNull()
    for (const ms of [0, 999, 1000, 62_500, 3_661_250]) expect(parseClock(clock(ms))).toBe(ms)
    expect(clock(62_500)).toBe('1:02.500')
  })
  it('shows lengths and sizes plainly', () => {
    expect(clipLength(62_000)).toBe('1:02')
    expect(clipLength(3_661_000)).toBe('1:01:01')
    expect(clipLength(null)).toBe('–')
    expect(clipSize(500)).toBe('500\u00a0B')
    expect(clipSize(1536)).toBe('1.5\u00a0KB')
    expect(clipSize(150 * 1024 * 1024)).toBe('150\u00a0MB')
  })
  it('knows a job that is still going', () => {
    expect(jobActive({ state: 'queued' })).toBe(true)
    expect(jobActive({ state: 'running' })).toBe(true)
    for (const state of ['done', 'failed', 'cancelled'] as const)
      expect(jobActive({ state })).toBe(false)
  })

  it('counts a description in bytes like the engine, with room for the Shorts tag', () => {
    // 2,000 three-byte characters are 6,000 bytes: over, though only 2,000 UTF-16 units.
    expect(uploadProblem({ title: 'x', description: '€'.repeat(2000) })).toMatch(/description/)
    expect(uploadProblem({ title: 'x', description: 'x'.repeat(5000) })).toBeNull()
    expect(uploadProblem({ title: 'x', description: 'x'.repeat(4995), shorts: true })).toMatch(
      /description/,
    )
    expect(uploadProblem({ title: 'x', description: 'x'.repeat(4980), shorts: true })).toBeNull()
    expect(
      uploadProblem({ title: 'x #shorts', description: 'x'.repeat(4995), shorts: true }),
    ).toBeNull()
  })
})
