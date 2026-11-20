import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DestinationView } from '@ferrocast/api'
import { RowText } from './golive'

let root: Root | null = null

function baseDest(overrides: Partial<DestinationView> = {}): DestinationView {
  return {
    id: 'twitch',
    kind: 'twitch',
    canvas: 'main',
    name: 'Twitch',
    account: 'arsh_live',
    enabled: true,
    connected: true,
    health: { state: 'live', kbps: 6000, dropped: 0, since_ms: 0 },
    blocked: null,
    rules: [],
    ...overrides,
  }
}

async function renderNode(node: React.ReactElement): Promise<HTMLDivElement> {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const el = document.createElement('div')
  document.body.appendChild(el)
  root = createRoot(el)
  await act(async () => root!.render(node))
  return el
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('RowText (Contract C-2 capped chip and structured issues)', () => {
  it('renders the calm capped chip and expands its detail when (i) is pressed', async () => {
    const detail =
      "Your 10,000 kbps stream is capped at 6,000 kbps H.264 (2 s keyframes, 1× VBV) so viewers don't stutter."
    const el = await renderNode(
      <RowText
        d={baseDest({
          capped: {
            kbps: 6000,
            separate_encode: false,
            summary: 'Capped at 6,000 kbps for Twitch',
            detail,
          },
        })}
      />,
    )
    expect(el.textContent).toContain('Capped at 6,000 kbps for Twitch')
    expect(el.textContent).not.toContain(detail)
    const infoBtn = el.querySelector(
      'button[aria-label="About Twitch limits"]',
    ) as HTMLButtonElement
    expect(infoBtn).not.toBeNull()
    expect(infoBtn.getAttribute('aria-expanded')).toBe('false')
    await act(async () => infoBtn.click())
    expect(infoBtn.getAttribute('aria-expanded')).toBe('true')
    expect(el.textContent).toContain(detail)
  })

  it('renders structured issues with expandable detail and Use N kbps quick-fix button', async () => {
    const fixBitrate = vi.fn()
    const detail =
      'Over Twitch’s 6,000 kbps limit, viewers may buffer. Lower the bitrate to 5,500 kbps or less.'
    const el = await renderNode(
      <RowText
        fixBitrate={fixBitrate}
        d={baseDest({
          rules: [detail],
          issues: [
            {
              code: 'bitrate',
              summary: 'Over Twitch’s 6,000 kbps limit',
              detail,
              fix_kbps: 5500,
            },
          ],
        })}
      />,
    )
    expect(el.textContent).toContain('Over Twitch’s 6,000 kbps limit')
    expect(el.textContent).not.toContain('viewers may buffer')
    const infoBtn = el.querySelector(
      'button[aria-label="More about Over Twitch’s 6,000 kbps limit"]',
    ) as HTMLButtonElement
    await act(async () => infoBtn.click())
    expect(el.textContent).toContain('viewers may buffer')

    const fixBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Use 5,500 kbps'),
    ) as HTMLButtonElement
    expect(fixBtn).not.toBeUndefined()
    await act(async () => fixBtn.click())
    expect(fixBitrate).toHaveBeenCalledWith(5500)
  })

  it('keeps the legacy rules string fallback working when an older engine omits issues', async () => {
    const legacy = 'Twitch needs a keyframe at least every 2 s.'
    const el = await renderNode(<RowText d={baseDest({ rules: [legacy] })} />)
    expect(el.textContent).toContain(legacy)
  })
})
