import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { Widget } from '@ferrocast/api/types'

const SHOTS = process.env.SCREENSHOT_DIR ?? join(process.cwd(), 'test-results', 'screenshots')

type DemoHandle = {
  client: {
    overlays(): Promise<
      { id: string; name: string; width: number; height: number; widgets: Widget[] }[]
    >
    saveOverlay(o: unknown): Promise<unknown>
    chat(limit?: number): Promise<{ id: string; source_id: string | null }[]>
    pinChatHighlight(event_id: string, duration_s?: number | null): Promise<unknown>
    clearChatHighlight(): Promise<void>
  }
  engine: {
    inject(kind: unknown, platform?: string, origin?: string): void
  }
}

const EMOTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#ff7a59"/><circle cx="22" cy="26" r="5" fill="#16191e"/><circle cx="42" cy="26" r="5" fill="#16191e"/><path d="M20 40c4 7 20 7 24 0" stroke="#16191e" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`

async function stubEmoteCdns(page: Page) {
  await page.route(
    /^https:\/\/(static-cdn\.jtvnw\.net|cdn\.7tv\.app|files\.kick\.com|images\.kick\.com|cdn\.betterttv\.net|cdn\.frankerfacez\.com|yt3\.ggpht\.com)\//,
    (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: EMOTE_SVG }),
  )
}

test.describe('interactive overlay widgets in Chromium', () => {
  test('renders End Credits scrolling via rAF, Emote Wall CDN & flood caps, and Chat Highlight', async ({
    page,
  }) => {
    await stubEmoteCdns(page)
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/?demo&quiet')
    await page.waitForSelector('html[data-ready="1"]', { state: 'attached' })

    // Configure overlay with the three new widget kinds cleanly
    const chatId = await page.evaluate(async () => {
      const h = (window as unknown as { __ferroDemo?: DemoHandle }).__ferroDemo
      if (!h) throw new Error('missing demo handle')
      const overlays = await h.client.overlays()
      const main = overlays[0]!
      await h.client.saveOverlay({
        ...main,
        widgets: [
          {
            id: 'ec-1',
            kind: 'end_credits',
            x: 80,
            y: 80,
            w: 760,
            h: 700,
            config: {
              theme: 'molten',
              title: 'Stream Credits',
              sections: ['followers', 'subs', 'gifters', 'tippers', 'raiders', 'mods'],
              speed: 120,
              font: 'system',
              text_color: '#eef0f5',
              accent_color: '#ff7a59',
              background: null,
              loop: true,
            },
          },
          {
            id: 'ew-1',
            kind: 'emote_wall',
            x: 0,
            y: 0,
            w: 1920,
            h: 1080,
            config: {
              theme: 'molten',
              platforms: [],
              max_emotes: 35,
              size: 56,
              lifetime_s: 6,
              physics: 'fountain',
            },
          },
          {
            id: 'hl-1',
            kind: 'chat_highlight',
            x: 920,
            y: 780,
            w: 700,
            h: 220,
            config: {
              theme: 'molten',
              duration_s: null,
              font_size: 24,
              show_badges: true,
              show_platform: true,
            },
          },
        ],
      })
      const lines = await h.client.chat(10)
      const target = lines[0]!.id
      await h.client.pinChatHighlight(target, null)
      return target
    })
    expect(chatId).toBeTruthy()

    // Verify End Credits lists session roles and scrolls using translate3d
    const creditsTrack = page.locator('.fc-credits-track')
    await expect(creditsTrack).toBeVisible()
    await expect(creditsTrack).toContainText('LunaLagoon')
    await expect(creditsTrack).toContainText('mira_exe')
    const t0 = await creditsTrack.evaluate((n) => getComputedStyle(n).transform)
    // The track moves a little every animation frame; software-rendered Linux WebKit in CI
    // draws only a few frames a second, so wait for the move instead of a fixed 250 ms.
    await expect
      .poll(() => creditsTrack.evaluate((n) => getComputedStyle(n).transform), {
        timeout: 10_000,
      })
      .not.toBe(t0)

    // Verify Chat Highlight card renders and dismisses cleanly
    const hl = page.locator('.fc-w-chat-highlight')
    await expect(hl).toBeVisible()

    // Flood trusted + untrusted emotes and verify strict caps + CDN allowlist
    await page.evaluate(() => {
      const h = (window as unknown as { __ferroDemo?: DemoHandle }).__ferroDemo!
      for (let i = 0; i < 60; i++) {
        h.engine.inject(
          {
            type: 'chat_message',
            actor: {
              platform: 'twitch',
              id: `u${i}`,
              login: `u${i}`,
              display_name: `<img src=x onerror=alert(1)> ${i}`,
              avatar_url: null,
              color: null,
              roles: 0,
              badges: [],
              anonymous: false,
            },
            content: {
              text: 'Kappa',
              fragments: [
                {
                  type: 'emote',
                  provider: 'native',
                  id: '25',
                  name: 'Kappa',
                  url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/2.0',
                  zero_width: false,
                },
                {
                  type: 'emote',
                  provider: 'native',
                  id: 'bad',
                  name: 'Evil',
                  url: 'https://evil.example/payload.png',
                  zero_width: false,
                },
              ],
            },
            reply_to: null,
            is_action: false,
          },
          'twitch',
          'live',
        )
      }
    })
    await expect(page.locator('.fc-emote-particle').first()).toBeVisible()
    const stats = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>('.fc-emote-particle')]
      return {
        count: imgs.length,
        hasEvil: imgs.some((img) => img.src.includes('evil.example')),
      }
    })
    expect(stats.count).toBeLessThanOrEqual(35)
    expect(stats.hasEvil).toBe(false)

    await page.waitForTimeout(900)
    await page.addStyleTag({
      content: 'html,body{background:#11151c!important;min-height:100%}',
    })
    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, 'overlay-widgets-combined.png') })

    // Dismiss highlight cleanly
    await page.evaluate(async () => {
      const h = (window as unknown as { __ferroDemo?: DemoHandle }).__ferroDemo!
      await h.client.clearChatHighlight()
    })
    await expect(hl).toBeHidden()
  })

  test('honours prefers-reduced-motion on End Credits and Emote Wall', async ({ page }) => {
    await stubEmoteCdns(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/?demo&quiet')
    await page.waitForSelector('html[data-ready="1"]', { state: 'attached' })

    await page.evaluate(async () => {
      const h = (window as unknown as { __ferroDemo?: DemoHandle }).__ferroDemo!
      const main = (await h.client.overlays())[0]!
      await h.client.saveOverlay({
        ...main,
        widgets: [
          {
            id: 'ec-rm',
            kind: 'end_credits',
            x: 40,
            y: 40,
            w: 760,
            h: 600,
            config: {
              theme: 'molten',
              sections: ['followers', 'mods'],
              speed: 120,
              font: 'system',
              loop: true,
            },
          },
        ],
      })
    })
    await expect(page.locator('.fc-w-end-credits')).toHaveClass(/is-static/)
  })
})
