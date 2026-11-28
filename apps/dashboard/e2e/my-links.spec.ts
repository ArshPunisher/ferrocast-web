import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, open, settled } from './helpers'

async function seriousA11y(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('[data-overlay-preview]')
    .analyze()
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}

test.describe('My links, real labels, and token resolution', () => {
  test('Settings > Accounts manages My links and propagates into overlay editor cleanly (desktop)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'settings/accounts')

    const group = page.locator('#my-links')
    await expect(group).toBeVisible()
    await expect(group.getByText('Auto: twitch.tv/novaplays')).toBeVisible()
    await expect(group.getByText('Auto: youtube.com/@NovaPlays')).toBeVisible()

    // Invalid scheme shows inline error without losing input and keeps Save disabled.
    const discord = group.getByLabel('Discord')
    await discord.fill('javascript:alert(1)')
    await expect(group.getByText(/javascript:/)).toBeVisible()
    await expect(group.getByRole('button', { name: 'Save links' })).toBeDisabled()

    await discord.fill('https://discord.gg/novahub/')
    await group.getByLabel('Next stream fallback').fill('Saturdays, 9 PM')
    await group.getByRole('button', { name: 'Add custom link' }).click()
    await group.getByLabel('Label 1').fill('Merch')
    await group.getByLabel('Link or handle').fill('https://shop.novahub.gg/')

    await expect(group.getByTestId('my-links-preview')).toContainText('discord.gg/novahub')
    await expect(group.getByTestId('my-links-preview')).toContainText('Merch: shop.novahub.gg')
    await group.getByRole('button', { name: 'Save links' }).click()
    await expect(page.getByText('My links saved. Overlays updated.')).toBeVisible()

    await settled(page)
    expect(await seriousA11y(page)).toEqual([])

    // Seed an overlay with a `{socials}` text layer and real label to inspect Overlays grid & editor.
    const ovId = await demo<string>(
      page,
      `async (d) => {
        const hdr = { Authorization: 'Bearer demo-session', 'Content-Type': 'application/json' }
        const res = await d.fetch(d.base + '/api/v1/overlays', {
          method: 'POST',
          headers: hdr,
          body: JSON.stringify({ name: 'Token Showcase', preset: 'starter' }),
        })
        const ov = await res.json()
        ov.widgets.push({
          id: 'txt-links',
          kind: 'layer',
          x: 60,
          y: 920,
          w: 760,
          h: 60,
          config: { type: 'text', text: '{socials}', size: 28, color: '#ffffff' },
        })
        await d.fetch(d.base + '/api/v1/overlays/' + ov.id, {
          method: 'PUT',
          headers: hdr,
          body: JSON.stringify(ov),
        })
        return ov.id
      }`,
    )

    // Overlays grid loads real links & real labels inside the saved card preview cleanly.
    await open(page, 'overlays')
    await expect(page.getByRole('heading', { name: 'Token Showcase' })).toBeVisible()
    await expect(async () => {
      const gridPreviewText = await page.evaluate(() => {
        const hosts = Array.from(document.querySelectorAll('[data-overlay-preview] > div'))
        return hosts.map((h) => h.shadowRoot?.textContent ?? '').join('\n')
      })
      expect(gridPreviewText).toContain('LunaLagoon')
      expect(gridPreviewText.toLowerCase()).not.toContain('yourname')
    }).toPass()

    // Designs gallery shows creator's resolved handles in scene previews too, never "yourname".
    await open(page, 'designs/themes')
    await expect(page.getByRole('button', { name: 'Use theme' }).first()).toBeVisible()
    const designPreviewText = await page.evaluate(() => {
      const hosts = Array.from(document.querySelectorAll('[data-overlay-preview] > div'))
      return hosts.map((h) => h.shadowRoot?.textContent ?? '').join('\n')
    })
    expect(designPreviewText.toLowerCase()).not.toContain('yourname')

    // Overlay editor shows real `/labels` value (`LunaLagoon`) and links `{socials}` preview + shortcut to My links.
    await open(page, `overlays/${ovId}`)
    await expect(page.getByRole('heading', { name: 'Token Showcase' })).toBeVisible()
    await page.getByRole('button', { name: 'Text: {socials}', exact: true }).click()
    const editLinks = page.getByRole('link', { name: 'Edit my links' })
    await expect(editLinks).toBeVisible()
    await expect(editLinks).toHaveAttribute('href', '#/settings/accounts')

    // Verify rendered preview shadow DOM resolves real label and configured links, never "yourname".
    await expect(async () => {
      const previewText = await page.evaluate(() => {
        const hosts = Array.from(document.querySelectorAll('[data-overlay-preview] > div'))
        return hosts.map((h) => h.shadowRoot?.textContent ?? '').join('\n')
      })
      expect(previewText).toContain('LunaLagoon')
      expect(previewText).toContain('twitch.tv/novaplays')
      expect(previewText.toLowerCase()).not.toContain('yourname')
    }).toPass()

    await editLinks.click()
    await expect(page.locator('#my-links')).toBeVisible()
  })

  test('My links card lays out cleanly without horizontal overflow on 375px mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'settings/accounts')

    const group = page.locator('#my-links')
    await expect(group).toBeVisible()
    await group.getByRole('button', { name: 'Add custom link' }).scrollIntoViewIfNeeded()
    await group.getByRole('button', { name: 'Add custom link' }).click()
    await expect(group.getByLabel('Label 1')).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
    await settled(page)
    expect(await seriousA11y(page)).toEqual([])
  })
})
