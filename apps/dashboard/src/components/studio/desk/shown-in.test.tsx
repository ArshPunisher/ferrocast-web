// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ShownBadge,
  ShownIn,
  canChooseWhere,
  editForShow,
  itemFor,
  showOf,
  SHOWN_LABEL,
} from './shown-in'
import { sharedNote } from './record-notes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('where an item is shown', () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  const render = (node: React.ReactNode) => act(() => root.render(node))

  it('reads the engine, and an engine from before this says both', () => {
    expect(showOf({})).toBe('both')
    expect(showOf({ show: 'both' })).toBe('both')
    expect(showOf({ show: 'stream' })).toBe('stream')
    expect(showOf({ show: 'recording' })).toBe('recording')
    // Anything it doesn't know is shown as it always was.
    expect(showOf({ show: 'everywhere' as never })).toBe('both')
  })

  it('has one edit word for each', () => {
    expect(editForShow('both')).toBe('stream_and_recording')
    expect(editForShow('stream')).toBe('stream_only')
    expect(editForShow('recording')).toBe('recording_only')
  })

  it('shows nothing in the list for an item shown on both', () => {
    render(<ShownBadge item={{ name: 'Cam' }} />)
    expect(host.querySelector('[role="img"]')).toBeNull()
    render(<ShownBadge item={{ name: 'Cam', show: 'both' }} />)
    expect(host.querySelector('[role="img"]')).toBeNull()
  })

  it('shows a labelled icon for an item that is for the stream or the recording only', () => {
    render(<ShownBadge item={{ name: 'Chat', show: 'stream' }} />)
    const stream = host.querySelector('[role="img"]')
    expect(stream?.getAttribute('aria-label')).toBe('Shown on the stream only')
    expect(stream?.getAttribute('title')).toBe('Stream only')
    render(<ShownBadge item={{ name: 'Face cam', show: 'recording' }} />)
    const rec = host.querySelector('[role="img"]')
    expect(rec?.getAttribute('aria-label')).toBe('Shown in the recording only')
    expect(rec?.getAttribute('title')).toBe('Recording only')
  })

  it('offers the three choices as one radio group, the current one picked', () => {
    render(<ShownIn item={{ name: 'Chat', show: 'stream' }} onChoose={() => {}} />)
    const group = host.querySelector('[role="radiogroup"]')
    expect(group?.getAttribute('aria-label')).toBe('Shown in')
    const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(radios.map((r) => r.value)).toEqual(['both', 'stream', 'recording'])
    expect(radios.map((r) => r.checked)).toEqual([false, true, false])
    expect(host.textContent).toContain(SHOWN_LABEL.both)
    expect(host.textContent).toContain(SHOWN_LABEL.stream)
    expect(host.textContent).toContain(SHOWN_LABEL.recording)
  })

  it('says which one was picked, and only when it changes', () => {
    const choose = vi.fn()
    render(<ShownIn item={{ name: 'Chat' }} onChoose={choose} />)
    const radio = (v: string) =>
      host.querySelector<HTMLInputElement>(`input[type="radio"][value="${v}"]`)!
    act(() => radio('recording').click())
    expect(choose).toHaveBeenCalledWith('recording')
    act(() => radio('stream').click())
    expect(choose).toHaveBeenLastCalledWith('stream')
    // Both is already picked: clicking it again says nothing.
    choose.mockClear()
    act(() => radio('both').click())
    expect(choose).not.toHaveBeenCalled()
  })

  it('is out of the way while a choice is being made', () => {
    render(<ShownIn item={{ name: 'Chat' }} busy onChoose={() => {}} />)
    const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    // Disabled through the fieldset: the browser's own :disabled applies to each radio.
    expect(radios.every((r) => r.matches(':disabled'))).toBe(true)
  })

  it('says what each choice is for behind the (i), not in the row', () => {
    render(<ShownIn item={{ name: 'Chat' }} onChoose={() => {}} />)
    expect(host.querySelector('button[aria-label="About where it is shown"]')).not.toBeNull()
    // The row itself stays short: the choices are single words.
    expect(host.querySelector('[role="radiogroup"]')?.textContent).toBe('BothStreamRecording')
  })
})

describe('who can choose where a source is shown', () => {
  it('a picture can, on the wide canvas', () => {
    expect(canChooseWhere('av_capture_input', 'main')).toBe(true)
    expect(canChooseWhere('browser_source', 'main')).toBe(true)
    expect(canChooseWhere('group', 'main')).toBe(true)
  })
  it('a sound source cannot: only its picture would be left out, and it has none', () => {
    expect(canChooseWhere('coreaudio_input_capture', 'main')).toBe(false)
    expect(canChooseWhere('coreaudio_output_capture', 'main')).toBe(false)
  })
  it('nothing can on the vertical picture: it has a stream and no recording', () => {
    expect(canChooseWhere('av_capture_input', 'vertical')).toBe(false)
  })
})

describe('the item a settings panel is about', () => {
  const item = (id: number, name: string, children: ReturnType<typeof make>[] = []) =>
    make(id, name, children)
  function make(id: number, name: string, children: unknown[] = []) {
    return {
      id,
      name,
      kind: 'x',
      visible: true,
      locked: false,
      audio: false,
      group: false,
      blend: 'normal',
      scale_filter: 'off',
      children,
    } as never
  }
  it('is the one picked in the list when two share a source', () => {
    const items = [item(7, 'Camera'), item(6, 'Camera'), item(5, 'Chat')]
    expect(itemFor(items, 'Camera', 6)?.id).toBe(6)
    expect(itemFor(items, 'Camera', 7)?.id).toBe(7)
  })
  it('falls back to the first with that name, and finds one inside a group', () => {
    const items = [item(7, 'Camera'), item(6, 'Camera')]
    expect(itemFor(items, 'Camera', null)?.id).toBe(7)
    expect(itemFor(items, 'Camera', 99)?.id).toBe(7)
    const grouped = [item(1, 'Pair', [item(2, 'Inner')])]
    expect(itemFor(grouped, 'Inner', 2)?.id).toBe(2)
    expect(itemFor(grouped, 'Nothing', 2)).toBeNull()
  })
})

describe('what a group says about the source inside it', () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  it('says so when the group is for one side only, and nothing when it is for both', () => {
    act(() =>
      root.render(
        <ShownIn
          item={{ name: 'Chat' }}
          onChoose={() => {}}
          parent={{ name: 'Overlay', show: 'stream' }}
        />,
      ),
    )
    expect(host.querySelector('[data-testid="shown-in-parent"]')?.textContent).toBe(
      'In Overlay: stream only.',
    )
    act(() =>
      root.render(
        <ShownIn
          item={{ name: 'Chat' }}
          onChoose={() => {}}
          parent={{ name: 'Overlay', show: 'both' }}
        />,
      ),
    )
    expect(host.querySelector('[data-testid="shown-in-parent"]')).toBeNull()
  })
  it('warns when the source and its group are for different sides: it is shown in neither', () => {
    act(() =>
      root.render(
        <ShownIn
          item={{ name: 'Chat', show: 'recording' }}
          onChoose={() => {}}
          parent={{ name: 'Overlay', show: 'stream' }}
        />,
      ),
    )
    const note = host.querySelector('[data-testid="shown-in-parent"]')?.textContent
    expect(note).toBe('In Overlay: stream only. Shown in neither.')
  })
  it('is marked busy while a choice is being made, and looks it', () => {
    act(() => root.render(<ShownIn item={{ name: 'Chat' }} busy onChoose={() => {}} />))
    const set = host.querySelector('fieldset')
    expect(set?.getAttribute('aria-busy')).toBe('true')
    expect(set?.className).toContain('opacity-50')
  })
})

describe('Same as stream on the record page', () => {
  it('says why it will have its own encoder, whatever the budget level', () => {
    expect(
      sharedNote('stream', {
        shared: false,
        why_not_shared: 'some sources are shown only on the stream or only in the recording',
      }),
    ).toBe(
      "Same as stream can't share here: some sources are shown only on the stream or only in the recording. It uses an encoder of its own.",
    )
  })
  it('says nothing when it shares, when another quality is chosen, or when no reason is known', () => {
    expect(sharedNote('stream', { shared: true, why_not_shared: null })).toBeNull()
    expect(sharedNote('high', { shared: false, why_not_shared: 'x' })).toBeNull()
    expect(sharedNote('stream', { shared: false, why_not_shared: null })).toBeNull()
    expect(sharedNote('stream', undefined)).toBeNull()
  })
})
