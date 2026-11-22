import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DEFAULT_THEME, type Widget } from '@ferrocast/api'
import { Toaster } from '@ferrocast/ui'
import { useLive } from '../../lib/store'
import { WidgetSettings } from './widget-settings'

let root: Root | null = null

const unmountRoot = async () => {
  if (!root) return
  const prev = root
  root = null
  await act(async () => prev.unmount())
}

function Harness({
  initial,
  onSpyChange,
}: {
  initial: Widget
  onSpyChange: (next: Widget) => void
}) {
  const [w, setW] = useState<Widget>(initial)
  return (
    <WidgetSettings
      w={w}
      themes={[]}
      goals={[]}
      onChange={(next) => {
        setW(next)
        onSpyChange(next)
      }}
      onRemove={() => {}}
      onGoalCreated={() => {}}
    />
  )
}

async function mountSettings(initial: Widget) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const onSpyChange = vi.fn<(next: Widget) => void>()
  const client = {
    createGoal: vi.fn(),
  }
  await unmountRoot()
  useLive.setState({ conn: { client } as never })
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  await act(async () => {
    root!.render(
      <>
        <Harness initial={initial} onSpyChange={onSpyChange} />
        <Toaster />
      </>,
    )
    await Promise.resolve()
  })
  return { el, onSpyChange }
}

afterEach(async () => {
  await unmountRoot()
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
  vi.restoreAllMocks()
})

describe('LabelSettings (#8 review fixes)', () => {
  it('uses distinct IANA timezone values (UTC vs Europe/London) and falls back cleanly for legacy offsets', async () => {
    const monthlyWidget: Widget & { kind: 'label' } = {
      id: 'w-month',
      kind: 'label',
      x: 0,
      y: 0,
      w: 360,
      h: 64,
      config: {
        source: 'monthly_tips',
        template: 'Month tips: {value}',
        theme: DEFAULT_THEME,
        timezone_offset_min: 330,
      },
    }

    const { el, onSpyChange } = await mountSettings(monthlyWidget)
    const select = Array.from(el.querySelectorAll('label')).find((l) =>
      l.textContent?.includes('Month boundary timezone'),
    )
      ? (el.querySelector(
          `select#${Array.from(el.querySelectorAll('label'))
            .find((l) => l.textContent?.includes('Month boundary timezone'))!
            .getAttribute('for')!}`,
        ) as HTMLSelectElement)
      : null
    expect(select).not.toBeNull()

    const optionValues = Array.from(select!.options).map((o) => o.value)
    expect(new Set(optionValues).size).toBe(optionValues.length)
    expect(optionValues).toContain('UTC')
    expect(optionValues).toContain('Europe/London')
    expect(select!.value).toBe('Asia/Kolkata')

    await act(async () => {
      select!.value = 'Europe/London'
      select!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(select!.value).toBe('Europe/London')
    const lastCall = onSpyChange.mock.calls.at(-1)?.[0]
    expect(lastCall?.kind === 'label' && lastCall.config.timezone).toBe('Europe/London')
  })
})
