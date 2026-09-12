import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

const SCREENS = [
  'home',
  'chat',
  'alerts',
  'overlays',
  'overlays/ov-main',
  'moderation',
  'bot',
  'tips',
  'settings',
  'community',
  'recap',
  'import',
  'import/streamlabs',
  'designs',
  'designer/builtin.molten-plate',
  'designer/builtin.forge',
  'designer/builtin.goal-segments',
]

for (const scheme of ['dark', 'light'] as const) {
  for (const s of SCREENS) {
    test(`${s} has no serious accessibility problems (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await open(page, s)
      await page.waitForTimeout(600)
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(
        bad.map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(' | ')}`,
        ),
      ).toEqual([])
    })
  }
}

test('first run has no serious accessibility problems', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, 'home', 'firstrun&autoplay=0&latency=0')
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(
    r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id),
  ).toEqual([])
})

test('keyboard only: skip link, test alert menu and panic', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Test alert' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Test sub sent/)).toBeVisible()
  await page.keyboard.press('Control+Alt+Shift+KeyP')
  await expect(page.getByText('Panic mode is on.').first()).toBeVisible()
})

test('the menu closes on Escape and gives focus back', async ({ page }) => {
  await open(page)
  const trigger = page.getByRole('button', { name: 'Test alert' })
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(trigger).toBeFocused()
})
