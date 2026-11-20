import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { OnAirButton } from './onair'

// Go live while it's starting: another press did nothing useful and started it twice (S3, M9-09).

let root: Root | null = null
async function show(props: Partial<Parameters<typeof OnAirButton>[0]>) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () =>
    root!.render(
      <OnAirButton kind="live" state="idle" time="00:00" onClick={() => {}} {...props} />,
    ),
  )
  return el.querySelector('button') as HTMLButtonElement
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('the Go live button', () => {
  it('answers a press, and only one while it is working', async () => {
    const onClick = vi.fn()
    const idle = await show({ onClick })
    await act(async () => idle.click())
    expect(onClick).toHaveBeenCalledTimes(1)
    await act(async () => root?.unmount())
    document.body.innerHTML = ''
    const working = await show({ onClick, state: 'starting', working: true })
    await act(async () => working.click())
    await act(async () => working.click())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('keeps keyboard focus while it works (aria-disabled, not disabled) and says it is busy', async () => {
    const b = await show({ state: 'starting', working: true })
    expect(b.disabled).toBe(false)
    expect(b.getAttribute('aria-disabled')).toBe('true')
    expect(b.getAttribute('aria-busy')).toBe('true')
    expect(b.textContent).toContain('Starting')
  })

  it('stays pressable while a stream connects by itself (it is how it is ended)', async () => {
    const onClick = vi.fn()
    const b = await show({ state: 'starting', onClick })
    await act(async () => b.click())
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(b.getAttribute('aria-disabled')).toBeNull()
  })

  it('shows the Show countdown on the on-air pill in fixed-width mono digits without breaking End stream (U4)', async () => {
    const onClick = vi.fn()
    const b = await show({ state: 'on', time: '00:00:03', countdown: '00:10', onClick })
    expect(b.textContent).toContain('LIVE')
    expect(b.textContent).toContain('00:00:03')
    expect(b.textContent).toContain('Starts')
    const digits = b.querySelector('[data-countdown]')
    expect(digits?.textContent).toBe('00:10')
    expect(digits?.className).toContain('font-mono')
    expect(digits?.className).toContain('tabular-nums')
    expect(digits?.className).toContain('min-w-[5ch]')
    expect(b.getAttribute('aria-label')).toBe('End stream (live 00:00:03, show starts in 00:10)')
    await act(async () => b.click())
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
