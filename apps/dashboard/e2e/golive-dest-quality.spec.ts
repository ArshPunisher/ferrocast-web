import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fault, settled } from './helpers'

const SHOT_DIR = process.env.FC_Q7_SHOTS
const DEMO_TOKEN = 'demo-session'

async function snap(page: Page, name: string) {
  if (!SHOT_DIR) return
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false })
}

async function setupStandbyDemo(
  page: Page,
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
    goLiveConfig?: {
      encode_budget?: { max_sessions?: number; limit_mpx_s?: number }
      switch_delay_ms?: number
      host_codecs?: string[]
    }
  } = {},
) {
  const theme = opts.theme ?? 'slate'
  const viewport = opts.viewport ?? { width: 1440, height: 900 }
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
  await expect(page.locator('[data-quality-trigger="twitch"]')).toBeVisible({ timeout: 10_000 })
  if (opts.enableKick) {
    const kickSwitch = page.getByRole('switch', { name: 'Go live on Kick' })
    if (!(await kickSwitch.isChecked())) {
      await kickSwitch.click()
      await expect(kickSwitch).toBeChecked({ timeout: 5_000 })
    }
  }
  await settled(page)
}

test.describe('Per-destination stream quality picker', () => {
  test('shows auto-fit chips, Twitch 1440p soft limit (i), Kick 1080p hard max Custom dropdowns, and keyboard nav', async ({
    page,
  }) => {
    await setupStandbyDemo(page, {
      theme: 'slate',
      viewport: { width: 1440, height: 900 },
      settings: { width: 2560, height: 1440, fps: 60, video_kbps: 18000 },
      enableKick: true,
    })

    const twitchTrigger = page.locator('[data-quality-trigger="twitch"]')
    const kickTrigger = page.locator('[data-quality-trigger="kick"]')
    const ytTrigger = page.locator('[data-quality-trigger="youtube"]')

    await expect(ytTrigger).toContainText('Same as main')
    await expect(twitchTrigger).toContainText('1440p60 · 6 Mbps · auto')
    await expect(kickTrigger).toContainText('1080p60 · 8 Mbps · auto')
    await expect(page.locator('[data-golive-encode-summary]')).toContainText('3 places')
    await expect(page.locator('[data-golive-encode-summary]')).toContainText('3 encodes')

    await twitchTrigger.click()
    const twitchPop = page.locator('[data-quality-popover="twitch"]')
    await expect(twitchPop).toBeVisible()
    await expect(twitchPop).toHaveAttribute('data-over-preview', '')
    await expect(twitchPop.getByRole('option', { name: /Same as main/ })).toBeVisible()
    await expect(twitchPop.getByRole('option', { name: /Best for Twitch/ })).toBeVisible()
    await expect(twitchPop.getByRole('option', { name: /Same as main/ })).toContainText(
      "Above Twitch's recommended 1080p",
    )
    await snap(page, '01-dock-twitch-popover-dark.png')

    const firstOpt = twitchPop.getByRole('option').first()
    await firstOpt.focus()
    await page.keyboard.press('ArrowDown')
    await expect(twitchPop.getByRole('option').nth(1)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(twitchPop).toBeHidden()
    await expect(twitchTrigger).toBeFocused()

    // Kick custom dropdowns must never offer 1440p above its 1080p hard ceiling.
    await kickTrigger.click()
    const kickPop = page.locator('[data-quality-popover="kick"]')
    await expect(kickPop).toBeVisible()
    await kickPop.getByRole('button', { name: /Custom/ }).click()
    const resValues = await kickPop.getByLabel('Resolution').locator('option').allTextContents()
    expect(resValues.some((t) => t.includes('1440p') || t.includes('2160p'))).toBe(false)
    await snap(page, '02-kick-custom-dropdowns-dark.png')

    await kickPop.getByLabel('Resolution').selectOption('1280x720')
    await kickPop.getByLabel('Frame rate').selectOption('30')
    await kickPop.getByLabel('Bitrate').selectOption('3000')
    await kickPop.getByRole('button', { name: 'Apply' }).click()
    await expect(kickTrigger).toContainText('720p30 · 3 Mbps')
  })

  test('highlights encoder sharing and enforces tight PC encode budget', async ({ page }) => {
    await setupStandbyDemo(page, {
      theme: 'slate',
      viewport: { width: 1440, height: 900 },
      settings: { width: 1920, height: 1080, fps: 60, video_kbps: 12000 },
      enableKick: true,
      goLiveConfig: { encode_budget: { max_sessions: 2, limit_mpx_s: 300 } },
    })

    // Under a 2-session limit, Pass 2 coalesces Twitch & Kick onto one shared 6M encode.
    await expect(page.locator('[data-golive-encode-summary]')).toContainText('3 places')
    await expect(page.locator('[data-golive-encode-summary]')).toContainText('2 encodes')
    await expect(
      page
        .getByRole('list', { name: 'Platforms' })
        .getByRole('listitem')
        .filter({ has: page.locator('[data-quality-trigger="kick"]') }),
    ).toContainText('shared with Twitch')
    const kickTrigger = page.locator('[data-quality-trigger="kick"]')
    await kickTrigger.click()
    const kickPop = page.locator('[data-quality-popover="kick"]')
    await expect(kickPop).toBeVisible()
    await expect(kickPop.getByRole('option', { name: /shared with Twitch/i })).toBeVisible()
    await expect(kickPop.locator('[role="option"][aria-disabled="true"]').first()).toBeVisible()
    await snap(page, '03-over-budget-shared-encode.png')
    await page.keyboard.press('Escape')
  })

  test('switches live mid-stream with Switching state, isolates Escape inside Your platforms dialog, and shows dismissible 422 alert', async ({
    page,
  }) => {
    await setupStandbyDemo(page, {
      theme: 'slate',
      viewport: { width: 1440, height: 900 },
      goLiveConfig: { switch_delay_ms: 450 },
    })

    await page.getByRole('button', { name: 'Go live', exact: true }).click()
    const goLiveAnyway = page.getByRole('button', { name: 'Go live anyway' })
    if (await goLiveAnyway.isVisible({ timeout: 1500 }).catch(() => false)) {
      await goLiveAnyway.click()
    }
    await expect(page.getByText('Live', { exact: true }).first()).toBeVisible({ timeout: 10_000 })

    const twitchTrigger = page.locator('[data-quality-trigger="twitch"]')
    await twitchTrigger.click()
    const pop = page.locator('[data-quality-popover="twitch"]')
    await expect(pop).toBeVisible()
    await pop.getByRole('option', { name: /720p30/ }).click()
    await expect(twitchTrigger).toContainText('Switching…')
    await expect(twitchTrigger).toContainText('720p30 · 3 Mbps', { timeout: 5_000 })

    // Open Your platforms modal: Escape closes only quality popover, keeping modal open.
    await page.getByRole('button', { name: 'Manage platforms' }).click()
    const modal = page.getByRole('dialog', { name: 'Your platforms' })
    await expect(modal).toBeVisible()
    await modal.locator('[data-quality-trigger="twitch"]').click()
    const modalPop = page.locator('[data-quality-popover="twitch"]')
    await expect(modalPop).toBeVisible()
    await snap(page, '04-platforms-dialog-popover-dark.png')

    await page.keyboard.press('Escape')
    await expect(modalPop).toBeHidden()
    await expect(modal).toBeVisible()

    // Failing PUT returns 422 inline alert without losing previous selection.
    await fault(page, {
      path: '/api/v1/golive/destinations/twitch/quality',
      status: 422,
      code: 'encode_budget_exceeded',
      message: 'Not enough GPU headroom to add another encode.',
      hint: 'Keep a shared preset or stop another encode.',
      times: 1,
    })
    await modal.locator('[data-quality-trigger="twitch"]').click()
    await page
      .locator('[data-quality-popover="twitch"]')
      .getByRole('option', { name: /Same as main/ })
      .click()
    const alert = page.locator('[data-quality-popover="twitch"] [role="alert"]')
    await expect(alert).toContainText('Not enough GPU headroom')
    await page
      .locator('[data-quality-popover="twitch"]')
      .getByRole('button', { name: 'Dismiss error' })
      .click()
    await expect(alert).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(modal.locator('[data-quality-trigger="twitch"]')).toContainText('720p30 · 3 Mbps')
  })

  for (const theme of ['slate', 'daylight'] as const) {
    for (const [label, viewport] of [
      ['1440', { width: 1440, height: 900 }],
      ['375', { width: 375, height: 812 }],
    ] as const) {
      test(`${label}px ${theme}: zero overflow and zero critical/serious axe violations`, async ({
        page,
      }) => {
        await setupStandbyDemo(page, {
          theme,
          viewport,
          settings: { width: 2560, height: 1440, fps: 60, video_kbps: 18000 },
        })

        const trigger = page.locator('[data-quality-trigger="twitch"]')
        await trigger.click()
        const pop = page.locator('[data-quality-popover="twitch"]')
        await expect(pop).toBeVisible()
        await pop.getByRole('button', { name: /Custom/ }).click()
        await settled(page)

        if (label === '375' && theme === 'daylight') {
          await snap(page, '05-mobile-375-custom-light.png')
        } else if (label === '1440' && theme === 'daylight') {
          await snap(page, '06-desktop-1440-custom-light.png')
        }

        const metrics = await page.evaluate(() => {
          const doc = document.documentElement
          const popEl = document.querySelector<HTMLElement>('[data-quality-popover="twitch"]')
          const rect = popEl?.getBoundingClientRect()
          return {
            innerWidth: window.innerWidth,
            scrollWidth: doc.scrollWidth,
            popLeft: rect?.left ?? 0,
            popRight: rect?.right ?? 0,
          }
        })
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1)
        expect(metrics.popLeft).toBeGreaterThanOrEqual(0)
        expect(metrics.popRight).toBeLessThanOrEqual(metrics.innerWidth + 1)

        const axe = new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .include('[data-quality-popover="twitch"]')
          .include('[data-quality-trigger="twitch"]')
          .include('[data-golive-encode-summary]')
          .analyze()
        const r = await axe
        const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(
          bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
        ).toEqual([])
      })
    }
  }
})
