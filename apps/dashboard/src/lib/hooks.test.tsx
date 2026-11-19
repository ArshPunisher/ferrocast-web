import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useAction } from './hooks'

// `once`: a second press of the same action while the first runs does nothing.

let root: Root | null = null
let run: ReturnType<typeof useAction>['run'] | null = null
function Host() {
  run = useAction().run
  return null
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

async function host() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => root!.render(<Host />))
}

describe('useAction', () => {
  it('with `once`, a double press runs the action once, and it runs again afterwards', async () => {
    await host()
    let calls = 0
    let release: () => void = () => {}
    const slow = () =>
      new Promise<string>((done) => {
        calls++
        release = () => done('started')
      })
    let first: Promise<string | undefined> | undefined
    let second: Promise<string | undefined> | undefined
    await act(async () => {
      first = run!('stream', slow, { once: true })
      second = run!('stream', slow, { once: true })
    })
    expect(calls).toBe(1)
    expect(await second).toBeUndefined()
    await act(async () => release())
    expect(await first).toBe('started')
    // Done: the next press is a new one.
    await act(async () => {
      void run!('stream', slow, { once: true })
    })
    expect(calls).toBe(2)
    await act(async () => release())
  })

  it('without it, every call runs (a slider saving at each step needs them all)', async () => {
    await host()
    let calls = 0
    await act(async () => {
      await Promise.all([
        run!('save', async () => void calls++),
        run!('save', async () => void calls++),
      ])
    })
    expect(calls).toBe(2)
  })

  it('a failed action frees the key too', async () => {
    await host()
    await act(async () => {
      await run!('stream', () => Promise.reject(new Error('no')), { once: true, quiet: true })
    })
    let calls = 0
    await act(async () => {
      await run!('stream', async () => void calls++, { once: true })
    })
    expect(calls).toBe(1)
  })
})
