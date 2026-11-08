import { describe, expect, it } from 'vitest'
import { defaultRecordingsFolder, examplePath, hardwareEncoderName, osOf, shortcut } from './os'

describe('the computer the dashboard is on', () => {
  it('reads Windows, a Mac and Linux from the user agent', () => {
    expect(osOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/131')).toBe(
      'windows',
    )
    expect(osOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac')
    expect(osOf('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux')
  })

  it('names things as each one does', () => {
    expect(hardwareEncoderName('windows')).toBe('Graphics card')
    expect(hardwareEncoderName('mac')).toBe('Mac hardware')
    expect(defaultRecordingsFolder('windows')).toBe('Videos › Ferrocast')
    expect(defaultRecordingsFolder('mac')).toBe('Movies › Ferrocast')
    expect(examplePath('Videos', 'Ferrocast', 'windows')).toBe(
      String.raw`C:\Users\you\Videos\Ferrocast`,
    )
    expect(shortcut('Z', true, 'windows')).toBe('Ctrl+Shift+Z')
    expect(shortcut('Z', true, 'mac')).toBe('⇧⌘Z')
  })
})
