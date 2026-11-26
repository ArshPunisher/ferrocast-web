import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BUILTINS } from '@ferrocast/designs'
import type { AlertDesign, Overlay, ThemeDesign, UseDesignRequest } from '@ferrocast/api'
import { Toaster, currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../lib/store'
import { UseDialog } from './dialogs'
import { ThemeSheet } from './gallery'

vi.mock('./previews', () => ({
  ScenePreview: ({ sceneKey }: { sceneKey?: string }) => (
    <div data-testid={`scene-preview-${sceneKey ?? 'first'}`} />
  ),
  WidgetPreview: () => <div data-testid="widget-preview" />,
}))

vi.mock('./DesignStage', () => ({
  DesignStage: ({ label }: { label?: string }) => <div data-testid="design-stage">{label}</div>,
}))

let mockUsesObs = false
vi.mock('../../lib/picture', () => ({
  useUsesObs: () => mockUsesObs,
}))

HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open')
}

const lofi = BUILTINS.find(
  (d): d is ThemeDesign => d.kind === 'theme' && d.id === 'builtin.lofi-loft',
)!
const lofiAlert = BUILTINS.find(
  (d): d is AlertDesign => d.kind === 'alert' && d.id === lofi.content.alert_design,
)!
if (!lofi || !lofiAlert) throw new Error('expected lofi-loft theme and alert design')

let root: Root | null = null

beforeEach(() => {
  vi.useFakeTimers()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  mockUsesObs = false
  if (root) {
    const r = root
    root = null
    await act(async () => r.unmount())
  }
  document.body.innerHTML = ''
  currentToasts().forEach((t) => dismissToast(t.id))
  vi.useRealTimers()
})

function overlayFor(scene: string, id = `ov-${scene}`, designId = lofi.id): Overlay {
  return {
    id,
    name: `${scene} (Lo-fi loft)`,
    url: `http://127.0.0.1:4190/overlay/${id}`,
    width: 1920,
    height: 1080,
    widgets: [],
    updated_at: 1,
    design: designId ? { id: designId, scene, branded: true, follows: true } : null,
  }
}

async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}

async function mountNode(node: React.ReactNode, clientOverrides: Record<string, unknown> = {}) {
  const calls = {
    useDesign: [] as { id: string; req: UseDesignRequest | undefined }[],
    addScene: [] as string[],
    addExisting: [] as { scene: string; name: string }[],
    addSource: [] as { scene: string; url: string }[],
    saveOverlay: [] as Overlay[],
  }
  const client = {
    overlays: vi.fn(async () => [] as Overlay[]),
    useDesign: vi.fn(async (id: string, req?: UseDesignRequest) => {
      calls.useDesign.push({ id, req })
      if (id === lofi.content.alert_design) {
        return { alert_design: id, overlays: [] }
      }
      const picked = req?.scenes ?? lofi.content.scenes.map((s) => s.key)
      return {
        alert_design: req?.alert_style === false ? null : lofi.content.alert_design,
        overlays: picked.map((k) => overlayFor(k)),
      }
    }),
    saveOverlay: vi.fn(async (o: Overlay) => {
      calls.saveOverlay.push(o)
      return o
    }),
    request: vi.fn(async (method: string, path: string, body?: unknown) => {
      if (method === 'GET') {
        if (path === '/api/v1/studio/engine') return { running: true }
        if (path === '/api/v1/studio/engine/scenes')
          return { current: 'Main', scenes: [{ name: 'Main' }] }
        if (path === '/api/v1/studio/engine/kinds') return { inputs: [{ id: 'ferrocast_web' }] }
        if (path === '/api/v1/studio/engine/sources') return [{ name: 'Main' }]
      }
      if (method === 'POST') {
        if (path === '/api/v1/studio/engine/scenes') {
          calls.addScene.push((body as { name: string }).name)
          return undefined
        }
        const items = /^\/api\/v1\/studio\/engine\/scenes\/([^/]+)\/items$/.exec(path)
        if (items) {
          const payload = body as { existing?: string; settings?: { url?: string } }
          if (payload.existing) {
            calls.addExisting.push({
              scene: decodeURIComponent(items[1]!),
              name: payload.existing,
            })
            return { item: { id: 1, name: payload.existing } }
          }
          calls.addSource.push({
            scene: decodeURIComponent(items[1]!),
            url: payload.settings?.url ?? '',
          })
          return { item: { id: 2, name: 'Overlay' }, settings: {} }
        }
      }
      if (method === 'PUT') return undefined
      throw new Error(`unexpected ${method} ${path}`)
    }),
    ...clientOverrides,
  }
  useLive.setState({ conn: { client } as never, connectors: {} as never })
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <>
        <Toaster />
        {node}
      </>,
    )
  })
  await flushMicrotasks()
  return { host, client, calls }
}

function byText(rootEl: Element, tag: string, text: string): HTMLElement {
  const found = Array.from(rootEl.querySelectorAll<HTMLElement>(tag)).find(
    (el) => el.textContent?.trim() === text,
  )
  if (!found) throw new Error(`missing <${tag}> with text "${text}"`)
  return found
}

describe('UseDialog / ThemeUseDialog partial selection', () => {
  it('ticks all screens by default, supports Select none/all, and sends only ticked scenes to useDesign and Studio', async () => {
    const onClose = vi.fn()
    const { host, calls } = await mountNode(<UseDialog design={lofi} onClose={onClose} />)

    const endingBtn = byText(host, 'button', 'Ending')
    expect(endingBtn.getAttribute('aria-pressed')).toBe('true')
    expect(host.textContent).toContain('Screens (5 of 5)')

    await act(async () => {
      byText(host, 'button', 'Select none').click()
    })
    expect(host.textContent).toContain('Screens (0 of 5)')
    expect(endingBtn.getAttribute('aria-pressed')).toBe('false')

    await act(async () => {
      byText(host, 'button', 'Select all').click()
    })
    expect(host.textContent).toContain('Screens (5 of 5)')

    // Keep only Starting soon and Ending ticked.
    for (const name of ['In game', 'Just chatting', 'Be right back']) {
      await act(async () => {
        byText(host, 'button', name).click()
      })
    }
    expect(host.textContent).toContain('Screens (2 of 5)')

    await act(async () => {
      byText(host, 'button', 'Next').click()
    })
    await flushMicrotasks()

    const submit = byText(host, 'button', 'Make 2 overlays') as HTMLButtonElement
    expect(submit.disabled).toBe(false)

    await act(async () => {
      submit.click()
    })
    await flushMicrotasks()

    expect(calls.useDesign).toEqual([
      {
        id: lofi.id,
        req: { scenes: ['starting_soon', 'ending'], alert_style: true },
      },
    ])
    // Set it up in the Studio is on by default when usesObs is false: only the 2 ticked screens are added.
    expect(calls.addScene).toEqual(['Lo-fi loft · Starting soon', 'Lo-fi loft · Ending'])
    expect(calls.addExisting).toEqual([])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('supports alert-style-only import without sending scenes: [], and disables primary button if both screens and alerts are off', async () => {
    const onClose = vi.fn()
    const onAlertApplied = vi.fn()
    const { host, calls } = await mountNode(
      <UseDialog design={lofi} onClose={onClose} onAlertApplied={onAlertApplied} />,
    )

    await act(async () => {
      byText(host, 'button', 'Select none').click()
    })

    const alertBtn = byText(host, 'button', 'Use alert style') as HTMLButtonElement
    expect(alertBtn.disabled).toBe(false)

    // Turning off "Use its alert style" disables the primary CTA cleanly.
    const alertSwitch = host.querySelector<HTMLButtonElement>('button[role="switch"]')!
    await act(async () => {
      alertSwitch.click()
    })
    expect(alertBtn.disabled).toBe(true)
    expect(host.textContent).toContain('Tick at least one screen or turn on its alert style.')

    // Turn back on and apply alert style only.
    await act(async () => {
      alertSwitch.click()
    })
    expect(alertBtn.disabled).toBe(false)
    await act(async () => {
      alertBtn.click()
    })
    await flushMicrotasks()

    expect(calls.useDesign).toEqual([{ id: lofi.content.alert_design, req: undefined }])
    expect(onAlertApplied).toHaveBeenCalledWith(lofi.content.alert_design)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables Next when 0 screens are ticked and the theme has no alert design', async () => {
    const noAlertTheme: ThemeDesign = {
      ...structuredClone(lofi),
      id: 'custom.no-alerts',
      content: { ...structuredClone(lofi.content), alert_design: null },
    }
    const { host } = await mountNode(<UseDialog design={noAlertTheme} onClose={vi.fn()} />)

    await act(async () => {
      byText(host, 'button', 'Select none').click()
    })

    const next = byText(host, 'button', 'Next') as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect(host.textContent).toContain('Tick at least one screen to continue.')
  })

  it('marks Already added screens and defaults to only the remaining un-imported screens', async () => {
    const existing = [overlayFor('in_game'), overlayFor('just_chatting')]
    const { host } = await mountNode(<UseDialog design={lofi} onClose={vi.fn()} />, {
      overlays: vi.fn(async () => existing),
    })

    expect(host.textContent).toContain('Already added')
    expect(byText(host, 'button', 'In game').getAttribute('aria-pressed')).toBe('false')
    expect(byText(host, 'button', 'Just chatting').getAttribute('aria-pressed')).toBe('false')
    expect(byText(host, 'button', 'Starting soon').getAttribute('aria-pressed')).toBe('true')
    expect(host.textContent).toContain('Screens (3 of 5)')

    // Manually re-ticking an already-added screen shows the clarifying helper text.
    await act(async () => {
      byText(host, 'button', 'In game').click()
    })
    expect(host.textContent).toContain('Already-added screens will be created as new overlays.')
  })

  it('supports One part mode adding a single theme widget onto an existing overlay via saveOverlay', async () => {
    const target: Overlay = {
      id: 'ov-custom',
      name: 'My Main Overlay',
      url: 'http://127.0.0.1:4190/overlay/ov-custom',
      width: 1280,
      height: 720,
      widgets: [],
      updated_at: 1,
      design: null,
    }
    const { host, calls } = await mountNode(<UseDialog design={lofi} onClose={vi.fn()} />, {
      overlays: vi.fn(async () => [target]),
    })

    const onePartRadio = byText(host, 'label', 'One part')
    await act(async () => {
      onePartRadio.click()
    })

    const selects = Array.from(host.querySelectorAll('select'))
    expect(selects).toHaveLength(2)
    await act(async () => {
      const ovSelect = selects[1]!
      ovSelect.value = 'ov-custom'
      ovSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const addPart = byText(host, 'button', 'Add part') as HTMLButtonElement
    expect(addPart.disabled).toBe(false)
    await act(async () => {
      addPart.click()
    })
    await flushMicrotasks()

    expect(calls.useDesign).toEqual([])
    expect(calls.saveOverlay).toHaveLength(1)
    expect(calls.saveOverlay[0]!.id).toBe('ov-custom')
    expect(calls.saveOverlay[0]!.widgets).toHaveLength(1)
  })
})

describe('ThemeSheet Use just this screen', () => {
  it('calls onUseScreen with the active screen and hides it for single-screen themes', async () => {
    const onUseScreen = vi.fn()
    const onUseAlert = vi.fn()
    const { host } = await mountNode(
      <ThemeSheet
        theme={lofi}
        alertDesign={lofiAlert}
        onClose={vi.fn()}
        onUse={vi.fn()}
        onUseScreen={onUseScreen}
        onUseAlert={onUseAlert}
        onDuplicate={vi.fn()}
      />,
    )

    await act(async () => {
      byText(host, 'button', 'Ending').click()
    })
    await act(async () => {
      byText(host, 'button', 'Use just this screen').click()
    })
    expect(onUseScreen).toHaveBeenCalledWith(lofi, 'ending')

    await act(async () => {
      byText(host, 'button', 'Alerts').click()
    })
    await act(async () => {
      byText(host, 'button', 'Use just this alert style').click()
    })
    expect(onUseAlert).toHaveBeenCalledWith(lofiAlert)

    // Single-screen theme hides "Use just this screen".
    const singleScreen: ThemeDesign = {
      ...structuredClone(lofi),
      id: 'custom.single',
      content: { scenes: [lofi.content.scenes[0]!], alert_design: null },
    }
    await act(async () => {
      root?.render(
        <ThemeSheet
          theme={singleScreen}
          alertDesign={null}
          onClose={vi.fn()}
          onUse={vi.fn()}
          onUseScreen={onUseScreen}
          onDuplicate={vi.fn()}
        />,
      )
    })
    expect(host.textContent).not.toContain('Use just this screen')
  })

  it('UseDialog respects initialScenes even when other screens are already overlays', async () => {
    const { host, calls } = await mountNode(
      <UseDialog design={lofi} initialScenes={['ending']} onClose={vi.fn()} />,
      { overlays: vi.fn(async () => [overlayFor('in_game'), overlayFor('starting_soon')]) },
    )

    expect(host.textContent).toContain('Screens (1 of 5)')
    expect(byText(host, 'button', 'Ending').getAttribute('aria-pressed')).toBe('true')
    expect(byText(host, 'button', 'In game').getAttribute('aria-pressed')).toBe('false')

    await act(async () => {
      byText(host, 'button', 'Next').click()
    })
    await flushMicrotasks()

    const submit = byText(host, 'button', 'Make 1 overlay') as HTMLButtonElement
    await act(async () => {
      submit.click()
    })
    await flushMicrotasks()

    expect(calls.useDesign).toEqual([
      { id: lofi.id, req: { scenes: ['ending'], alert_style: true } },
    ])
    expect(calls.addScene).toEqual(['Lo-fi loft · Ending'])
    expect(calls.addExisting).toEqual([])
  })

  it('preserves user screen exclusions when toggling Set it up in OBS too back on', async () => {
    mockUsesObs = true
    const obsPlan = {
      plan: {
        prefix: lofi.name,
        screens: lofi.content.scenes.map((s) => ({
          key: s.key,
          place: { kind: 'new' as const },
          under: null,
          role: null,
        })),
      },
      screens: lofi.content.scenes.map((s) => ({ key: s.key, name: s.name })),
      obs_scenes: ['Main'],
      obs_cameras: ['Camera'],
      old_widgets: [],
      applied: null,
    }
    const { host } = await mountNode(<UseDialog design={lofi} onClose={vi.fn()} />, {
      request: vi.fn(async (method: string, path: string) => {
        if (method === 'GET' && path === `/api/v1/designs/${encodeURIComponent(lofi.id)}/obs`) {
          return obsPlan
        }
        return undefined
      }),
    })
    await act(async () => {
      useLive.setState({
        connectors: {
          obs: { state: 'connected', account: null, detail: null, last_event_at: null },
        } as never,
      })
    })
    await flushMicrotasks()

    // Turn OBS setup off, exclude Ending and In game, then turn OBS setup back on.
    const obsOffSwitch = host.querySelector<HTMLButtonElement>('button[role="switch"]')!
    await act(async () => {
      obsOffSwitch.click()
    })
    await act(async () => {
      byText(host, 'button', 'Ending').click()
      byText(host, 'button', 'In game').click()
    })
    expect(host.textContent).toContain('Screens (3 of 5)')

    const obsOnSwitch = host.querySelector<HTMLButtonElement>('button[role="switch"]')!
    await act(async () => {
      obsOnSwitch.click()
    })
    await flushMicrotasks()

    expect(host.textContent).toContain('Screens (3 of 5)')
    expect(byText(host, 'button', 'Ending').getAttribute('aria-pressed')).toBe('false')
    expect(byText(host, 'button', 'In game').getAttribute('aria-pressed')).toBe('false')
    expect(byText(host, 'button', 'Starting soon').getAttribute('aria-pressed')).toBe('true')
  })
})
