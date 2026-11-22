import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open, settled } from './helpers'

// A1: the alert editor opens full screen as three panes (rules and looks on the left, the
// live stage with its timeline in the middle, collapsible property groups on the right).

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

for (const [width, height] of [
  [1440, 900],
  [1280, 800],
  [1024, 768],
] as const) {
  test.describe(`A1 alert editor at ${width}x${height}`, () => {
    test.use({ viewport: { width, height } })

    test('is one screen: no page scroll, the docks scroll inside', async ({ page }) => {
      await open(page, 'alerts/follow')
      const editor = page.getByTestId('alert-editor')
      await expect(editor).toBeVisible()
      expect(await noSideScroll(page)).toBe(true)
      const m = await page.evaluate(() => ({
        sh: document.documentElement.scrollHeight,
        ih: window.innerHeight,
      }))
      expect(m.sh).toBeLessThanOrEqual(m.ih)
      // The top bar: Back, the name, Alert designs, Discard, Save, Test on stream.
      await expect(
        page.getByTestId('alert-editor').getByRole('button', { name: 'Back', exact: true }),
      ).toBeVisible()
      await expect(page.getByLabel('Rule name')).toHaveValue('Follows')
      await expect(page.getByRole('link', { name: /Alert design/ })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Discard' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Test on stream' })).toBeVisible()
      // The three panes.
      await expect(page.getByRole('navigation', { name: 'Alert rules' })).toBeVisible()
      await expect(page.getByLabel('Live preview')).toBeVisible()
      await expect(page.getByRole('complementary', { name: 'Look properties' })).toBeVisible()
      // The timeline sits in the middle pane, right under the stage.
      await expect(
        page.getByLabel('Live preview').locator('[data-timeline-handle="in"]'),
      ).toBeVisible()
    })

    test('Unsaved edits shows on a change, Discard puts it back, Save keeps it', async ({
      page,
    }) => {
      await open(page, 'alerts/follow')
      const headline = page.getByLabel('Headline', { exact: true })
      await headline.fill('{name} just followed!')
      await expect(page.getByText('Unsaved edits')).toBeVisible()
      await page.getByRole('button', { name: 'Discard' }).click()
      await expect(headline).toHaveValue('{name} followed!')
      await expect(page.getByText('Unsaved edits')).toHaveCount(0)
      await headline.fill('{name} just followed!')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByText(/saved\. New alerts use it right away/)).toBeVisible()
      await expect(page.getByText('Unsaved edits')).toHaveCount(0)
    })

    test('the token popover inserts a token and the property groups collapse', async ({ page }) => {
      await open(page, 'alerts/follow')
      const headline = page.getByLabel('Headline', { exact: true })
      await headline.fill('Hi ')
      await page.getByRole('button', { name: 'Tokens for Headline' }).click()
      const pop = page.getByRole('group', { name: 'Insert token into Headline' })
      await expect(pop).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(pop).toHaveCount(0)
      await page.getByRole('button', { name: 'Tokens for Headline' }).click()
      await pop.locator('[data-insert-token="amount"]').click()
      await expect(headline).toHaveValue('Hi {amount}')
      // A group closes and opens again from its header.
      const group = page.getByRole('button', { name: /Layout and media/ })
      await expect(group).toHaveAttribute('aria-expanded', 'true')
      await group.click()
      await expect(group).toHaveAttribute('aria-expanded', 'false')
      await group.click()
      await expect(group).toHaveAttribute('aria-expanded', 'true')
    })

    test('a look picked on the left opens in the right dock', async ({ page }) => {
      await open(page, 'alerts/sub')
      await expect(page.locator('[data-variation-card]').first()).toBeVisible()
      await page.getByRole('button', { name: 'Add a look' }).click()
      await expect(page.getByRole('button', { name: /This look/ })).toBeVisible()
      await expect(page.getByLabel('Look name')).toHaveValue('New look')
      expect(await noSideScroll(page)).toBe(true)
    })

    test('has no serious accessibility problems', async ({ page }) => {
      await open(page, 'alerts/follow')
      await expect(page.getByTestId('alert-editor')).toBeVisible()
      await settled(page)
      const r = await new AxeBuilder({ page }).include('[data-testid="alert-editor"]').analyze()
      expect(r.violations).toEqual([])
    })
  })
}

test.describe('A1 alert editor at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('stacks without sideways scroll and keeps every control reachable', async ({ page }) => {
    await open(page, 'alerts/follow')
    expect(await noSideScroll(page)).toBe(true)
    await expect(page.getByLabel('Rule name')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Test on stream' })).toBeVisible()
    await page.getByLabel('Headline', { exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByLabel('Headline', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Tokens for Headline' }).click()
    await expect(page.getByRole('group', { name: 'Insert token into Headline' })).toBeVisible()
    expect(await noSideScroll(page)).toBe(true)
  })
})
