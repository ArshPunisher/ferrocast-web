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
  })

  test('keeps inline Pin and compact actions inside 375x812 rows with zero overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'chat')

    const log = page.getByRole('log', { name: 'Merged chat' })
    const line = log.locator('li.fc-row').first()
    await expect(line).toBeVisible()

    await line.hover()
    const pinBtn = line.getByRole('button', { name: 'Pin message to stream' })
    await expect(pinBtn).toBeVisible()

    const narrowMetrics = await line.evaluate((li) => {
      const btn = li.querySelector('button[aria-label="Pin message to stream"]') as HTMLElement
      const lr = li.getBoundingClientRect()
      const br = btn.getBoundingClientRect()
      return {
        fitsRow: br.right <= lr.right + 1 && br.left >= lr.left - 1,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    })
    expect(narrowMetrics.fitsRow).toBe(true)
    expect(narrowMetrics.pageOverflow).toBeLessThanOrEqual(0)

    await pinBtn.click()
    await expect(page.getByTestId('highlight-banner')).toBeVisible()
    await snap(page, 'chat-pin-pinned-375.png')
  })
})
