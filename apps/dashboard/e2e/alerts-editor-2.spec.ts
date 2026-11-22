import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

// The Alerts editor sits beside the sidebar (folding it to the icon rail for room), and its
// two docks can be resized.

const navW = (page: Page) =>
  page.evaluate(() => document.documentElement.style.getPropertyValue('--fc-nav-w'))
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('fc-nav-folded'))
/** `fc-nav-folded`: '1' folded, '0' open (the app's own key). */
const withNav = (page: Page, v: '0' | '1') =>
  page.addInitScript((val) => localStorage.setItem('fc-nav-folded', val), v)
const go = (page: Page, hash: string) => page.evaluate((h) => (location.hash = h), hash)
const toggle = (page: Page) => page.getByRole('button', { name: /^(Show|Hide) the menu$/ }).click()
const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test.describe('the sidebar and the Alerts editor', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('an open sidebar folds on Alerts and comes back on any other page', async ({ page }) => {
    await withNav(page, '0')
    await open(page, 'home')
    expect(await navW(page)).toBe('15rem')
    await go(page, '#/alerts')
    await expect(page.getByTestId('alert-editor')).toBeVisible()
    expect(await navW(page)).toBe('60px')
    // The sidebar is still there, beside the editor, not under it.
    const side = await page.locator('aside').first().boundingBox()
    const ed = await page.getByTestId('alert-editor').boundingBox()
    expect(side && ed && ed.x >= side.x + side.width - 1).toBe(true)
    await go(page, '#/chat')
    expect(await navW(page)).toBe('15rem')
    // The person's choice was never changed.
    expect(await stored(page)).toBe('0')
  })

  test('the person can open it on Alerts and it stays open until they leave', async ({ page }) => {
    await withNav(page, '0')
    await open(page, 'alerts/follow')
    expect(await navW(page)).toBe('60px')
    await toggle(page)
    expect(await navW(page)).toBe('15rem')
    // Switching to another rule (still Alerts) does not fold it again.
    await page.getByRole('navigation', { name: 'Alert rules' }).getByText('Tips').click()
    await expect(page.getByLabel('Rule name')).toHaveValue('Tips')
    expect(await navW(page)).toBe('15rem')
    expect(await stored(page)).toBe('0')
    await go(page, '#/home')
    expect(await navW(page)).toBe('15rem')
  })

  test('a sidebar the person keeps folded is never touched', async ({ page }) => {
    await withNav(page, '1')
    await open(page, 'home')
    expect(await navW(page)).toBe('60px')
    await go(page, '#/alerts')
    expect(await navW(page)).toBe('60px')
    // Opened by hand on Alerts, it folds back on leaving (that is what they had).
    await toggle(page)
    expect(await navW(page)).toBe('15rem')
    await go(page, '#/home')
    expect(await navW(page)).toBe('60px')
    expect(await stored(page)).toBe('1')
  })

  test('on another page the toggle is the choice, and it is remembered', async ({ page }) => {
    await withNav(page, '0')
    await open(page, 'home')
    await toggle(page)
    expect(await navW(page)).toBe('60px')
    expect(await stored(page)).toBe('1')
    await go(page, '#/alerts')
    await go(page, '#/home')
    expect(await navW(page)).toBe('60px')
  })
})

for (const [width, height] of [
  [1280, 800],
  [1440, 900],
] as const) {
  test.describe(`resizing the docks at ${width}x${height}`, () => {
    test.use({ viewport: { width, height } })

    test('the mouse resizes both docks, within limits, and the stage stays 16:9 with no scroll', async ({
      page,
    }) => {
      await open(page, 'alerts/follow')
      const left = page.getByRole('separator', { name: 'Resize the alert rules dock' })
      const right = page.getByRole('separator', { name: 'Resize the properties dock' })
      await expect(left).toHaveAttribute('aria-valuemin', '200')
      await expect(left).toHaveAttribute('aria-valuemax', '360')
      await expect(right).toHaveAttribute('aria-valuemin', '300')
      await expect(right).toHaveAttribute('aria-valuemax', '520')
      const w0 = Number(await left.getAttribute('aria-valuenow'))
      const lb = (await left.boundingBox())!
      await page.mouse.move(lb.x + lb.width / 2, lb.y + 200)
      await page.mouse.down()
      await page.mouse.move(lb.x + lb.width / 2 + 60, lb.y + 200, { steps: 5 })
      await page.mouse.up()
      expect(Number(await left.getAttribute('aria-valuenow'))).toBe(w0 + 60)
      // Far past the limit: held at the maximum.
      const lb2 = (await left.boundingBox())!
      await page.mouse.move(lb2.x + lb2.width / 2, lb2.y + 200)
      await page.mouse.down()
      await page.mouse.move(lb2.x + 600, lb2.y + 200, { steps: 5 })
      await page.mouse.up()
      expect(Number(await left.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(360)
      // The right dock grows when dragged left.
      const r0 = Number(await right.getAttribute('aria-valuenow'))
      const rb = (await right.boundingBox())!
      await page.mouse.move(rb.x + rb.width / 2, rb.y + 200)
      await page.mouse.down()
      await page.mouse.move(rb.x + rb.width / 2 - 50, rb.y + 200, { steps: 5 })
      await page.mouse.up()
      expect(Number(await right.getAttribute('aria-valuenow'))).toBe(r0 + 50)
      // The stage keeps 16:9, the page does not scroll.
      const box = await page
        .getByLabel('Live preview')
        .locator('[class*="aspect-video"]')
        .first()
        .boundingBox()
      expect(box, 'the stage is there').not.toBeNull()
      expect(Math.abs(box!.width / box!.height - 16 / 9)).toBeLessThan(0.05)
      expect(await noSideScroll(page)).toBe(true)
      const m = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight])
      expect(m[0]).toBeLessThanOrEqual(m[1]!)
    })

    test('the keyboard resizes: arrows, Shift, Home, End; double-click resets; it is remembered', async ({
      page,
    }) => {
      await open(page, 'alerts/follow')
      const right = page.getByRole('separator', { name: 'Resize the properties dock' })
      const def = Number(await right.getAttribute('aria-valuenow'))
      await right.focus()
      await page.keyboard.press('ArrowLeft')
      expect(Number(await right.getAttribute('aria-valuenow'))).toBe(def + 16)
      await page.keyboard.press('Shift+ArrowRight')
      expect(Number(await right.getAttribute('aria-valuenow'))).toBe(def + 16 - 48)
      await page.keyboard.press('End')
      expect(Number(await right.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(520)
      await page.keyboard.press('Home')
      expect(Number(await right.getAttribute('aria-valuenow'))).toBe(300)
      // Remembered after a reload.
      await page.reload()
      const again = page.getByRole('separator', { name: 'Resize the properties dock' })
      await expect(again).toHaveAttribute('aria-valuenow', '300')
      await again.dblclick()
      await expect(again).toHaveAttribute('aria-valuenow', String(def))
      const left = page.getByRole('separator', { name: 'Resize the alert rules dock' })
      await left.focus()
      await page.keyboard.press('Home')
      await expect(left).toHaveAttribute('aria-valuenow', '200')
      expect(await noSideScroll(page)).toBe(true)
    })
  })
}

test.describe('platforms appear once on the Alerts screen', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('one connection pill, one Listens on block, one Preview as control', async ({ page }) => {
    await open(page, 'alerts/follow')
    await expect(page.getByTestId('alert-editor')).toBeVisible()
    // The app's strip is one summary pill, not three platform pills.
    const strip = page.getByRole('list', { name: 'Connections' })
    await expect(strip.getByRole('listitem')).toHaveCount(1)
    await expect(page.getByTestId('connections-overflow')).toContainText(/platforms|connected/)
    // The header has no platform controls: the name and a labelled switch only.
    const editor = page.getByTestId('alert-editor')
    const header = editor.locator('header')
    await expect(header.getByRole('switch', { name: 'Rule on' })).toBeVisible()
    await expect(header.getByText('Rule on')).toBeVisible()
    await expect(header.getByText('Twitch')).toHaveCount(0)
    await expect(header.getByText('Kick')).toHaveCount(0)
    // "Rule listens on" is plain checkboxes in the right dock's This look group.
    const listens = page
      .getByRole('complementary', { name: 'Look properties' })
      .getByRole('group', { name: 'Rule listens on' })
    await expect(listens.getByRole('checkbox')).toHaveCount(2)
    await expect(listens.getByText('Applies to every look in Follows')).toBeVisible()
    await expect(page.locator('[data-platform-test]')).toHaveCount(4)
    // Across the whole editor the platform names are in exactly two groups: the checkboxes
    // (what the rule listens on) and the preview buttons (what to look at).
    await expect(editor.getByRole('checkbox')).toHaveCount(2)
    await expect(editor.locator('[data-platform-test]')).toHaveCount(4)
    // Preview is on the stage, icon only, with its caption; no separate row.
    await expect(page.getByRole('group', { name: 'Preview' })).toBeVisible()
    await expect(page.getByText('Simulated Twitch sample')).toBeVisible()
  })

  test('previewing a platform the rule does not listen on says so', async ({ page }) => {
    await open(page, 'alerts/follow')
    await page.getByRole('checkbox', { name: /Kick/ }).uncheck()
    await page.locator('[data-platform-test="kick"]').click()
    await expect(page.getByText(/doesn’t listen on Kick/)).toBeVisible()
    await page.locator('[data-platform-test="twitch"]').click()
    await expect(page.getByText(/doesn’t listen on/)).toHaveCount(0)
    // The last platform cannot be unchecked (an empty list would mean every platform).
    await expect(page.getByRole('checkbox', { name: /Twitch/ })).toBeDisabled()
  })

  test('the full connection list is one click away, and other pages keep the usual strip', async ({
    page,
  }) => {
    await open(page, 'alerts/follow')
    await page.getByTestId('connections-overflow').click()
    await expect(page.getByTestId('connections-overflow-popover')).toContainText('Twitch')
    await page.keyboard.press('Escape')
    await page.evaluate(() => (location.hash = '#/home'))
    await expect(
      page.getByRole('list', { name: 'Connections' }).getByRole('listitem').first(),
    ).toBeVisible()
    expect(
      await page.getByRole('list', { name: 'Connections' }).getByRole('listitem').count(),
    ).toBeGreaterThan(1)
  })
})

for (const [width, height] of [
  [1280, 800],
  [1440, 900],
] as const) {
  test(`no horizontal scrollbar anywhere in the editor at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await open(page, 'alerts/follow')
    await expect(page.getByTestId('alert-editor')).toBeVisible()
    // Open the groups with the widest content too.
    await page.getByRole('button', { name: /^Custom HTML, CSS and schema/ }).click()
    await page.getByRole('button', { name: /^Read aloud/ }).click()
    const bad = await page.evaluate(() => {
      const out: string[] = []
      for (const el of document.querySelectorAll(
        '[data-testid="alert-editor"], [data-testid="alert-editor"] *',
      )) {
        const cs = getComputedStyle(el)
        if (
          (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
          el.scrollWidth > el.clientWidth + 1
        )
          out.push(
            `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)} ${el.scrollWidth}>${el.clientWidth}`,
          )
      }
      return out
    })
    expect(bad).toEqual([])
  })
}
