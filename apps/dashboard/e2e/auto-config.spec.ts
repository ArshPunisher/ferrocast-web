import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, open, settled } from './helpers'

async function enterStudioDesk(page: Page): Promise<void> {
  await open(page, 'studio/golive', 'autoplay=0&latency=0&studioEngine=1')
  const ferrocastRadio = page
    .getByRole('radiogroup', { name: 'Picture from' })
    .getByText('Ferrocast', { exact: true })
  await ferrocastRadio.click()
  const startBtn = page.getByRole('button', { name: 'Start the Studio' })
  const settingsBtn = page.getByRole('button', { name: 'Studio settings' })
  await expect(startBtn.or(settingsBtn)).toBeVisible({ timeout: 10_000 })
  if (await startBtn.isVisible()) {
    await startBtn.click()
    const closeReady = page.getByRole('button', { name: 'Close the ready check' })
    await closeReady
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => closeReady.click())
      .catch(() => {})
  }
  await expect(settingsBtn).toBeVisible({ timeout: 15_000 })
}

async function openWizardViaSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Studio settings' }).click()
  const settingsDialog = page.getByRole('dialog', { name: 'Studio settings' })
  await expect(settingsDialog).toBeVisible()
  await settingsDialog.getByRole('button', { name: /Set up for me/i }).click()
  await expect(page.getByRole('dialog', { name: 'Set up for me' })).toBeVisible()
}

test.use({ viewport: { width: 1280, height: 800 } })

test.describe('auto-config encoder benchmark and rollback', () => {
  test('keyboard setup, cancel mid-run, honest benchmark results, Apply, Keep, and Undo', async ({
    page,
  }) => {
    await enterStudioDesk(page)
    await demo(
      page,
      '(d) => { d.golive.setup({ upload_kbps: 24_000 }); d.studioEngine?.configure({ benchProfile: "apple_vt", benchStepMs: 35, confirmTimeoutMs: 10_000, watchWindowMs: 20_000 }) }',
    )

    // Open via Go live dock "Optimize" button on desktop
    const optimizeBtn = page.getByRole('button', { name: 'Optimize' })
    if (await optimizeBtn.isVisible().catch(() => false)) {
      await optimizeBtn.click()
    } else {
      await openWizardViaSettings(page)
    }

    const dlg = page.getByRole('dialog', { name: 'Set up for me' })
    await expect(dlg).toBeVisible()

    // Keyboard navigation on radiogroups
    const streamRadio = dlg.getByRole('radio', { name: /Streaming/i })
    const recordRadio = dlg.getByRole('radio', { name: /Recording/i })
    await expect(streamRadio).toHaveAttribute('aria-checked', 'true')
    await streamRadio.focus()
    await page.keyboard.press('ArrowRight')
    await expect(recordRadio).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(streamRadio).toHaveAttribute('aria-checked', 'true')

    // Slow down steps briefly to verify Running state + Cancel mid-run reliably
    await demo(page, '(d) => { d.studioEngine?.configure({ benchStepMs: 120 }) }')
    await dlg.getByRole('button', { name: 'Run benchmark' }).click()
    await expect(dlg.getByRole('progressbar', { name: 'Benchmark progress' })).toBeVisible()
    await dlg.getByRole('button', { name: 'Cancel test' }).click()
    await expect(dlg.getByRole('button', { name: 'Run benchmark' })).toBeVisible()

    // Speed up and run full benchmark -> Done honest results UI
    await demo(page, '(d) => { d.studioEngine?.configure({ benchStepMs: 25 }) }')
    await dlg.getByRole('button', { name: 'Run benchmark' }).click()
    await expect(dlg.getByText(/Recommended:/i)).toBeVisible({ timeout: 10_000 })
    await expect(dlg.getByText(/What was tested/i)).toBeVisible()
    await expect(dlg.getByText(/headroom/i).first()).toBeVisible()
    await expect(dlg.getByText(/Hardware encoders tested before x264/i)).toBeVisible()
    await expect(dlg.getByText(/Upload measured:/i)).toBeVisible()
    const tableFits = await dlg
      .getByRole('table', { name: 'Tested encoder candidates table' })
      .evaluate((el) => el.scrollWidth <= (el.parentElement?.clientWidth ?? el.clientWidth))
    expect(tableFits).toBe(true)

    // Adjust bitrate override and apply
    const kbps = dlg.getByLabel('Bitrate (Kbps)')
    await kbps.fill('7000')
    await dlg.getByRole('button', { name: 'Apply settings' }).click()

    await expect(dlg.getByText('Settings applied. Keep these changes?')).toBeVisible()
    await expect(dlg.getByText(/Auto-undo in/i)).toBeVisible()
    await expect(dlg.getByText(/7\.0 Mbps/i)).toBeVisible()

    // Close dialog (not confirm) and verify non-blocking RollbackBar appears on Desk
    await dlg.getByRole('button', { name: 'Close' }).first().click()
    const bar = page.getByRole('region', { name: 'Auto-config confirmation' })
    await expect(bar).toBeVisible()
    await expect(bar.getByText(/Testing new encoder settings:/i)).toBeVisible()
    await expect(bar.getByText(/1920×1080/)).toBeVisible()

    // Keep then Undo from RollbackBar
    await bar.getByRole('button', { name: 'Keep' }).click()
    await expect(bar.getByText(/Kept new encoder settings/i)).toBeVisible()
    await bar.getByRole('button', { name: 'Undo' }).click()
    await expect(bar).toBeHidden()
  })

  test('automatic rollback after timeout and post-stream offer on live encoder drops, plus 409 live refusal', async ({
    page,
  }) => {
    await enterStudioDesk(page)

    // 1. Timeout rollback when user does nothing within 30s (shortened in demo engine)
    await demo(
      page,
      '(d) => { d.studioEngine?.configure({ benchProfile: "qsv_stepdown", benchStepMs: 20, confirmTimeoutMs: 220, watchWindowMs: 1200 }) }',
    )
    await openWizardViaSettings(page)
    const dlg = page.getByRole('dialog', { name: 'Set up for me' })
    await dlg.getByRole('button', { name: 'Run benchmark' }).click()
    await expect(dlg.getByText(/Recommended:/i)).toBeVisible({ timeout: 10_000 })
    await dlg.getByRole('button', { name: 'Apply settings' }).click()
    await expect(dlg.getByText(/Rolled back automatically after 30 s/i)).toBeVisible({
      timeout: 5000,
    })

    // 2. Keep + live encoder drops -> never mutates live, offers rollback once stream ends
    await demo(
      page,
      '(d) => { d.studioEngine?.configure({ confirmTimeoutMs: 5000, watchWindowMs: 5000 }) }',
    )
    await dlg.getByRole('button', { name: 'Run benchmark again' }).click()
    await dlg.getByRole('button', { name: 'Run benchmark' }).click()
    await expect(dlg.getByText(/Recommended:/i)).toBeVisible({ timeout: 10_000 })
    await dlg.getByRole('button', { name: 'Apply settings' }).click()
    await dlg.getByRole('button', { name: 'Keep' }).click()
    await dlg.getByRole('button', { name: 'Done' }).click()
    await page
      .getByRole('dialog', { name: 'Studio settings' })
      .getByRole('button', { name: 'Close' })
      .first()
      .click()

    await demo(
      page,
      '(d) => { d.studioEngine?.setStreamActive(true); d.studioEngine?.injectDroppedFrames(10, 0); d.studioEngine?.injectDroppedFrames(0, 7) }',
    )
    const offerBar = page.getByRole('region', { name: 'Auto-config rollback offer' })
    await expect(offerBar).toBeHidden()

    await demo(page, '(d) => { d.studioEngine?.setStreamActive(false) }')
    await expect(offerBar).toBeVisible({ timeout: 5000 })
    await expect(offerBar.getByText(/dropped/i)).toBeVisible()
    await offerBar.getByRole('button', { name: 'Undo' }).click()
    await expect(offerBar).toBeHidden()

    // 3. Refuses with 409 while streaming
    await demo(page, '(d) => { d.studioEngine?.setStreamActive(true) }')
    await openWizardViaSettings(page)
    const runAgain = dlg.getByRole('button', { name: 'Run benchmark again' })
    if (await runAgain.isVisible().catch(() => false)) {
      await runAgain.click()
    }
    await dlg.getByRole('button', { name: 'Run benchmark', exact: true }).click()
    await expect(
      dlg.getByRole('alert').getByText(/Stop streaming and recording before testing the encoder\./),
    ).toBeVisible()
  })

  test('fits 375 px phone viewport without horizontal overflow across wizard and rollback bar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await enterStudioDesk(page)
    await demo(
      page,
      '(d) => { d.studioEngine?.configure({ benchProfile: "weak_cpu", benchStepMs: 25, confirmTimeoutMs: 10_000, watchWindowMs: 20_000 }) }',
    )

    await openWizardViaSettings(page)
    const dlg = page.getByRole('dialog', { name: 'Set up for me' })
    await dlg.getByRole('button', { name: 'Run benchmark' }).click()
    await expect(dlg.getByText(/Recommended:/i)).toBeVisible({ timeout: 10_000 })
    // Mobile candidate card list is shown (< 640px)
    await expect(dlg.getByRole('list', { name: 'Tested encoder candidates' })).toBeVisible()

    const overflowDone = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflowDone).toBeLessThanOrEqual(0)

    await dlg.getByRole('button', { name: 'Apply settings' }).click()
    await expect(dlg.getByText('Settings applied. Keep these changes?')).toBeVisible()
    const overflowApplied = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflowApplied).toBeLessThanOrEqual(0)

    // Close both dialogs so AutoConfigRollbackBar actually renders at 375 px
    await dlg.getByRole('button', { name: 'Close' }).first().click()
    await page
      .getByRole('dialog', { name: 'Studio settings' })
      .getByRole('button', { name: 'Close' })
      .first()
      .click()
    const bar = page.getByRole('region', { name: 'Auto-config confirmation' })
    await expect(bar).toBeVisible()
    const overflowBar = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflowBar).toBeLessThanOrEqual(0)
    const keepBox = await bar.getByRole('button', { name: 'Keep' }).boundingBox()
    expect(keepBox && keepBox.height >= 24 && keepBox.width >= 24).toBe(true)
    const barScan = await new AxeBuilder({ page })
      .include('[aria-label="Auto-config confirmation"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      barScan.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })

  for (const scheme of ['dark', 'light'] as const) {
    test(`has no serious accessibility violations (${scheme})`, async ({ page }) => {
      const scanClean = async (scopeSelector?: string) => {
        await settled(page)
        const builder = new AxeBuilder({ page }).withTags([
          'wcag2a',
          'wcag2aa',
          'wcag21a',
          'wcag21aa',
        ])
        if (scopeSelector) builder.include(scopeSelector)
        const r = await builder.analyze()
        const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(
          bad.map(
            (v) =>
              `${v.id}: ${v.nodes
                .map((n) => n.target.join(' '))
                .slice(0, 3)
                .join(', ')}`,
          ),
        ).toEqual([])
      }

      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await enterStudioDesk(page)
      await demo(
        page,
        '(d) => { d.studioEngine?.configure({ benchProfile: "nvidia_nvenc", benchStepMs: 320, confirmTimeoutMs: 10_000, watchWindowMs: 20_000 }) }',
      )
      await openWizardViaSettings(page)
      const dlg = page.getByRole('dialog', { name: 'Set up for me' })
      await scanClean()

      // Running state
      await dlg.getByRole('button', { name: 'Run benchmark' }).click()
      await expect(dlg.getByRole('progressbar', { name: 'Benchmark progress' })).toBeVisible()
      await scanClean()

      // Done state
      await expect(dlg.getByText(/Recommended:/i)).toBeVisible({ timeout: 10_000 })
      await scanClean()

      // Applied state
      await dlg.getByRole('button', { name: 'Apply settings' }).click()
      await expect(dlg.getByText('Settings applied. Keep these changes?')).toBeVisible()
      await scanClean()

      // AutoConfigRollbackBar on Desk
      await dlg.getByRole('button', { name: 'Close' }).first().click()
      await page
        .getByRole('dialog', { name: 'Studio settings' })
        .getByRole('button', { name: 'Close' })
        .first()
        .click()
      const bar = page.getByRole('region', { name: 'Auto-config confirmation' })
      await expect(bar).toBeVisible()
      await scanClean('[aria-label="Auto-config confirmation"]')

      // RolledBack state (via Undo + reopening Details -> RolledBack panel)
      await bar.getByRole('button', { name: 'Undo' }).click()
      await expect(bar).toBeHidden()
      await openWizardViaSettings(page)
      await expect(dlg.getByText('Restored your previous settings', { exact: true })).toBeVisible()
      await scanClean()
    })
  }
})
