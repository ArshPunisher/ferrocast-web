import { describe, expect, it } from 'vitest'
import type { Media } from '@ferrocast/api'
import { previewMediaUrl } from './media-url'

const client = { mediaUrl: (id: string) => `http://127.0.0.1:1/api/v1/media/${id}?session=s` }
const file = (id: string, url: string): Media =>
  ({ id, kind: 'image', name: 'Doodle.png', bytes: 1, url }) as Media

describe('previewMediaUrl', () => {
  it('sends the session for engine files (their url alone answers 401)', () => {
    expect(previewMediaUrl(client, [file('m1', '/api/v1/media/m1')], 'm1')).toBe(
      'http://127.0.0.1:1/api/v1/media/m1?session=s',
    )
  })

  it('uses inline demo files as they are', () => {
    expect(previewMediaUrl(client, [file('m1', 'data:image/png;base64,AA')], 'm1')).toBe(
      'data:image/png;base64,AA',
    )
  })

  it('still asks the engine for a file the list hasn’t loaded yet', () => {
    expect(previewMediaUrl(client, null, 'm2')).toBe(client.mediaUrl('m2'))
    expect(previewMediaUrl(client, [], null)).toBeNull()
  })
})
