import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { fault, settled } from './helpers'

const SHOT_DIR = process.env.FC_ONEMODAL_SHOTS ?? process.env.FC_GOLIVE_SHOTS
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

test.describe('One Modal B unified platforms & quality editor', () => {
  test('Gear opens one dialog selecting first enabled platform, shows Match main card, Use 1080p60, and syncs rows', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile'
    const vp = await setupStudioDock(page, testInfo, {
      theme: 'slate',
      settings: { width: 2560, height: 1440, fps: 60, video_kbps: 16000 },
      enableKick: false,
    })

    await expect(page.locator('[data-quality-trigger="youtube"]')).toContainText('Same as main')
    await expect(page.locator('[data-quality-trigger="twitch"]')).toContainText(
      '1440p60 · 6 Mbps · auto',
    )

    // Gear opens ONE modal dialog (never two stacked dialogs).
    const gearBtn = page.getByRole('button', { name: 'Manage platforms' })
    await gearBtn.click()
    await expect(page.locator('[role="dialog"], dialog[open]')).toHaveCount(1)
    const modal = page.locator('[data-platforms-modal]')
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Your platforms' })).toBeVisible()

    // Desktop starts with Twitch (first enabled) selected in right pane; mobile starts on list step.
    const panes = modal.locator('[data-step]')
    if (isMobile) {
      await expect(panes).toHaveAttribute('data-step', 'list')
      await snap(page, 'omb-list-375-slate.png')
      await modal.locator('[data-select-platform="twitch"]').click()
      await expect(panes).toHaveAttribute('data-step', 'editor')
    } else {
      await expect(modal.locator('[data-platform-tile="twitch"]')).toHaveAttribute(
        'data-selected',
        'true',
      )
    }

    // Header must not say Live now when offline, and must fit header height without clipping.
    await expect(modal).toContainText('Twitch quality')
    await expect(modal).toContainText('Not live')
    await expect(modal).not.toContainText('Live now')

    const headerClip = await modal.locator('.fc-om-head').evaluate((h) => {
      const r = h.getBoundingClientRect()
      return r.top >= 0 && r.height >= 40 && h.scrollHeight <= h.clientHeight + 2
    })
    expect(headerClip).toBe(true)

    // Match main card shows 1440p60 · 16 Mbps -> Twitch 1440p60 · 6 Mbps + soft Use 1080p60 tip.
    const cmp = modal.locator('[data-quality-comparison]')
    await expect(cmp).toContainText('Main stream')
    await expect(cmp).toContainText('1440p60')
    await expect(cmp).toContainText('16 Mbps')
    await expect(cmp).toContainText('6 Mbps')
    await expect(modal).toContainText('Bitrate capped at 6 Mbps, Twitch’s limit.')
    await expect(modal).toContainText('Runs as its own encode. Your recording keeps 1440p60.')
    await snap(page, `omb-match-twitch-${isMobile ? '375' : '1280'}-slate.png`)

    // Clicking "Use 1080p60" switches to Set my own at 1080p60 · 6 Mbps with one neutral result box.
    await modal.locator('[data-soft-fix="1080p"]').click()
    await expect(modal.getByRole('radio', { name: 'Set my own' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(modal.locator('[data-quality-result]')).toHaveCount(1)
    await expect(modal.locator('[data-quality-result]')).toContainText(
      'Twitch gets 1080p60 at 6 Mbps',
    )

    // Primary Apply is orange with white text and updates Twitch row immediately on Apply.
    const applyBtn = modal.locator('[data-apply-quality]')
    await expect(applyBtn).toBeEnabled()
    await settled(page)
    const applyColors = await applyBtn.evaluate((b) => {
      const cs = getComputedStyle(b)
      return { bg: cs.backgroundColor, color: cs.color }
    })
    expect(applyColors.color).toBe('rgb(255, 255, 255)')
    await snap(page, `omb-use1080-${isMobile ? '375' : '1280'}-slate.png`)

    await applyBtn.click()
    if (isMobile) {
      await modal.getByRole('button', { name: 'Back to platforms' }).click()
      await expect(panes).toHaveAttribute('data-step', 'list')
    }
    await expect(modal.locator('[data-row-quality="twitch"]')).toContainText('1080p60 · 6 Mbps')
    await expect(page.locator('[data-quality-trigger="twitch"]')).toContainText('1080p60 · 6 Mbps')

    // On desktop check Kick (Off) -> shows 1080p60 · 8 Mbps and Off header; YouTube -> no extra work.
    if (!isMobile) {
      await modal.locator('[data-select-platform="kick"]').click()
      await expect(modal).toContainText('Kick quality')
      await expect(modal).toContainText('Off')
      await expect(modal.locator('[data-quality-comparison]')).toContainText('1080p60')
      await expect(modal.locator('[data-quality-comparison]')).toContainText('8 Mbps')
      await modal.locator('[data-select-platform="youtube"]').click()
      await expect(modal).toContainText('Exactly the same picture, no extra work for your PC.')
      await modal.locator('[data-select-platform]').filter({ hasText: 'YouTube Shorts' }).click()
      await expect(modal).toContainText('YouTube Shorts live quality')
      await expect(modal).toContainText('Match vertical picture')
      await modal.getByRole('radio', { name: 'Set my own' }).click()
      await expect(modal.getByRole('group', { name: 'Resolution' })).toContainText('1080×1920')
      await expect(modal.getByRole('group', { name: 'Resolution' })).toContainText('720×1280')
      await expect(modal.getByRole('group', { name: 'Resolution' })).toContainText('540×960')
      await snap(page, 'omb-shorts-1280-slate.png')
    }

    // Inline Add destination keeps single dialog count === 1.
    if (isMobile) {
      await modal.getByRole('button', { name: 'Add a destination' }).click()
    } else {
      await modal.getByRole('button', { name: 'Add a destination' }).click()
    }
    await expect(page.locator('[role="dialog"], dialog[open]')).toHaveCount(1)
    await expect(modal.getByRole('heading', { name: 'Add a destination' })).toBeVisible()
    await modal.getByRole('button', { name: 'Cancel' }).click()

    // Escape closes and returns focus to Gear button.
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
    await expect(gearBtn).toBeFocused()
    expect(vp.width).toBeGreaterThan(0)
  })

  test('Row quality opens same dialog to that platform, enforces hard limit + fix, handles 375 back nav & Escape focus return', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile'
    await setupStudioDock(page, testInfo, {
      theme: 'daylight',
      settings: { width: 2560, height: 1440, fps: 60, video_kbps: 16000 },
      enableKick: true,
    })

    const twitchTrigger = page.locator('[data-quality-trigger="twitch"]')
    await twitchTrigger.click()
    await expect(page.locator('[role="dialog"], dialog[open]')).toHaveCount(1)

    const modal = page.locator('[data-platforms-modal]')
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('Twitch quality')

    if (isMobile) {
      const panes = modal.locator('[data-step]')
      await expect(panes).toHaveAttribute('data-step', 'editor')
      await modal.getByRole('button', { name: 'Back to platforms' }).click()
      await expect(panes).toHaveAttribute('data-step', 'list')
      await modal.locator('[data-select-platform="twitch"]').click()
      await expect(panes).toHaveAttribute('data-step', 'editor')
    }

    await modal.getByRole('radio', { name: 'Set my own' }).click()
    await modal
      .getByRole('group', { name: 'Resolution' })
      .getByRole('button', { name: /1080p/ })
      .click()
    await modal.getByLabel('Bitrate in Mbps').fill('9')
    await expect(modal).toContainText('Twitch closes streams above 6 Mbps.')
    await expect(modal.locator('[data-apply-quality]')).toBeDisabled()
    await snap(page, `omb-hard-${isMobile ? '375' : '1280'}-light.png`)

    await modal.locator('[data-hard-fix]').click()
    await expect(modal.getByLabel('Bitrate in Mbps')).toHaveValue('6')
    await expect(modal.locator('[data-apply-quality]')).toBeEnabled()

    // Focus trap cycles Tab inside the single dialog and Escape returns focus to row trigger.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    const focusInside = await page.evaluate(() => {
      const d = document.querySelector('[data-platforms-modal]')
      return Boolean(d && document.activeElement && d.contains(document.activeElement))
    })
    expect(focusInside).toBe(true)

    // An open tip takes its own Escape first; the next one closes the dialog.
    const tip = modal.getByRole('button', { name: /About Twitch quality details/ })
    await tip.focus()
    await expect(tip).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(modal).toBeVisible()
    await expect(tip).toHaveAttribute('aria-expanded', 'false')
    await modal.locator('[data-apply-quality]').focus()
    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
    await expect(twitchTrigger).toBeFocused()
  })

  test('Live apply transitions SWITCHING -> LIVE, shows Live now only for live platforms, shared-cap budget full & 422 API errors inline', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile'
    await setupStudioDock(page, testInfo, {
      theme: 'slate',
      settings: { width: 2560, height: 1440, fps: 60, video_kbps: 16000 },
      goLiveConfig: { switch_delay_ms: 450 },
    })

    // Start stream: Twitch & YouTube live, Kick remains off.
    await page.getByRole('button', { name: 'Go live', exact: true }).click()
    const goLiveAnyway = page.getByRole('button', { name: 'Go live anyway' })
    if (await goLiveAnyway.isVisible({ timeout: 1500 }).catch(() => false)) {
      await goLiveAnyway.click()
    }
    await expect(page.locator('[data-golive-tag="twitch"]')).toHaveText('LIVE', { timeout: 10_000 })

    // Open Twitch via row trigger: header says Live now + live footer copy.
    const twitchTrigger = page.locator('[data-quality-trigger="twitch"]')
    await twitchTrigger.click()
    const modal = page.locator('[data-platforms-modal]')
    await expect(modal).toContainText('Twitch quality')
    await expect(modal).toContainText('Live now')
    await expect(modal).toContainText('Switches only Twitch. Your stream keeps going.')

    // Check Kick (Off) via list: header says Off, NOT Live now!
    if (isMobile) {
      await modal.getByRole('button', { name: 'Back to platforms' }).click()
    }
    await modal.locator('[data-select-platform="kick"]').click()
    await expect(modal).toContainText('Kick quality')
    await expect(modal).toContainText('Off')
    await expect(modal).not.toContainText('Live now')

    // Switch back to Twitch, pick 720p30 · 3 Mbps, Apply live -> SWITCHING -> LIVE.
    if (isMobile) {
      await modal.getByRole('button', { name: 'Back to platforms' }).click()
    }
    await modal.locator('[data-select-platform="twitch"]').click()
    await modal.getByRole('radio', { name: 'Set my own' }).click()
    await modal
      .getByRole('group', { name: 'Resolution' })
      .getByRole('button', { name: /720p/ })
      .click()
    await modal
      .getByRole('group', { name: 'Frame rate' })
      .getByRole('button', { name: '30', exact: true })
      .click()
    await modal.getByLabel('Bitrate in Mbps').fill('3')
    await modal.locator('[data-apply-quality]').click()

    await expect(page.locator('[data-golive-tag="twitch"]')).toHaveText('SWITCHING')
    await expect(page.locator('[data-golive-tag="twitch"]')).toHaveText('LIVE', { timeout: 5_000 })
    await expect(twitchTrigger).toContainText('720p30 · 3 Mbps')

    // Inline 422 API errors (timeout + retry, budget, limit, locked) stay inside modal.
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
      await twitchTrigger.click()
      await expect(page.locator('[role="dialog"], dialog[open]')).toHaveCount(1)
      await modal.getByRole('radio', { name: 'Match main stream' }).click()
      await modal.locator('[data-apply-quality]').click()
      const alert = modal.getByRole('alert')
      await expect(alert).toContainText(err.expectText)
      if (err.hasRetry) {
        await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
      }
      await page.keyboard.press('Escape')
      await expect(modal).toBeHidden()
    }

    // Encode budget full (max_sessions = 1): restore Twitch to Match main so Pass-2 shared cap fires cleanly.
    await twitchTrigger.click()
    await modal.getByRole('radio', { name: 'Match main stream' }).click()
    await modal.locator('[data-apply-quality]').click()
    await expect(modal).toBeHidden()
    await expect(page.locator('[data-golive-tag="twitch"]')).toHaveText('LIVE', { timeout: 5_000 })

    await page.evaluate(() => {
      window.__ferrocastDemo?.setGoLive({
        encode_budget: { max_sessions: 1, limit_mpx_s: 200 },
      })
    })
    await expect(page.locator('[data-golive-row="youtube"]')).toContainText('Too many qualities', {
      timeout: 8_000,
    })
    await page.getByRole('button', { name: 'Manage platforms' }).click()
    await expect(modal).toBeVisible()
    await modal.locator('[data-select-platform="youtube"]').click()
    await expect(modal).toContainText(
      'Your PC can run 1 stream encode at once; lower main quality or turn off a platform.',
      { timeout: 8_000 },
    )
    await snap(page, `omb-budget-full-${isMobile ? '375' : '1280'}-slate.png`)
  })

  for (const theme of ['slate', 'daylight'] as const) {
    test(`${theme}: One Modal B has zero overflow and zero critical/serious axe violations`, async ({
      page,
    }, testInfo) => {
      const vpLabel = testInfo.project.name === 'mobile' ? '375' : '1280'
      const vp = await setupStudioDock(page, testInfo, {
        theme,
        settings: { width: 2560, height: 1440, fps: 60, video_kbps: 16000 },
        enableKick: true,
      })

      await page.locator('[data-quality-trigger="twitch"]').click()
      const modal = page.locator('[data-platforms-modal]')
      await expect(modal).toBeVisible()
      await settled(page)
      await snap(page, `omb-a11y-${vpLabel}-${theme}.png`)

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement
        const el = document.querySelector<HTMLElement>('[data-platforms-modal]')
        const rect = el?.getBoundingClientRect()
        return {
          innerWidth: window.innerWidth,
          scrollWidth: doc.scrollWidth,
          modalScrollWidth: el?.scrollWidth ?? 0,
          modalClientWidth: el?.clientWidth ?? 0,
          left: rect?.left ?? 0,
          right: rect?.right ?? 0,
        }
      })
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1)
      expect(metrics.modalScrollWidth).toBeLessThanOrEqual(metrics.modalClientWidth + 1)
      expect(metrics.left).toBeGreaterThanOrEqual(-1)
      expect(metrics.right).toBeLessThanOrEqual(metrics.innerWidth + 1)
      expect(vp.width).toBeGreaterThan(0)

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('[data-platforms-modal]')
        .analyze()
      const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(
        bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([])
    })
  }
})
