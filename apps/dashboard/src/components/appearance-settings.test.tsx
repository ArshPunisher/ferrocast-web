import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, setAppearance } from '../lib/appearance'
import { AppearanceGroups } from './appearance-settings'

let root: Root | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  localStorage.removeItem(APPEARANCE_KEY)
  setAppearance(DEFAULT_APPEARANCE)
  localStorage.removeItem(APPEARANCE_KEY)
})

async function mount() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => root!.render(<AppearanceGroups />))
  return host
}

const radio = (host: HTMLElement, group: string, name: string) =>
  [...host.querySelectorAll<HTMLLabelElement>(`[role="radiogroup"][aria-label="${group}"] label`)]
    .find((l) => l.textContent === name)
    ?.querySelector<HTMLInputElement>('input')

describe('Appearance and Accessibility settings', () => {
  it('the text size slider sets the root size and is remembered', async () => {
    const host = await mount()
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!
    expect(slider.min).toBe('90')
    expect(slider.max).toBe('130')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      set.call(slider, '120')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(document.documentElement.style.fontSize).toBe('120%')
    expect(JSON.parse(localStorage.getItem(APPEARANCE_KEY)!).scale).toBe(120)
    expect(host.textContent).toContain('120%')
  })

  it('row spacing sets the density', async () => {
    const host = await mount()
    await act(async () => radio(host, 'Row spacing', 'Compact')?.click())
    expect(document.documentElement.dataset.density).toBe('compact')
    await act(async () => radio(host, 'Row spacing', 'Roomy')?.click())
    expect(document.documentElement.dataset.density).toBe('comfortable')
  })

  it('reduce motion switches the app’s motion off, and back', async () => {
    const host = await mount()
    const sw = host.querySelector<HTMLElement>('button[role="switch"][aria-label="Reduce motion"]')!
    await act(async () => sw.click())
    expect(document.documentElement.dataset.reduceMotion).toBe('true')
    await act(async () => sw.click())
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined()
  })

  it('the colour-blind preset changes the meters; its sample shows them', async () => {
    const host = await mount()
    await act(async () => radio(host, 'Meter colours', 'Colour-blind')?.click())
    expect(document.documentElement.style.getPropertyValue('--fc-meter-ok')).toBe('#0072b2')
    expect(
      host.querySelector<HTMLElement>('[data-testid="meter-sample"]')?.style.background,
    ).toContain('rgb(0, 114, 178)')
    expect(host.querySelector('input[type="color"][aria-label="Clipping"]')).toBeNull()
  })

  it('your own colours open three pickers and reset puts everything back', async () => {
    const host = await mount()
    await act(async () => radio(host, 'Meter colours', 'Your own')?.click())
    expect(host.querySelector('input[type="color"][aria-label="Clipping"]')).not.toBeNull()
    const reset = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Reset all')!
    await act(async () => reset.click())
    expect(document.documentElement.style.getPropertyValue('--fc-meter-ok')).toBe('')
    expect(radio(host, 'Meter colours', 'Normal')?.checked).toBe(true)
  })
})
