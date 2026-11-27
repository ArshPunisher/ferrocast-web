// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHAT_TTS, type ChatTtsConfig } from '@ferrocast/api'
import { ChatTtsGroup } from './chat-tts-settings'

let root: Root | null = null

async function renderChatTts(opts?: {
  value?: ChatTtsConfig | undefined
  hasAlertsOverlay?: boolean
  onSave?: (next: ChatTtsConfig) => void
}) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const onSave = opts?.onSave ?? vi.fn()
  await act(async () => {
    root!.render(
      <ChatTtsGroup
        value={opts?.value}
        hasAlertsOverlay={opts?.hasAlertsOverlay}
        onSave={onSave}
      />,
    )
  })
  return { host, onSave }
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function findInputByLabel(host: HTMLElement, labelText: string): HTMLInputElement | undefined {
  const labels = [...host.querySelectorAll('label[for]')]
  const lbl = labels.find((l) => l.textContent?.trim() === labelText)
  const id = lbl?.getAttribute('for')
  return id ? ((document.getElementById(id) as HTMLInputElement | null) ?? undefined) : undefined
}

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('ChatTtsGroup', () => {
  it('toggles chat TTS and switches trigger mode cleanly', async () => {
    const onSave = vi.fn()
    const { host } = await renderChatTts({ value: { ...DEFAULT_CHAT_TTS }, onSave })

    const sw = host.querySelector<HTMLButtonElement>('[role="switch"]')
    expect(sw).toBeTruthy()
    await act(async () => {
      sw!.click()
    })
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, mode: 'subs_mods' }),
    )

    // Re-render enabled so mode & numeric controls appear.
    onSave.mockClear()
    await act(async () => {
      root!.render(
        <ChatTtsGroup
          value={{ ...DEFAULT_CHAT_TTS, enabled: true }}
          hasAlertsOverlay
          onSave={onSave}
        />,
      )
    })

    const radios = [
      ...host.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input[type="radio"]'),
    ]
    expect(radios.length).toBe(3)
    const cmdRadio = [...host.querySelectorAll<HTMLLabelElement>('[role="radiogroup"] label')]
      .find((l) => l.textContent?.includes('Command'))
      ?.querySelector('input')
    expect(cmdRadio).toBeTruthy()
    await act(async () => {
      cmdRadio!.click()
    })
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, mode: 'command', command: '!tts' }),
    )
    expect(findInputByLabel(host, 'Command')).toBeTruthy()
  })

  it('validates command and numeric bounds inline without saving invalid values', async () => {
    const onSave = vi.fn()
    const { host } = await renderChatTts({
      value: { ...DEFAULT_CHAT_TTS, enabled: true, mode: 'command' },
      hasAlertsOverlay: false,
      onSave,
    })

    expect(host.textContent).toContain('Needs an Alerts overlay')
    expect(host.textContent).toContain('local voice')

    const cmd = findInputByLabel(host, 'Command')!
    await act(async () => {
      setInput(cmd, 'badcmd')
    })
    await act(async () => {
      cmd.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onSave).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Start with !')

    const cd = findInputByLabel(host, 'Per-person cooldown (s)')!
    await act(async () => {
      setInput(cmd, '  !speak  ')
      setInput(cd, '999')
    })
    await act(async () => {
      cd.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onSave).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Enter 0 to 300 seconds.')

    await act(async () => {
      setInput(cd, '30')
    })
    await act(async () => {
      cd.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ command: '!speak', cooldown_s: 30 }),
    )
  })

  it('lets the user turn Read chat messages OFF even when unsaved draft inputs are invalid', async () => {
    const onSave = vi.fn()
    const { host } = await renderChatTts({
      value: { ...DEFAULT_CHAT_TTS, enabled: true, mode: 'command', command: '!tts' },
      hasAlertsOverlay: true,
      onSave,
    })

    const cmd = findInputByLabel(host, 'Command')!
    await act(async () => {
      setInput(cmd, 'badcmd')
    })

    const toggle = host.querySelector<HTMLButtonElement>('button[role="switch"]')!
    await act(async () => {
      toggle.click()
    })
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, command: '!tts' }),
    )
  })
})
