import { expect, test } from '@playwright/test'

test('multistream: the platforms switch on and off and the count follows', async ({ page }) => {
  await page.goto('/features/multistream/')
  await expect(page.locator('[data-n]')).toHaveText('4')
  const kick = page.locator('.fan-chip[data-p="kick"]')
  await kick.click()
  await expect(kick).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('[data-n]')).toHaveText('3')
  await page.locator('.step').nth(1).click()
  await expect(page.locator('.step').nth(1)).toHaveAttribute('aria-pressed', 'true')
})

test('vertical and horizontal: the preview switch dims the other canvas', async ({ page }) => {
  await page.goto('/features/vertical-dual-output/')
  await page.getByRole('button', { name: 'Upright' }).click()
  await expect(page.locator('#vrow')).toHaveAttribute('data-mode', 'upright')
})

test('widgets: a filter hides the other widgets', async ({ page }) => {
  await page.goto('/features/widgets/')
  await expect(page.locator('.wt:visible')).toHaveCount(6)
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.locator('.wt:visible')).toHaveCount(1)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.locator('.wt:visible')).toHaveCount(6)
})

for (const [path, h1] of [
  ['/use-cases/gaming/', 'Built for gaming.'],
  ['/use-cases/just-chatting/', 'Built for talking.'],
  ['/use-cases/irl/', 'Built for the road.'],
] as const) {
  test(`use case ${path} marks itself in the tabs and links to real pages`, async ({
    page,
    request,
  }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1)
    await expect(page.locator('.seg a[aria-current="page"]')).toHaveCount(1)
    const links = await page
      .locator('.picks a')
      .evaluateAll((a) => a.map((x) => x.getAttribute('href')))
    for (const l of links)
      expect((await request.get((l ?? '').split('#')[0] ?? '/')).status(), l ?? '').toBe(200)
  })
}

test('Ferrocast vs Streamlabs is about features: no prices anywhere on it', async ({ page }) => {
  await page.goto('/vs-streamlabs/')
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  expect(text).not.toMatch(/US\$|₹|\$\s?\d|per month|a month|a year|\/ ?(mo|month|yr|year)/i)
  await expect(page.getByText('What Streamlabs has that we do not.')).toBeVisible()
})

test('pricing: the new prices, and the sale chip stays hidden without a live sale', async ({
  page,
}) => {
  await page.route('**/v1/pro/prices', (r) => r.abort())
  await page.goto('/pricing/')
  await expect(page.locator('[data-live-price="monthly"]')).toHaveText('₹399')
  await expect(page.locator('[data-live-price="yearly"]')).toHaveText('₹3,999')
  await expect(page.locator('[data-live-chip]')).toBeHidden()
  await expect(
    page.getByText('you keep your price for at least 12 months', { exact: false }),
  ).toBeVisible()
})
