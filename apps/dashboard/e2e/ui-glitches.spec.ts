import { expect, test, type Locator, type Page } from '@playwright/test'
import { open, settled } from './helpers'

// Layout regressions found by the UI scan: nothing clipped or overlapping, one dialog at a
// time, the live picture cut out under a dialog, no sideways scroll on a phone.

async function openDesk(
  page: Page,
  width: number,
  height: number,
  layout?: Record<string, unknown>,
): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.addInitScript(
    (layoutJson: string | null) => {
      ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = { desktop: true }
      localStorage.setItem('fc-golive-picture', 'ferrocast')
      if (layoutJson) localStorage.setItem('fc-studio-layout', layoutJson)
    },
    layout ? JSON.stringify(layout) : null,
  )
  await open(page, 'studio/golive', 'autoplay=0&latency=0&studioEngine=1')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  await expect(page.locator('[data-canvas-box]').first()).toBeVisible()
  await page.evaluate(() => {
    const w = window as unknown as {
      __overlayEvents?: { overlays: { x: number; y: number; w: number; h: number }[] }[]
    }
    w.__overlayEvents = []
    window.addEventListener('fc:preview-overlays', ((ev: CustomEvent) => {
      w.__overlayEvents?.push(ev.detail)
    }) as EventListener)
  })
  const closeReady = page.getByRole('button', { name: 'Close the ready check' })
  await closeReady
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => closeReady.click())
    .catch(() => undefined)
}

/** The element and everything inside it fits its own box sideways: nothing clipped or spilling. */
async function fitsSideways(el: Locator): Promise<{ over: number; offenders: string[] }> {
  return el.evaluate((root) => {
    const box = root.getBoundingClientRect()
    const offenders: string[] = []
    for (const n of root.querySelectorAll('*')) {
      const r = n.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cs = getComputedStyle(n)
      if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') continue
      // Content inside a real scroller may be wider on purpose. A box that only clips
      // (overflow hidden or clip) hides what spills out, so the control must fit that box.
      let scrolls = false
      let clippedByAncestor = false
      for (let p = n.parentElement; p && p !== root; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll') {
          scrolls = true
          break
        }
        if (ox === 'hidden' || ox === 'clip') {
          const pr = p.getBoundingClientRect()
          if (r.right > pr.right + 1.5 || r.left < pr.left - 1.5) clippedByAncestor = true
        }
      }
      if (scrolls) continue
      if (clippedByAncestor) {
        offenders.push(`clipped ${n.tagName}.${String(n.className).slice(0, 60)}`)
        continue
      }
      if (r.right > box.right + 1.5 || r.left < box.left - 1.5) {
        offenders.push(`${n.tagName}.${String(n.className).slice(0, 60)}`)
      }
    }
    // The box and any scroll area inside it must not need a sideways scrollbar: a dialog body
    // with overflow-y:auto is also overflow-x:auto, so a too-wide table would scroll silently.
    let over = Math.max(0, root.scrollWidth - root.clientWidth)
    for (const n of root.querySelectorAll('*')) {
      const ox = getComputedStyle(n).overflowX
      if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth - n.clientWidth > 1) {
        over = Math.max(over, n.scrollWidth - n.clientWidth)
        offenders.push(`scrolls sideways ${n.tagName}.${String(n.className).slice(0, 60)}`)
      }
    }
    return { over, offenders: offenders.slice(0, 5) }
  })
}

test.describe('Studio desk at desktop widths', () => {
  test.skip(({ isMobile }) => !!isMobile, 'The desk on a phone is checked elsewhere.')

  for (const width of [1024, 1120, 1280]) {
    test(`the status bar keeps every reading inside the window (${width}px)`, async ({ page }) => {
      await openDesk(page, width, 800)
      await settled(page)
      const bar = page.locator('footer[aria-label="Studio status"]')
      await expect(bar).toBeVisible()
      const m = await bar.evaluate((f) => {
        const fr = f.getBoundingClientRect()
        const btn = f.querySelector('button[aria-label^="Studio status"]')!.getBoundingClientRect()
        return {
          scrollOver: f.scrollWidth - f.clientWidth,
          btnRight: btn.right,
          barRight: fr.right,
          vw: document.documentElement.clientWidth,
        }
      })
      expect(m.scrollOver).toBeLessThanOrEqual(1)
      expect(m.btnRight).toBeLessThanOrEqual(m.barRight + 1)
      expect(m.barRight).toBeLessThanOrEqual(m.vw + 1)
    })
  }

  test('Advanced audio fits its dialog at 1024px and its rows keep their height', async ({
    page,
  }) => {
    await openDesk(page, 1024, 800)
    await page.getByRole('button', { name: /^Advanced audio/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Advanced audio' })
    await expect(dialog).toBeVisible()
    await settled(page)
    const fit = await fitsSideways(dialog)
    expect(fit.over, JSON.stringify(fit)).toBeLessThanOrEqual(1)
    expect(fit.offenders, JSON.stringify(fit)).toEqual([])
    // A row is as tall as what is in it: its last control is inside it.
    const rows = await dialog.evaluate((d) => {
      const bad: string[] = []
      for (const row of d.querySelectorAll<HTMLElement>('[id^="adv-audio-"]')) {
        const r = row.getBoundingClientRect()
        for (const c of row.querySelectorAll('input, select, button')) {
          const cr = c.getBoundingClientRect()
          if (cr.height > 0 && cr.bottom > r.bottom + 1) bad.push(row.id)
        }
      }
      return bad
    })
    expect(rows).toEqual([])
  })

  test('the platforms dialog cuts a hole for its whole panel in the live picture', async ({
    page,
  }) => {
    await openDesk(page, 1280, 800)
    await page.getByRole('button', { name: 'Manage platforms' }).click()
    const dialog = page.locator('dialog[data-platforms-modal][open]')
    await expect(dialog).toBeVisible()
    await settled(page)
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    )
    const box = (await dialog.boundingBox())!
    const covered = await page.evaluate((b) => {
      const w = window as unknown as {
        __overlayEvents?: { overlays: { x: number; y: number; w: number; h: number }[] }[]
      }
      const last = w.__overlayEvents?.at(-1)?.overlays ?? []
      return last.some(
        (o) =>
          Math.abs(o.x - b.x) <= 2 &&
          Math.abs(o.y - b.y) <= 2 &&
          Math.abs(o.w - b.width) <= 3 &&
          Math.abs(o.h - b.height) <= 3,
      )
    }, box)
    expect(covered, 'no hole matches the dialog panel').toBe(true)
  })

  test('Studio settings opens the setup and the log inside itself: one dialog, a way back', async ({
    page,
  }) => {
    await openDesk(page, 1280, 800)
    await page.getByRole('button', { name: 'Studio settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Studio settings' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /Set up for me/i }).click()
    await expect(page.locator('dialog[open]')).toHaveCount(1)
    await expect(dialog.getByRole('heading', { name: 'Set up for me' }).first()).toBeVisible()
    // Escape steps back to the settings; it does not close everything.
    await page.keyboard.press('Escape')
    await expect(dialog.getByRole('button', { name: /Set up for me/i })).toBeVisible()
    await expect(page.locator('dialog[open]')).toHaveCount(1)

    await dialog.getByRole('button', { name: 'Advanced', exact: true }).click()
    await dialog.getByRole('button', { name: 'Open the log' }).click()
    await expect(page.locator('dialog[open]')).toHaveCount(1)
    await expect(dialog.getByRole('heading', { name: 'Log' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Open the log' })).toBeVisible()
  })

  test('Settings rows keep their labels readable between 640 and 720px', async ({ page }) => {
    await openDesk(page, 700, 800)
    await page.getByRole('button', { name: 'Studio settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Studio settings' })
    await expect(dialog).toBeVisible()
    await settled(page)
    const narrow = await dialog.evaluate((d) => {
      const bad: string[] = []
      for (const row of d.querySelectorAll('[class*="min-h-9"]')) {
        const label = row.firstElementChild as HTMLElement | null
        if (
          label &&
          label.getBoundingClientRect().width > 0 &&
          label.getBoundingClientRect().width < 60
        ) {
          bad.push(label.textContent?.slice(0, 30) ?? '')
        }
      }
      return bad
    })
    expect(narrow).toEqual([])
  })

  test('a long scene name leaves the Sources Add button whole', async ({ page }) => {
    await openDesk(page, 1280, 800)
    const scene = (await page.locator('[data-scene-name]').first().getAttribute('data-scene-name'))!
    await page.evaluate(
      ([from, to]) => {
        const d = (
          window as unknown as {
            __ferrocastDemo?: {
              studioEngine: { route: (m: string, s: string[], b: unknown) => unknown }
            }
          }
        ).__ferrocastDemo!
        d.studioEngine.route('POST', ['studio', 'engine', 'sources', from!, 'rename'], { name: to })
      },
      [scene, 'An extremely long scene name that goes on and on and on for far too long'],
    )
    const add = page.getByRole('button', { name: /^Add a source to / })
    await expect(add).toBeVisible()
    const box = (await add.boundingBox())!
    // As wide as an icon button in a dock bar is (26 px), not squeezed to a dot.
    expect(box.width).toBeGreaterThanOrEqual(25)
  })

  test('Remove stays inside a narrow Sources dock', async ({ page }) => {
    await openDesk(page, 1024, 800, {
      left: ['scenes'],
      right: ['golive'],
      bottom: ['sources', 'audio'],
      float: {},
      hidden: [],
      mob: 'scenes',
      lw: 240,
      rw: 240,
      bh: 220,
      w: { scenes: 1, sources: 0.3, audio: 1.7, golive: 1 },
      locked: false,
      preset: null,
      webs: [],
    })
    await settled(page)
    const m = await page.evaluate(() => {
      const dock = document.querySelector('[data-dock="sources"]')!.getBoundingClientRect()
      const remove = [...document.querySelectorAll('[data-dock="sources"] footer button')]
        .find((b) => /^Remove/.test(b.getAttribute('aria-label') ?? ''))!
        .getBoundingClientRect()
      return { dockRight: dock.right, removeRight: remove.right, w: dock.width }
    })
    expect(m.removeRight).toBeLessThanOrEqual(m.dockRight + 1)
  })

  for (const width of [1280, 375]) {
    test(`Edit transform opens the source panel on Position, crop included, and it fits (${width}px)`, async ({
      page,
    }) => {
      await openDesk(page, width, 800)
      const row = page.locator('[data-dock="sources"] [data-item-id]').first()
      if (width < 800) {
        // On a phone one panel shows at a time, picked below the picture.
        await page
          .getByRole('radiogroup', { name: 'Panel' })
          .getByText('Sources', { exact: true })
          .click()
      }
      await row.click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Transform' }).hover()
      await page.getByRole('menuitem', { name: 'Edit transform' }).click()
      const panel = page.locator('aside[aria-label$=" settings"]')
      await expect(panel).toBeVisible()
      await expect(panel.getByLabel('Crop left')).toBeVisible()
      const fit = await fitsSideways(panel)
      expect(fit.over, JSON.stringify(fit)).toBeLessThanOrEqual(1)
      expect(fit.offenders, JSON.stringify(fit)).toEqual([])
    })
  }

  for (const width of [1280, 375]) {
    test(`the Missing files dialog fits and its buttons stay inside (${width}px)`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const patch = () => {
          const d = (
            window as unknown as {
              __ferrocastDemo?: {
                studioEngine: { route: (...a: unknown[]) => unknown }
              }
            }
          ).__ferrocastDemo
          if (!d || (d as { __patched?: boolean }).__patched) return
          ;(d as { __patched?: boolean }).__patched = true
          const orig = d.studioEngine.route.bind(d.studioEngine)
          d.studioEngine.route = (method: unknown, seg: unknown, body: unknown, url: unknown) =>
            method === 'GET' && (seg as string[]).join('/') === 'studio/engine/missing-files'
              ? [
                  {
                    source: 'Intro video',
                    parent: null,
                    kind: 'ffmpeg_source',
                    key: 'local_file',
                    label: 'File',
                    path: '/Users/someone/Videos/an-extremely-long-folder-name/with/many/levels/and-a-very-long-file-name-for-the-intro-video-final-v7.mp4',
                  },
                  {
                    source: 'Logo',
                    parent: 'A scene with a long name too',
                    kind: 'image_source',
                    key: 'file',
                    label: 'File',
                    path: 'C:\\Pictures\\logo.png',
                  },
                ]
              : orig(method, seg, body, url)
        }
        const t = setInterval(patch, 20)
        setTimeout(() => clearInterval(t), 8000)
      })
      await openDesk(page, width, 800)
      await page.getByRole('button', { name: 'Find them' }).click()
      const dialog = page.getByRole('dialog', { name: 'Missing files' })
      await expect(dialog).toBeVisible()
      await settled(page)
      const fit = await fitsSideways(dialog)
      expect(fit.over, JSON.stringify(fit)).toBeLessThanOrEqual(1)
      expect(fit.offenders, JSON.stringify(fit)).toEqual([])
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    })
  }

  test('stacked docks keep room for a row each', async ({ page }) => {
    await openDesk(page, 1280, 560, {
      left: ['scenes', 'sources', 'audio', 'chat', 'events'],
      right: ['golive'],
      bottom: [],
      float: {},
      hidden: [],
      mob: 'scenes',
      lw: 300,
      rw: 240,
      bh: 200,
      w: { scenes: 1, sources: 1, audio: 1, chat: 1, events: 1, golive: 1 },
      locked: false,
      preset: null,
      webs: [],
    })
    await settled(page)
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('[data-dock-region="left"] > [data-dock]')].map((d) =>
        Math.round(d.getBoundingClientRect().height),
      ),
    )
    expect(heights.length).toBeGreaterThanOrEqual(4)
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(90)
  })
})

const ROUTES = [
  'home',
  'chat',
  'alerts',
  'overlays',
  'designs',
  'community',
  'bot',
  'history',
  'tips',
  'moderation',
  'store',
  'settings',
  'settings/obs',
  'settings/advanced',
  'cloud',
  'account',
]

test.describe('A phone (375px): nothing scrolls sideways', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  for (const route of ROUTES) {
    test(`#/${route}`, async ({ page }) => {
      await open(page, route)
      await settled(page)
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(over, `${route} is ${over}px wider than the phone`).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('Rows that grew with their content stay inside their box', () => {
  test('a long event detail does not make the feed rows jump on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'home')
    const rows = page.locator('li:has(time)')
    const first = rows.first()
    await expect(first).toBeVisible()
    const before = await first.boundingBox()
    await first.hover()
    const after = await first.boundingBox()
    expect(after!.height).toBe(before!.height)
  })

  test('the Alerts top bar grows with its buttons instead of spilling over the editor', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await open(page, 'alerts/sub')
    const editor = page.getByTestId('alert-editor')
    await expect(editor).toBeVisible()
    await editor.getByLabel('Rule name').fill('A rule with a long and unusual name')
    await settled(page)
    const spill = await editor.evaluate((ed) => {
      const header = ed.querySelector('header')!.getBoundingClientRect()
      let worst = 0
      for (const b of ed.querySelectorAll('header button')) {
        worst = Math.max(worst, b.getBoundingClientRect().bottom - header.bottom)
      }
      return worst
    })
    expect(spill).toBeLessThanOrEqual(1)
  })
})

test.describe('Dialogs, toasts and screens', () => {
  test('a toast already showing is raised above a dialog that opens', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'home')
    await page.getByRole('button', { name: /panic/i }).first().click()
    await expect(
      page.getByRole('region', { name: 'Notifications' }).getByRole('status').first(),
    ).toBeVisible()
    // Top-layer order is the order things were put there: record it.
    await page.evaluate(() => {
      const log: string[] = []
      ;(window as unknown as { __topLayer: string[] }).__topLayer = log
      const wrap = (proto: object, name: string, tag: string) => {
        const orig = (proto as Record<string, (...a: unknown[]) => unknown>)[name]!
        ;(proto as Record<string, unknown>)[name] = function (this: unknown, ...a: unknown[]) {
          log.push(tag)
          return orig.apply(this, a)
        }
      }
      wrap(HTMLDialogElement.prototype, 'showModal', 'dialog')
      wrap(HTMLElement.prototype, 'showPopover', 'toasts')
    })
    await page.getByRole('button', { name: 'Start show' }).first().click()
    await expect(page.locator('dialog[open]')).toHaveCount(1)
    const log = await page.evaluate(
      () => (window as unknown as { __topLayer: string[] }).__topLayer,
    )
    expect(log.indexOf('dialog')).toBeGreaterThanOrEqual(0)
    // The toasts went into the top layer after the dialog, so they are drawn over its backdrop.
    expect(log.lastIndexOf('toasts')).toBeGreaterThan(log.indexOf('dialog'))
  })

  test('Escape gives focus back to the button that opened a dialog', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'bot')
    const opener = page.getByRole('button', { name: 'New command' }).first()
    await opener.focus()
    await opener.press('Enter')
    await expect(page.locator('dialog[open]')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('the Designs counts do not read 0 while the library loads', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'designs/alerts', 'autoplay=0&latency=3000')
    const tab = page.getByRole('navigation', { name: 'Gallery' }).getByRole('link').first()
    await expect(tab).toBeVisible()
    const count = tab.locator('span').last()
    await expect(count).toHaveCSS('visibility', 'hidden')
  })

  test('Duplicate & customise stays inside every built-in card at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'designs/alerts')
    const cards = page.locator('article')
    await expect(cards.first()).toBeVisible()
    const bad = await cards.evaluateAll((list) => {
      const out: string[] = []
      for (const c of list) {
        const cr = c.getBoundingClientRect()
        for (const b of c.querySelectorAll('button, a')) {
          const r = b.getBoundingClientRect()
          if (r.width > 0 && (r.right > cr.right + 0.5 || r.left < cr.left - 0.5)) {
            out.push(b.textContent?.trim() ?? '')
          }
        }
      }
      return out
    })
    expect(bad).toEqual([])
  })

  test('on a phone the Settings strip shows the open section', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'settings/advanced')
    await expect(page.locator('nav[aria-label="Settings sections"]')).toBeVisible()
    await settled(page)
    await page.waitForTimeout(400)
    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Settings sections"]')!
      const cur = nav.querySelector('[aria-current="page"]')!.getBoundingClientRect()
      const box = nav.getBoundingClientRect()
      return { left: cur.left, right: cur.right, navLeft: box.left, navRight: box.right }
    })
    expect(m.left).toBeGreaterThanOrEqual(m.navLeft - 1)
    expect(m.right).toBeLessThanOrEqual(m.navRight + 1)
  })
})
