import { expect, test } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

function buildNeonPackBuffer(): Buffer {
  const cfg = {
    schemaVersion: 2,
    nodeType: 'RootNode',
    data: {
      scenes: {
        data: {
          items: [
            {
              name: 'Neon Lounge',
              sceneId: 'sc-neon',
              slots: {
                data: {
                  items: [
                    {
                      id: 'bg-1',
                      name: 'Frame',
                      sceneNodeType: 'item',
                      x: 0,
                      y: 0,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'ImageNode', data: { filename: 'assets/frame.png' } },
                    },
                    {
                      id: 'w-1',
                      name: 'Alerts',
                      sceneNodeType: 'item',
                      x: 0.2,
                      y: 0.1,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'WidgetNode', data: { type: 'AlertBox' } },
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
  return Buffer.from(
    zipSync({
      'config.json': Uint8Array.from(strToU8(JSON.stringify(cfg))),
      'assets/frame.png': PNG_1X1,
    }),
  )
}

test.describe('Problem 8: .overlay import syncs StudioEngine collections and scenes', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`imports NeonPack into StudioEngine, updates collection + scenes, and undoes cleanly (${vp.width}px)`, async ({
      page,
    }) => {
      const consoleErrors: string[] = []
      page.on('pageerror', (e) => consoleErrors.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text())
      })

      await page.setViewportSize(vp)
      await page.addInitScript(() => {
        localStorage.setItem('fc-golive-picture', 'ferrocast')
      })
      await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
      await expect(page.locator('#main')).toBeVisible()

      await page.getByRole('button', { name: 'Start the Studio' }).click()
      const untitledBtn = page.getByRole('button', { name: 'scene collection: Untitled' })
      await expect(untitledBtn).toBeVisible()

      // First import -> verify Studio switched behind modal -> click Undo import -> verify Untitled restored
      await untitledBtn.click()
      await page.getByRole('menuitem', { name: /Import a theme pack/ }).click()
      const pickDialog = page.getByRole('dialog', { name: 'Import a theme pack' })
      await expect(pickDialog).toBeVisible()
      await pickDialog.locator('input[type="file"]').setInputFiles({
        name: 'neon-pack.overlay',
        mimeType: 'application/zip',
        buffer: buildNeonPackBuffer(),
      })

      const previewDialog = page.getByRole('dialog', { name: 'Review theme pack' })
      await expect(previewDialog).toBeVisible()
      await previewDialog.getByRole('button', { name: 'Import theme pack' }).click()

      const resultDialog = page.getByRole('dialog', { name: 'Theme pack imported' })
      await expect(resultDialog).toBeVisible()
      await expect(
        resultDialog.getByText('Imported "neon-pack" and switched Studio to it.'),
      ).toBeVisible()
      await expect(page.locator('button[aria-label="scene collection: neon-pack"]')).toBeVisible()

      const overflowResult = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflowResult).toBe(false)

      await resultDialog.getByRole('button', { name: 'Undo import' }).click()
      const undoneDialog = page.getByRole('dialog', { name: 'Theme pack undone' })
      await expect(undoneDialog).toBeVisible()
      await undoneDialog.getByRole('button', { name: 'Done' }).click()

      await expect(untitledBtn).toBeVisible()
      const scenesPanel = page.getByRole('region', { name: 'Scenes' })
      await expect(scenesPanel.getByText('Gameplay')).toBeVisible()

      // Second import -> Done -> confirm Scenes and Sources panels show neon-pack
      await untitledBtn.click()
      await page.getByRole('menuitem', { name: /Import a theme pack/ }).click()
      await page
        .getByRole('dialog', { name: 'Import a theme pack' })
        .locator('input[type="file"]')
        .setInputFiles({
          name: 'neon-pack.overlay',
          mimeType: 'application/zip',
          buffer: buildNeonPackBuffer(),
        })
      await page
        .getByRole('dialog', { name: 'Review theme pack' })
        .getByRole('button', { name: 'Import theme pack' })
        .click()
      await page
        .getByRole('dialog', { name: 'Theme pack imported' })
        .getByRole('button', { name: 'Done' })
        .click()

      await expect(page.getByRole('button', { name: 'scene collection: neon-pack' })).toBeVisible()
      await expect(scenesPanel.getByText('Neon Lounge')).toBeVisible()
      await expect(scenesPanel.getByText('Gameplay')).toHaveCount(0)

      if (vp.width < 1024) {
        await page
          .getByRole('radiogroup', { name: 'Panel' })
          .getByText('Sources', { exact: true })
          .click()
      }
      const sourcesPanel = page.getByRole('region', { name: 'Sources' })
      await expect(sourcesPanel.getByText(/neon-pack.*Neon Lounge/)).toBeVisible()

      const overflowStudio = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflowStudio).toBe(false)
      expect(consoleErrors).toEqual([])
    })
  }
})
