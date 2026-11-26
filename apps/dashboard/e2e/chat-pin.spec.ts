import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const shots = process.env.FC_SHOTS

function snap(page: Page, name: string) {
  if (!shots) return Promise.resolve()
  mkdirSync(shots, { recursive: true })
  return page.screenshot({ path: join(shots, name) })
}

test.describe('inline chat Pin action without overlap (#5)', () => {
  test('renders inline Pin beside timestamp without floating overlap at 1280x800', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'chat')

    const log = page.getByRole('log', { name: 'Merged chat' })
    const line = log.locator('li.fc-row').last()
    await expect(line).toBeVisible()

    await line.hover()
    const pinBtn = line.getByRole('button', { name: 'Pin message to stream' })
    await expect(pinBtn).toBeVisible()
    await expect(pinBtn).toHaveAttribute('title', 'Pin')
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'false')

    const metrics = await line.evaluate((li) => {
      const btn = li.querySelector('button[aria-label="Pin message to stream"]') as HTMLElement
      const msgDiv = li.children[1] as HTMLElement
      const lr = li.getBoundingClientRect()
      const br = btn.getBoundingClientRect()
      const mr = msgDiv.getBoundingClientRect()
      return {
        insideRight: br.right <= lr.right + 1,
        insideVertical: br.top >= lr.top - 1 && br.bottom <= lr.bottom + 1,
        clearOfMessage: mr.right <= br.left + 1,
        hasAbsoluteAncestor: Boolean(btn.closest('.absolute')),
        hasShadowAncestor: Boolean(btn.closest('.shadow-2')),
      }
    })
    expect(metrics.insideRight).toBe(true)
    expect(metrics.insideVertical).toBe(true)
    expect(metrics.clearOfMessage).toBe(true)
    expect(metrics.hasAbsoluteAncestor).toBe(false)
    expect(metrics.hasShadowAncestor).toBe(false)
    await snap(page, 'chat-pin-hover-1280.png')

    await pinBtn.click()
    const unpinBtn = line.getByRole('button', { name: 'Unpin message from stream' })
    await expect(unpinBtn).toHaveAttribute('title', 'Unpin')
    await expect(unpinBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('highlight-banner')).toBeVisible()

    await page.mouse.move(0, 0)
    await expect(unpinBtn).toHaveCSS('opacity', '1')
    const timeOpacity = await line.locator('time').evaluate((el) => getComputedStyle(el).opacity)
    expect(timeOpacity).toBe('0')
    await snap(page, 'chat-pin-pinned-1280.png')

    // Unpin, check toolbar fits vertically on the bottom row without scroller clipping, and cover a broadcaster row.
    await unpinBtn.click()
    await line.hover()
    const toolbarFits = await line.evaluate((li) => {
      const bar = li.querySelector('.absolute .rounded-control') as HTMLElement | null
      const scroller = li.closest('[class*="overflow-y-auto"]') as HTMLElement | null
      if (!bar || !scroller) return false
      const br = bar.getBoundingClientRect()
      const sr = scroller.getBoundingClientRect()
      const lr = li.getBoundingClientRect()
      return br.top >= lr.top - 1 && br.bottom <= lr.bottom + 1 && br.bottom <= sr.bottom + 1
    })
    expect(toolbarFits).toBe(true)

    await page.evaluate(() => {
      const d = window.__ferrocastDemo
      if (!d) throw new Error('demo engine missing')
      d.inject(
        {
          type: 'chat_message',
          actor: {
            platform: 'kick',
            id: 'u-broadcaster',
            login: 'streamer',
            display_name: 'StreamerSelf',
            avatar_url: null,
            color: null,
            roles: 1,
            badges: [],
            anonymous: false,
          },
          content: {
            text: 'Hey guys',
            fragments: [{ type: 'text', text: 'Hey guys' }],
          },
          reply_to: null,
          is_action: false,
        },
        'kick',
      )
    })
    const ownLine = log.locator('li.fc-row', { hasText: 'Hey guys' }).last()
    await expect(ownLine).toBeVisible()
    await ownLine.hover()
    await expect(ownLine.getByRole('button', { name: 'Pin message to stream' })).toBeVisible()
    expect(await ownLine.locator('.absolute').count()).toBe(0)
  })

  test('fits dense Home chat rows vertically without overhanging into the next row', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'home')

    const log = page.getByRole('log', { name: 'Latest chat' })
    const line = log.locator('li.fc-row').last()
    await expect(line).toBeVisible()
    await line.hover()
    const denseToolbarFits = await line.evaluate((li) => {
      const bar = li.querySelector('.absolute .rounded-control') as HTMLElement | null
      if (!bar) return false
      const br = bar.getBoundingClientRect()
      const lr = li.getBoundingClientRect()
      return br.top >= lr.top - 1 && br.bottom <= lr.bottom + 1
    })
    expect(denseToolbarFits).toBe(true)
  })

  test('keeps inline Pin and Message actions inside 375x812 rows with zero overlap or overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'chat')

    const log = page.getByRole('log', { name: 'Merged chat' })
    const line = log.locator('li.fc-row').last()
    await expect(line).toBeVisible()

    await line.hover()
    const pinBtn = line.getByRole('button', { name: 'Pin message to stream' })
    const moreBtn = line.getByRole('button', { name: 'Message actions' })
    await expect(pinBtn).toBeVisible()
    await expect(moreBtn).toBeVisible()
    await snap(page, 'chat-pin-narrow-375.png')

    const narrowMetrics = await line.evaluate((li) => {
      const btn = li.querySelector('button[aria-label="Pin message to stream"]') as HTMLElement
      const more = li.querySelector('button[aria-label="Message actions"]') as HTMLElement
      const msgDiv = li.children[1] as HTMLElement
      const lr = li.getBoundingClientRect()
      const br = btn.getBoundingClientRect()
      const ar = more.getBoundingClientRect()
      const mr = msgDiv.getBoundingClientRect()
      return {
        fitsRow: br.right <= lr.right + 1 && ar.left >= lr.left - 1,
        moreClearOfMessage: mr.right <= ar.left + 1,
        moreBeforePin: ar.right <= br.left + 1,
        moreNotAbsolute: more.closest('.absolute') === null,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    })
    expect(narrowMetrics.fitsRow).toBe(true)
    expect(narrowMetrics.moreClearOfMessage).toBe(true)
    expect(narrowMetrics.moreBeforePin).toBe(true)
    expect(narrowMetrics.moreNotAbsolute).toBe(true)
    expect(narrowMetrics.pageOverflow).toBeLessThanOrEqual(0)

    await pinBtn.click()
    await expect(page.getByTestId('highlight-banner')).toBeVisible()
    await snap(page, 'chat-pin-pinned-375.png')
  })
})
