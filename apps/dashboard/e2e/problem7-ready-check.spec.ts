import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { demo, settled } from './helpers'

type Box = { x: number; y: number; width: number; height: number }

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

async function boxOf(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox()
  expect(b).not.toBeNull()
  return b!
}

async function startStudioWithIssues(page: Page, vp: { width: number; height: number }) {
  await page.setViewportSize(vp)
  await page.addInitScript(() => {
    localStorage.setItem('fc-golive-picture', 'ferrocast')
  })
  await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
  await expect(page.locator('#main')).toBeVisible()

  // Seed two real Studio issues (1 blocking muted mic, 1 warning hidden webcam) before Start.
  await demo(
    page,
    '(d) => { d.studioEngine?.setSourceMuted("Mic", true); d.studioEngine?.setSceneItemEnabled("Gameplay", "Webcam", false) }',
  )

  const startBtn = page.getByRole('button', { name: 'Start the Studio' })
  await expect(startBtn).toBeVisible()
  await startBtn.click()
  await expect(page.getByRole('region', { name: 'Scenes' })).toBeVisible({ timeout: 10_000 })
  await settled(page)
}

test.describe('Problem 7: Ready check Option 1 slim pill + upward card', () => {
  for (const vp of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`placement, expand/collapse/dismiss/restore, Escape focus, Fix, and no overflow (${vp.width}px)`, async ({
      page,
    }) => {
      await startStudioWithIssues(page, vp)

      const region = page.getByRole('region', { name: 'Ready check' })
      await expect(region).toBeVisible({ timeout: 10_000 })

      const pill = region.getByRole('button', { name: /^Ready check ·/ })
      await expect(pill).toContainText('Ready check · 2 to fix (1 blocking)', { timeout: 10_000 })
      await expect(pill).toHaveAttribute('aria-expanded', 'false')

      const pillBox = await boxOf(pill)
      // Slim 36 px pill positioned bottom-right.
      expect(pillBox.height).toBeCloseTo(36, 1)
      expect(pillBox.x + pillBox.width).toBeGreaterThan(vp.width * 0.5)

      if (vp.width >= 1024) {
        const goLiveBox = await boxOf(page.getByRole('region', { name: 'Go live to' }))
        const audioBox = await boxOf(page.getByRole('region', { name: 'Audio' }))
        const scenesBox = await boxOf(page.getByRole('region', { name: 'Scenes' }))
        const footerBox = await boxOf(page.locator('footer[aria-label="Studio status"]'))

        // Inside the right column and strictly above the status bar.
        expect(pillBox.x).toBeGreaterThanOrEqual(goLiveBox.x)
        expect(pillBox.x + pillBox.width).toBeLessThanOrEqual(goLiveBox.x + goLiveBox.width + 1)
        expect(pillBox.y + pillBox.height).toBeLessThanOrEqual(footerBox.y)

        expect(intersects(pillBox, audioBox)).toBe(false)
        expect(intersects(pillBox, scenesBox)).toBe(false)
        expect(intersects(pillBox, footerBox)).toBe(false)
      } else {
        const navBox = await boxOf(page.locator('nav[data-tab-bar]'))
        expect(pillBox.y + pillBox.height).toBeLessThanOrEqual(navBox.y)
        expect(intersects(pillBox, navBox)).toBe(false)
      }

      // Expand upward on click: pill hides so summary text appears once in card header.
      await pill.click()
      await expect(pill).toHaveCount(0)
      const card = region.locator('div[aria-labelledby]')
      await expect(card).toBeVisible()
      await expect(region.getByText('2 to fix (1 blocking)')).toHaveCount(1)
      await expect(region.getByText('Ready check')).toHaveCount(1)
      await settled(page)

      const cardBox = await boxOf(card)
      // Stays anchored at the bottom-right slot (aligned with collapsed pill bottom, within viewport).
      expect(cardBox.y + cardBox.height).toBeCloseTo(pillBox.y + pillBox.height, 2)

      if (vp.width >= 1024) {
        const goLiveBox = await boxOf(page.getByRole('region', { name: 'Go live to' }))
        const audioBox = await boxOf(page.getByRole('region', { name: 'Audio' }))
        const scenesBox = await boxOf(page.getByRole('region', { name: 'Scenes' }))
        const footerBox = await boxOf(page.locator('footer[aria-label="Studio status"]'))

        expect(cardBox.x).toBeGreaterThanOrEqual(goLiveBox.x)
        expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(goLiveBox.x + goLiveBox.width + 1)
        expect(intersects(cardBox, audioBox)).toBe(false)
        expect(intersects(cardBox, scenesBox)).toBe(false)
        expect(intersects(cardBox, footerBox)).toBe(false)
      } else {
        const navBox = await boxOf(page.locator('nav[data-tab-bar]'))
        expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(navBox.y)
        expect(intersects(cardBox, navBox)).toBe(false)
      }

      // One row per issue with a Fix button.
      const rows = card.getByRole('listitem')
      await expect(rows).toHaveCount(2)
      await expect(card.getByRole('button', { name: /^Fix / })).toHaveCount(2)

      // Accessibility audit on the expanded Ready check region.
      const axe = await new AxeBuilder({ page })
        .include('section[aria-label="Ready check"]')
        .analyze()
      expect(axe.violations).toEqual([])

      // Keyboard Escape from inside the card closes it and returns focus to the restored pill.
      const firstFix = card.getByRole('button', { name: /^Fix / }).first()
      await firstFix.focus()
      await expect(firstFix).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(card).toHaveCount(0)
      await expect(pill).toBeVisible()
      await expect(pill).toHaveAttribute('aria-expanded', 'false')
      await expect(pill).toBeFocused()

      // Re-open and collapse via chevron button -> restores pill and returns focus to pill.
      await pill.click()
      await expect(pill).toHaveCount(0)
      await expect(card).toBeVisible()
      await card.getByRole('button', { name: 'Collapse ready check' }).click()
      await expect(card).toHaveCount(0)
      await expect(pill).toBeVisible()
      await expect(pill).toBeFocused()

      // Re-open and dismiss with X -> status-bar (or mobile tools bar) recall control appears and brings it back.
      await pill.click()
      await card.getByRole('button', { name: 'Dismiss ready check' }).click()
      await expect(region).toBeHidden()

      const recallBtn =
        vp.width >= 1024
          ? page
              .locator('footer[aria-label="Studio status"]')
              .getByRole('button', { name: /Show ready check/i })
          : page.getByRole('button', { name: /Show ready check/i })
      await expect(recallBtn).toBeVisible()
      await expect(recallBtn).toContainText('Ready check (2)')

      await recallBtn.click()
      await expect(region).toBeVisible()
      await expect(pill).toBeVisible()
      await expect(pill).toBeFocused()

      // Fix both issues in the card -> partial Fix moves focus to next Fix; final Fix transitions to All good pill.
      await pill.click()
      const micFix = card.getByRole('button', { name: /^Fix Mic:/ })
      await micFix.focus()
      await micFix.click()
      await expect(card.getByText('1 to fix')).toBeVisible()
      await expect(region.getByText('1 to fix')).toHaveCount(1)
      await expect(card).not.toContainText('blocking')

      const webcamFix = card.getByRole('button', { name: /^Fix Webcam:/ })
      await expect(webcamFix).toBeFocused()
      await webcamFix.click()
      await expect(card).toHaveCount(0)
      await expect(pill).toContainText('Ready check · All good')
      await expect(pill).toBeFocused()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }

  test('auto-hides cleanly after 5s when all checks pass (1280px)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript(() => {
      localStorage.setItem('fc-golive-picture', 'ferrocast')
    })
    await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
    await page.getByRole('button', { name: 'Start the Studio' }).click()

    const region = page.getByRole('region', { name: 'Ready check' })
    const pill = region.getByRole('button', { name: /^Ready check ·/ })
    await expect(pill).toContainText('Ready check · All good', { timeout: 10_000 })
    await expect(region).toBeHidden({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /Show ready check/i })).toHaveCount(0)
  })

  test('preserves found issues and expanded card when resizing from 1280px to 375px', async ({
    page,
  }) => {
    await startStudioWithIssues(page, { width: 1280, height: 800 })

    const region = page.getByRole('region', { name: 'Ready check' })
    const pill = region.getByRole('button', { name: /^Ready check ·/ })
    await expect(pill).toContainText('Ready check · 2 to fix (1 blocking)', { timeout: 10_000 })

    await pill.click()
    await expect(pill).toHaveCount(0)
    const desktopCard = region.locator('div[aria-labelledby]')
    await expect(desktopCard).toBeVisible()
    await expect(region.getByText('2 to fix (1 blocking)')).toHaveCount(1)

    // Resize across the 900px DockWorkspace breakpoint into mobile layout.
    await page.setViewportSize({ width: 375, height: 812 })
    await settled(page)

    await expect(pill).toHaveCount(0)
    const mobileCard = region.locator('div[aria-labelledby]')
    await expect(mobileCard).toBeVisible()
    await expect(region.getByText('2 to fix (1 blocking)')).toHaveCount(1)
    await expect(mobileCard.getByRole('listitem')).toHaveCount(2)

    const navBox = await boxOf(page.locator('nav[data-tab-bar]'))
    const mobileCardBox = await boxOf(mobileCard)
    expect(mobileCardBox.y + mobileCardBox.height).toBeLessThanOrEqual(navBox.y)
    expect(intersects(mobileCardBox, navBox)).toBe(false)
  })
})
