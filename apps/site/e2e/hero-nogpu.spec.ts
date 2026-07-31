import { expect, test } from '@playwright/test'

// The default test browser draws WebGL in software (SwiftShader), like a VM or a machine
// with a blocklisted GPU: the star field must stay off and the banner must still finish.
test('without a real GPU: no star field, and the braid still shows', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas.hero-field')).toHaveCount(0)
  await expect(page.locator('html')).toHaveClass(/hero-burst/)
  await expect(page.locator('.hero-visual')).toHaveCSS('opacity', '1', { timeout: 3000 })
})
