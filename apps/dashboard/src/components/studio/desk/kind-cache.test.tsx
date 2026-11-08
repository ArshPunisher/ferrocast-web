import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { type EngineOption } from '@ferrocast/api'
import { cachedForm, forgetForms, readAhead, readDefaults, readForm } from './kind-cache'
import { NoDevices, type Choice } from './add-source'
import { KIND_GROUPS } from './common'

const camList = (names: string[]): EngineOption[] => [
  {
    key: 'video_device_id',
    name: 'Device',
    kind: 'list',
    choices: names,
    values: names.map((n) => `@${n}`),
  } as unknown as EngineOption,
]

/** An engine whose camera list takes a while, like FFmpeg asking DirectShow on Windows. */
function slowEngine(names: string[]) {
  let calls = 0
  let defaultCalls = 0
  const api = {
    options: vi.fn((kind: string) => {
      calls++
      void kind
      return new Promise<EngineOption[]>((r) => setTimeout(() => r(camList(names)), 20))
    }),
    defaults: vi.fn(() => {
      defaultCalls++
      return Promise.resolve({ active: true })
    }),
  }
  return { api, calls: () => calls, defaultCalls: () => defaultCalls }
}

afterEach(forgetForms)

describe('the Add dialog’s kind forms', () => {
  it('shares one read between asks made at once (read ahead + the click)', async () => {
    const e = slowEngine(['Integrated Camera'])
    const [a, b] = await Promise.all([
      readForm(e.api, 'dshow_input'),
      readForm(e.api, 'dshow_input'),
    ])
    expect(e.calls()).toBe(1)
    expect(a).toBe(b)
  })

  it('keeps the last list to show at once, and a fresh read replaces it', async () => {
    const e = slowEngine(['Integrated Camera'])
    expect(cachedForm('dshow_input')).toBeUndefined()
    await readForm(e.api, 'dshow_input')
    expect(cachedForm('dshow_input')?.[0]).toMatchObject({ choices: ['Integrated Camera'] })
    const later = slowEngine(['Integrated Camera', 'Elgato HD60'])
    const fresh = readForm(later.api, 'dshow_input')
    // Still the old list while the new read runs.
    expect(cachedForm('dshow_input')?.[0]).toMatchObject({ choices: ['Integrated Camera'] })
    await fresh
    expect(cachedForm('dshow_input')?.[0]).toMatchObject({
      choices: ['Integrated Camera', 'Elgato HD60'],
    })
  })

  it('reads a kind’s defaults once', async () => {
    const e = slowEngine([])
    await readDefaults(e.api, 'dshow_input')
    await readDefaults(e.api, 'dshow_input')
    expect(e.defaultCalls()).toBe(1)
  })

  it('reads ahead each kind once, however often it’s named', async () => {
    const e = slowEngine(['Cam'])
    readAhead(e.api, ['dshow_input', 'dshow_input', 'wasapi_input_capture'])
    readAhead(e.api, ['dshow_input'])
    await new Promise((r) => setTimeout(r, 40))
    expect(e.api.options).toHaveBeenCalledTimes(2)
    expect(cachedForm('wasapi_input_capture')).toBeDefined()
  })

  it('a failed read leaves the last good list and can be read again', async () => {
    const ok = slowEngine(['Cam'])
    await readForm(ok.api, 'dshow_input')
    const bad = { options: () => Promise.reject(new Error('gone')), defaults: ok.api.defaults }
    await expect(readForm(bad, 'dshow_input')).rejects.toThrow('gone')
    expect(cachedForm('dshow_input')?.[0]).toMatchObject({ choices: ['Cam'] })
    await readForm(ok.api, 'dshow_input')
  })
})

describe('no devices to pick', () => {
  const entry = (key: string) => KIND_GROUPS.flatMap((g) => g.entries).find((e) => e.key === key)!
  const choice = (key: string): Choice => ({ entry: entry(key), kind: 'dshow_input', tone: '#fff' })

  it('says what is missing and what to try, with a way to look again', () => {
    const html = renderToStaticMarkup(
      <NoDevices c={choice('camera')} checking={false} onLook={() => undefined} />,
    )
    expect(html).toContain('No camera found')
    expect(html).toContain('Close other apps using it')
    expect(html).toContain('Look again')
    expect(html).toContain('role="status"')
    // Not a settings form any more.
    expect(html).not.toContain('Settings')
  })

  it('has its own words for each kind that lists devices', () => {
    for (const [key, title] of [
      ['card', 'No capture card found'],
      ['screen', 'No screens to show'],
      ['window', 'No windows to show'],
      ['mic', 'No microphone found'],
    ] as const) {
      const html = renderToStaticMarkup(
        <NoDevices c={choice(key)} checking={false} onLook={() => undefined} />,
      )
      expect(html).toContain(title)
    }
  })
})
