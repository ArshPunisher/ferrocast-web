import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ApiError } from '@ferrocast/api'
import { useSaveOrder } from './save-order'

// The Go live dock, the platforms list and "Stop trying" all save through this hook: it must
// turn the engine's two questions into a dialog, and send the answer.

let root: Root | null = null
const order = [{ id: 'twitch', enabled: false }]

function Host({
  saveOrder,
  onSaved,
}: {
  saveOrder: ReturnType<typeof vi.fn>
  onSaved: () => void
}) {
  const saver = useSaveOrder({ saveOrder } as never, onSaved)
  return (
    <>
      <button onClick={() => void saver.request(order)}>untick</button>
      {saver.dialog}
    </>
  )
}

async function mount(saveOrder: ReturnType<typeof vi.fn>, onSaved = vi.fn()) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => root!.render(<Host saveOrder={saveOrder} onSaved={onSaved} />))
  return { el, onSaved }
}
const click = async (label: string) =>
  act(async () => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent === label)
    expect(b, label).toBeTruthy()
    b!.click()
  })

// jsdom has no <dialog> methods: the open attribute is what the page and these tests read.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('useSaveOrder', () => {
  it('asks before stopping the last destination, and sends confirm_last when answered', async () => {
    const saveOrder = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(409, 'golive_last_destination', 'That’s the last destination.', 'Confirm.'),
      )
      .mockResolvedValue(undefined)
    const { onSaved } = await mount(saveOrder)
    await click('untick')
    expect(document.body.textContent).toContain('Stop sending to your last platform?')
    // Not answered yet: only the first, unconfirmed save went out.
    expect(saveOrder).toHaveBeenCalledTimes(1)
    await click('Stop sending')
    expect(saveOrder).toHaveBeenLastCalledWith(order, { last: true })
    expect(onSaved).toHaveBeenCalled()
  })

  it('keeps it on when the question is declined: nothing more is sent', async () => {
    const saveOrder = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'golive_last_destination', 'Last one.', null))
    await mount(saveOrder)
    await click('untick')
    await click('Keep it on')
    expect(saveOrder).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('Stop sending to your last platform?')
  })

  it('asks about an upload that will not carry it, and sends upload when answered', async () => {
    const saveOrder = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(409, 'golive_upload_exceeded', 'Your upload is short.', null),
      )
      .mockResolvedValue(undefined)
    await mount(saveOrder)
    await click('untick')
    expect(document.body.textContent).toContain('Your upload may not carry this')
    await click('Add it anyway')
    expect(saveOrder).toHaveBeenLastCalledWith(order, { upload: true })
  })

  it('lets any other error through to the caller', async () => {
    const saveOrder = vi.fn().mockRejectedValue(new ApiError(500, 'boom', 'Broke.', null))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    await mount(saveOrder)
    await click('untick')
    process.off('unhandledRejection', unhandled)
    expect(document.body.textContent).not.toContain('last platform')
  })
})
