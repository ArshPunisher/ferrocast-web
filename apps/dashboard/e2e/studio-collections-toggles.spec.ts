import { expect, test, type Page } from '@playwright/test'
import { fault, settled } from './helpers'

async function openDesk(
  page: Page,
  viewport: { width: number; height: number },
  theme: 'daylight' | 'slate' = 'daylight',
) {
  await page.setViewportSize(viewport)
  await page.addInitScript(
    ({ themeId }) => {
      localStorage.setItem('fc-theme', themeId)
      localStorage.setItem('fc-golive-picture', 'ferrocast')
      localStorage.removeItem('fc-studio-standby-scene')
      localStorage.removeItem('fc-preview-view')
    },
    { themeId: theme },
  )
  await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  await expect(page.locator('[data-canvas-box]')).toBeVisible({ timeout: 10_000 })
  await settled(page)
}

async function horizontalGap(a: ReturnType<Page['locator']>, b: ReturnType<Page['locator']>) {
  const [boxA, boxB] = await Promise.all([a.boundingBox(), b.boundingBox()])
  expect(boxA, 'first control box').not.toBeNull()
  expect(boxB, 'second control box').not.toBeNull()
  return boxB!.x - (boxA!.x + boxA!.width)
}

test.describe('Studio collections, profiles, preview aspect & toggle pills', () => {
  test('collection & profile switch/new/duplicate/rename/import/error flow and non-16:9 canvas aspect', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'Desktop top-bar workflow checked at 1280x800.')
    await openDesk(page, { width: 1280, height: 800 }, 'daylight')

    const colBtn = page.getByRole('button', { name: /^scene collection:/ })
    const profBtn = page.getByRole('button', { name: /^profile:/ })

    // Create New scene collection and verify confirmation toast + clean scene reset.
    await colBtn.click()
    await page.getByRole('menuitem', { name: 'New scene collection' }).click()
    const newDialog = page.getByRole('dialog')
    await newDialog.getByRole('textbox').fill('Podcast Pack')
    await newDialog.getByRole('button', { name: 'Make it' }).click()
    await expect(page.getByText('Created Podcast Pack.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'scene collection: Podcast Pack' })).toBeVisible()

    // Rename & Duplicate collection each emit clear confirmation toasts.
    await colBtn.click()
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    await newDialog.getByRole('textbox').fill('Podcast Studio')
    await newDialog.getByRole('button', { name: 'Rename' }).click()
    await expect(page.getByText('Renamed to Podcast Studio.')).toBeVisible()

    await colBtn.click()
    await page.getByRole('menuitem', { name: 'Duplicate' }).click()
    await newDialog.getByRole('button', { name: 'Make it' }).click()
    await expect(page.getByText(/Duplicated as Podcast Studio copy\./)).toBeVisible()

    // Import collection with >100-char name succeeds (clamped to <=100 chars).
    const overLongName = 'A'.repeat(120)
    await page.locator('input[type="file"][accept*="json"]').setInputFiles({
      name: 'long-collection.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          name: overLongName,
          sources: [{ id: 'scene', name: 'ImportedIntro' }],
        }),
      ),
    })
    await expect(page.getByText(/A{100}: 1 scenes/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'ImportedIntro On air' })).toBeVisible()

    // Switch back to Untitled: imported scene disappears with zero stale entries.
    await colBtn.click()
    await page.getByRole('menuitemcheckbox', { name: 'Untitled' }).click()
    await expect(page.getByText('Now using Untitled.')).toBeVisible()
    await expect(page.getByRole('button', { name: /ImportedIntro On air/ })).toHaveCount(0)

    // Profile workflow: create "Portrait Profile", change Canvas to 1080x1920 & sample rate to 44.1 kHz.
    await profBtn.click()
    await page.getByRole('menuitem', { name: 'New profile' }).click()
    await newDialog.getByRole('textbox').fill('Portrait Profile')
    await newDialog.getByRole('button', { name: 'Make it' }).click()
    await expect(page.getByText('Created Portrait Profile.')).toBeVisible()

    await page.getByRole('button', { name: 'Studio settings' }).click()
    const settingsDialog = page.getByRole('dialog', { name: 'Studio settings' })
    await settingsDialog.getByRole('button', { name: 'Picture' }).click()
    await settingsDialog.getByText('1080×1920').click()
    await settingsDialog.getByRole('button', { name: 'Audio' }).click()
    await settingsDialog.getByLabel('Sample rate', { exact: true }).selectOption('44100')
    await settingsDialog.getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog).toBeHidden()

    // Preview container keeps standard 16:9 stage geometry across portrait profiles.
    const portraitBox = await page.locator('[data-canvas-box]').boundingBox()
    expect(portraitBox).not.toBeNull()
    expect(portraitBox!.width / portraitBox!.height).toBeCloseTo(16 / 9, 1)

    // Switch back to Default profile -> shows restart note & Restart button triggers 204 cleanly.
    await profBtn.click()
    await page.getByRole('menuitemcheckbox', { name: 'Default' }).click()
    await expect(page.getByText('Now using Default.')).toBeVisible()
    await expect(page.getByText('The sound rate applies after Ferrocast restarts.')).toBeVisible()
    const restartBtn = page.getByRole('button', { name: 'Restart', exact: true })
    await expect(restartBtn).toBeVisible()
    await restartBtn.click()
    await expect(restartBtn).toBeHidden()
    const landscapeBox = await page.locator('[data-canvas-box]').boundingBox()
    expect(landscapeBox).not.toBeNull()
    expect(landscapeBox!.width / landscapeBox!.height).toBeCloseTo(16 / 9, 1)

    // Switch back to Portrait Profile -> 16:9 stage geometry holds.
    await profBtn.click()
    await page.getByRole('menuitemcheckbox', { name: 'Portrait Profile' }).click()
    await expect(page.getByText('Now using Portrait Profile.')).toBeVisible()
    const portraitAgain = await page.locator('[data-canvas-box]').boundingBox()
    expect(portraitAgain!.width / portraitAgain!.height).toBeCloseTo(16 / 9, 1)

    // Inject error on History endpoint -> clicking History surfaces error toast (not swallowed).
    await page.getByRole('button', { name: 'Go live to panel: move, pop out or hide' }).click()
    await page.getByRole('menuitem', { name: 'Hide this panel' }).click()
    await fault(page, {
      path: '/api/v1/studio/engine/history',
      status: 500,
      message: 'History store unavailable.',
      times: 1,
    })
    await page.getByRole('button', { name: 'History: step back to any change' }).click()
    await expect(page.getByText('History store unavailable.')).toBeVisible()

    // Inject 409 studio_busy on collection switch -> fail-closed headline when stats are idle.
    await fault(page, {
      path: '/api/v1/studio/engine/library/collections/current',
      status: 409,
      code: 'studio_busy',
      message: 'Stop streaming and recording before changing scene collections.',
      hint: 'Stop every active output first.',
      times: 1,
    })
    await colBtn.click()
    await page.getByRole('menuitemcheckbox', { name: 'Podcast Studio', exact: true }).click()
    await expect(page.getByText('Stop active outputs to switch')).toBeVisible()

    // Real recording stats active -> switch notice specifically names recording.
    await page.getByRole('button', { name: 'Record', exact: true }).click()
    const stopRecBtn = page.getByRole('button', { name: /^Stop recording/ })
    await expect(stopRecBtn).toBeVisible()
    await colBtn.click()
    await page.getByRole('menuitemcheckbox', { name: 'Podcast Studio', exact: true }).click()
    await expect(page.getByText('Stop recording to switch')).toBeVisible()
    await stopRecBtn.click()
    await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible()
  })

  test('dual view collection switch keeps 16:9 stage and active toggle accent ring', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'Desktop top-bar workflow checked at 1280x800.')
    await openDesk(page, { width: 1280, height: 800 }, 'daylight')

    await page.getByRole('button', { name: 'Go live to panel: move, pop out or hide' }).click()
    await page.getByRole('menuitem', { name: 'Hide this panel' }).click()
    await settled(page)

    const verticalBtn = page.getByRole('button', { name: 'Vertical', exact: true })
    await verticalBtn.click()
    await expect(verticalBtn).toHaveAttribute('aria-pressed', 'true')
    const ringShadow = await verticalBtn.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(ringShadow).not.toBe('none')

    const bothBtn = page.getByRole('button', { name: 'Both pictures' })
    await expect(bothBtn).toHaveAttribute('aria-pressed', 'true')
    const bothShadow = await bothBtn.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(bothShadow).not.toBe('none')

    // Create a second scene collection so switching collections runs while dual view is active.
    const colBtn = page.getByRole('button', { name: /^scene collection:/ })
    await colBtn.click()
    await page.getByRole('menuitem', { name: 'New scene collection' }).click()
    const dlg = page.getByRole('dialog')
    await dlg.getByRole('textbox').fill('Second Show')
    await dlg.getByRole('button', { name: 'Make it' }).click()
    await expect(colBtn).toContainText('Second Show')

    await colBtn.click()
    await page.getByRole('menuitemcheckbox', { name: 'Untitled', exact: true }).click()
    await expect(colBtn).toContainText('Untitled')

    const canvasBox = await page.locator('[data-canvas-box]').boundingBox()
    expect(canvasBox).not.toBeNull()
    expect(canvasBox!.width / canvasBox!.height).toBeCloseTo(16 / 9, 1)
    await expect(page.getByRole('group', { name: /Vertical picture/ })).toBeVisible()
  })

  test('mobile panel switcher hugs content at 375px', async ({ page }) => {
    await openDesk(page, { width: 375, height: 812 }, 'daylight')
    const panelGroup = page.getByRole('radiogroup', { name: 'Panel' })
    await expect(panelGroup).toBeVisible()
    const box = await panelGroup.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeLessThan(320)
  })

  for (const theme of ['daylight', 'slate'] as const) {
    test(`toggle pills remain separated with visible gap in ${theme} theme at 1280px`, async ({
      page,
      isMobile,
    }) => {
      test.skip(!!isMobile, 'Desktop 1280px layout checked outside phone project.')
      await openDesk(page, { width: 1280, height: 800 }, theme)

      // Hide the right Go live dock so StageBar renders ViewControls + History directly inline at 1280px.
      await page.getByRole('button', { name: 'Go live to panel: move, pop out or hide' }).click()
      await page.getByRole('menuitem', { name: 'Hide this panel' }).click()
      await settled(page)

      // StageBar: Source outlines + Keep shape both active must maintain >= 4px gap.
      const outlines = page.getByRole('button', {
        name: /Show every source’s outline|Hide source outlines/,
      })
      if ((await outlines.getAttribute('aria-pressed')) !== 'true') {
        await outlines.click()
      }
      const keepShape = page.getByRole('button', {
        name: /Frames keep their shape|Side handles stretch frames/,
      })
      if ((await keepShape.getAttribute('aria-pressed')) !== 'true') {
        await keepShape.click()
      }
      expect(await outlines.getAttribute('aria-pressed')).toBe('true')
      expect(await keepShape.getAttribute('aria-pressed')).toBe('true')
      expect(await horizontalGap(outlines, keepShape)).toBeGreaterThanOrEqual(4)

      // AudioDock segmented control ("This scene" | "All") keeps >= 3px gap.
      const whichSounds = page.getByRole('radiogroup', { name: 'Which sounds' }).locator('label')
      expect(await horizontalGap(whichSounds.nth(0), whichSounds.nth(1))).toBeGreaterThanOrEqual(3)

      // AudioDock vertical Strip mode: Mute and Hear buttons maintain >= 3px gap.
      await page.getByRole('button', { name: 'Show as a mixing desk' }).click()
      const firstMute = page.getByRole('button', { name: /^(Mute|Unmute) / }).first()
      const firstHear = page.getByRole('button', { name: /^(Hear|Stop hearing) / }).first()
      expect(await horizontalGap(firstMute, firstHear)).toBeGreaterThanOrEqual(3)

      // Undo / Redo / History controls maintain >= 3px gap.
      const undoBtn = page.getByRole('button', { name: /Undo|Nothing to undo/ }).first()
      const redoBtn = page.getByRole('button', { name: /Redo|Nothing to redo/ }).first()
      const histBtn = page.getByRole('button', { name: 'History: step back to any change' })
      expect(await horizontalGap(undoBtn, redoBtn)).toBeGreaterThanOrEqual(3)
      expect(await horizontalGap(redoBtn, histBtn)).toBeGreaterThanOrEqual(3)
    })

    test(`toggle pills remain separated with visible gap in ${theme} theme at 375px`, async ({
      page,
    }) => {
      await openDesk(page, { width: 375, height: 812 }, theme)
      const colBtn = page.getByRole('button', { name: /^scene collection:/ })
      const profBtn = page.getByRole('button', { name: /^profile:/ })
      await expect(colBtn).toBeVisible()
      await expect(profBtn).toBeVisible()
      expect(await horizontalGap(colBtn, profBtn)).toBeGreaterThanOrEqual(4)

      const panelGroup = page.getByRole('radiogroup', { name: 'Panel' }).locator('label')
      await expect(panelGroup.nth(0)).toBeVisible()
      expect(await horizontalGap(panelGroup.nth(0), panelGroup.nth(1))).toBeGreaterThanOrEqual(3)
    })
  }
})
