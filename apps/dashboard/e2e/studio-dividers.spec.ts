import { expect, test, type Locator, type Page } from '@playwright/test'

// The Studio's dividers follow the pointer one to one, both ways, down to small minimums, as
// OBS's splitters do (owner, 27 Oct: the one under the preview had a dead zone and stopped
// at 45%).

// The Studio needs the desktop app's engine (the demo has none): run against a dev app with
// FC_API=http://127.0.0.1:<port> FC_TOKEN=<token> (its debug token file), and the app started
// with FERROCAST_DEV_ORIGIN set to this server's origin.
const api = process.env.FC_API
const token = process.env.FC_TOKEN
test.skip(!api || !token, 'Needs a running Ferrocast app (FC_API and FC_TOKEN).')
test.skip(({ isMobile }) => !!isMobile, 'Phones show one panel at a time, without dividers.')

async function desk(page: Page): Promise<void> {
  await page.addInitScript(
    ([a, t]) => {
      ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = Object.freeze({
        api: a,
        token: t,
        desktop: true,
      })
    },
    [api, token],
  )
  await page.goto('./#/studio/golive')
  await page
    .getByRole('radiogroup', { name: 'Picture from' })
    .getByText('Ferrocast', { exact: true })
    .click()
  await expect(page.getByRole('separator', { name: /Resize the preview/ })).toBeVisible()
}

async function centre(l: Locator): Promise<{ x: number; y: number }> {
  const b = await l.boundingBox()
  if (!b) throw new Error('not on screen')
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

async function drag(page: Page, l: Locator, dx: number, dy: number): Promise<void> {
  const c = await centre(l)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  // In steps, as a hand moves.
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 12 })
  await page.mouse.up()
}

test('the divider under the preview follows the pointer both ways, down to small minimums', async ({
  page,
}) => {
  await desk(page)
  const d = page.getByRole('separator', { name: /Resize the preview/ })
  const at = async () => (await centre(d)).y
  const start = await at()
  await drag(page, d, 0, -80)
  expect(Math.abs((await at()) - (start - 80))).toBeLessThanOrEqual(1)
  await drag(page, d, 0, 120)
  expect(Math.abs((await at()) - (start + 40))).toBeLessThanOrEqual(1)
  // All the way up: the picture becomes a strip, its bar stays whole.
  await drag(page, d, 0, -2000)
  const stage = page.locator('[data-stage]')
  const bar = stage.locator(':scope > :last-child')
  const picture = (await stage.boundingBox())!.height - (await bar.boundingBox())!.height
  expect(picture).toBeGreaterThanOrEqual(63)
  expect(picture).toBeLessThanOrEqual(70)
  // And straight back down: no dead zone first.
  const top = await at()
  await drag(page, d, 0, 50)
  expect(Math.abs((await at()) - (top + 50))).toBeLessThanOrEqual(1)
  // All the way down: the panels keep their title and a little of their list.
  await drag(page, d, 0, 2000)
  const panels = page.locator('[data-dock="scenes"]').locator('..')
  expect((await panels.boundingBox())!.height).toBeGreaterThanOrEqual(109)
})

test('the side divider follows the pointer both ways and stops at the minimums', async ({
  page,
}) => {
  await desk(page)
  const d = page.getByRole('separator', { name: /Resize the right panels/ })
  const at = async () => (await centre(d)).x
  const start = await at()
  await drag(page, d, -100, 0)
  expect(Math.abs((await at()) - (start - 100))).toBeLessThanOrEqual(1)
  await drag(page, d, 60, 0)
  expect(Math.abs((await at()) - (start - 40))).toBeLessThanOrEqual(1)
  // Narrowest panel, then widest (the stage keeps 240 px).
  await drag(page, d, 3000, 0)
  const right = page.locator('[data-dock="golive"]').locator('..')
  expect(Math.round((await right.boundingBox())!.width)).toBeGreaterThanOrEqual(179)
  expect(Math.round((await right.boundingBox())!.width)).toBeLessThanOrEqual(182)
  await drag(page, d, -3000, 0)
  const middle = page.locator('[data-stage]').locator('..')
  expect(Math.round((await middle.boundingBox())!.width)).toBeGreaterThanOrEqual(239)
})
