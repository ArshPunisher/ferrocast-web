// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShownBadge, ShownIn, editForShow, showOf, SHOWN_LABEL } from './shown-in'

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
