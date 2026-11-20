import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { StudioSettings } from '@ferrocast/api'
import { StreamPage, encoderChoice, recordChoice, streamQuality } from './settings'

vi.mock('./common', async (orig) => ({
  ...(await orig<typeof import('./common')>()),
  useDesk: () => ({ kinds: { data: { encoders: [] } }, api: {} }),
}))

vi.mock('../../../lib/hooks', async (orig) => ({
  ...(await orig<typeof import('../../../lib/hooks')>()),
  useResource: () => ({ data: null, error: null, loading: false, reload: () => {} }),
}))

let root: Root | null = null
let host: HTMLElement | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const base = {
  width: 1920,
  height: 1080,
  fps: 60,
  video_kbps: 6000,
  scale: null,
  encoder: 'hardware',
}
const mk = (over: Partial<StudioSettings>) => ({ ...base, ...over }) as unknown as StudioSettings

async function show(initial: StudioSettings) {
  let save: (p: Partial<StudioSettings>) => void = () => {}
  function Host() {
    const [s, setS] = useState(initial)
    save = (p) => setS((d) => ({ ...d, ...p }))
    return <StreamPage s={s} set={(p) => setS((d) => ({ ...d, ...p }))} />
  }
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root?.render(<Host />))
  return { save: (p: Partial<StudioSettings>) => act(async () => save(p)) }
}

const cards = (group: string) =>
  Array.from(
    host?.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`) ?? [],
  )
const picked = (group: string) =>
  cards(group)
    .filter((c) => c.getAttribute('aria-checked') === 'true')
    .map((c) => c.querySelector('b')?.textContent)

describe('the stream quality cards', () => {
  it('a preset match picks that card, and only it', async () => {
    await show(mk({ video_kbps: 4500, scale: [1280, 720] }))
    expect(cards('Stream quality')).toHaveLength(4)
    expect(picked('Stream quality')).toEqual(['Smooth'])
    expect(host?.textContent).not.toContain('Your own:')
  })

  it('custom values pick "Your own", with its numbers; clicking it opens More options', async () => {
    await show(mk({ video_kbps: 13500, scale: [2560, 1440] }))
    expect(picked('Stream quality')).toEqual(['Your own'])
    const own = cards('Stream quality')[3] as HTMLElement
    expect(own.textContent).toContain('1440p · 60 fps · 13.5 Mbps')
    const more = host?.querySelector('details') as HTMLDetailsElement
    expect(more.open).toBe(false)
    await act(async () => own.click())
    expect((host?.querySelector('details') as HTMLDetailsElement).open).toBe(true)
  })

  it('the pick follows a save or "Set up for me" (new values), always exactly one', async () => {
    const view = await show(mk({ video_kbps: 13500 }))
    expect(picked('Stream quality')).toEqual(['Your own'])
    await view.save({ video_kbps: 6000, scale: null })
    expect(picked('Stream quality')).toEqual(['Sharp'])
    await view.save({ video_kbps: 12000 })
    expect(picked('Stream quality')).toEqual(['Max'])
    // The same bitrate at another sent size is not the preset.
    await view.save({ video_kbps: 6000, scale: [1280, 720] })
    expect(picked('Stream quality')).toEqual(['Your own'])
  })

  it('is a radio group: aria-checked, and the arrow keys move the pick', async () => {
    await show(mk({ video_kbps: 6000 }))
    const group = host?.querySelector(
      '[role="radiogroup"][aria-label="Stream quality"]',
    ) as HTMLElement
    const sharp = cards('Stream quality')[1] as HTMLElement
    sharp.focus()
    await act(async () => {
      sharp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(group).toBeTruthy()
    expect(picked('Stream quality')).toEqual(['Max'])
  })

  it('the encoder cards always show one picked', async () => {
    await show(mk({ encoder: 'software' }))
    expect(picked('Encoder')).toEqual(['Software (x264)'])
    expect(encoderChoice('hardware')).toBe('hardware')
    expect(encoderChoice('something else')).toBe('hardware')
    expect(encoderChoice(undefined)).toBe('hardware')
  })
})

describe('the picks', () => {
  it('streamQuality tells presets from your own', () => {
    expect(streamQuality(mk({ video_kbps: 4500, scale: [1280, 720] }))).toBe('smooth')
    expect(streamQuality(mk({ video_kbps: 6000 }))).toBe('sharp')
    expect(streamQuality(mk({ video_kbps: 12000 }))).toBe('max')
    expect(streamQuality(mk({ video_kbps: 13500 }))).toBe('custom')
    // A 720p canvas has nothing to scale: Smooth is its plain 4.5 Mbps.
    expect(streamQuality(mk({ height: 720, width: 1280, video_kbps: 4500 }))).toBe('smooth')
  })

  it('the recording cards always have one picked, an unknown value is "Your own"', () => {
    expect(recordChoice('stream')).toBe('stream')
    expect(recordChoice('lossless')).toBe('lossless')
    expect(recordChoice('custom')).toBe('custom')
    expect(recordChoice('mystery')).toBe('custom')
    expect(recordChoice(null)).toBe('custom')
  })
})
