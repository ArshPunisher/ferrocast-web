import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Screenshots go outside the repo by default (they are for looking at, not for git).
const SHOTS = process.env.SCREENSHOT_DIR ?? join(process.cwd(), 'test-results', 'screenshots')

type Demo = {
  client: {
    test(kind: string): Promise<unknown>
    overlays(): Promise<{ id: string; widgets: { config: { theme?: string } }[] }[]>
    saveOverlay(o: unknown): Promise<unknown>
  }
}

function watch(page: Page) {
  const errors: string[] = []
  const external: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('request', (r) => {
    const u = r.url()
    if (!/^(https?:\/\/localhost:\d+\/|data:|blob:)/.test(u)) external.push(u)
  })
  return { errors, external }
}

async function open(page: Page, query: string) {
  await page.goto(`/?demo&${query}`)
  await page.waitForSelector('html[data-ready="1"]', { state: 'attached' })
  await expect(page.locator('.fc-w')).toHaveCount(6)
}

/** Text of the alert currently on screen (it lives in a shadow root). */
const alertText = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector('.fc-alert-host')
    return host?.shadowRoot?.querySelector('.al-text')?.textContent ?? null
  })

test('the demo overlay renders every widget from the snapshot, with no errors or outside requests', async ({
  page,
}) => {
  const w = watch(page)
  await open(page, 'quiet')
  await expect(page.locator('.fc-w-chat .fc-msg')).not.toHaveCount(0)
  await expect(page.locator('.fc-w-events .fc-ev')).not.toHaveCount(0)
  await expect(page.locator('.fc-goal-nums')).toHaveText(/\d+ \/ 50/)
  await expect(page.locator('.fc-label-text')).toHaveText(/LunaLagoon/)
  await expect(page.locator('.fc-viewers-count')).toHaveText(/\d/)
  await page.waitForTimeout(300)
  expect(w.errors).toEqual([])
  expect(w.external).toEqual([])
})

test('the page background is transparent', async ({ page }) => {
  await open(page, 'quiet')
  const png = await page.screenshot({ omitBackground: true })
  const alpha = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    if (!ctx) return -1
    ctx.drawImage(img, 0, 0)
    // Empty areas between widgets: top-left corner and the middle of the screen.
    return [ctx.getImageData(4, 4, 1, 1).data[3], ctx.getImageData(960, 520, 1, 1).data[3]]
  }, png.toString('base64'))
  expect(alpha).toEqual([0, 0])
  const bg = await page.evaluate(() => [
    getComputedStyle(document.body).backgroundColor,
    getComputedStyle(document.documentElement).backgroundColor,
  ])
  expect(bg).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'])
})

test('a test alert rises, holds and leaves', async ({ page }) => {
  await open(page, 'quiet')
  await page.evaluate(() =>
    (window as unknown as { __ferroDemo: Demo }).__ferroDemo.client.test('follow'),
  )
  await expect.poll(() => alertText(page)).toContain('NovaRiver followed!')
  await expect(page.locator('.fc-alert-host')).toHaveCount(0, { timeout: 15_000 })
})

test('reduced motion turns the alert into a fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, 'quiet')
  await page.evaluate(() =>
    (window as unknown as { __ferroDemo: Demo }).__ferroDemo.client.test('tip'),
  )
  await expect.poll(() => alertText(page)).toContain('tipped')
  const anim = await page.evaluate(() => {
    const inner = document.querySelector('.fc-alert-host')?.shadowRoot?.querySelector('.al-inner')
    return inner ? getComputedStyle(inner).animationName : null
  })
  expect(anim).toBe('al-fade-in')
})

test('?lowmotion forces fades only', async ({ page }) => {
  await open(page, 'quiet&lowmotion')
  await expect(page.locator('.fc-ov.is-low')).toHaveCount(1)
})

test('?test mode loops sample alerts', async ({ page }) => {
  await open(page, 'quiet&test')
  await expect.poll(() => alertText(page), { timeout: 5000 }).not.toBeNull()
})

test('no infinite animations are running', async ({ page }) => {
  await open(page, '')
  await page.waitForTimeout(1500)
  const infinite = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => {
        const t = a.effect?.getComputedTiming()
        return t && t.iterations === Infinity
      }).length,
  )
  expect(infinite).toBe(0)
})

for (const theme of ['molten', 'daylight', 'arcade', 'minimal', 'sticker']) {
  test(`theme ${theme} at 1920x1080`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'screenshots from one engine are enough')
    await open(page, 'quiet')
    await page.evaluate(async (t) => {
      const { client } = (window as unknown as { __ferroDemo: Demo }).__ferroDemo
      const [o] = await client.overlays()
      if (!o) return
      for (const w of o.widgets) w.config.theme = t
      await client.saveOverlay(o)
      await client.test('subscription')
    }, theme)
    await expect.poll(() => alertText(page)).toContain('subscribed')
    await page.waitForTimeout(1200)
    // A stand-in for gameplay: bright on the left, dark on the right, so legibility shows on both.
    await page.addStyleTag({
      content:
        'html,body{min-height:100%}html{background:linear-gradient(100deg,#d9e7f2 0%,#9ec3a1 30%,#4f6b3a 48%,#1c2430 70%,#07090c 100%)!important}',
    })
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, `overlay-${theme}.jpg`), type: 'jpeg', quality: 72 })
    const themes = await page
      .locator('.fc-w')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.theme))
    expect(new Set(themes)).toEqual(new Set([theme]))
  })
}

test('without a token and without ?demo the page shows nothing (no fake alerts on stream)', async ({
  page,
}) => {
  const warnings: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text())
  })
  await page.goto('/')
  await page.waitForTimeout(800)
  await expect(page.locator('.fc-w')).toHaveCount(0)
  expect(await page.evaluate(() => 'demo' in window || '__ferroDemo' in window)).toBe(false)
  expect(warnings.some((w) => w.includes('needs an overlay URL'))).toBe(true)
})

test('custom alert CSS cannot move the alert out of its box', async ({ page }) => {
  await open(page, 'quiet')
  await page.evaluate(async () => {
    type Rule = { id: string; variations: { css: string }[] }
    const demo = (
      window as unknown as {
        __ferroDemo: {
          client: {
            alertRules(): Promise<Rule[]>
            saveAlertRule(r: Rule): Promise<unknown>
            test(k: string): Promise<unknown>
          }
        }
      }
    ).__ferroDemo
    const rules = await demo.client.alertRules()
    const follow = rules.find((r) => r.id === 'follow')
    if (!follow) return
    for (const v of follow.variations)
      v.css =
        ':host { position: fixed !important; inset: auto !important; left: 0 !important; top: 0 !important; transform: translate(900px, 600px) !important } .al { position: fixed; left: 0; top: 0 }'
    await demo.client.saveAlertRule(follow)
    await demo.client.test('follow')
  })
  await expect.poll(() => alertText(page)).toContain('followed')
  await page.waitForTimeout(900)
  const geo = await page.evaluate(() => {
    const box = document.querySelector('.fc-w-alerts')?.getBoundingClientRect()
    const card = document
      .querySelector('.fc-alert-host')
      ?.shadowRoot?.querySelector('.al-inner')
      ?.getBoundingClientRect()
    return box && card ? { box: box.toJSON() as DOMRect, card: card.toJSON() as DOMRect } : null
  })
  expect(geo).not.toBeNull()
  if (!geo) return
  const cx = Math.round(geo.card.left + geo.card.width / 2)
  const cy = Math.round(geo.card.top + geo.card.height / 2)
  const outside = cx < geo.box.left || cx > geo.box.right || cy < geo.box.top || cy > geo.box.bottom
  // The streamer's CSS really did push it out; what matters is that nothing is painted there.
  expect(outside).toBe(true)
  const png = await page.screenshot({
    clip: { x: cx - 2, y: cy - 2, width: 4, height: 4 },
    omitBackground: true,
  })
  const alpha = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    ctx?.drawImage(img, 0, 0)
    return ctx
      ? Math.max(
          ...Array.from(
            ctx.getImageData(0, 0, c.width, c.height).data.filter((_, i) => i % 4 === 3),
          ),
        )
      : -1
  }, png.toString('base64'))
  expect(alpha).toBe(0)
})
