import { expect, test } from '@playwright/test'
import { demo, open, settled } from './helpers'

test.describe('Overlay editor layout, single scroller, Unsaved bar and steady canvas', () => {
  for (const vp of [
    { width: 1280, height: 700 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
  ]) {
    test(`desktop ${vp.width}x${vp.height} fills viewport with no outer page scrollbar`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await open(page, 'overlays/ov-main')
      await settled(page)

      const canvas = page.locator('[role="group"][aria-label$="layout, 1920 by 1080"]')
      await expect(canvas).toBeVisible()
      const canvasBox = (await canvas.boundingBox())!

      const doc = await page.evaluate(() => ({
        scrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }))
      expect(doc.scrollH).toBeLessThanOrEqual(doc.innerH + 1)
      expect(doc.scrollW).toBeLessThanOrEqual(doc.innerW + 1)
      if (vp.height >= 1000) {
        expect(canvasBox.height).toBeGreaterThan(550)
      }
      expect(canvasBox.width / canvasBox.height).toBeCloseTo(16 / 9, 1)
    })
  }

  test('desktop 1440x900 with 12 layers and selected Text layer has strictly one inspector scrollbar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, 'overlays/ov-main')
    await settled(page)

    const textBtn = page.getByRole('toolbar', { name: 'Canvas' }).getByRole('button', {
      name: 'Text',
      exact: true,
    })
    for (let i = 0; i < 6; i++) {
      await textBtn.click()
    }
    await settled(page)

    const layersRegion = page
      .locator('aside[aria-label="Inspector"]')
      .getByRole('region', { name: 'Layers' })
    await expect(layersRegion).toBeVisible()

    const scrollAudit = await page.evaluate(() => {
      const aside = document.querySelector('aside[aria-label="Inspector"]')!
      const list = aside.querySelector('ul[aria-label="Layers, top first"]')!
      const listStyle = getComputedStyle(list)
      const asideStyle = getComputedStyle(aside)
      const scrollableDescendants = [...aside.querySelectorAll('*')].filter((el) => {
        const s = getComputedStyle(el)
        return (
          (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 1
        )
      })
      return {
        asideOverflowY: asideStyle.overflowY,
        listOverflowY: listStyle.overflowY,
        listScrollH: list.scrollHeight,
        listClientH: list.clientHeight,
        scrollableDescendants: scrollableDescendants.length,
        docScrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
      }
    })

    expect(scrollAudit.asideOverflowY).toBe('auto')
    expect(scrollAudit.listOverflowY).toBe('visible')
    expect(scrollAudit.listScrollH).toBeLessThanOrEqual(scrollAudit.listClientH + 1)
    expect(scrollAudit.scrollableDescendants).toBe(0)
    expect(scrollAudit.docScrollH).toBeLessThanOrEqual(scrollAudit.innerH + 1)
  })

  test('canvas keeps steady size and Unsaved bar stays anchored with 0 px jump on inspector edits', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'overlays/ov-main')
    await settled(page)

    const canvas = page.locator('[role="group"][aria-label$="layout, 1920 by 1080"]')
    const toolbar = page.getByRole('toolbar', { name: 'Canvas' })
    const statusBar = page.getByTestId('overlay-status-bar')
    await expect(canvas).toBeVisible()
    await expect(statusBar).toBeVisible()
    await expect(statusBar).toContainText('Saved')

    const beforeCanvas = (await canvas.boundingBox())!
    const beforeBar = (await statusBar.boundingBox())!

    const assertSteady = async () => {
      const curCanvas = (await canvas.boundingBox())!
      const curBar = (await statusBar.boundingBox())!
      expect(Math.abs(curCanvas.width - beforeCanvas.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(curCanvas.height - beforeCanvas.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(curCanvas.x - beforeCanvas.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(curCanvas.y - beforeCanvas.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(curBar.height - beforeBar.height)).toBeLessThanOrEqual(1)
    }

    // Add a Text layer (first edit brings up Unsaved layout bar).
    await toolbar.getByRole('button', { name: 'Text', exact: true }).click()
    await expect(
      page.getByText('Unsaved layout. Your stream keeps the old one until you save.'),
    ).toBeVisible()
    await assertSteady()

    const toolbarBox = (await toolbar.boundingBox())!
    const barBox = (await statusBar.boundingBox())!
    expect(barBox.y - (toolbarBox.y + toolbarBox.height)).toBeGreaterThanOrEqual(0)
    expect(barBox.y - (toolbarBox.y + toolbarBox.height)).toBeLessThanOrEqual(24)

    // Toggle Effect (reveals Second colour) and Count down (reveals 5 countdown inputs).
    await page.getByLabel('Effect').selectOption('neon')
    await expect(page.getByLabel('Second colour', { exact: true })).toBeVisible()
    await assertSteady()

    await page.getByLabel('Count down (minutes)').fill('2')
    await expect(page.getByLabel('Timer look')).toBeVisible()
    await assertSteady()

    await page.getByLabel('Text', { exact: true }).fill('Live soon')
    await assertSteady()

    // Switch selection to Goal widget.
    await page
      .getByRole('button', { name: /Goal widget/ })
      .first()
      .click()
    await assertSteady()

    // Discard returns to Saved cleanly without moving canvas or status bar.
    await page.getByRole('button', { name: 'Discard' }).click()
    await expect(statusBar).toContainText('Saved')
    await assertSteady()
  })

  test('top notice banners adjust --fc-banners so desktop 1280x700 stays free of outer scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 700 })
    await open(page, 'overlays/ov-main')
    await demo(
      page,
      `(d) => d.broadcastLive({ v: 1, type: 'notice', data: { key: 'test-banner', level: 'warn', message: 'Studio encoder warning for layout check.' } })`,
    )
    await expect(page.getByText('Studio encoder warning for layout check.')).toBeVisible()
    await settled(page)

    const metrics = await page.evaluate(() => ({
      scrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      fcBanners: parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--fc-banners') || '0',
        10,
      ),
    }))
    expect(metrics.fcBanners).toBeGreaterThan(20)
    expect(metrics.scrollH).toBeLessThanOrEqual(metrics.innerH + 1)
  })

  for (const vp of [
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    test(`responsive flow at ${vp.width}x${vp.height} has no horizontal overflow or nested scrollbars`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await open(page, 'overlays/ov-main')
      await settled(page)

      const canvas = page.locator('[role="group"][aria-label$="layout, 1920 by 1080"]')
      await expect(canvas).toBeVisible()
      const canvasBox = (await canvas.boundingBox())!
      expect(canvasBox.height).toBeGreaterThan(150)

      await page
        .getByRole('toolbar', { name: 'Canvas' })
        .getByRole('button', {
          name: 'Text',
          exact: true,
        })
        .click()
      const unsaved = page.getByText(
        'Unsaved layout. Your stream keeps the old one until you save.',
      )
      await expect(unsaved).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      expect(overflow).toBe(false)

      if (vp.width === 375) {
        const barBox = (await page.getByTestId('overlay-status-bar').boundingBox())!
        const tabBox = (await page.locator('[data-tab-bar]').boundingBox())!
        expect(barBox.y + barBox.height).toBeLessThanOrEqual(tabBox.y + 1)
      }
    })
  }

  test('short height 1280x500 drops viewport lock cleanly so canvas stays full-width and readable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 500 })
    await open(page, 'overlays/ov-main')
    await settled(page)
    const canvas = page.locator('[role="group"][aria-label$="layout, 1920 by 1080"]')
    await expect(canvas).toBeVisible()
    const box = (await canvas.boundingBox())!
    expect(box.height).toBeGreaterThan(280)
  })

  test('SceneDesigner keeps working cleanly at 1280x800 and 375x812', async ({ page }) => {
    for (const vp of [
      { width: 1280, height: 800 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(vp)
      await open(page, 'designer/builtin.forge')
      await settled(page)
      await expect(page.getByRole('tablist', { name: 'Scenes' })).toBeVisible()
      await expect(page.locator('aside[aria-label="Inspector"]')).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      expect(overflow).toBe(false)
    }
  })
})
