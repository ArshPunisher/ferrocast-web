import { describe, expect, it } from 'vitest'
import { ENGINE_RECORD_FORMATS, WRITTEN_RECORD_FORMATS, writtenFormat } from '../src/studio-engine'

describe('writtenFormat', () => {
  // The engine's RecordPlan::extension: every format a profile may hold records as one Ferrocore
  // writes (19 Nov: MOV, FLV, TS and HLS were offered, then refused when Record was pressed).
  it('maps every saved format to one Ferrocore writes', () => {
    const got = Object.fromEntries(ENGINE_RECORD_FORMATS.map((f) => [f, writtenFormat(f)]))
    expect(got).toEqual({
      mp4: 'mp4',
      mov: 'mov',
      fmp4: 'mp4',
      fmov: 'mov',
      mkv: 'mkv',
      flv: 'mkv',
      ts: 'mkv',
      hls: 'mkv',
    })
    for (const f of Object.values(got)) expect(WRITTEN_RECORD_FORMATS).toContain(f)
  })

  it('takes a missing format as MP4', () => {
    expect(writtenFormat(undefined)).toBe('mp4')
    expect(writtenFormat(null)).toBe('mp4')
  })
})
