import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { THEMES } from '../lib/themes'
import { ThemePicker } from './theme-picker'

let root: Root | null = null
afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

async function mount(value: Parameters<typeof ThemePicker>[0]['value'], onChange = vi.fn()) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => root!.render(<ThemePicker value={value} onChange={onChange} />))
  return { host, onChange }
}

const radios = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input[type="radio"]'),
]

describe('the theme picker', () => {
  it('is one radio group of ten, each named for its theme and kind', async () => {
    const { host } = await mount('ember')
    const group = host.querySelector('[role="radiogroup"]')!
    expect(group.getAttribute('aria-label')).toBe('Theme')
    const all = radios(host)
    expect(all).toHaveLength(10)
    const names = all.map((r) => r.closest('label')!.textContent ?? '')
    for (const t of THEMES) {
      const hit = names.find((n) => n.includes(t.name))
      expect(hit, t.name).toBeTruthy()
      expect(hit).toContain(t.kind === 'dark' ? 'Dark' : 'Light')
    }
  })

  it('shows the chosen one, and none while following the computer', async () => {
    const { host } = await mount('moonlight')
    const on = radios(host).filter((r) => r.checked)
    expect(on).toHaveLength(1)
    expect(on[0]!.value).toBe('moonlight')
    await act(async () => root!.unmount())
    root = null
    document.body.innerHTML = ''
    const again = await mount(null)
    expect(radios(again.host).some((r) => r.checked)).toBe(false)
  })

  it('choosing a card says which one, and every card describes itself', async () => {
    const { host, onChange } = await mount('slate')
    const mist = radios(host).find((r) => r.value === 'mist')!
    await act(async () => mist.click())
    expect(onChange).toHaveBeenCalledWith('mist')
    for (const r of radios(host)) {
      const d = r.getAttribute('aria-describedby')
      expect(d && host.querySelector(`#${CSS.escape(d)}`)?.textContent?.length).toBeGreaterThan(10)
    }
  })

  it('each card previews its own colours without touching the page theme', async () => {
    const { host } = await mount('slate')
    const minis = [...host.querySelectorAll<HTMLElement>('[data-theme-preview]')]
    expect(minis.map((m) => m.dataset.themePreview)).toEqual(THEMES.map((t) => t.id))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})
