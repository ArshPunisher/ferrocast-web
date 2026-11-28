import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { open, settled } from './helpers'

test.describe('Settings > Advanced cleanup (U6)', () => {
  test('support report, likely causes, info tiles, API keys padding/button/empty state, and section gaps are aligned', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, 'settings/advanced')

    const support = page.locator('#support')
    const apiKeys = page.locator('#api-keys')
    await expect(support).toBeVisible()
    await expect(apiKeys).toBeVisible()
    await expect(page.getByText('2 of 32 active keys')).toBeVisible()

    const metrics = await page.evaluate(() => {
      const sup = document.querySelector('#support') as HTMLElement
      const keys = document.querySelector('#api-keys') as HTMLElement
      const supNote = Array.from(sup.querySelectorAll('p')).find((p) =>
        p.textContent?.includes('Creates a redacted zip'),
      )
      const keysHeading = keys.querySelector('h3')
      const keysNote = Array.from(keys.querySelectorAll('p')).find((p) =>
        p.textContent?.includes('Scoped keys for local scripts'),
      )
      const startHeading = Array.from(document.querySelectorAll('h3')).find(
        (h) => h.textContent?.trim() === 'Starting and closing',
      )

      const preview = sup.querySelector('[data-testid="support-report-preview"]') as HTMLElement
      const previewRadius = parseFloat(getComputedStyle(preview).borderTopLeftRadius)
      const infoLabels = [
        'App & OS',
        'GPU & Encoder',
        'Audio & Sample Rate',
        'Stream History & Crashes',
      ]
      const infoBorders = infoLabels.map((label) => {
        const span = Array.from(preview.querySelectorAll('span')).find(
          (s) => s.textContent?.trim() === label,
        )
        const tile = span?.parentElement as HTMLElement | null
        return tile ? parseFloat(getComputedStyle(tile).borderTopWidth) : 0
      })

      // Card inside #api-keys: rounded panel owning the border.
      const keysCard = Array.from(keys.querySelectorAll('section > div')).find(
        (d) => parseFloat(getComputedStyle(d).borderTopWidth) >= 1,
      ) as HTMLElement | null
      const activeText = Array.from(keys.querySelectorAll('span')).find((s) =>
        s.textContent?.includes('active keys'),
      ) as HTMLElement | undefined
      const createBtn = Array.from(keys.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Create API key'),
      ) as HTMLElement | undefined

      if (!keysCard || !activeText || !createBtn || !keysHeading || !startHeading) {
        throw new Error('Missing Advanced settings elements')
      }

      const supRect = sup.getBoundingClientRect()
      const keysHeadRect = keysHeading.getBoundingClientRect()
      const keysRect = keys.getBoundingClientRect()
      const startRect = startHeading.getBoundingClientRect()
      const cardRect = keysCard.getBoundingClientRect()
      const activeRect = activeText.getBoundingClientRect()
      const btnRect = createBtn.getBoundingClientRect()

      return {
        supportToApiKeysGap:
          keysHeadRect.top - (supNote ? supNote.getBoundingClientRect().bottom : supRect.bottom),
        apiKeysToStartupGap:
          startRect.top - (keysNote ? keysNote.getBoundingClientRect().bottom : keysRect.bottom),
        previewRadius,
        infoBorders,
        activeLeftInset: activeRect.left - cardRect.left,
        createBtnRightInset: cardRect.right - btnRect.right,
        createBtnTopInset: btnRect.top - cardRect.top,
      }
    })

    expect(metrics.supportToApiKeysGap, 'gap above Local API keys heading').toBeGreaterThanOrEqual(
      20,
    )
    expect(metrics.apiKeysToStartupGap, 'gap above Starting and closing').toBeGreaterThanOrEqual(20)
    expect(metrics.previewRadius, 'Likely causes panel border radius').toBeGreaterThanOrEqual(10)
    for (const bw of metrics.infoBorders) {
      expect(bw, 'each hardware/telemetry info tile has a 1px border').toBeGreaterThanOrEqual(1)
    }
    expect(
      metrics.activeLeftInset,
      'active keys text padded from left card edge',
    ).toBeGreaterThanOrEqual(14)
    expect(
      metrics.createBtnRightInset,
      'Create API key inside right border',
    ).toBeGreaterThanOrEqual(14)
    expect(metrics.createBtnTopInset, 'Create API key inside top border').toBeGreaterThanOrEqual(10)

    // Revoking keeps keys listed with Revoked badge; card padding and layout stay clean.
    await apiKeys.getByRole('button', { name: 'Revoke Node Follow Reactor' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke key' }).click()
    await expect(apiKeys.getByText('Revoked', { exact: true }).first()).toBeVisible()
  })

  test('works at 1440/1280/1024/375 with zero overflow and passes light and dark axe checks', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const width of [1440, 1280, 1024, 375]) {
      await page.setViewportSize({ width, height: 800 })
      await open(page, 'settings/advanced')
      await expect(page.getByRole('heading', { name: 'Advanced', exact: true })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `overflow at ${width}px`,
      ).toBe(true)
    }

    await page.setViewportSize({ width: 1280, height: 800 })
    const lightAxe = await new AxeBuilder({ page }).include('main').analyze()
    expect(lightAxe.violations).toEqual([])
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'slate'))
    await settled(page)
    const darkAxe = await new AxeBuilder({ page }).include('main').analyze()
    expect(darkAxe.violations).toEqual([])
  })
})
