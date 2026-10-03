// Alert designs and theme scenes in a real browser (real Web Animations, real fonts): the
// demo overlay page plays alerts dressed by built-in and own designs, and draws scenes.

import { expect, test, type Page } from '@playwright/test'

type Demo = {
  client: {
    testAlert(r: { kind: string; design_id?: string }): Promise<unknown>
    setActiveAlertDesign(id: string | null): Promise<unknown>
    duplicateDesign(id: string): Promise<{ id: string }>
    useDesign(id: string, r?: unknown): Promise<{ overlays: { id: string }[] }>
  }
  overlay: { id: string }
}

async function open(page: Page, query = 'quiet') {
  await page.goto(`/?demo&${query}`)
  await page.waitForSelector('html[data-ready="1"]', { state: 'attached' })
}

const inAlert = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const host = document.querySelector('.fc-design-host')
    return host?.shadowRoot?.querySelectorAll(s).length ?? 0
  }, sel)

test(
  'a built-in alert design plays with its frame, highlight and mark',
  { tag: '@smoke' },
  async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await open(page)
    await page.evaluate(async () => {
      const d = (window as unknown as { __ferroDemo: Demo }).__ferroDemo
      await d.client.setActiveAlertDesign('builtin.esports-banner')
      await d.client.testAlert({ kind: 'tip' })
    })
    await expect.poll(() => inAlert(page, '.fa.f-banner')).toBe(1)
    expect(await inAlert(page, '.fa-title .hl')).toBeGreaterThan(0)
    expect(await inAlert(page, '.fa-spark.spot-edge')).toBe(1)
    // It leaves after its length, acknowledged.
    await expect.poll(() => inAlert(page, '.fa'), { timeout: 12_000 }).toBe(0)
    expect(errors).toEqual([])
  },
)

test('your own copy plays without the mark', async ({ page }) => {
  await open(page)
  await page.evaluate(async () => {
    const d = (window as unknown as { __ferroDemo: Demo }).__ferroDemo
    const mine = await d.client.duplicateDesign('builtin.comic-burst')
    await d.client.testAlert({ kind: 'follow', design_id: mine.id })
  })
  await expect.poll(() => inAlert(page, '.fa.f-comic')).toBe(1)
  expect(await inAlert(page, '.fa-spark, .al-spikes')).toBe(0)
})

test('reduced motion still shows the alert, with fades only', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await page.evaluate(async () => {
    const d = (window as unknown as { __ferroDemo: Demo }).__ferroDemo
    await d.client.testAlert({ kind: 'raid', design_id: 'builtin.pixel-arcade' })
  })
  await expect.poll(() => inAlert(page, '.fa.f-pixel')).toBe(1)
  const moving = await page.evaluate(() => {
    const host = document.querySelector('.fc-design-host')
    const anims = host?.shadowRoot?.querySelector('.fa')?.getAnimations({ subtree: true }) ?? []
    return anims.filter((a) =>
      JSON.stringify((a.effect as KeyframeEffect).getKeyframes()).includes('transform'),
    ).length
  })
  expect(moving, 'nothing moves').toBe(0)
})

test('a theme scene renders its layers and the mark', async ({ page }) => {
  await open(page)
  const id = await page.evaluate(async () => {
    const d = (window as unknown as { __ferroDemo: Demo }).__ferroDemo
    const r = await d.client.useDesign('builtin.forge', {
      overlay_id: d.overlay.id,
      scenes: ['brb'],
    })
    return r.overlays[0]?.id
  })
  expect(id).toBeTruthy()
  await expect(page.locator('.fc-w-layer')).not.toHaveCount(0)
  await expect(page.locator('.fc-brand')).toHaveCount(1)
  await expect(page.locator('.fc-layer-text').first()).toHaveText(/Be right back/)
})

test('a long name with no spaces wraps inside the alert instead of running off', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(async () => {
    const d = (window as unknown as { __ferroDemo: Demo }).__ferroDemo
    await d.client.setActiveAlertDesign('builtin.molten-plate')
    await d.client.testAlert({ kind: 'tip' })
  })
  await expect.poll(() => inAlert(page, '.fa-title')).toBe(1)
  const fits = await page.evaluate(() => {
    const root = document.querySelector('.fc-design-host')?.shadowRoot
    const title = root?.querySelector('.fa-title')
    const card = root?.querySelector('.fa-text')
    if (!title || !card) return null
    // Same shape the renderer builds: one box per word, one per letter.
    const w = document.createElement('span')
    w.className = 'w'
    for (const c of 'TheLegendaryChaiDrinker_9000xXxTheLegendary') {
      const ch = document.createElement('span')
      ch.className = 'ch'
      ch.textContent = c
      w.append(ch)
    }
    title.replaceChildren(w)
    return w.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1
  })
  expect(fits).toBe(true)
})
