// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineAudio, EngineLevel, StudioSettings } from '@ferrocast/api'
import type { EngineApi } from './common'
import { Meter } from './mixer'
import { useLevelFeed } from './meter-feed'
import { useLive } from '../../../lib/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom has no modal dialog.
HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open')
}

const mic = (over: Partial<EngineAudio> = {}): EngineAudio => ({
  name: 'Mic',
  kind: 'coreaudio_input_capture',
  channel: null,
  volume_db: 0,
  muted: false,
  monitor: 'off',
  balance: 0.5,
  sync_ms: 0,
  mono: false,
  tracks: [1],
  active: true,
  ...over,
})

const setAudio = vi.fn(async () => undefined)
let audioNow: EngineAudio = mic()
// One object, as the real hook gives: a new one every render would reload the list for ever.
const desk = {
  scene: 'Main',
  pictureScenes: [{ name: 'Main' }],
  prefs: { data: { hotkeys: { 'push_to_talk:Mic': 'Alt+Space' } } as unknown as StudioSettings },
  api: { audio: async () => [audioNow], setAudio },
}
vi.mock('./common', async (orig) => ({
  ...(await orig<typeof import('./common')>()),
  useDesk: () => desk,
}))

import { AdvancedAudio } from './advanced-audio'

let root: Root | null = null
let host: HTMLElement

beforeEach(() => {
  host = document.body.appendChild(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  host.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
  useLive.setState({ conn: null })
})

async function mountAdvanced() {
  useLive.setState({ conn: { client: { request: vi.fn() } } as never })
  root = createRoot(host)
  await act(async () => root!.render(<AdvancedAudio focus="" onClose={() => {}} />))
  await act(async () => {
    for (let i = 0; i < 40 && !document.querySelector('[id^="adv-audio-"]'); i++)
      await new Promise((r) => setTimeout(r, 25))
  })
}

describe('push to talk and push to mute in Advanced audio', () => {
  it('are two switches per sound; turning one on sends it, and then its delay and key show', async () => {
    audioNow = mic()
    await mountAdvanced()
    const talk = document.querySelector('[aria-label="Push to talk for Mic"]') as HTMLElement | null
    const mute = document.querySelector('[aria-label="Push to mute for Mic"]')
    expect(talk).not.toBeNull()
    expect(mute).not.toBeNull()
    expect(document.querySelector('input[name="push_to_talk_ms"]')).toBeNull()
    await act(async () => talk!.click())
    expect(setAudio).toHaveBeenCalledWith('Mic', { push_to_talk: true })
    // On: its delay box and its key appear.
    const delay = document.querySelector('input[name="push_to_talk_ms"]') as HTMLInputElement
    expect(delay).not.toBeNull()
    expect(document.body.textContent).toContain('Key: ')
    delay.value = '250'
    await act(async () => {
      delay.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      delay.blur()
    })
  })

  it('a delay over 5 s is sent as 5000', async () => {
    audioNow = mic({ push_to_talk: true, push_to_talk_ms: 150 })
    await mountAdvanced()
    const delay = document.querySelector('input[name="push_to_talk_ms"]') as HTMLInputElement
    expect(delay.defaultValue).toBe('150')
    expect(document.body.textContent).toContain('Alt')
    delay.focus()
    delay.value = '99999'
    await act(async () => delay.blur())
    expect(setAudio).toHaveBeenCalledWith('Mic', { push_to_talk_ms: 5000 })
  })
})

describe('the meter while a push key holds the sound muted', () => {
  it('goes dim, and back', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'performance', 'requestAnimationFrame'],
    })
    let gated = true
    const api = {
      levels: vi.fn(async () => ({
        Mic: { peak: [-20, -20], magnitude: [-22, -22], gated } as EngineLevel,
      })),
    } as unknown as EngineApi
    function Probe() {
      const feed = useLevelFeed(api, ['Mic'])
      return (
        <Meter
          feed={feed}
          feedName="Mic"
          muted={false}
          volumeDb={0}
          label="Mic volume"
          onVolume={() => undefined}
        />
      )
    }
    root = createRoot(host)
    await act(async () => root!.render(<Probe />))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    const zone = () => host.querySelector<HTMLElement>('div[aria-hidden][style*="gradient"]')!
    expect(zone().style.opacity).toBe('0.35')
    gated = false
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(zone().style.opacity).toBe('')
  })

  it('has a "This is a mic" switch per sound that sends the owner\'s word', async () => {
    audioNow = mic({ mic: false })
    await mountAdvanced()
    const sw = document.querySelector('[aria-label="This is a mic: Mic"]') as HTMLElement | null
    expect(sw).not.toBeNull()
    await act(async () => sw!.click())
    expect(setAudio).toHaveBeenCalledWith('Mic', { mic: true })
  })

  it('lays the six track buttons three by two on a phone and in one row from "sm" up', async () => {
    audioNow = mic({ tracks: [1, 2] })
    await mountAdvanced()
    const group = document.querySelector('[aria-label="Audio tracks for Mic"]') as HTMLElement
    const buttons = group.querySelector('span:not(.sr-only):last-child') as HTMLElement
    expect(buttons.querySelectorAll('button')).toHaveLength(6)
    expect(buttons.className).toContain('grid-cols-3')
    expect(buttons.className).toContain('sm:flex')
    expect(buttons.className).toContain('min-w-0')
  })

  it('lets the sound row grow with its push rows instead of a fixed height', async () => {
    audioNow = mic({ push_to_talk: true, push_to_talk_ms: 150 })
    await mountAdvanced()
    const row = document.querySelector('[id^="adv-audio-"]') as HTMLElement
    // A fixed row height made Push to talk, Push to mute and the rest spill onto the next sound.
    expect(row.className).not.toMatch(/(^|\s)min-\[1100px\]:h-10(\s|$)/)
    expect(row.className).toContain('min-[1100px]:min-h-10')
  })
})
