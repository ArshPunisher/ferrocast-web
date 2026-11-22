import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AlertStage } from './AlertStage'

let root: Root | null = null

describe('AlertStage blocked preview message (Problem 10)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
  })

  it('shows emptyMessage instead of mounting a sandbox frame when custom code is invalid', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () =>
      root!.render(
        <AlertStage
          alert={null}
          theme="molten"
          emptyMessage={'Preview paused: custom HTML can\'t use the "onerror" attribute.'}
        />,
      ),
    )

    expect(host.textContent).toContain(
      'Preview paused: custom HTML can\'t use the "onerror" attribute.',
    )
    expect(host.querySelector('iframe')).toBeNull()
  })
})
