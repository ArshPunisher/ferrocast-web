import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

const SHOTS = process.env.SCREENSHOT_DIR ?? join(process.cwd(), 'test-results', 'screenshots')

test.describe('interactive widgets on desktop (1280 px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('overlay editor adds and configures End credits, Emote wall, and Chat highlight', async ({
    page,
  }) => {
    await open(page, 'overlays/ov-main')

    const inspector = page.getByRole('complementary', { name: 'Inspector' })

    // End credits: add from "More to add" menu and configure settings
    await page.getByRole('button', { name: 'More to add' }).click()
    await page.getByRole('menuitem', { name: 'End credits' }).click()
    await expect(inspector.getByRole('heading', { name: 'End credits', level: 3 })).toBeVisible()
    await page.getByLabel('Heading').fill('Stream Roll Call')
    await page.getByRole('checkbox', { name: 'Followers' }).uncheck()
    await page.getByLabel('Loop continuously').uncheck()

    // Emote wall: add and adjust physics + cap
    await page.getByRole('button', { name: 'More to add' }).click()
    await page.getByRole('menuitem', { name: 'Emote wall' }).click()
    await expect(inspector.getByRole('heading', { name: 'Emote wall', level: 3 })).toBeVisible()
    await page.getByLabel('Physics').selectOption('fountain')

    // Chat highlight: add and set auto-hide duration
    await page.getByRole('button', { name: 'More to add' }).click()
    await page.getByRole('menuitem', { name: 'Chat highlight' }).click()
    await expect(inspector.getByRole('heading', { name: 'Chat highlight', level: 3 })).toBeVisible()
    await page.getByLabel('Auto-hide after').selectOption('30')

    // Save overlay and verify clean WCAG AA compliance
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(/Overlay saved/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toBeHidden()
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, 'dashboard-editor-1280.png') })

    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('[data-overlay-preview]')
      .analyze()
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    )
  })

  test('dashboard chat pins and removes a highlighted message', async ({ page }) => {
    await open(page, 'chat')
    const chatLog = page.getByRole('log', { name: 'Merged chat' })
    const line = chatLog.getByRole('listitem').last()
    await expect(line).toBeVisible()
    await line.getByRole('button').first().focus()
    await line.getByRole('button', { name: 'Show on stream' }).click()

    await expect(page.getByTestId('highlight-banner')).toBeVisible()
    await expect(chatLog.getByText('On stream')).toBeVisible()
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, 'dashboard-chat-highlight-1280.png') })

    // Dismiss via the banner
    await page.getByTestId('highlight-banner').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByTestId('highlight-banner')).toBeHidden()
  })
})

test.describe('interactive widgets on phone (375 px)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

  const overflow = (page: import('@playwright/test').Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

  test('chat highlight action sheet and banner fit cleanly on a 375 px phone', async ({ page }) => {
    await open(page, 'chat')
    const firstMsg = page.locator('ul > li.fc-row').first()
    await expect(firstMsg).toBeVisible()
    await firstMsg.click()
    await page.getByRole('button', { name: 'Show on stream' }).click()

    await expect(page.getByTestId('highlight-banner')).toBeVisible()
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, 'dashboard-chat-highlight-375.png') })

    await page.getByTestId('highlight-banner').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByTestId('highlight-banner')).toBeHidden()
  })

  test('overlay editor widget forms fit without horizontal overflow at 375 px', async ({
    page,
  }) => {
    await open(page, 'overlays/ov-main')
    const more = page.getByRole('button', { name: 'More to add' })
    await more.scrollIntoViewIfNeeded()
    await more.click()
    await page.getByRole('menuitem', { name: 'End credits' }).click()
    await expect(page.getByLabel('Heading')).toBeVisible()
    await page.waitForTimeout(220)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, 'dashboard-editor-375.png') })
  })
})
