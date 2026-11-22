import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, useMemo, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { zipSync, strToU8 } from 'fflate'
import { FerroClient, studioEngineApi } from '@ferrocast/api'
import { DemoEngine, DEMO_TOKEN } from '@ferrocast/api/demo'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../../../lib/store'
import { DeskProvider, type Desk } from './common'
import { LibraryBar } from './library'

const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

function makePackFile(name = 'CyberWave.overlay'): File {
  const cfg = {
    schemaVersion: 2,
    nodeType: 'RootNode',
    data: {
      scenes: {
        data: {
          items: [
            {
              name: 'Starting Soon',
              sceneId: 'sc-1',
              slots: {
                data: {
                  items: [
                    {
                      id: 'i1',
                      name: 'Card',
                      sceneNodeType: 'item',
                      x: 0.1,
                      y: 0.1,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'ImageNode', data: { filename: 'assets/card.png' } },
                    },
                    {
                      id: 'i2',
                      name: 'Title',
                      sceneNodeType: 'item',
                      x: 0.2,
                      y: 0.2,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: {
                        nodeType: 'TextNode',
                        data: {
                          settings: { text: 'SOON', font: { face: 'Montserrat', size: 44 } },
                        },
                      },
                    },
                    {
                      id: 'i3',
                      name: 'Goal',
                      sceneNodeType: 'item',
                      x: 0.3,
                      y: 0.8,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'WidgetNode', data: { type: 'FollowerGoal' } },
                    },
                    {
                      id: 'i4',
                      name: 'Sponsor',
                      sceneNodeType: 'item',
                      x: 0.8,
                      y: 0.8,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'WidgetNode', data: { type: 'SponsorBanner' } },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
  }
  const jsonBytes = Uint8Array.from(strToU8(JSON.stringify(cfg)))
  const bytes = zipSync({
    'config.json': jsonBytes,
    'assets/card.png': TINY_PNG,
  })
  return new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'application/zip' })
}

let root: Root | null = null

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null })
  currentToasts().forEach((t) => dismissToast(t.id))
})

describe('Import a theme pack flow in LibraryBar', () => {
  it('opens from scene collections menu, shows inline error on bad zip, previews, imports, shows result and undoes', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    HTMLDialogElement.prototype.showModal ??= function () {
      this.open = true
    }
    HTMLDialogElement.prototype.close ??= function () {
      this.open = false
    }

    const demo = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: demo.base, token: DEMO_TOKEN, fetch: demo.fetch })
    const api = studioEngineApi(client)
    const refresh = vi.fn()

    function Harness() {
      const [library, setLibrary] = useState(0)
      const desk = useMemo(
        () =>
          ({
            api,
            refresh,
            library,
            bumpLibrary: () => setLibrary((n) => n + 1),
          }) as unknown as Desk,
        [library],
      )
      return (
        <DeskProvider value={desk}>
          <LibraryBar />
        </DeskProvider>
      )
    }

    useLive.setState({ conn: { client } as never })
    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => {
      root!.render(<Harness />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const btn = await vi.waitFor(() => {
      const found = host.querySelector(
        'button[aria-label="scene collection: Main Show"]',
      ) as HTMLButtonElement | null
      if (!found) throw new Error('scene collection button not ready')
      return found
    })
    await act(async () => btn.click())

    const importItem = Array.from(document.querySelectorAll('[role^="menuitem"]')).find((el) =>
      el.textContent?.includes('Import a theme pack'),
    ) as HTMLButtonElement | undefined
    expect(importItem).toBeDefined()
    await act(async () => importItem!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    const fileInput = document.querySelector(
      'input[aria-label="Choose .overlay theme pack file"]',
    ) as HTMLInputElement
    expect(fileInput).not.toBeNull()

    // Upload corrupt zip first -> inline alert shown
    const badFile = new File([new TextEncoder().encode('not-a-zip')], 'bad.overlay')
    const setFiles = (f: File) => {
      const fl = Object.assign([f], {
        item: (i: number) => (i === 0 ? f : null),
      }) as unknown as FileList
      Object.defineProperty(fileInput, 'files', { configurable: true, value: fl })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await act(async () => setFiles(badFile))
    await vi.waitFor(() => {
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        '.overlay zip archive',
      )
    })

    // Now upload valid .overlay pack -> transitions to preview
    await act(async () => setFiles(makePackFile()))
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Review theme pack')
    })
    expect(document.body.textContent).toContain('Montserrat')
    expect(document.body.textContent).toContain('Will fetch from Google Fonts')
    expect(document.body.textContent).toContain('SponsorBanner')

    // Click Import theme pack -> Result view with downloaded font & created overlay
    const importBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Import theme pack'),
    ) as HTMLButtonElement
    await act(async () => importBtn.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(document.body.textContent).toContain('Theme pack imported')
    expect(document.body.textContent).toContain('Downloaded (Google Fonts)')
    expect((await api.shelf('collections')).current).toBe('cyberwave')
    await vi.waitFor(() => {
      expect(host.querySelector('button[aria-label="scene collection: CyberWave"]')).not.toBeNull()
    })

    // Click Undo import -> restores Main Show
    const undoBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Undo import'),
    ) as HTMLButtonElement
    await act(async () => undoBtn.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(document.body.textContent).toContain('Theme pack undone')
    expect((await api.shelf('collections')).current).toBe('default')
  })
})
