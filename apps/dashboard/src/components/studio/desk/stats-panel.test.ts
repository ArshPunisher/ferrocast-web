import { describe, expect, it } from 'vitest'
import { droppedText, encoderName, share } from './stats-panel'

describe('the Stats panel', () => {
  it('names the encoder as people know it', () => {
    expect(encoderName('h264_nvenc')).toBe('NVIDIA graphics card')
    expect(encoderName('h264_qsv')).toBe('Intel graphics')
    expect(encoderName('libx264')).toBe('Software (x264)')
    expect(encoderName('VideoToolbox')).toBe('Mac hardware')
    expect(encoderName('h264_something_new')).toBe('h264_something_new')
  })

  it('says shares and drops in numbers people read', () => {
    expect(share(0, 0)).toBeTruthy()
    expect(droppedText(0, 100)).toBeTruthy()
  })
})
