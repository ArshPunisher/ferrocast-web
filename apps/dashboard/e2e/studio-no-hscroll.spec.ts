import { expect, test, type Page } from '@playwright/test'
import { settled } from './helpers'

// Owner, 28 Nov: docked panels showed a sideways scrollbar along their bottom edge (macOS with
// "always show scrollbars"): the Sources and Scenes column, and the right column under Go live
// to and Chat. The dividers' grab area stuck out 4px past a column's end, so the column scrolled.
// Nothing in the Studio may scroll sideways, whatever the layout or window width.

const layout = (o: Record<string, unknown>) =>
  JSON.stringify({
    lw: 300,
    rw: 320,
    bh: 260,
    float: {},
    hidden: [],
    w: { scenes: 1, sources: 1.3, audio: 1.7, golive: 1, chat: 1, events: 1 },
    webs: [],
    preset: null,
    locked: false,
    mob: 'scenes',
    sizes: 2,
    ...o,
  })

const LAYOUTS: Record<string, string> = {
  'side panels, chat under Go live to': layout({
    left: ['scenes', 'sources'],
    right: ['golive', 'chat'],
    bottom: ['audio'],
  }),
  'classic, panels along the bottom': layout({
    left: [],
    right: ['golive', 'chat', 'events'],
    bottom: ['scenes', 'sources', 'audio'],
  }),
  'everything on the left': layout({
    left: ['scenes', 'sources', 'audio', 'events'],
    right: ['chat'],
    bottom: [],
  }),
  'columns dragged to their narrowest': layout({
    left: ['scenes', 'sources'],
    right: ['golive', 'chat'],
    bottom: ['audio'],
    lw: 180,
    rw: 180,
  }),
}

/** Every element that can scroll sideways with a scrollbar (and the page itself). */
async function sidewaysScrollers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const name = (el: Element) => {
      const aria = el.getAttribute('aria-label')
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : ''
      return `${el.tagName.toLowerCase()}${aria ? `[${aria}]` : ''}${cls ? `.${cls}` : ''}`
    }
    for (const el of document.querySelectorAll('*')) {
      if (el.clientWidth === 0 || el.scrollWidth <= el.clientWidth + 1) continue
      const ox = getComputedStyle(el).overflowX
      if (ox !== 'auto' && ox !== 'scroll') continue
      const chain: string[] = []
      for (let e: Element | null = el; e && chain.length < 4; e = e.parentElement)
        chain.unshift(name(e))
      out.push(`${chain.join(' > ')} (content ${el.scrollWidth}px in ${el.clientWidth}px)`)
    }
    const d = document.documentElement
    if (d.scrollWidth > d.clientWidth + 1)
      out.push(`page (${d.scrollWidth}px in ${d.clientWidth}px)`)
    return out
  })
}

test.describe('the Studio never scrolls sideways', () => {
  test.skip(({ isMobile }) => !!isMobile, 'Phones show one panel at a time.')

  for (const width of [1280, 1024]) {
    for (const [name, saved] of Object.entries(LAYOUTS)) {
      test(`${name}, ${width}px wide`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.addInitScript(
          ([l]) => {
            localStorage.setItem('fc-golive-picture', 'ferrocast')
            localStorage.setItem('fc-studio-layout', l!)
          },
          [saved],
        )
        await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
        await expect(page.locator('#main')).toBeVisible()
        await page.getByRole('button', { name: 'Start the Studio' }).click()
        await expect(page.getByRole('region', { name: 'Scenes' })).toBeVisible({ timeout: 10_000 })
        await settled(page)
        expect(await sidewaysScrollers(page)).toEqual([])
      })
    }
  }
})
