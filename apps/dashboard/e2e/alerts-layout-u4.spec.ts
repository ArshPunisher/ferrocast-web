import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open, settled } from './helpers'

async function verifyEditorViewport(page: Page, width: number, height: number) {
  const scroll = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
  }))
  expect(scroll.sw, `no horizontal overflow at ${width}x${height}`).toBeLessThanOrEqual(scroll.iw)
  expect(scroll.sh, `no page vertical scroll at ${width}x${height}`).toBeLessThanOrEqual(scroll.ih)

  const timeline = page
    .locator('[aria-label="Live preview"]')
    .getByText('Timeline and text effects')
  await expect(timeline).toBeVisible()
  const entrance = page.getByLabel('Entrance', { exact: true })
  const exitSelect = page.getByLabel('Exit', { exact: true })
  await expect(entrance).toBeVisible()
  await expect(exitSelect).toBeVisible()

  const exitBox = await exitSelect.boundingBox()
  expect(exitBox).not.toBeNull()
  expect(
    exitBox!.y + exitBox!.height,
    `bottom timeline controls pushed below ${height}px viewport`,
  ).toBeLessThanOrEqual(height)

  const previewOverflow = await page.evaluate(() => {
    const sec = document.querySelector('section[aria-label="Live preview"]') as HTMLElement | null
    return sec ? sec.scrollHeight - sec.clientHeight : 0
  })
  expect(
    previewOverflow,
    `live preview overflowed vertically at ${width}x${height}`,
  ).toBeLessThanOrEqual(2)
}

test.describe('Alert editor toolbar and layout (U4)', () => {
  test('Rule pill is vertically centered and preview chips/Replay/Mute use themed light surface with border and no overlap', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'alerts/sub')
    await expect(page.getByTestId('alert-editor')).toBeVisible()

    const ruleAlignment = await page.evaluate(() => {
      const header = document.querySelector('[data-testid="alert-editor"] header')
      const sw = header?.querySelector('[role="switch"]') as HTMLElement | null
      const label = Array.from(header?.querySelectorAll('label') ?? []).find(
        (l) => l.textContent?.trim() === 'Rule',
      )
      const pill = label?.closest('.rounded-full') as HTMLElement | null
      if (!header || !sw || !label || !pill) throw new Error('Rule switch elements missing')
      const hR = header.getBoundingClientRect()
      const pR = pill.getBoundingClientRect()
      const lR = label.getBoundingClientRect()
      const sR = sw.getBoundingClientRect()
      return {
        labelVsSwitchDiff: Math.abs(lR.top + lR.height / 2 - (sR.top + sR.height / 2)),
        pillVsHeaderDiff: Math.abs(pR.top + pR.height / 2 - (hR.top + hR.height / 2)),
        switchMarginTop: parseFloat(getComputedStyle(sw).marginTop),
      }
    })
    expect(ruleAlignment.labelVsSwitchDiff).toBeLessThanOrEqual(2)
    expect(ruleAlignment.pillVsHeaderDiff).toBeLessThanOrEqual(3)
    expect(ruleAlignment.switchMarginTop).toBe(0)

    const previewStyles = await page.evaluate(() => {
      const replay = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Replay',
      )
      const group = document.querySelector('[role="group"][aria-label="Preview"]')
      if (!replay || !group) throw new Error('Preview toolbar controls missing')
      const rCs = getComputedStyle(replay)
      const gCs = getComputedStyle(group)
      return {
        replayBg: rCs.backgroundColor,
        replayColor: rCs.color,
        replayBorderWidth: parseFloat(rCs.borderTopWidth),
        groupBg: gCs.backgroundColor,
        groupColor: gCs.color,
        groupBorderWidth: parseFloat(gCs.borderTopWidth),
      }
    })
    expect(previewStyles.replayBg).not.toBe('rgba(0, 0, 0, 0.6)')
    expect(previewStyles.groupBg).not.toBe('rgba(0, 0, 0, 0.6)')
    expect(previewStyles.replayColor).not.toBe('rgb(255, 255, 255)')
    expect(previewStyles.replayBorderWidth).toBeGreaterThanOrEqual(1)
    expect(previewStyles.groupBorderWidth).toBeGreaterThanOrEqual(1)
  })

  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1024, 768],
  ] as const) {
    test(`timeline and controls stay reachable without page scroll at ${width}x${height} with dock at min and max`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await open(page, 'alerts/sub')
      await expect(page.getByTestId('alert-editor')).toBeVisible()

      const left = page.getByRole('separator', { name: 'Resize the alert rules dock' })
      const right = page.getByRole('separator', { name: 'Resize the properties dock' })

      // 1. Both docks at MIN (widest preview stage).
      await left.focus()
      await page.keyboard.press('Home')
      await right.focus()
      await page.keyboard.press('Home')
      await verifyEditorViewport(page, width, height)

      // 2. Both docks at MAX (narrowest preview stage, as in img15/img17).
      await left.focus()
      await page.keyboard.press('End')
      await right.focus()
      await page.keyboard.press('End')
      await verifyEditorViewport(page, width, height)

      // Verify Preview chips, Replay and Mute fit cleanly inside stage bounds without overlapping.
      const overlapOrClip = await page.evaluate(() => {
        const stage = document
          .querySelector('[aria-label="Alert preview"]')
          ?.getBoundingClientRect()
        const g = document
          .querySelector('[role="group"][aria-label="Preview"]')
          ?.getBoundingClientRect()
        const r = Array.from(document.querySelectorAll('button'))
          .find((b) => b.textContent?.trim() === 'Replay')
          ?.getBoundingClientRect()
        const m = Array.from(document.querySelectorAll('button'))
          .find((b) => b.textContent?.trim() === 'Mute' || b.textContent?.trim() === 'Sound off')
          ?.getBoundingClientRect()
        if (!stage || !g || !r || !m) return true
        for (const rect of [g, r, m]) {
          if (rect.left < stage.left - 1 || rect.right > stage.right + 1) return true
        }
        const hit = (a: DOMRect, b: DOMRect) =>
          a.right > b.left + 1 &&
          b.right > a.left + 1 &&
          a.bottom > b.top + 1 &&
          b.bottom > a.top + 1
        return hit(g, r) || hit(g, m) || hit(r, m)
      })
      expect(
        overlapOrClip,
        `preview controls overlap or clip at max dock (${width}x${height})`,
      ).toBe(false)
    })
  }

  test('works at 375 px with zero sideways scroll and passes light/dark axe checks', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'alerts/sub')
    await expect(page.getByTestId('alert-editor')).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(150)
    const lightAxe = await new AxeBuilder({ page })
      .include('[data-testid="alert-editor"]')
      .analyze()
    expect(lightAxe.violations).toEqual([])

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'slate'))
    await page.waitForTimeout(150)
    const darkAxe = await new AxeBuilder({ page }).include('[data-testid="alert-editor"]').analyze()
    expect(darkAxe.violations).toEqual([])

    await page.setViewportSize({ width: 375, height: 812 })
    await settled(page)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })
})
