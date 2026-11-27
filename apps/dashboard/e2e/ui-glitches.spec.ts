import { expect, test, type Locator, type Page } from '@playwright/test'
import { open, settled } from './helpers'

// Layout regressions found by the UI scan: nothing clipped or overlapping, one dialog at a
// time, the live picture cut out under a dialog, no sideways scroll on a phone.

async function openDesk(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = { desktop: true }
    localStorage.setItem('fc-golive-picture', 'ferrocast')
  })
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
      // Inside a scroller the content may be wider on purpose.
      let scroller = false
      for (let p = n.parentElement; p && p !== root; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') {
          scroller = true
          break
        }
      }
      if (scroller) continue
      if (r.right > box.right + 1.5 || r.left < box.left - 1.5) {
        offenders.push(`${n.tagName}.${String(n.className).slice(0, 60)}`)
      }
    }
    return {
      over: Math.max(0, root.scrollWidth - root.clientWidth),
      offenders: offenders.slice(0, 5),
    }
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
