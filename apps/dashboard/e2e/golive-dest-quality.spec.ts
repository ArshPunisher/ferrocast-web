import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { fault, settled } from './helpers'

const SHOT_DIR = process.env.FC_GOLIVE_SHOTS
const DEMO_TOKEN = 'demo-session'

async function snap(page: Page, name: string) {
  if (!SHOT_DIR) return
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false })
}

function viewportForTest(testInfo: TestInfo, explicit?: { width: number; height: number }) {
  if (explicit) return explicit
  return testInfo.project.name === 'mobile'
    ? { width: 375, height: 812 }
    : { width: 1280, height: 800 }
}

async function setupStudioDock(
  page: Page,
  testInfo: TestInfo,
  opts: {
    theme?: 'slate' | 'daylight'
    viewport?: { width: number; height: number }
    settings?: {
      width: number
      height: number
      fps: number
      video_kbps: number
      scale?: [number, number] | null
    }
    enableKick?: boolean
    goLiveConfig?: Record<string, unknown>
  } = {},
) {
  const theme = opts.theme ?? 'slate'
  const viewport = viewportForTest(testInfo, opts.viewport)
  await page.setViewportSize(viewport)
  await page.addInitScript((t) => {
    localStorage.setItem('fc-theme', t)
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    localStorage.removeItem('fc-studio-standby-scene')
  }, theme)

  await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
  const startBtn = page.getByRole('button', { name: 'Start the Studio' })
  await expect(startBtn).toBeVisible({ timeout: 10_000 })

  await page.evaluate(
    async ({ settings, goLiveConfig, token }) => {
      const demoEngine = window.__ferrocastDemo
      if (!demoEngine) throw new Error('Demo engine missing on window')
      if (goLiveConfig) {
        demoEngine.setGoLive(goLiveConfig as never)
      }
      if (settings) {
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }
        const res = await demoEngine.fetch(`${demoEngine.base}/api/v1/studio/engine/settings`, {
          headers,
        })
        if (!res.ok) throw new Error(`GET settings failed: ${res.status}`)
        const cur = (await res.json()) as Record<string, unknown>
        const putRes = await demoEngine.fetch(`${demoEngine.base}/api/v1/studio/engine/settings`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...cur, ...settings, scale: settings.scale ?? null }),
        })
        if (!putRes.ok) throw new Error(`PUT settings failed: ${putRes.status}`)
      }
    },
    {
      settings: opts.settings ?? null,
      goLiveConfig: opts.goLiveConfig ?? null,
      token: DEMO_TOKEN,
    },
  )

  await startBtn.click()
  if (viewport.width <= 600) {
    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Go live to', { exact: true })
      .click()
  }
  await expect(page.locator('[data-golive-row="twitch"]')).toBeVisible({ timeout: 10_000 })
  if (opts.enableKick) {
    const kickSwitch = page.getByRole('switch', { name: 'Go live on Kick' })
    if (!(await kickSwitch.isChecked())) {
      await kickSwitch.click()
      await expect(kickSwitch).toBeChecked({ timeout: 5_000 })
    }
  }
  await settled(page)
  return viewport
}

test.describe('Go live List 3b and Modal A quality picker', () => {
  test('List 3b fixed rows, Modal A resolution/fps/bitrate + Match main, keyboard trap, and Escape focus return', async ({
    page,
  }, testInfo) => {
    const viewport = await setupStudioDock(page, testInfo, {
      theme: 'slate',
      settings: { width: 2560, height: 1440, fps: 60, video_kbps: 18000 },
      enableKick: true,
    })

    // List 3b tags, 2-line uniform row heights, and footer summary.
    await expect(page.locator('[data-golive-tag="twitch"]')).toHaveText('OFF')
    await expect(page.locator('[data-golive-tag="youtube"]')).toHaveText('OFF')
    await expect(page.locator('[data-golive-tag="kick"]')).toHaveText('OFF')
    await expect(page.locator('[data-quality-trigger="youtube"]')).toContainText('Same as main')
    await expect(page.locator('[data-quality-trigger="twitch"]')).toContainText(
      '1440p60 · 6 Mbps · auto',
    )
    await expect(page.locator('[data-quality-trigger="kick"]')).toContainText(
      '1080p60 · 8 Mbps · auto',
    )
    await expect(page.locator('[data-golive-encode-summary]')).toContainText('3 places')
    await expect(page.locator('[data-golive-encode-summary]')).toContainText('3 encodes')

    const heights = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-golive-row]')).map(
        (el) => el.getBoundingClientRect().height,
      ),
    )
    expect(heights.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2)

    // Open Modal A from Kick row: desktop centered dialog vs mobile bottom sheet.
    const kickTrigger = page.locator('[data-quality-trigger="kick"]')
    await kickTrigger.click()
    const kickModal = page.locator('[data-quality-modal="kick"]')
    await expect(kickModal).toBeVisible()
    await expect(kickModal).toHaveAttribute('data-over-preview', '')

    const modalBox = await kickModal.boundingBox()
    expect(modalBox).not.toBeNull()
    if (viewport.width <= 560) {
      expect(modalBox!.width).toBeGreaterThanOrEqual(viewport.width - 2)
      expect(modalBox!.y + modalBox!.height).toBeGreaterThanOrEqual(viewport.height - 2)
    } else {
      expect(modalBox!.width).toBeLessThanOrEqual(460)
    }

    // 1440p exceeds Kick's 1080p ceiling -> locked disabled chip.
    const kick1440 = kickModal.getByRole('button', { name: /1440p/ })
    await expect(kick1440).toBeDisabled()
    await snap(
      page,
      `modal-A-kick-locked-${testInfo.project.name === 'mobile' ? '375' : '1280'}-slate.png`,
    )

    // Turn off Match main stream, pick 720p30 · 3 Mbps, verify result line & apply.
    const matchSwitch = kickModal.getByRole('switch', { name: 'Match main stream' })
    await matchSwitch.click()
    await expect(matchSwitch).toHaveAttribute('aria-checked', 'false')
    await kickModal.getByRole('button', { name: '720p', exact: true }).click()
    await kickModal.getByRole('button', { name: '30', exact: true }).click()
    const kbpsInput = kickModal.getByLabel('Bitrate in Mbps')
    await kbpsInput.fill('3')
    await expect(kickModal.locator('[data-quality-result]')).toContainText(
      'Kick gets 720p30 at 3 Mbps',
    )
    await kickModal.getByRole('button', { name: 'Apply' }).click()
    await expect(kickModal).toBeHidden()
    await expect(kickTrigger).toContainText('720p30 · 3 Mbps')

    // Match main switch back ON resets to Same as main (auto-fitted).
    await kickTrigger.click()
    await expect(kickModal).toBeVisible()
    await kickModal.getByRole('switch', { name: 'Match main stream' }).click()
    await expect(kickModal.getByRole('switch', { name: 'Match main stream' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(kickModal.locator('[data-quality-result]')).toContainText('Fitted to Kick')

    // Focus trap cycles Tab inside Modal A, and Escape closes & restores focus to trigger.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    const focusInside = await page.evaluate(() => {
      const m = document.querySelector('[data-quality-modal="kick"]')
      return Boolean(m && document.activeElement && m.contains(document.activeElement))
    })
    expect(focusInside).toBe(true)

    await page.keyboard.press('Escape')
    await expect(kickModal).toBeHidden()
    await expect(kickTrigger).toBeFocused()
  })

  test('Modal A enforces hard limit overrun + one-tap fix and soft recommendation note', async ({
    page,
  }, testInfo) => {
    const suffix = testInfo.project.name === 'mobile' ? '375' : '1280'
    await setupStudioDock(page, testInfo, {
      theme: 'daylight',
      settings: { width: 2560, height: 1440, fps: 60, video_kbps: 18000 },
    })

    const twitchTrigger = page.locator('[data-quality-trigger="twitch"]')
    await twitchTrigger.click()
    const modal = page.locator('[data-quality-modal="twitch"]')
    await expect(modal).toBeVisible()

    // Turn off Match main stream and enter 8 Mbps (> Twitch 6 Mbps hard ceiling).
    await modal.getByRole('switch', { name: 'Match main stream' }).click()
    await modal.getByRole('button', { name: '1080p', exact: true }).click()
    await modal.getByLabel('Bitrate in Mbps').fill('8')

    await expect(modal.getByRole('alert')).toContainText('Twitch closes streams above 6 Mbps.')
    await expect(modal.getByRole('button', { name: 'Apply' })).toBeDisabled()
    await snap(page, `modal-A-hard-${suffix}-light.png`)

    // One-tap fix restores valid 6 Mbps and enables Apply.
    await modal.getByRole('button', { name: /Use 1080p60 · 6 Mbps/ }).click()
    await expect(modal.getByRole('alert')).toHaveCount(0)
    await expect(modal.getByLabel('Bitrate in Mbps')).toHaveValue('6')
    await expect(modal.getByRole('button', { name: 'Apply' })).toBeEnabled()

    // Pick 1440p -> soft warning stays allowed and shows warning status + Open quality popover in List 3b.
    await modal.getByRole('button', { name: /1440p/ }).click()
    await expect(modal.getByRole('status')).toContainText("Above Twitch's recommended 1080p")
    await expect(modal.getByRole('button', { name: 'Apply' })).toBeEnabled()
    await modal.getByRole('button', { name: 'Apply' }).click()
    await expect(modal).toBeHidden()

    const statusTrigger = page.locator('[data-status-trigger="twitch"]')
    await expect(statusTrigger).toContainText("Above Twitch's recommended 1080p")
    await statusTrigger.click()
    const statusPop = page.locator('[data-golive-status-popover="twitch"]')
    await expect(statusPop).toContainText('Not recommended')
    await statusPop.getByRole('button', { name: 'Open quality' }).click()
    await expect(modal).toBeVisible()
  })

  test('applies live with SWITCHING state, isolates Escape in Your platforms, and surfaces 422 API errors', async ({
    page,
  }, testInfo) => {
    await setupStudioDock(page, testInfo, {
      theme: 'slate',
      goLiveConfig: { switch_delay_ms: 450 },
    })

    await page.getByRole('button', { name: 'Go live', exact: true }).click()
    const goLiveAnyway = page.getByRole('button', { name: 'Go live anyway' })
    if (await goLiveAnyway.isVisible({ timeout: 1500 }).catch(() => false)) {
      await goLiveAnyway.click()
    }
    await expect(page.locator('[data-golive-tag="twitch"]')).toHaveText('LIVE', { timeout: 10_000 })
    await snap(page, `dock-live-${testInfo.project.name === 'mobile' ? '375' : '1280'}-slate.png`)

    // Live apply transitions through SWITCHING and returns to LIVE.
    const twitchTrigger = page.locator('[data-quality-trigger="twitch"]')
    await twitchTrigger.click()
    const modal = page.locator('[data-quality-modal="twitch"]')
    await expect(modal).toContainText('Switches only Twitch. Your stream keeps going.')
    await modal.getByRole('switch', { name: 'Match main stream' }).click()
    await modal.getByRole('button', { name: '720p', exact: true }).click()
    await modal.getByRole('button', { name: '30', exact: true }).click()
    await modal.getByLabel('Bitrate in Mbps').fill('3')
    await modal.getByRole('button', { name: 'Apply' }).click()

    await expect(page.locator('[data-golive-tag="twitch"]')).toHaveText('SWITCHING')
    await expect(page.locator('[data-golive-tag="twitch"]')).toHaveText('LIVE', { timeout: 5_000 })
    await expect(twitchTrigger).toContainText('720p30 · 3 Mbps')

    // Your platforms dialog: Escape closes only Modal A, keeping Your platforms open.
    await page.getByRole('button', { name: 'Manage platforms' }).click()
    const platformsDialog = page.getByRole('dialog', { name: 'Your platforms' })
    await expect(platformsDialog).toBeVisible()
    await platformsDialog.locator('[data-quality-trigger="twitch"]').click()
    await expect(modal).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
    await expect(platformsDialog).toBeVisible()

    // Test 422 golive_switch_timeout, encode_budget_exceeded, platform_limit_exceeded, golive_quality_locked.
    const errors: Array<{ code: string; message: string; expectText: RegExp; hasRetry?: boolean }> =
      [
        {
          code: 'golive_switch_timeout',
          message: 'No keyframe arrived in time.',
          expectText: /Couldn't switch Twitch/,
          hasRetry: true,
        },
        {
          code: 'encode_budget_exceeded',
          message: 'Not enough GPU headroom to add another encode.',
          expectText: /Not enough GPU headroom/,
        },
        {
          code: 'platform_limit_exceeded',
          message: 'Twitch cannot use that bitrate.',
          expectText: /Twitch cannot use that bitrate/,
        },
        {
          code: 'golive_quality_locked',
          message: 'Quality is locked while switching picture source.',
          expectText: /Quality is locked/,
        },
      ]

    for (const err of errors) {
      await fault(page, {
        path: '/api/v1/golive/destinations/twitch/quality',
        status: 422,
        code: err.code,
        message: err.message,
        times: 1,
      })
      await platformsDialog.locator('[data-quality-trigger="twitch"]').click()
      await modal.getByRole('switch', { name: 'Match main stream' }).click()
      await modal.getByRole('button', { name: 'Apply' }).click()
      const alert = modal.getByRole('alert')
      await expect(alert).toContainText(err.expectText)
      if (err.hasRetry) {
        await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
      }
      await page.keyboard.press('Escape')
      await expect(modal).toBeHidden()
    }
  })

  test('List 3b shows reconnecting/error tags, status popovers, Needs a look popover, and compact footer strip without top banner', async ({
    page,
  }, testInfo) => {
    await setupStudioDock(page, testInfo, {
      theme: 'slate',
      enableKick: true,
      goLiveConfig: {
        failed: {
          twitch: {
            attempts: 3,
            reason: 'Stream key was rejected.',
            detail: 'Check your Twitch stream key.',
            refused: true,
          },
        },
      },
    })

    await page.getByRole('button', { name: 'Go live', exact: true }).click()
    const goLiveAnyway = page.getByRole('button', { name: 'Go live anyway' })
    if (await goLiveAnyway.isVisible({ timeout: 1500 }).catch(() => false)) {
      await goLiveAnyway.click()
    }

    // Wait for Twitch ERROR and Kick RECONNECTING while YouTube is LIVE.
    await expect(page.locator('[data-golive-tag="twitch"]')).toHaveText('ERROR', {
      timeout: 10_000,
    })
    await expect(page.locator('[data-golive-tag="kick"]')).toHaveText('RECONNECTING', {
      timeout: 10_000,
    })
    await expect(page.locator('[data-golive-tag="youtube"]')).toHaveText('LIVE', {
      timeout: 10_000,
    })

    // No top AllFailedBanner inside GoLiveDock.
    const dock = page.getByRole('region', { name: 'Go live to' })
    await expect(dock.getByText(/Stream stopped: every platform refused/)).toHaveCount(0)

    // Pin Twitch and Kick as failed so "Needs a look" deterministically shows both without racing auto-reconnect.
    await page.evaluate(() => {
      window.__ferrocastDemo?.setGoLive({
        failed: {
          twitch: { attempts: 3, reason: 'Stream key was rejected.', refused: true },
          kick: { attempts: 3, reason: 'Kick refused multistreaming.', refused: true },
        },
      })
    })
    await expect(page.locator('[data-golive-tag="kick"]')).toHaveText('ERROR', {
      timeout: 8_000,
    })
    const probsTrigger = dock.locator('[data-golive-problems-trigger]')
    await probsTrigger.scrollIntoViewIfNeeded()
    await expect(probsTrigger).toContainText(/2 problems/)
    await probsTrigger.click()
    const needsLook = page.locator('[data-golive-needs-look]')
    await expect(needsLook).toContainText('Twitch')
    await expect(needsLook).toContainText('Kick')
    await snap(
      page,
      `dock-problems-popover-${testInfo.project.name === 'mobile' ? '375' : '1280'}-slate.png`,
    )
    await page.keyboard.press('Escape')

    // All platforms down turns footer into compact danger strip ("Nothing is sending" + "Retry all").
    await page.evaluate(() => {
      window.__ferrocastDemo?.setGoLive({
        failed: {
          twitch: { attempts: 3, reason: 'Closed', refused: true },
          youtube: { attempts: 3, reason: 'Closed', refused: true },
          kick: { attempts: 3, reason: 'Closed', refused: true },
        },
      })
    })
    const strip = dock.locator('[data-golive-footer-strip]')
    await expect(strip).toContainText('Nothing is sending', { timeout: 8_000 })
    await expect(strip.getByRole('button', { name: 'Retry all' })).toBeVisible()
    await expect(dock.getByText(/Stream stopped: every platform refused/)).toHaveCount(0)
    await snap(
      page,
      `dock-alldown-strip-${testInfo.project.name === 'mobile' ? '375' : '1280'}-slate.png`,
    )
  })

  for (const theme of ['slate', 'daylight'] as const) {
    test(`${theme}: List 3b and Modal A have zero overflow and zero critical/serious axe violations`, async ({
      page,
    }, testInfo) => {
      const vpLabel = testInfo.project.name === 'mobile' ? '375' : '1280'
      await setupStudioDock(page, testInfo, {
        theme,
        settings: { width: 2560, height: 1440, fps: 60, video_kbps: 18000 },
        enableKick: true,
      })

      await snap(page, `dock-list3b-${vpLabel}-${theme}.png`)

      const dockOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      )
      expect(dockOverflow).toBe(true)

      const dockAxe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('[aria-label="Go live to"]')
        .analyze()
      const dockBad = dockAxe.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(
        dockBad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([])

      await page.locator('[data-quality-trigger="twitch"]').click()
      const modal = page.locator('[data-quality-modal="twitch"]')
      await expect(modal).toBeVisible()
      await modal.getByRole('switch', { name: 'Match main stream' }).click()
      await settled(page)

      await snap(page, `modal-A-edit-${vpLabel}-${theme}.png`)

      const modalMetrics = await page.evaluate(() => {
        const doc = document.documentElement
        const el = document.querySelector<HTMLElement>('[data-quality-modal="twitch"]')
        const rect = el?.getBoundingClientRect()
        return {
          innerWidth: window.innerWidth,
          scrollWidth: doc.scrollWidth,
          left: rect?.left ?? 0,
          right: rect?.right ?? 0,
        }
      })
      expect(modalMetrics.scrollWidth).toBeLessThanOrEqual(modalMetrics.innerWidth + 1)
      expect(modalMetrics.left).toBeGreaterThanOrEqual(-1)
      expect(modalMetrics.right).toBeLessThanOrEqual(modalMetrics.innerWidth + 1)

      const modalAxe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('[data-quality-modal="twitch"]')
        .analyze()
      const modalBad = modalAxe.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(
        modalBad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([])
    })
  }
})
