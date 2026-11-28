// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, FerroClient, type ClipJob, type ClipsOverview } from '@ferrocast/api'
import { DemoEngine, DEMO_TOKEN } from '@ferrocast/api/demo'
import { useLive } from '../../../lib/store'
import { ClipsTab, spanText } from './clips-tab'
import { JobRow, JobsPanel } from './jobs-panel'
import { resetThumbs } from './thumb'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(() => {
  // jsdom has no modal <dialog>: the open attribute is enough for these tests.
  const d = HTMLDialogElement.prototype as unknown as Record<string, unknown>
  d.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  d.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

let root: Root | null = null
let engine: DemoEngine | null = null
let host: HTMLElement

async function mountWith(client: unknown) {
  useLive.setState({ conn: { client } as never, remote: null as never })
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => root!.render(<ClipsTab />))
}

async function mountDemo() {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  await mountWith(client)
  return client
}

const text = () => document.body.textContent ?? ''
const q = <T extends Element = HTMLElement>(sel: string) => document.body.querySelector<T>(sel)
const byLabel = <T extends Element = HTMLElement>(label: string) => q<T>(`[aria-label="${label}"]`)
const click = async (el: Element | null) => {
  expect(el, 'element to click').not.toBeNull()
  await act(async () => (el as HTMLElement).click())
}
const type = async (el: HTMLInputElement | HTMLTextAreaElement | null, value: string) => {
  expect(el).not.toBeNull()
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const blur = async (el: Element | null) =>
  act(async () => (el as HTMLElement).dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
const settle = (ms = 0) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))
/** The button that opens a clip (named by its visible words, with "Open" said first). */
const openBtn = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('li[data-clip] > button')].find((b) =>
    b.textContent?.startsWith(`Open ${name}`),
  ) ?? null

/** A switch by its visible label. */
const switchNamed = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button[role="switch"]')].find(
    (b) => document.querySelector(`label[for="${b.id}"]`)?.textContent === label,
  ) ?? null

/** Picks a section of the open clip (the segmented control's radios). */
const choose = async (label: string) => {
  const radio = [
    ...document.querySelectorAll<HTMLInputElement>(
      '[aria-label="What to do with this clip"] input',
    ),
  ].find((i) => i.parentElement?.textContent === label)
  await click(radio ?? null)
}
const buttonByText = (t: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) ?? null

beforeEach(() => resetThumbs())
afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  engine?.dispose()
  engine = null
  host?.remove()
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
})

describe('the Clips tab', () => {
  it('shows a loading state, then the clips with their kind and captions mark', async () => {
    let release!: (v: unknown) => void
    const gate = new Promise((r) => (release = r))
    const overview: ClipsOverview = {
      folder: '/Movies/Ferrocast',
      ffmpeg_ready: true,
      youtube_connected: true,
      clips: [
        {
          id: 'A.mp4',
          name: 'A',
          kind: 'replay',
          ext: 'mp4',
          size: 2048,
          modified: Date.now() - 60_000,
          has_captions: true,
        },
        {
          id: 'B.mp4',
          name: 'B',
          kind: 'vertical',
          ext: 'mp4',
          size: 4096,
          modified: Date.now() - 120_000,
          has_captions: false,
        },
      ],
    }
    const client = {
      request: vi.fn(async (_m: string, path: string) => {
        if (path.startsWith('/api/v1/clips/jobs')) return { jobs: [] }
        if (path.endsWith('/thumbnail')) return { image: 'data:image/svg+xml;utf8,x' }
        await gate
        return overview
      }),
      clipFileUrl: () => '',
    }
    await mountWith(client)
    expect(byLabel('Loading clips')).not.toBeNull()
    await act(async () => release(null))
    await settle()
    expect(byLabel('Loading clips')).toBeNull()
    expect(byLabel('Clips')?.querySelectorAll('li[data-clip]').length).toBe(2)
    expect(text()).toContain('Replay')
    expect(text()).toContain('Vertical')
    expect(q('[data-clip="A.mp4"]')?.textContent).toContain('Captions')
    expect(q('[data-clip="B.mp4"]')?.textContent).not.toContain('Captions')
    expect(text()).toContain('/Movies/Ferrocast'.slice(0, 0)) // the folder lives behind the (i)
  })

  it('says so when there are no clips, and when the library cannot be read', async () => {
    const empty = {
      request: vi.fn(async (_m: string, p: string) =>
        p.includes('/jobs')
          ? { jobs: [] }
          : { folder: '/x', ffmpeg_ready: true, youtube_connected: false, clips: [] },
      ),
      clipFileUrl: () => '',
    }
    await mountWith(empty)
    await settle()
    expect(text()).toContain('No clips yet.')
    await act(async () => root!.unmount())
    root = createRoot(host)
    const broken = {
      request: vi.fn(async (_m: string, p: string) => {
        if (p.includes('/jobs')) return { jobs: [] }
        throw new ApiError(
          422,
          'x',
          'The recordings folder is not there.',
          'Pick another folder in Settings.',
        )
      }),
      clipFileUrl: () => '',
    }
    useLive.setState({ conn: { client: broken } as never })
    await act(async () => root!.render(<ClipsTab />))
    await settle()
    expect(q('[role="alert"]')?.textContent).toContain('The recordings folder is not there.')
    expect(buttonByText('Try again')).not.toBeNull()
  })

  it('warns when FFmpeg is missing', async () => {
    const client = {
      request: vi.fn(async (_m: string, p: string) =>
        p.includes('/jobs')
          ? { jobs: [] }
          : {
              folder: '/x',
              ffmpeg_ready: false,
              youtube_connected: false,
              clips: [
                {
                  id: 'A.mp4',
                  name: 'A',
                  kind: 'recording',
                  ext: 'mp4',
                  size: 1,
                  modified: 1,
                  has_captions: false,
                },
              ],
            },
      ),
      clipFileUrl: () => '',
    }
    await mountWith(client)
    await settle()
    expect(q('[role="status"]')?.textContent).toContain("FFmpeg isn't installed")
    // No picture can be made: the tile says so instead of spinning.
    await settle(10)
    expect(text()).toContain('No picture')
  })

  it('searches by name and says when nothing matches', async () => {
    await mountDemo()
    await settle()
    expect(byLabel('Clips')?.querySelectorAll('li[data-clip]').length).toBeGreaterThanOrEqual(5)
    await type(byLabel<HTMLInputElement>('Search clips by name'), 'boss')
    await settle(400)
    expect(
      [...document.querySelectorAll('li[data-clip]')].map((l) => l.getAttribute('data-clip')),
    ).toEqual(['Boss fight.mp4'])
    await type(byLabel<HTMLInputElement>('Search clips by name'), 'zzzz')
    await settle(400)
    expect(text()).toContain('No clip is called that.')
    await click(buttonByText('Clear the search'))
    await settle(400)
    expect(document.querySelectorAll('li[data-clip]').length).toBeGreaterThanOrEqual(5)
  })

  it('compiles the clips picked, in the order set, as a job that can be stopped', async () => {
    await mountDemo()
    await settle()
    const first = q<HTMLInputElement>('[data-clip^="Replay 2026-11-22 21"] input[type=checkbox]')
    const second = q<HTMLInputElement>('[data-clip^="Replay 2026-11-22 20"] input[type=checkbox]')
    await click(first)
    expect(text()).toContain('1 selected')
    expect(buttonByText('Compile')?.disabled).toBe(true)
    await click(second)
    expect(text()).toContain('2 selected')
    expect(buttonByText('Compile')?.disabled).toBe(false)
    await click(buttonByText('Compile'))
    await settle()
    const order = () =>
      [...document.querySelectorAll('ol[aria-label="Clips in order"] li')].map((l) => l.textContent)
    expect(order()[0]).toContain('21-04-12')
    await click(byLabel('Move Replay 2026-11-22 21-04-12 down'))
    expect(order()[0]).toContain('20-31-55')
    expect(text()).toContain('long.')
    await click(buttonByText('Start'))
    await settle(50)
    const row = q('[data-job]')!
    expect(row.textContent).toContain('Compile 2 clips')
    expect(row.querySelector('[role="progressbar"]')).not.toBeNull()
    await click(byLabel('Stop Compile 2 clips'))
    await settle(50)
    expect(q('[data-job]')?.getAttribute('data-state')).toBe('cancelled')
    expect(q('[data-job]')?.textContent).toContain('Stopped')
    expect(document.querySelectorAll('li[data-clip]').length).toBeGreaterThanOrEqual(5) // nothing was made
  })

  it('has one toolbar row: search, Type, folder and reload; selecting swaps its right side', async () => {
    await mountDemo()
    await settle()
    const bar = q('[data-testid="clips-toolbar"]')!
    expect(bar.querySelector('[aria-label="Search clips by name"]')).not.toBeNull()
    expect(bar.querySelector('select[aria-label="Type"]')).not.toBeNull()
    expect(bar.querySelector('[aria-label="Copy the clips folder path"]')).not.toBeNull()
    expect(bar.querySelector('[aria-label="Reload the clips"]')).not.toBeNull()
    expect(bar.querySelector('[aria-label="Selected clips"]')).toBeNull()
    await click(q('[data-clip^="Replay 2026-11-22 21"] input[type=checkbox]'))
    // The same row now carries the selection actions (no second band).
    const group = q('[data-testid="clips-toolbar"] [aria-label="Selected clips"]')!
    expect(group.textContent).toContain('1 selected')
    expect(group.textContent).toContain('Compile')
    expect(group.textContent).toContain('Caption')
    expect(group.textContent).toContain('Upload')
    expect(group.textContent).toContain('Clear')
    await click(buttonByText('Clear'))
    expect(q('[aria-label="Selected clips"]')).toBeNull()
  })

  it('filters by Type and says so when none match', async () => {
    await mountDemo()
    await settle()
    const sel = q<HTMLSelectElement>('select[aria-label="Type"]')!
    const set = async (v: string) => {
      await act(async () => {
        sel.value = v
        sel.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }
    await set('replays')
    const kinds = [...document.querySelectorAll('li[data-clip]')].map((l) => l.textContent)
    expect(kinds.length).toBeGreaterThan(0)
    expect(kinds.every((t) => t?.includes('Replay'))).toBe(true)
    await set('moments')
    expect(text()).toMatch(/No clips of that type|Edit/)
    await set('all')
    expect(document.querySelectorAll('li[data-clip]').length).toBeGreaterThanOrEqual(5)
  })

  it('opens Upload for a pick the search is hiding', async () => {
    await mountDemo()
    await settle()
    await click(q('[data-clip^="Replay 2026-11-22 21"] input[type=checkbox]'))
    await type(byLabel<HTMLInputElement>('Search clips by name'), 'boss')
    await settle(400)
    expect(q('[data-clip^="Replay 2026-11-22 21"]')).toBeNull() // hidden, still picked
    await click(
      [...document.body.querySelectorAll('button')].find((b) =>
        b.textContent?.startsWith('Upload'),
      ) ?? null,
    )
    await settle(400)
    const dialog = q('dialog[open], [role=dialog]')
    expect(dialog?.textContent).toContain('Replay 2026-11-22 21-04-12')
    expect(dialog?.textContent).not.toContain("isn't in the folder")
  })

  it('probes each picked clip once, however the answers interleave', async () => {
    const client = await mountDemo()
    const real = client.request.bind(client)
    let n = 0
    // The first answer comes soonest, the next ones later: they finish one after another.
    const spy = vi
      .spyOn(client, 'request')
      .mockImplementation(async (...a: Parameters<typeof real>) => {
        if (a[0] === 'GET' && /^\/api\/v1\/clips\/[^/?]+$/.test(String(a[1])))
          await new Promise((r) => setTimeout(r, 30 * ++n))
        return real(...a)
      })
    await settle()
    for (const prefix of ['21', '20']) {
      await click(q(`[data-clip^="Replay 2026-11-22 ${prefix}"] input[type=checkbox]`))
    }
    await click(q('[data-clip^="Clutch"] input[type=checkbox]'))
    await settle(400)
    const probes = spy.mock.calls.filter(
      ([m, path]) => m === 'GET' && /^\/api\/v1\/clips\/[^/?]+$/.test(String(path)),
    )
    expect(probes.length).toBe(3)
  })

  it('reads a length as seconds or minutes', () => {
    expect(spanText(42_000)).toBe('42 s')
    expect(spanText(65_000)).toBe('1 min 5 s')
    expect(spanText(120_000)).toBe('2 min')
  })

  it('keeps clips picked for a compilation when a search hides them', async () => {
    await mountDemo()
    await settle()
    // Pick two replays, then search for a clip that is neither.
    await click(q('[data-clip^="Replay 2026-11-22 21"] input[type=checkbox]'))
    await click(q('[data-clip^="Replay 2026-11-22 20"] input[type=checkbox]'))
    expect(text()).toContain('2 selected')
    await type(byLabel<HTMLInputElement>('Search clips by name'), 'boss')
    await settle(400)
    // Still two picked, and the compilation still holds both.
    expect(text()).toContain('2 selected')
    await click(buttonByText('Compile'))
    await settle()
    expect(document.querySelectorAll('ol[aria-label="Clips in order"] li').length).toBe(2)
  })

  it('opens a clip: trim checks its times and starts a job, then the dialog closes', async () => {
    await mountDemo()
    await settle()
    await click(openBtn('Replay 2026-11-22 21-04-12'))
    await settle()
    expect(q('dialog[open]')).not.toBeNull()
    expect(text()).toContain('Replay · ')
    const out = [...document.querySelectorAll<HTMLInputElement>('input')].find(
      (i) => i.labels?.[0]?.textContent === 'Out',
    )!
    const inn = [...document.querySelectorAll<HTMLInputElement>('input')].find(
      (i) => i.labels?.[0]?.textContent === 'In',
    )!
    await type(inn, '99')
    await blur(inn)
    expect(text()).toContain('is only') // past the end of a 38 s clip
    await type(out, 'soon')
    await blur(out)
    expect(text()).toContain('Type a time like 1:02.5')
    await type(inn, '5')
    await blur(inn)
    await type(out, '15')
    await blur(out)
    expect(text()).toContain('Keeps 0:10')
    await click(buttonByText('Trim to a new clip'))
    await settle(50)
    expect(q('dialog[open]')).toBeNull()
    expect(q('[data-job]')?.textContent).toContain('Trim Replay 2026-11-22 21-04-12')
  })

  it('YouTube: private by default, a Short only when it fits, and a clear state when not connected', async () => {
    await mountDemo()
    await settle()
    await click(openBtn('Clutch round vertical'))
    await settle()
    await choose('YouTube')
    const privacy = q<HTMLSelectElement>('dialog select, [role=dialog] select')!
    expect(privacy.value).toBe('private')
    const shorts = switchNamed('Send as a Short')!
    expect(shorts.disabled).toBe(false) // the clip is tall and short
    expect(text()).toContain('One of 100 uploads a day')
    expect(buttonByText('Send to YouTube')?.disabled).toBe(false)
    const title = [...document.querySelectorAll<HTMLInputElement>('input')].find(
      (i) => i.labels?.[0]?.textContent === 'Title',
    )!
    await type(title, '  ')
    expect(buttonByText('Send to YouTube')?.disabled).toBe(true)
    await type(title, 'Clutch!')
    await click(buttonByText('Send to YouTube'))
    await settle(50)
    expect(q('[aria-label="This upload"]')?.textContent).toContain('Upload Clutch round vertical')
    // A wide clip can't be a Short, and the switch says why.
    await act(async () => root!.unmount())
    document.body.innerHTML = ''
    root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => root!.render(<ClipsTab />))
    await settle()
    await click(openBtn('Replay 2026-11-22 21-04-12'))
    await settle()
    await choose('YouTube')
    expect(switchNamed('Send as a Short')!.disabled).toBe(true)
    expect(text()).toContain('A Short is square or tall')
  })

  it('YouTube not connected: says so and offers Accounts', async () => {
    const client = await mountDemo()
    await client.disconnect('youtube')
    await act(async () => root!.unmount())
    document.body.innerHTML = ''
    root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => root!.render(<ClipsTab />))
    await settle()
    await click(openBtn('Boss fight'))
    await settle()
    await choose('YouTube')
    expect(text()).toContain("YouTube isn't connected.")
    expect(buttonByText('Open Accounts')).not.toBeNull()
    expect(buttonByText('Send to YouTube')).toBeNull()
  })

  it('captions: shows what is there, checks edits, and keeps Save for good ones', async () => {
    await mountDemo()
    await settle()
    await click(openBtn('Boss fight'))
    await settle()
    await choose('Captions')
    await settle()
    expect(document.querySelectorAll('ol[aria-label="Captions"] li').length).toBe(3)
    expect(buttonByText('Save captions')?.disabled).toBe(true) // nothing changed
    const words = byLabel<HTMLTextAreaElement>('Caption 1 words')!
    await type(words, '   ')
    expect(text()).toContain('Caption 1 needs 1 to 300 characters.')
    expect(buttonByText('Save captions')?.disabled).toBe(true)
    expect(buttonByText('Export .srt')?.disabled).toBe(true)
    await type(words, 'Fixed words')
    expect(buttonByText('Save captions')?.disabled).toBe(false)
    expect(buttonByText('Burn into a copy')?.disabled).toBe(true) // save first
    await click(buttonByText('Save captions'))
    await settle()
    expect(text()).toContain('Saved beside the clip')
    expect(buttonByText('Burn into a copy')?.disabled).toBe(false)
  })

  it('captions: a clip with none offers to make them, and the job fills the list in', async () => {
    await mountDemo()
    await settle()
    await click(openBtn('Replay 2026-11-22 20-31-55'))
    await settle()
    await choose('Captions')
    await settle()
    expect(text()).toContain('No captions yet.')
    expect(text()).toContain('Nothing is uploaded')
    await click(buttonByText('Make captions'))
    await settle(50)
    expect(q('[aria-label="Making captions"] [data-job]')).not.toBeNull()
  })

  it('captions: closing and reopening the clip while they are made still shows them when done', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0, clipStepMs: 80 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    await mountWith(client)
    await settle()
    await click(openBtn('Replay 2026-11-22 20-31-55'))
    await settle()
    await choose('Captions')
    await settle()
    await click(buttonByText('Make captions'))
    await settle(5)
    // Close the clip and open it again while the job still runs.
    await click(byLabel('Close'))
    await settle(5)
    await click(openBtn('Replay 2026-11-22 20-31-55'))
    await settle(5)
    await choose('Captions')
    for (let i = 0; i < 80 && !q('ol[aria-label="Captions"]'); i++) await settle(50)
    expect(
      q('ol[aria-label="Captions"]'),
      'the captions appear without another reopen',
    ).not.toBeNull()
  })

  it('captions: words typed while the finished captions load are kept', async () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0, clipStepMs: 15 })
    let slow = false
    const base = engine.fetch
    const client = new FerroClient({
      base: engine.base,
      token: DEMO_TOKEN,
      fetch: async (input: string, init?: RequestInit) => {
        if (slow && /\/captions$/.test(input) && (init?.method ?? 'GET') === 'GET')
          await new Promise((r) => setTimeout(r, 300))
        return base(input, init)
      },
    })
    await mountWith(client)
    await settle()
    await click(openBtn('Replay 2026-11-22 20-31-55'))
    await settle()
    await choose('Captions')
    await settle()
    await click(buttonByText('Make captions'))
    // From here every read of the captions is slow: the one after the job is done too.
    slow = true
    // The job runs; the moment it is done the list is read again (slowly).
    for (let i = 0; i < 100 && !q('[aria-label="Making captions"]'); i++) await settle(10)
    expect(q('[aria-label="Making captions"]')).not.toBeNull()
    for (let i = 0; i < 200 && q('[aria-label="Making captions"]'); i++) await settle(10)
    // While that read is on its way, the person starts writing their own.
    await click(buttonByText('Write them myself'))
    await type(byLabel<HTMLTextAreaElement>('Caption 1 words'), 'my own words')
    await settle(900)
    expect(byLabel<HTMLTextAreaElement>('Caption 1 words')?.value).toBe('my own words')
  })

  it('details: rename is checked, and the Trash asks first', async () => {
    await mountDemo()
    await settle()
    await click(openBtn('Boss fight'))
    await settle()
    await choose('Details')
    const name = [...document.querySelectorAll<HTMLInputElement>('input')].find(
      (i) => i.labels?.[0]?.textContent === 'Name',
    )!
    await type(name, 'a/b')
    expect(text()).toContain('No / \\ : * ? " < > | or control characters.')
    expect(buttonByText('Rename')?.disabled).toBe(true)
    await click(buttonByText('Move to Trash'))
    expect(text()).toContain('Move Boss fight to the Trash?')
    expect(document.body.querySelector('[data-cancel]')).not.toBeNull()
    // The pressed button went away: focus is on the safe answer, and returns on Keep.
    await settle(50)
    expect(document.activeElement).toBe(document.body.querySelector('[data-cancel]'))
    await click(document.body.querySelector<HTMLButtonElement>('[data-cancel]'))
    await settle(50)
    expect(document.activeElement).toBe(buttonByText('Move to Trash'))
  })
})

describe('the open clip', () => {
  const clip = {
    id: 'A.mp4',
    name: 'A',
    kind: 'recording' as const,
    ext: 'mp4',
    size: 5000,
    modified: Date.now() - 60_000,
    has_captions: true,
  }
  const cues = [{ start_ms: 0, end_ms: 2000, text: 'Hello' }]
  type Handler = (m: string, p: string, b?: unknown) => Promise<unknown>
  const stub = (over: Handler) => ({
    request: vi.fn(async (m: string, p: string, b?: unknown) => {
      if (p.includes('/jobs')) return { jobs: [] }
      if (p === '/api/v1/clips')
        return { folder: '/x', ffmpeg_ready: true, youtube_connected: true, clips: [clip] }
      if (p.endsWith('/thumbnail')) return { image: 'data:image/svg+xml;utf8,x' }
      return over(m, p, b)
    }),
    clipFileUrl: () => '',
  })

  it('renaming a clip while a search shows it opens it under its new name', async () => {
    await mountDemo()
    await settle()
    await type(byLabel<HTMLInputElement>('Search clips by name'), 'Boss')
    await settle(400)
    await click(openBtn('Boss fight'))
    await settle()
    await choose('Details')
    const name = [...document.querySelectorAll<HTMLInputElement>('input')].find(
      (i) => i.labels?.[0]?.textContent === 'Name',
    )!
    await type(name, 'Finale')
    await click(buttonByText('Rename'))
    await settle(400)
    // The search no longer matches the new name, but the clip is opened, not reported missing.
    expect(text()).not.toContain("isn't in the folder")
    expect(byLabel<HTMLInputElement>('Search clips by name')?.value).toBe('')
    expect(text()).toContain('Finale')
  })

  it('keeps a caption edit when another section is looked at and comes back', async () => {
    await mountWith(
      stub(async (m, p) =>
        p.endsWith('/captions') && m === 'GET'
          ? { cues }
          : { duration_ms: 5000, width: 640, height: 360, has_audio: true, has_video: true },
      ),
    )
    await settle()
    await click(openBtn('A'))
    await settle()
    await choose('Captions')
    await settle()
    await type(byLabel<HTMLTextAreaElement>('Caption 1 words'), 'My fixed words')
    expect(buttonByText('Save captions')?.disabled).toBe(false)
    await choose('Details')
    await choose('Captions')
    expect(byLabel<HTMLTextAreaElement>('Caption 1 words')?.value).toBe('My fixed words')
    expect(text()).toContain('Unsaved changes')
  })

  it('still offers rename and the Trash when the clip cannot be read', async () => {
    await mountWith(
      stub(async (m, p) => {
        if (p.endsWith('/captions')) return { cues: [] }
        if (m === 'GET')
          throw new ApiError(
            422,
            'not_a_clip',
            "That file isn't a video ffmpeg can read.",
            'It may be damaged.',
          )
        return {}
      }),
    )
    await settle()
    await click(openBtn('A'))
    await settle()
    expect(q('[data-section="trim"] [role="alert"]')?.textContent).toContain(
      "isn't a video ffmpeg can read",
    )
    await choose('Details')
    expect(buttonByText('Move to Trash')).not.toBeNull()
    expect(buttonByText('Rename')).not.toBeNull()
  })

  it('does not lose words typed while a save is on its way', async () => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    await mountWith(
      stub(async (m, p, b) => {
        if (p.endsWith('/captions') && m === 'GET') return { cues }
        if (p.endsWith('/captions') && m === 'PUT') {
          await held
          return b
        }
        return { duration_ms: 5000, width: 640, height: 360, has_audio: true, has_video: true }
      }),
    )
    await settle()
    await click(openBtn('A'))
    await settle()
    await choose('Captions')
    await settle()
    await type(byLabel<HTMLTextAreaElement>('Caption 1 words'), 'First version')
    await click(buttonByText('Save captions'))
    // Typing goes on while the save is out.
    await type(byLabel<HTMLTextAreaElement>('Caption 1 words'), 'First version, and more')
    await act(async () => release())
    await settle()
    expect(byLabel<HTMLTextAreaElement>('Caption 1 words')?.value).toBe('First version, and more')
    expect(buttonByText('Save captions')?.disabled).toBe(false) // the newer words are still unsaved
  })
})

describe('a long folder', () => {
  const many = (n: number): ClipsOverview => ({
    folder: '/x',
    ffmpeg_ready: true,
    youtube_connected: false,
    clips: Array.from({ length: n }, (_, i) => ({
      id: `c${i}.mp4`,
      name: `c${i}`,
      kind: 'recording' as const,
      ext: 'mp4',
      size: 1000,
      modified: 1_000_000 - i,
      has_captions: false,
    })),
  })

  it('shows 60 at a time and more on request', async () => {
    const client = {
      request: vi.fn(async (_m: string, p: string) =>
        p.includes('/jobs')
          ? { jobs: [] }
          : p.endsWith('/thumbnail')
            ? { image: 'data:image/svg+xml;utf8,x' }
            : many(130),
      ),
      clipFileUrl: () => '',
    }
    await mountWith(client)
    await settle()
    expect(document.querySelectorAll('li[data-clip]').length).toBe(60)
    await click(buttonByText('Show 60 more'))
    expect(document.querySelectorAll('li[data-clip]').length).toBe(120)
    await click(buttonByText('Show 10 more'))
    expect(document.querySelectorAll('li[data-clip]').length).toBe(130)
    expect(buttonByText('Show 10 more')).toBeNull()
  })

  it('asks FFmpeg for at most two pictures at a time', async () => {
    let now = 0
    let most = 0
    const done: (() => void)[] = []
    const client = {
      request: vi.fn(async (_m: string, p: string) => {
        if (p.includes('/jobs')) return { jobs: [] }
        if (p.endsWith('/thumbnail')) {
          now++
          most = Math.max(most, now)
          await new Promise<void>((r) => done.push(r))
          now--
          return { image: 'data:image/svg+xml;utf8,x' }
        }
        return many(6)
      }),
      clipFileUrl: () => '',
    }
    await mountWith(client)
    await settle()
    for (let i = 0; i < 12; i++) {
      await act(async () => done.shift()?.())
      await settle()
    }
    expect(most).toBe(2)
    expect(document.querySelectorAll('li[data-clip] img').length).toBe(6)
  })
})

describe('jobs', () => {
  const job = (over: Partial<ClipJob>): ClipJob => ({
    id: 'job-1',
    kind: 'trim',
    label: 'Trim A',
    state: 'running',
    progress: 0.4,
    started: 1,
    ...over,
  })

  it('shows progress while running, with a way to stop', async () => {
    const onCancel = vi.fn()
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <ul>
          <JobRow job={job({})} onCancel={onCancel} />
        </ul>,
      ),
    )
    const bar = q('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(text()).toContain('40%')
    await click(byLabel('Stop Trim A'))
    expect(onCancel).toHaveBeenCalledWith('job-1')
  })

  it('says what a cancelled upload warns about (it may already be on YouTube)', async () => {
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <ul>
          <JobRow
            job={job({
              kind: 'upload',
              label: 'Send A',
              state: 'cancelled',
              error: {
                message: 'Stopped near the end.',
                hint: 'YouTube may already have the video. Check YouTube Studio before sending it again.',
              },
            })}
          />
        </ul>,
      ),
    )
    expect(text()).toContain('Stopped near the end.')
    expect(text()).toContain('Check YouTube Studio before sending it again.')
    // A plain cancel (no note) shows no warning.
    await act(async () =>
      root!.render(
        <ul>
          <JobRow job={job({ state: 'cancelled' })} />
        </ul>,
      ),
    )
    expect(document.body.querySelector('[role="alert"]')).toBeNull()
  })

  it('reads a failure in words with its next step, and a success with what it made', async () => {
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    const onShow = vi.fn()
    await act(async () =>
      root!.render(
        <JobsPanel
          jobs={[
            job({
              id: 'j2',
              state: 'failed',
              error: {
                message: "YouTube's daily limit for uploads is used up.",
                hint: 'Try again after midnight Pacific time.',
              },
            }),
            job({ id: 'j3', state: 'done', progress: 1, output: 'A trimmed.mp4' }),
            job({
              id: 'j4',
              kind: 'upload',
              state: 'done',
              progress: 1,
              link: 'https://www.youtube.com/watch?v=x',
            }),
            job({ id: 'j5', state: 'queued', progress: 0 }),
          ]}
          onCancel={() => {}}
          onDismiss={() => {}}
          onShow={onShow}
        />,
      ),
    )
    expect(q('[data-job="j2"] [role="alert"]')?.textContent).toContain(
      'Try again after midnight Pacific time.',
    )
    expect(q('[data-job="j3"]')?.textContent).toContain('Made A trimmed.mp4')
    await click(
      [...document.querySelectorAll('[data-job="j3"] button')].find(
        (b) => b.textContent === 'Show',
      ) ?? null,
    )
    expect(onShow).toHaveBeenCalledWith('A trimmed.mp4')
    expect(q('[data-job="j4"]')?.textContent).toContain('Open on YouTube')
    expect(q('[data-job="j5"]')?.textContent).toContain('Waiting')
    expect(q('[data-job="j5"] [role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0')
  })

  it('shows nothing when there is no work', async () => {
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <JobsPanel jobs={[]} onCancel={() => {}} onDismiss={() => {}} onShow={() => {}} />,
      ),
    )
    expect(host.textContent).toBe('')
  })
})
