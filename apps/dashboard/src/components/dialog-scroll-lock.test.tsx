import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConfirmDialog, Dialog } from '@ferrocast/ui'

let root: Root | null = null

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute('open', '')
      }
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function () {
        this.removeAttribute('open')
      }
    }
  }
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  delete document.documentElement.dataset.scrollLock
  delete document.documentElement.dataset.scrollGutter
  document.documentElement.removeAttribute('style')
  vi.restoreAllMocks()
})

describe('Dialog / Confirm scroll lock without mutating html.style', () => {
  it('toggles data-scroll-lock and data-scroll-gutter without touching documentElement.style', async () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1800,
    })
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      value: 800,
    })

    const styleMutations: string[] = []
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.attributeName) styleMutations.push(r.attributeName)
      }
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })

    const host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)

    await act(async () => {
      root!.render(
        <>
          <Dialog open onClose={() => undefined} title="Outer">
            <p>Outer body</p>
          </Dialog>
          <ConfirmDialog
            open
            onClose={() => undefined}
            onConfirm={() => undefined}
            confirm="Delete"
            title="Nested"
            description="Confirm body"
          />
        </>,
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(document.documentElement.dataset.scrollLock).toBe('true')
    expect(document.documentElement.dataset.scrollGutter).toBe('stable')
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.documentElement.style.scrollbarGutter).toBe('')
    expect(styleMutations).toEqual([])

    // Close only the nested Confirm while outer Dialog stays open: lock must hold.
    await act(async () => {
      root!.render(
        <>
          <Dialog open onClose={() => undefined} title="Outer">
            <p>Outer body</p>
          </Dialog>
          <ConfirmDialog
            open={false}
            onClose={() => undefined}
            onConfirm={() => undefined}
            confirm="Delete"
            title="Nested"
          />
        </>,
      )
    })

    expect(document.documentElement.dataset.scrollLock).toBe('true')
    expect(document.documentElement.dataset.scrollGutter).toBe('stable')

    // Close outer Dialog too: lock & gutter attributes clear cleanly.
    await act(async () => {
      root!.render(
        <Dialog open={false} onClose={() => undefined} title="Outer">
          <p>Outer body</p>
        </Dialog>,
      )
    })

    expect(document.documentElement.dataset.scrollLock).toBeUndefined()
    expect(document.documentElement.dataset.scrollGutter).toBeUndefined()
    expect(styleMutations).toEqual([])
    mo.disconnect()
  })

  it('defines matching CSS rules in packages/ui/src/styles/base.css', () => {
    const cssPath = path.resolve(process.cwd(), '../../packages/ui/src/styles/base.css')
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(css).toContain("data-scroll-lock='true'")
    expect(css).toContain("data-scroll-gutter='stable'")
  })
})
