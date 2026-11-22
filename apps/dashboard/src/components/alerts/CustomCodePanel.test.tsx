import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { newVariation } from '@ferrocast/api'
import { CustomCodePanel } from './CustomCodePanel'

let root: Root | null = null

describe('CustomCodePanel field schema row layout (Problem 11.2)', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
  })

  it('gives the Type select column wider track room than equal 1fr columns so "Colour" is not clipped', async () => {
    const v = newVariation('v1', '{name}')
    v.custom_enabled = true
    v.fields = [{ key: 'accent_color', label: 'Accent colour', type: 'color', default: '#ffa424' }]
    v.field_values = { accent_color: '#ffa424' }

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => root!.render(<CustomCodePanel v={v} onChange={vi.fn()} />))

    const row = host.querySelector('[data-schema-field="accent_color"] > div')
    expect(row).not.toBeNull()
    expect(row!.className).not.toContain('sm:grid-cols-3')
    const select = host.querySelector(
      '[data-schema-field="accent_color"] select',
    ) as HTMLSelectElement
    expect(select).not.toBeNull()
    expect(select.selectedOptions[0]?.textContent).toBe('Colour')
  })
})
