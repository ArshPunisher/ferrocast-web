import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open, settled } from './helpers'

// Clips and highlights (#23) in demo mode: the library, search, picking, compile, an open clip
// (trim, captions, YouTube, details), and the states: loading, empty, a failed job. Screenshots
// go to FC_SHOTS when it is set (the hands-on record).
const shots = process.env.FC_SHOTS

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false })
}

async function noOverflowOrSeriousA11y(page: Page, scope = '#main') {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow, 'horizontal scroll').toBe(false)
  const axe = await new AxeBuilder({ page })
    .include(scope)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

for (const vp of [
  { name: '1280', width: 1280, height: 800 },
  { name: '375', width: 375, height: 812 },
]) {
  test.describe(`Clips at ${vp.name}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.emulateMedia({ reducedMotion: 'reduce' })
    })

    test('the library, search, and picking fit and have no serious a11y problems', async ({
      page,
    }) => {
      await open(page, 'studio/clips')
      await expect(page.getByRole('heading', { name: 'Clips', exact: true })).toBeVisible()
      const grid = page.getByRole('list', { name: 'Clips', exact: true })
      await expect(grid.getByRole('listitem')).toHaveCount(5)
      await expect(page.getByRole('img').first()).toBeVisible()
      await settled(page)
      await shot(page, `${vp.name}-01-library`)
      await noOverflowOrSeriousA11y(page)

      await page.getByRole('searchbox', { name: 'Search clips by name' }).fill('boss')
      await expect(grid.getByRole('listitem')).toHaveCount(1)
      await page.getByRole('searchbox', { name: 'Search clips by name' }).fill('zzzz')
      await expect(page.getByText('No clip is called that.')).toBeVisible()
      await shot(page, `${vp.name}-02-search-empty`)
      await page.getByRole('button', { name: 'Clear the search' }).first().click()
      await expect(grid.getByRole('listitem')).toHaveCount(5)

      await page
        .getByRole('checkbox', { name: /Pick Replay 2026-11-22 21-04-12/ })
        .check({ force: true })
      await page
        .getByRole('checkbox', { name: /Pick Replay 2026-11-22 20-31-55/ })
        .check({ force: true })
      await expect(page.getByText('2 picked')).toBeVisible()
      await shot(page, `${vp.name}-03-picked`)
    })

    test('compile: order, crossfade, start, progress, stop', async ({ page }) => {
      // Slow steps, so the job is still running whenever a loaded machine gets to Stop.
      await open(page, 'studio/clips', 'autoplay=0&latency=0&clipstep=60000')
      await page
        .getByRole('checkbox', { name: /Pick Replay 2026-11-22 21-04-12/ })
        .check({ force: true })
      await page
        .getByRole('checkbox', { name: /Pick Replay 2026-11-22 20-31-55/ })
        .check({ force: true })
      await page.getByRole('button', { name: 'Compile', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Compile clips' })
      await expect(dialog).toBeVisible()
      await dialog.getByLabel('Crossfade').selectOption('1')
      await expect(dialog.getByText(/long\./)).toBeVisible()
      await settled(page)
      await shot(page, `${vp.name}-04-compile`)
      await noOverflowOrSeriousA11y(page, 'dialog[open]')
      await dialog.getByRole('button', { name: 'Start' }).click()
      const jobs = page.getByRole('list', { name: 'Clip jobs' })
      await expect(jobs.getByRole('progressbar')).toBeVisible()
      await shot(page, `${vp.name}-05-compile-running`)
      await jobs.getByRole('button', { name: /^Stop/ }).click()
      await expect(jobs.getByText('Stopped')).toBeVisible()
      await shot(page, `${vp.name}-06-compile-stopped`)
    })

    test('an open clip: trim, captions, YouTube and details', async ({ page }) => {
      await open(page, 'studio/clips')
      await page.getByRole('button', { name: /^Open Boss fight/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Boss fight' })
      await expect(dialog).toBeVisible()
      await settled(page)
      await shot(page, `${vp.name}-07-clip-trim`)
      await noOverflowOrSeriousA11y(page, 'dialog[open]')

      await dialog.getByText('Captions', { exact: true }).click()
      await expect(
        dialog.getByRole('list', { name: 'Captions' }).getByRole('listitem'),
      ).toHaveCount(3)
      await dialog.getByLabel('Caption 1 words').fill('   ')
      await expect(dialog.getByText('Caption 1 needs 1 to 300 characters.')).toBeVisible()
      await shot(page, `${vp.name}-08-captions-error`)
      await dialog.getByLabel('Caption 1 words').fill('Okay, this is the one.')
      await expect(dialog.getByRole('button', { name: 'Save captions' })).toBeDisabled()
      await noOverflowOrSeriousA11y(page, 'dialog[open]')

      await dialog.getByText('YouTube', { exact: true }).click()
      await expect(dialog.getByLabel('Who can watch')).toHaveValue('private')
      await dialog.getByLabel('Title').fill('Boss quota test')
      await shot(page, `${vp.name}-09-youtube`)
      await noOverflowOrSeriousA11y(page, 'dialog[open]')
      await dialog.getByRole('button', { name: 'Send to YouTube' }).click()
      // The demo's pretend quota error: said in words with a next step.
      await expect(dialog.getByRole('alert').filter({ hasText: 'daily limit' })).toBeVisible({
        timeout: 10_000,
      })
      await expect(
        dialog.getByRole('list', { name: 'This upload' }).getByText(/midnight Pacific/),
      ).toBeVisible()
      await shot(page, `${vp.name}-10-youtube-failed`)

      await dialog.getByText('Details', { exact: true }).click()
      await dialog.getByLabel('Name').fill('a/b')
      await expect(dialog.getByText(/No \//)).toBeVisible()
      await dialog.getByRole('button', { name: 'Move to Trash' }).click()
      await expect(page.getByRole('dialog', { name: /Move Boss fight to the Trash/ })).toBeVisible()
      await shot(page, `${vp.name}-11-trash-confirm`)
    })

    test('a clip without captions offers to make them, and the job fills them in', async ({
      page,
    }) => {
      await open(page, 'studio/clips')
      await page.getByRole('button', { name: /^Open Replay 2026-11-22 20-31-55/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Replay 2026-11-22 20-31-55' })
      await dialog.getByText('Captions', { exact: true }).click()
      await expect(dialog.getByText('No captions yet.')).toBeVisible()
      await shot(page, `${vp.name}-12-captions-none`)
      await dialog.getByRole('button', { name: 'Make captions' }).click()
      await expect(
        dialog.getByRole('list', { name: 'Captions' }).getByRole('listitem').first(),
      ).toBeVisible({
        timeout: 15_000,
      })
    })
  })
}

test('the Clips tab is in the Studio on the PC', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, 'studio/moments')
  // The tab is hidden only for a paired phone (unit-tested with studioTabs); the demo is the PC.
  await expect(page.getByRole('radio', { name: 'Clips' })).toBeAttached()
})
