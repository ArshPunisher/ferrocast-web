import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { open, settled } from './helpers'

async function expectCleanLayout(page: import('@playwright/test').Page, scopeSelector = '#main') {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
  const axe = await new AxeBuilder({ page })
    .include(scopeSelector)
    .exclude('[data-overlay-preview]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

test.describe('Diagnostics support report (#7)', () => {
  for (const vp of [
    { name: '1280px', width: 1280, height: 800 },
    { name: '375px', width: 375, height: 812 },
  ]) {
    test(`renders preview, downloads redacted zip, fits ${vp.name} cleanly`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await open(page, 'settings/advanced')

      const support = page.locator('#support')
      await support.scrollIntoViewIfNeeded()
      await expect(support.getByRole('heading', { name: 'Help and support report' })).toBeVisible()

      const preview = support.getByTestId('support-report-preview')
      await expect(preview).toBeVisible()
      await expect(preview.getByRole('heading', { name: 'Likely causes' })).toBeVisible()
      await expect(preview.getByText('App & OS')).toBeVisible()
      await expect(preview.getByText('GPU & Encoder')).toBeVisible()
      await expect(preview.getByText('Audio & Sample Rate')).toBeVisible()
      await expect(preview.getByText('Stream History & Crashes')).toBeVisible()

      const downloadPromise = page.waitForEvent('download')
      await support.getByRole('button', { name: 'Create support report' }).click()
      const download = await downloadPromise
      expect(download.suggestedFilename()).toMatch(/^ferrocast-support-.*\.zip$/)
      const stream = await download.createReadStream()
      const chunks: Buffer[] = []
      if (stream) {
        for await (const ch of stream) chunks.push(Buffer.from(ch))
      }
      const bytes = Buffer.concat(chunks)
      expect(bytes.length).toBeGreaterThan(100)
      expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK')

      await expect(support.getByTestId('support-report-downloaded')).toBeVisible()
      await settled(page)
      await expectCleanLayout(page, '#support')
    })
  }
})

test.describe('Stream labels+ & hype train (#8)', () => {
  for (const vp of [
    { name: '1280px', width: 1280, height: 800 },
    { name: '375px', width: 375, height: 812 },
  ]) {
    test(`configures monthly + hype train labels and renders textContent preview at ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await open(page, 'overlays/ov-main')

      await expect(page.getByRole('button', { name: 'More to add' })).toBeVisible()
      await page.getByRole('button', { name: 'More to add' }).click()
      await page.getByRole('menuitem', { name: 'Label' }).click()

      const shows = page.getByLabel('Shows')
      await expect(shows).toBeVisible()

      // Monthly total + timezone selector.
      await shows.selectOption('monthly_tips')
      await expect(page.getByLabel('Month boundary timezone')).toBeVisible()
      await page.getByLabel('Month boundary timezone').selectOption('330')
      await expect(page.getByLabel('Text')).toHaveValue('Month tips: {value}')

      // Top supporter all-time & session counts.
      await shows.selectOption('top_supporter_alltime')
      await expect(page.getByLabel('Text')).toHaveValue('Top supporter (all time): {value}')

      // Hype / combo train controls + preview textContent rendering.
      await shows.selectOption('hype_train')
      await expect(page.getByLabel('Month boundary timezone')).toHaveCount(0)
      await expect(page.getByLabel('Window (s)')).toBeVisible()
      await expect(page.getByLabel('Grow per event (s)')).toBeVisible()
      await expect(page.getByLabel('Max timer (s)')).toBeVisible()
      await expect(page.getByLabel('Events to start')).toBeVisible()

      await page.getByLabel('Window (s)').fill('90')
      await page.getByLabel('Grow per event (s)').fill('20')
      await page.getByLabel('Max timer (s)').fill('240')
      await page.getByLabel('Events to start').fill('2')

      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByText('Saved.')).toBeVisible()

      // Preview renders label widgets without HTML injection.
      const labelEl = page.locator('[data-overlay-preview] .fc-w-label').last()
      await expect(labelEl).toBeVisible()
      const text = await labelEl.textContent()
      expect(text?.trim().length).toBeGreaterThan(0)

      await settled(page)
      await expectCleanLayout(page, '#main')
    })
  }
})
