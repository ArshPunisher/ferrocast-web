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

/** Picks a clip, scrolled to the middle first (a phone's bottom bar covers the page's foot). */
async function pickClip(page: Page, name: RegExp) {
  const box = page.getByRole('checkbox', { name })
  await box.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await box.check({ force: true })
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

      await pickClip(page, /Pick Replay 2026-11-22 21-04-12/)
      await pickClip(page, /Pick Replay 2026-11-22 20-31-55/)
      await expect(page.getByText('2 selected')).toBeVisible()
      await shot(page, `${vp.name}-03-picked`)
    })

    test('compile: order, crossfade, start, progress, stop', async ({ page }) => {
      // Slow steps, so the job is still running whenever a loaded machine gets to Stop.
      await open(page, 'studio/clips', 'autoplay=0&latency=0&clipstep=60000')
      await pickClip(page, /Pick Replay 2026-11-22 21-04-12/)
      await pickClip(page, /Pick Replay 2026-11-22 20-31-55/)
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
      await dialog.locator('[data-section="details"]').getByLabel('Name').fill('a/b')
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

// C3: one compact toolbar row, a full-width media wall, no horizontal scroll at any width.
const c3Shots = process.env.FC_C3_SHOTS
for (const vp of [
  { width: 1440, height: 900, cols: 5 },
  { width: 1280, height: 800, cols: 5 },
  { width: 375, height: 812, cols: 1 },
]) {
  test(`Clips C3 at ${vp.width}: one toolbar row, the wall, selection in the same row`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, 'studio/clips')
    const bar = page.getByTestId('clips-toolbar')
    await expect(bar).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'Clips', exact: true }).getByRole('listitem'),
    ).toHaveCount(5)
    const noScroll = async () => {
      const bad = await page.evaluate(() => {
        const root = document.querySelector('#main')!
        const out: string[] = []
        for (const el of [root, ...root.querySelectorAll('*')]) {
          const cs = getComputedStyle(el)
          if (
            (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
            el.scrollWidth > el.clientWidth + 1
          )
            out.push(`${el.tagName}.${(el as HTMLElement).className}`.slice(0, 80))
        }
        if (document.documentElement.scrollWidth > document.documentElement.clientWidth)
          out.push('page')
        return out
      })
      expect(bad, 'horizontal scroll').toEqual([])
    }
    await noScroll()
    // The search is small (about 220 to 260 px) on a wide window.
    const search = await page.getByRole('searchbox', { name: 'Search clips by name' }).boundingBox()
    if (vp.width >= 640) expect(search!.width).toBeGreaterThanOrEqual(220)
    if (vp.width >= 640) expect(search!.width).toBeLessThanOrEqual(260)
    // Wall columns.
    const cols = await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('ul[aria-label="Clips"]')!,
        ).gridTemplateColumns.split(' ').length,
    )
    expect(cols).toBe(vp.cols)
    // Type, folder and reload in the one row.
    await page.getByRole('combobox', { name: 'Type' }).selectOption('replays')
    await expect(
      page.getByRole('list', { name: 'Clips', exact: true }).getByRole('listitem'),
    ).not.toHaveCount(0)
    await page.getByRole('combobox', { name: 'Type' }).selectOption('all')
    const height = async () => (await bar.boundingBox())!.height
    const idle = await height()
    await pickClip(page, /Pick Replay 2026-11-22 21-04-12/)
    await pickClip(page, /Pick Replay 2026-11-22 20-31-55/)
    const group = bar.getByRole('group', { name: 'Selected clips' })
    await expect(group.getByText(/2 selected/)).toBeVisible()
    for (const n of ['Compile', 'Caption', 'Upload', 'Clear'])
      await expect(group.getByRole('button', { name: new RegExp(`^${n}`) })).toBeVisible()
    if (vp.width >= 1280) {
      // One row: the selection swaps the right side and adds no band.
      expect(await height()).toBeLessThanOrEqual(idle + 2)
      expect(await height()).toBeLessThan(60)
    }
    await noScroll()
    await settled(page)
    await page.evaluate(() => {
      window.scrollTo(0, 0)
      document.querySelector('#main')?.scrollTo?.(0, 0)
    })
    if (c3Shots) await page.screenshot({ path: `${c3Shots}/C3-${vp.width}.png` })
    await noOverflowOrSeriousA11y(page)
  })
}
