import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const LONG_WORD = 'StreamCheck'.repeat(26) // 286 chars, zero spaces
const LONG_NAME = 'UnbrokenHandleName_' + '1234567890ABCDEF'.repeat(8) // 147 chars, zero spaces

async function injectUnbrokenChatAndEvent(page: Page) {
  await page.evaluate(
    ({ msg, who }) => {
      const d = window.__ferrocastDemo
      if (!d) throw new Error('demo engine missing')
      const actor = {
        platform: 'twitch' as const,
        id: 'u-long',
        login: who.toLowerCase(),
        display_name: who,
        avatar_url: null,
        color: '#33d4ff',
        roles: 0,
        badges: [],
        anonymous: false,
      }
      d.inject(
        {
          type: 'chat_message',
          actor,
          content: {
            text: msg,
            fragments: [{ type: 'text', text: msg }],
          },
          reply_to: null,
          is_action: false,
        },
        'twitch',
      )
      d.inject(
        {
          type: 'tip',
          actor: { ...actor, platform: 'tips' },
          money: { minor: 5000, currency: 'INR' },
          message: msg,
          provider: 'razorpay',
          payment_ref: 'pay_long_test',
          status: 'captured',
        },
        'tips',
      )
    },
    { msg: LONG_WORD, who: LONG_NAME },
  )
}

async function assertNoViewportOverflow(page: Page, width: number) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(width)
}

async function assertInsideViewport(locator: ReturnType<Page['locator']>, width: number) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5)
}

for (const vp of [
  { name: 'desktop', width: 1280, height: 800, touch: false },
  { name: 'mobile', width: 375, height: 812, touch: true },
] as const) {
  test.describe(`long unbroken text wraps cleanly (${vp.name} ${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch })

    test('chat list, highlight banner, composer, and events never overflow or push controls off-screen', async ({
      page,
    }) => {
      await open(page, 'chat')
      await injectUnbrokenChatAndEvent(page)

      const chatLog = page.getByRole('log', { name: 'Merged chat' })
      const longLine = chatLog.locator('li.fc-row', { hasText: 'StreamCheckStreamCheck' }).last()
      await expect(longLine).toBeVisible()

      // Pin the unbroken message to the stream highlight banner.
      if (vp.touch) {
        await longLine.click()
        await page.getByRole('button', { name: 'Show on stream' }).click()
      } else {
        await longLine.getByRole('button').first().focus()
        await longLine.getByRole('button', { name: 'Show on stream' }).click()
      }

      const banner = page.getByTestId('highlight-banner')
      await expect(banner).toBeVisible()
      const msgEl = banner.getByText('StreamCheckStreamCheck')
      await expect(msgEl).toBeVisible()

      const bannerMetrics = await banner.evaluate((el) => ({
        elScrollW: el.scrollWidth,
        elClientW: el.clientWidth,
      }))
      const msgMetrics = await msgEl.evaluate((el) => ({
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        height: el.getBoundingClientRect().height,
      }))
      expect(bannerMetrics.elScrollW).toBeLessThanOrEqual(bannerMetrics.elClientW + 1)
      expect(msgMetrics.scrollW).toBeLessThanOrEqual(msgMetrics.clientW + 1)
      expect(msgMetrics.height).toBeGreaterThan(28)

      await assertNoViewportOverflow(page, vp.width)
      await assertInsideViewport(banner.getByRole('button', { name: 'Remove' }), vp.width)
      await assertInsideViewport(page.getByRole('button', { name: 'Send' }), vp.width)

      // Check Events feed (right pane on desktop, Events tab on mobile).
      if (vp.width < 1024) {
        await page
          .getByRole('radiogroup', { name: 'View' })
          .getByText('Events', { exact: true })
          .click()
      }
      const eventRow = page
        .locator('li', { hasText: 'tipped' })
        .filter({ hasText: 'UnbrokenHandleName_' })
        .first()
      await expect(eventRow).toBeVisible()
      await assertNoViewportOverflow(page, vp.width)
      const rowTime = eventRow.locator('time')
      if (await rowTime.isVisible()) {
        await assertInsideViewport(rowTime, vp.width)
      }
    })

    test('Studio Mini Feed and Chat docks wrap unbroken text inside narrow dock panels', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        localStorage.setItem('fc-golive-picture', 'ferrocast')
        localStorage.setItem(
          'fc-studio-layout',
          JSON.stringify({
            left: ['chat'],
            right: ['events'],
            bottom: ['scenes', 'sources', 'audio'],
            hidden: [],
            locked: true,
            mob: 'events',
            lw: 280,
            rw: 280,
            bh: 240,
            sizes: 2,
          }),
        )
      })
      await open(page, 'studio/golive', 'autoplay=0&latency=0&studioEngine=1')
      const startBtn = page.getByRole('button', { name: 'Start the Studio' })
      const eventsDock = page.getByRole('region', { name: 'Events' })
      await startBtn.or(eventsDock).waitFor({ state: 'visible' })
      if (await startBtn.isVisible().catch(() => false)) {
        await startBtn.click()
      }
      await expect(eventsDock).toBeVisible()
      await injectUnbrokenChatAndEvent(page)

      const eventRow = eventsDock.locator('li', { hasText: 'UnbrokenHandleName_' }).first()
      await expect(eventRow).toBeVisible()
      await assertNoViewportOverflow(page, vp.width)
      await assertInsideViewport(eventRow, vp.width)
      const readBtn = eventRow.getByRole('button', { name: /Mark .* read/i })
      if ((await readBtn.count()) > 0 && (await readBtn.isVisible())) {
        await assertInsideViewport(readBtn, vp.width)
      }

      if (vp.width >= 1024) {
        const chatDock = page.getByRole('region', { name: 'Chat' })
        await expect(chatDock).toBeVisible()
        const chatRow = chatDock.locator('li.fc-row', { hasText: 'StreamCheckStreamCheck' }).last()
        await expect(chatRow).toBeVisible()
        await assertNoViewportOverflow(page, vp.width)
        await assertInsideViewport(chatRow, vp.width)
      }
    })
  })
}
