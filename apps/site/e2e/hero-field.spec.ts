import { chromium, expect, test } from '@playwright/test'

// The star field runs on a real GPU only. Ask Chromium for the Mac's GPU (Metal); on a
// machine without one (most CI) the field tests skip and the no-GPU test covers the page.
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
test.use({ launchOptions: { args: GPU_ARGS } })
let hasGpu = false
test.beforeAll(async () => {
  const b = await chromium.launch({ args: GPU_ARGS })
  const p = await b.newPage()
  hasGpu = await p.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const i = gl?.getExtension('WEBGL_debug_renderer_info')
    const name = i ? String(gl!.getParameter(i.UNMASKED_RENDERER_WEBGL)) : ''
    return !!name && !/swiftshader|llvmpipe|softpipe|software/i.test(name)
  })
  await b.close()
})
const needsGpu = () => test.skip(!hasGpu, 'no real GPU on this machine')

// The star field lives in the home banner only (it replaced the page-wide particles).
// a WebGL canvas cannot be read back after it is shown, so compare what is on screen
const frame = async (page: import('@playwright/test').Page) =>
  (await page.locator('canvas.hero-field').screenshot({ animations: 'allow' })).toString('base64')

test('one decorative star field, inside the home banner only', async ({ page }) => {
  needsGpu()
  await page.goto('/')
  const canvas = page.locator('canvas.hero-field')
  await expect(canvas).toHaveCount(1)
  await expect(canvas).toHaveAttribute('aria-hidden', 'true')
  expect(await canvas.evaluate((el) => el.parentElement?.matches('[data-hero]'))).toBe(true)
  expect(await canvas.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
  // no page-wide particle layer any more
  await expect(page.locator('canvas.fc-particles')).toHaveCount(0)
  // other pages have no star field
  await page.goto('/pricing/')
  await expect(page.locator('canvas.hero-field')).toHaveCount(0)
})

test('every load plays the intro, then the braid shows', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    if (i) await page.reload()
    else await page.goto('/')
    await expect(page.locator('html')).toHaveClass(/fc-intro/)
    await expect(page.locator('html')).toHaveClass(/hero-burst/, { timeout: 6000 })
    await expect(page.locator('.hero-visual')).toHaveCSS('opacity', '1', { timeout: 3000 })
  }
})

test('the field moves', async ({ page }) => {
  needsGpu()
  await page.goto('/')
  await page.locator('canvas.hero-field').waitFor({ state: 'attached' })
  await page.waitForTimeout(600)
  const a = await frame(page)
  await page.waitForTimeout(400)
  expect(await frame(page)).not.toBe(a)
})

test('under reduced motion: no intro, everything visible, the field holds still', async ({ page }) => {
  needsGpu()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('html')).not.toHaveClass(/fc-intro/)
  await expect(page.locator('.hero-visual')).toHaveCSS('opacity', '1')
  await page.locator('canvas.hero-field').waitFor({ state: 'attached' })
  await page.waitForTimeout(300)
  const a = await frame(page)
  await page.mouse.move(700, 400)
  await page.waitForTimeout(400)
  expect(await frame(page)).toBe(a)
})

test('opening: On air, Level check and Spark drop play, then every helper is gone', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.intro-onair')).toHaveCount(1)
  await expect(page.locator('.intro-cursor')).toHaveCount(2)
  await expect(page.locator('.intro-meter')).toHaveCount(1)
  await expect(page.locator('html')).not.toHaveClass(/intro-hold/, { timeout: 4000 })
  await expect(
    page.locator('.intro-standby, .intro-onair, .intro-wash, .intro-tally, .intro-cursor, .intro-meter'),
  ).toHaveCount(0)
  for (const sel of ['.hero .eyebrow', '.hero h1 .line >> nth=1', '.hero .lede', '.hero-ctas'])
    await expect(page.locator(sel)).toHaveCSS('opacity', '1')
  // the headline still reads as one sentence
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Your stream tools,\s+on your own PC\./)
})

test('opening: any key skips straight to the finished banner', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.intro-onair')).toHaveCount(1)
  await page.keyboard.press('Shift')
  await expect(page.locator('html')).not.toHaveClass(/intro-hold/)
  await expect(page.locator('.intro-standby')).toHaveCount(0)
  await expect(page.locator('.hero .lede')).toHaveCSS('opacity', '1')
})

test('opening: if its script never runs, the text still shows', async ({ page }) => {
  await page.route(/\/_astro\/intro\..*\.js$/, (r) => r.abort())
  await page.goto('/')
  await expect(page.locator('.hero .lede')).toHaveCSS('opacity', '1', { timeout: 6000 })
})

test('opening: only the banner waits; other sections are readable at once', async ({ page }) => {
  await page.goto('/#tips')
  await expect(page.locator('html')).toHaveClass(/intro-hold/)
  const others = page.locator('main .lede:not(.hero-copy .lede), main .eyebrow:not(.hero-copy .eyebrow)')
  const n = await others.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) await expect(others.nth(i)).toHaveCSS('opacity', '1')
})
