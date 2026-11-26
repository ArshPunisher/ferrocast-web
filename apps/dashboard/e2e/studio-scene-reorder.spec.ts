import { expect, test, type Page } from '@playwright/test'
import { demo, open } from './helpers'

async function openRunningStudio(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = { desktop: true }
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    localStorage.removeItem('fc-studio-scenes-grid')
  })
  await open(page, 'studio/golive', 'autoplay=0&latency=0&studioEngine=1')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  await expect(page.locator('[data-canvas-box]').first()).toBeVisible()
  const scenesTab = page.getByRole('tab', { name: 'Scenes' })
  if (await scenesTab.isVisible()) await scenesTab.click()
  await expect(page.getByRole('region', { name: 'Scenes' })).toBeVisible()
}

async function sceneNames(page: Page): Promise<string[]> {
  return page
    .locator('[data-scene-name]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-scene-name') ?? ''))
}

async function undoCount(page: Page): Promise<number> {
  return demo<number>(
    page,
    `(d) => d.studioEngine.route('GET', ['studio', 'engine', 'history'], undefined).undo.length`,
  )
}

test.describe('Studio scene reorder and Studio Mode footer (Group E & Extra #3)', () => {
  test('drags scenes in list mode without cutting on-air, guards no-op/Escape, and supports undo', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openRunningStudio(page)

    const initial = await sceneNames(page)
    expect(initial).toEqual(['Main', 'Gameplay', 'Chatting', 'BRB', 'Starting Soon', 'Ending'])
    const baseUndo = await undoCount(page)

    // Drag 'Main' (index 0, currently On air) past 5 px onto bottom half of 'Chatting' (index 2).
    const mainRow = page.locator('[data-scene-name="Main"]')
    const chattingRow = page.locator('[data-scene-name="Chatting"]')
    const mainBox = (await mainRow.boundingBox())!
    const chatBox = (await chattingRow.boundingBox())!

    await page.mouse.move(mainBox.x + 12, mainBox.y + mainBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(mainBox.x + 12, chatBox.y + chatBox.height * 0.8, { steps: 6 })
    await expect(page.locator('[data-scene-ghost]')).toContainText('Main')
    await expect(page.locator('[data-drop-line]')).toBeVisible()
    await page.mouse.up()

    await expect
      .poll(() => sceneNames(page))
      .toEqual(['Gameplay', 'Chatting', 'Main', 'BRB', 'Starting Soon', 'Ending'])
    // Release never cut away from Main.
    await expect(page.locator('[data-scene-name="Main"] button')).toHaveAttribute(
      'aria-current',
      'true',
    )
    const afterMoveUndo = await undoCount(page)
    expect(afterMoveUndo).toBe(baseUndo + 1)

    // Escape cancels mid-drag without changing order or pushing undo.
    const brbBox = (await page.locator('[data-scene-name="BRB"]').boundingBox())!
    await page.mouse.move(brbBox.x + 12, brbBox.y + brbBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(brbBox.x + 12, brbBox.y - 60, { steps: 4 })
    await expect(page.locator('[data-scene-ghost]')).toContainText('BRB')
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.locator('[data-scene-ghost]')).toHaveCount(0)
    expect(await sceneNames(page)).toEqual([
      'Gameplay',
      'Chatting',
      'Main',
      'BRB',
      'Starting Soon',
      'Ending',
    ])
    expect(await undoCount(page)).toBe(afterMoveUndo)

    // Adjacent-seam no-op drop pushes zero undo steps.
    const gameBox = (await page.locator('[data-scene-name="Gameplay"]').boundingBox())!
    const nextChatBox = (await page.locator('[data-scene-name="Chatting"]').boundingBox())!
    await page.mouse.move(gameBox.x + 12, gameBox.y + gameBox.height / 2)
    await page.mouse.down()
    // Top half of Chatting resolves to index 0 (Gameplay's existing slot).
    await page.mouse.move(gameBox.x + 12, nextChatBox.y + nextChatBox.height * 0.2, { steps: 4 })
    await expect(page.locator('[data-drop-line]')).toHaveCount(0)
    await page.mouse.up()
    expect(await undoCount(page)).toBe(afterMoveUndo)

    // Undo restores the original scene order via keyboard shortcut.
    await page.keyboard.press('ControlOrMeta+z')
    await expect
      .poll(() => sceneNames(page))
      .toEqual(['Main', 'Gameplay', 'Chatting', 'BRB', 'Starting Soon', 'Ending'])
  })

  test('supports Alt+Arrow keyboard reorder with focus retention, aria-live, and grid drag', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openRunningStudio(page)

    const gameplayBtn = page.locator('[data-scene-name="Gameplay"] button')
    await gameplayBtn.focus()
    await page.keyboard.press('Alt+ArrowDown')

    await expect
      .poll(() => sceneNames(page))
      .toEqual(['Main', 'Chatting', 'Gameplay', 'BRB', 'Starting Soon', 'Ending'])
    await expect(page.locator('[data-scene-name="Gameplay"] button')).toBeFocused()
    await expect(
      page.getByRole('region', { name: 'Scenes' }).locator('[role="status"][aria-live="polite"]'),
    ).toContainText('Moved Gameplay to position 3 of 6')

    // Switch to Grid mode and reorder via 2D tile drag.
    await page.getByRole('button', { name: 'Show scenes as a grid' }).click()
    const mainTile = (await page.locator('[data-scene-name="Main"]').boundingBox())!
    const chatTile = (await page.locator('[data-scene-name="Chatting"]').boundingBox())!
    await page.mouse.move(mainTile.x + 20, mainTile.y + mainTile.height / 2)
    await page.mouse.down()
    await page.mouse.move(chatTile.x + chatTile.width * 0.85, chatTile.y + chatTile.height / 2, {
      steps: 6,
    })
    await expect(page.locator('[data-drop-line]')).toBeVisible()
    await page.mouse.up()
    await expect
      .poll(() => sceneNames(page))
      .toEqual(['Chatting', 'Main', 'Gameplay', 'BRB', 'Starting Soon', 'Ending'])
  })

  test('targets selected preview scene in Studio Mode footer and reorders vertical scenes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openRunningStudio(page)

    // Enter Studio Mode and pick Chatting in Preview (while Main stays On air).
    await page.getByRole('button', { name: /Studio Mode/ }).click()
    await page.locator('[data-scene-name="Chatting"] button').click()

    const up = page.getByRole('button', { name: 'Move the preview scene up' })
    const copy = page.getByRole('button', { name: 'Copy the preview scene' })
    const remove = page.getByRole('button', { name: 'Remove the preview scene' })
    await expect(up).toBeEnabled()
    await up.click()

    await expect
      .poll(() => sceneNames(page))
      .toEqual(['Main', 'Chatting', 'Gameplay', 'BRB', 'Starting Soon', 'Ending'])
    await expect(page.locator('[data-scene-name="Main"] button')).toHaveAttribute(
      'aria-current',
      'true',
    )

    await copy.click()
    await expect
      .poll(() => sceneNames(page))
      .toEqual(['Main', 'Chatting', 'Chatting 2', 'Gameplay', 'BRB', 'Starting Soon', 'Ending'])

    await remove.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect
      .poll(() => sceneNames(page))
      .toEqual(['Main', 'Chatting 2', 'Gameplay', 'BRB', 'Starting Soon', 'Ending'])

    // Leave Studio Mode, turn Vertical on (may sit inside More tools at narrower widths),
    // verify Scenes switches to Vertical, add & reorder vertical scenes.
    await page.getByRole('button', { name: 'Leave Studio Mode' }).click()
    const verticalBtn = page.getByRole('button', { name: 'Vertical', exact: true })
    if (!(await verticalBtn.isVisible())) {
      await page.getByRole('button', { name: 'More tools' }).click()
    }
    await verticalBtn.click()

    const scenesDock = page.getByRole('region', { name: 'Scenes' })
    await expect(scenesDock.getByText('Vertical', { exact: true }).first()).toBeVisible()
    await scenesDock.getByRole('button', { name: 'Add a scene' }).click()
    await scenesDock.getByLabel('New scene name').fill('Tall A')
    await scenesDock.getByLabel('New scene name').press('Enter')
    await scenesDock.getByRole('button', { name: 'Add a scene' }).click()
    await scenesDock.getByLabel('New scene name').fill('Tall B')
    await scenesDock.getByLabel('New scene name').press('Enter')

    await expect.poll(() => sceneNames(page)).toEqual(['Vertical', 'Tall A', 'Tall B'])
    await page.locator('[data-scene-name="Tall B"] button').focus()
    await page.keyboard.press('Alt+ArrowUp')
    await expect.poll(() => sceneNames(page)).toEqual(['Vertical', 'Tall B', 'Tall A'])
  })

  test('renders Scenes drag handles and keyboard reorder cleanly at 375 px mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openRunningStudio(page)

    const scenesDock = page.getByRole('region', { name: 'Scenes' })
    await expect(scenesDock.locator('[data-drag-handle]').first()).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true)

    const chatBtn = page.locator('[data-scene-name="Chatting"] button')
    await chatBtn.focus()
    await page.keyboard.press('Alt+ArrowUp')
    await expect
      .poll(() => sceneNames(page))
      .toEqual(['Main', 'Chatting', 'Gameplay', 'BRB', 'Starting Soon', 'Ending'])
  })
})
