import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, open, settled } from './helpers'

type Dlg = ReturnType<Page['getByRole']>

const SHOT_DIR = process.env.FC_FPS_SHOTS

async function snap(page: Page, name: string, el?: Dlg) {
  if (!SHOT_DIR) return
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  const file = path.join(SHOT_DIR, name)
  if (el) await el.screenshot({ path: file })
  else await page.screenshot({ path: file })
}

async function enterStudioDesk(page: Page): Promise<void> {
  await open(page, 'studio/golive', 'autoplay=0&latency=0&studioEngine=1')
  await page
    .getByRole('radiogroup', { name: 'Picture from' })
    .getByText('Ferrocast', { exact: true })
    .click()
  const startBtn = page.getByRole('button', { name: 'Start the Studio' })
  const settingsBtn = page.getByRole('button', { name: 'Studio settings' })
  await expect(startBtn.or(settingsBtn)).toBeVisible({ timeout: 10_000 })
  if (await startBtn.isVisible()) {
    await startBtn.click()
    const closeReady = page.getByRole('button', { name: 'Close the ready check' })
    await closeReady
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => closeReady.click())
      .catch(() => {})
  }
  await expect(settingsBtn).toBeVisible({ timeout: 15_000 })
}

/** Opens Stats from the status bar (it shows from 1024 px up: the desk has no other way in). */
async function openStats(page: Page) {
  await page.getByRole('button', { name: 'Studio status: open Stats' }).click()
  const dlg = page.getByRole('dialog', { name: 'Stats' })
  await expect(dlg).toBeVisible()
  await settled(page)
  return dlg
}

const inject = (page: Page, js: string) => demo(page, `(d) => { ${js} }`)

const box = (dlg: Dlg, label: string) =>
  dlg.locator('div', { has: dlg.page().getByText(label, { exact: true }) }).last()

/** The panel's own numbers and reason are all in the normal colour. */
async function expectNormal(dlg: Dlg) {
  for (const label of ['Frame rate', 'Missed, 60 s', 'Skipped, 60 s']) {
    await expect(box(dlg, label).locator('b')).not.toHaveClass(/text-(danger|warn)/)
  }
  await expect(dlg.getByText('Steady for the last minute')).toHaveClass(/text-text-3/)
}

test.describe('Stats frame rate panel', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('calm: normal colours, a flat missed-frames graph, nothing to explain', async ({ page }) => {
    await enterStudioDesk(page)
    const dlg = await openStats(page)
    await expect(dlg.getByText('Steady for the last minute')).toBeVisible()
    await expect(dlg.getByRole('img', { name: 'Missed frames over the last minute' })).toBeVisible()
    await expect(dlg.getByText('Missed, 60 s')).toBeVisible()
    await expect(dlg.getByText('Skipped, 60 s')).toBeVisible()
    await expectNormal(dlg)
    await snap(page, 'calm-1280.png')
  })

  test('an old burst is amber and says why; the total since start is the small text', async ({
    page,
  }) => {
    await enterStudioDesk(page)
    await inject(page, 'd.studioEngine.injectMissed({ render: 40 }, 30)')
    const dlg = await openStats(page)
    const why = dlg.getByText('Drawing fell behind')
    await expect(why).toBeVisible()
    await expect(why).toHaveClass(/text-warn/)
    await expect(dlg.getByText('short dip')).toBeVisible()
    // The minute first (40), the total since the start smaller under it.
    const missed = box(dlg, 'Missed, 60 s')
    await expect(missed.locator('b')).toHaveText('40')
    await expect(missed.locator('b')).toHaveClass(/text-warn/)
    await expect(missed).toContainText('total')
    await snap(page, 'dip-1280.png')
  })

  test('frames still being missed are red, and the encoder or the upload is named', async ({
    page,
  }) => {
    await enterStudioDesk(page)
    await inject(page, 'd.studioEngine.injectMissed({ encode: 6, skipped: 2 })')
    const dlg = await openStats(page)
    const why = dlg.getByText('Encoder overloaded')
    await expect(why).toHaveClass(/text-danger/)
    await expect(dlg.getByText('still happening')).toBeVisible()
    await expect(box(dlg, 'Frame rate').locator('b')).toHaveClass(/text-danger/)
    await snap(page, 'red-encoder-1280.png')
    // The upload struggled in the minute: the encoder's trouble is the line's.
    await inject(page, 'd.studioEngine.injectUploadTrouble(5)')
    await expect(dlg.getByText('Upload too slow')).toBeVisible()
    await snap(page, 'red-upload-1280.png')
  })

  test('a burst during a window resize says so', async ({ page }) => {
    await enterStudioDesk(page)
    await inject(page, 'd.studioEngine.injectMissed({ render: 9, resize: 9 }, 12)')
    const dlg = await openStats(page)
    await expect(dlg.getByText('Window resize')).toBeVisible()
    await snap(page, 'resize-1280.png')
  })

  test('the (i) explains the cause and what to do, by keyboard', async ({ page }) => {
    await enterStudioDesk(page)
    await inject(page, 'd.studioEngine.injectMissed({ render: 5, encode: 2 }, 20)')
    const dlg = await openStats(page)
    const tip = dlg.getByRole('button', { name: 'About missed and skipped frames' })
    await tip.focus()
    await expect(tip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Use fewer or smaller sources/)).toBeVisible()
    await expect(page.getByText(/Also in the last minute: encoder overloaded \(2\)/)).toBeVisible()
    await snap(page, 'info-1280.png')
  })

  test('an old hiccup is forgotten once it leaves the minute', async ({ page }) => {
    await enterStudioDesk(page)
    // 58 s ago: still inside the minute for a moment, then gone.
    await inject(page, 'd.studioEngine.injectMissed({ render: 30 }, 58)')
    const dlg = await openStats(page)
    await expect(dlg.getByText('Steady for the last minute')).toBeVisible({ timeout: 8_000 })
    await expectNormal(dlg)
  })

  test('no horizontal scroll and no serious accessibility problems', async ({ page }) => {
    await enterStudioDesk(page)
    await inject(page, 'd.studioEngine.injectMissed({ render: 5 }, 3)')
    const dlg = await openStats(page)
    expect(await dlg.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false)
    const results = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})

/**
 * Phone width. The desk's status bar (Stats' only way in) shows from 1024 px up and the desk
 * itself gives way to a phone layout below that, so Stats can't be opened at 375 px in the
 * app. What is checked here: the open dialog is copied out of the page as the wide window shows
 * it, then the window narrows to 375 px, and the copy is laid out by the same stylesheet at
 * that width (the one-column graphs, the boxes, the reason line).
 */
test.describe('Stats frame rate panel laid out at 375 px', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  async function atPhoneWidth(page: Page, ready: string): Promise<Dlg> {
    const dlg = await openStats(page)
    await expect(dlg.getByText(ready)).toBeVisible()
    await page.evaluate(() => {
      const d = document.querySelector('dialog[open]')
      if (!d) throw new Error('no dialog')
      const copy = d.cloneNode(true) as HTMLElement
      const holder = document.createElement('div')
      holder.id = 'stats-phone-copy'
      // Over the whole window, as the open dialog is.
      copy.style.cssText = 'position:fixed;inset:0;z-index:2147483000'
      holder.style.cssText = 'background:rgb(4 5 8 / 0.62)'
      holder.append(copy)
      document.body.append(holder)
    })
    await page.setViewportSize({ width: 375, height: 812 })
    // The desk unmounts at this width, and its dialog with it; the copy stays.
    await expect(page.locator('dialog[open]:not(#stats-phone-copy dialog)')).toHaveCount(0)
    const copy = page.locator('#stats-phone-copy dialog')
    await expect(copy).toBeVisible()
    return copy
  }

  async function fits(page: Page, copy: Dlg) {
    const box = await copy.locator('[data-over-preview]').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    // The graphs stack in one column: each as wide as the other.
    const widths = await copy
      .locator('figure')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))
    expect(widths).toHaveLength(3)
    expect(new Set(widths.map(Math.round)).size).toBe(1)
  }

  test('calm', async ({ page }) => {
    await enterStudioDesk(page)
    const copy = await atPhoneWidth(page, 'Steady for the last minute')
    await fits(page, copy)
    await snap(page, 'calm-375.png')
  })

  test('amber dip with its reason', async ({ page }) => {
    await enterStudioDesk(page)
    await inject(page, 'd.studioEngine.injectMissed({ render: 40 }, 30)')
    const copy = await atPhoneWidth(page, 'short dip')
    await fits(page, copy)
    await expect(copy.getByText('Drawing fell behind')).toHaveClass(/text-warn/)
    await snap(page, 'dip-375.png')
  })

  test('red while frames are still being missed', async ({ page }) => {
    await enterStudioDesk(page)
    await inject(
      page,
      'd.studioEngine.injectMissed({ encode: 6, skipped: 2 }); d.studioEngine.injectUploadTrouble(5)',
    )
    const copy = await atPhoneWidth(page, 'still happening')
    await fits(page, copy)
    await expect(copy.getByText('Upload too slow')).toHaveClass(/text-danger/)
    await snap(page, 'red-upload-375.png')
  })

  test('a window resize burst', async ({ page }) => {
    await enterStudioDesk(page)
    await inject(page, 'd.studioEngine.injectMissed({ render: 9, resize: 9 }, 12)')
    const copy = await atPhoneWidth(page, 'short dip')
    await fits(page, copy)
    await expect(copy.getByText('Window resize')).toBeVisible()
    await snap(page, 'resize-375.png')
  })
})
