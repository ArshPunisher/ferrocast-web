import { expect, test } from '@playwright/test'

// The features page: find a feature, jump to it, see any screenshot big.

test('the chips dim the other groups and a card jumps to its feature', async ({ page }) => {
  // Clicked before the page has finished loading too: the jump still lands.
  await page.goto('/features/', { waitUntil: 'commit' })
  await page.getByRole('button', { name: 'Plugins', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Plugins', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const alerts = page.locator('.cards > li[data-g="alerts"]').first()
  await expect(alerts).toHaveClass(/dim/)
  // A dimmed card is out of the tab order; the group's own cards aren't.
  await expect(alerts.locator('a')).toHaveAttribute('tabindex', '-1')
  await page.locator('.cards a[href="#plugins"]').click()
  await expect(page).toHaveURL(/#plugins$/)
  await expect(page.locator('#plugins')).toBeInViewport()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.locator('.cards > li.dim')).toHaveCount(0)
})

test('a screenshot grows big with nothing else, and a click, a scroll or Esc puts it back', async ({ page }) => {
  await page.goto('/features/')
  const zoom = page.locator('#zoom')
  const shot = page.getByRole('button', { name: 'See Alerts big' })
  await shot.click()
  await expect(zoom).toBeVisible()
  // Only the picture: no buttons, no words.
  await expect(zoom.locator('button')).toHaveCount(0)
  expect((await zoom.innerText()).trim()).toBe('')
  // The full screenshot, filling most of the screen.
  const img = page.locator('#zoom-img')
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1440)
  await expect.poll(async () => (await img.boundingBox())?.width ?? 0).toBeGreaterThan(1100)
  await img.click()
  await expect(zoom).toBeHidden()
  await expect(shot).toBeFocused()
  // A scroll puts it back too, and the page doesn't move under it.
  await shot.click()
  await expect(zoom).toBeVisible()
  const y = await page.evaluate(() => scrollY)
  await page.mouse.wheel(0, 400)
  await expect(zoom).toBeHidden()
  expect(await page.evaluate(() => scrollY)).toBe(y)
  await shot.click()
  await expect(zoom).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(zoom).toBeHidden()
})

test('every feature screenshot loads and is a dark one', async ({ page }) => {
  await page.goto('/features/')
  const shots = page.locator('.fx .shot img')
  for (const img of await shots.all()) {
    await img.scrollIntoViewIfNeeded()
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    // Mean brightness of a small copy: the owner wants dark screenshots only.
    const mean = await img.evaluate((i: HTMLImageElement) => {
      const c = document.createElement('canvas')
      c.width = 48
      c.height = 30
      const g = c.getContext('2d')!
      g.drawImage(i, 0, 0, 48, 30)
      const d = g.getImageData(0, 0, 48, 30).data
      let sum = 0
      for (let k = 0; k < d.length; k += 4) sum += (d[k]! + d[k + 1]! + d[k + 2]!) / 3
      return sum / (d.length / 4) / 255
    })
    expect(mean, await img.getAttribute('src') ?? '').toBeLessThan(0.25)
  }
})
