import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { StudioSettings } from '@ferrocast/api'
import {
  PicturePage,
  RecordPage,
  StreamPage,
  encoderChoice,
  recordChoice,
  recordSizes,
  replayCapMb,
  streamQuality,
} from './settings'

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

describe('the canvas cards', () => {
  async function showPicture(initial: StudioSettings) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root?.render(<PicturePage s={initial} set={() => {}} />))
  }

  it('a preset size picks its card, and only it', async () => {
    await showPicture(mk({ width: 2560, height: 1440 }))
    expect(picked('Canvas size')).toEqual(['2560×1440'])
  })

  it('a size that is no card picks "Your own", with its size', async () => {
    await showPicture(mk({ width: 2000, height: 1000 }))
    expect(picked('Canvas size')).toEqual(['Your own'])
    expect(cards('Canvas size')).toHaveLength(5)
    expect(host?.textContent).toContain('2000×1000')
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

describe('the engine-backed settings', () => {
  async function showRecord(initial: StudioSettings) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root?.render(<RecordPage s={initial} set={() => {}} />))
  }

  it('keeps the profile, the B-frames switch and an Auto keyframe', async () => {
    await show(mk({}))
    expect(host?.querySelector('[aria-label="B-frames"]')).not.toBeNull()
    expect(host?.querySelector('[aria-label="Profile"]')).not.toBeNull()
    const keyframe = host?.querySelector('[aria-label="Keyframe every"]') as HTMLSelectElement
    expect(Array.from(keyframe.options).map((o) => o.value)).toContain('0')
    expect(Array.from(keyframe.options).find((o) => o.value === '0')?.text).toMatch(/Auto/)
  })

  it('shows the Balanced recording tier, picked when it is the quality', async () => {
    await showRecord(mk({ record_quality: 'balanced' }))
    expect(cards('Recording quality')).toHaveLength(5)
    expect(picked('Recording quality')).toEqual(['Balanced'])
    expect(recordChoice('balanced')).toBe('balanced')
    const s = recordSizes({ video_kbps: 6000, audio_kbps: 160, width: 2560, height: 1440, fps: 60 })
    expect(s.balanced).toBeCloseTo(s.high / 2, 6)
  })

  it('shows the replay buffer memory cap: 512 MB unless one is set', async () => {
    expect(replayCapMb(mk({}))).toBe(512)
    expect(replayCapMb(mk({ replay_mb: 0 }))).toBe(512)
    expect(replayCapMb(mk({ replay_mb: 2048 }))).toBe(2048)
    await showRecord(mk({ replay_mb: 0 }))
    const box = host?.querySelector('[aria-label="Replay buffer memory"]') as HTMLInputElement
    expect(box).not.toBeNull()
    expect(box.value).toBe('512')
  })
})

describe('the B-frames switch', () => {
  it('is in More options, off until switched on, with its words behind an (i)', async () => {
    await show(mk({ b_frames: false }))
    const sw = host?.querySelector<HTMLElement>('[aria-label="B-frames"]')
    expect(sw).not.toBeNull()
    expect(sw?.closest('details')).not.toBeNull()
    expect((sw as HTMLInputElement).checked || sw?.getAttribute('aria-checked') === 'true').toBe(
      false,
    )
    // The explanation sits behind the (i), not on the row's own line.
    expect(host?.querySelector('[aria-label="About b-frames"]')).not.toBeNull()
    await act(async () => sw?.click())
    const again = host?.querySelector<HTMLElement>('[aria-label="B-frames"]')
    expect(
      (again as HTMLInputElement).checked || again?.getAttribute('aria-checked') === 'true',
    ).toBe(true)
  })
})

describe('Stream quality bitrate cap note (U2)', () => {
  const capDests = [
    {
      id: 'twitch',
      kind: 'twitch' as const,
      canvas: 'main' as const,
      name: 'Twitch',
      account: 'arsh',
      enabled: true,
      connected: true,
      health: null,
      blocked: null,
      rules: [],
    },
    {
      id: 'youtube',
      kind: 'youtube' as const,
      canvas: 'main' as const,
      name: 'YouTube',
      account: 'arsh',
      enabled: true,
      connected: true,
      health: null,
      blocked: null,
      rules: [],
    },
  ]

  it('shows offline vs live effective-rate wording and suppresses note under ignoreServiceLimits', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root?.render(
        <StreamPage s={mk({ video_kbps: 12000 })} set={() => {}} destinations={capDests} />,
      ),
    )
    expect(host?.textContent).toContain(
      'Will send 6.0 Mbps. Twitch takes at most 6 Mbps, and every place gets the same picture. Turn Twitch off to send 12 Mbps.',
    )

    await act(async () =>
      root?.render(
        <StreamPage s={mk({ video_kbps: 12000 })} set={() => {}} destinations={capDests} live />,
      ),
    )
    expect(host?.textContent).toContain(
      'Sending 6.0 Mbps on this stream; turning Twitch off applies from your next stream.',
    )

    await act(async () =>
      root?.render(
        <StreamPage
          s={mk({ video_kbps: 12000 })}
          set={() => {}}
          destinations={capDests}
          ignoreServiceLimits
        />,
      ),
    )
    expect(host?.textContent).not.toContain('Twitch takes at most')
    expect(host?.textContent).not.toContain('Will send 6.0 Mbps')
  })
})
