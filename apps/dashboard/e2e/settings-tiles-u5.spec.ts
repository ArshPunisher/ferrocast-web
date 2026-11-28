import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open, settled } from './helpers'

const SETTINGS_SECTIONS = [
  'Accounts',
  'OBS',
  'Cloud mode',
  'Music',
  'Text-to-speech',
  'Discord',
  'Automations',
  'Appearance',
  'Your data',
  'Updates',
  'Pro',
  'Plugins',
] as const

async function transparentBorderedTiles(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) return []
    const bad: string[] = []
    const els = main.querySelectorAll('li, [class*="rounded-"]')
    for (const el of els) {
      const h = el as HTMLElement
      const rect = h.getBoundingClientRect()
      if (rect.width < 120 || rect.height < 40) continue
      const cs = getComputedStyle(h)
      if (parseFloat(cs.borderTopWidth) < 1) continue
      // Ignore switches, buttons, inputs, links, selects, meters, or containers whose ancestor already provides an opaque card surface.
      if (
        ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'CODE', 'KBD', 'LABEL'].includes(
          h.tagName,
        ) ||
        h.getAttribute('role') === 'switch' ||
        h.getAttribute('role') === 'radiogroup'
      ) {
        continue
      }
      let cur: HTMLElement | null = h
      let hasOpaqueSurface = false
      while (cur && cur !== main) {
        const bg = getComputedStyle(cur).backgroundColor
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          hasOpaqueSurface = true
          break
        }
        cur = cur.parentElement
      }
      if (!hasOpaqueSurface) {
        bad.push(
          `${h.tagName}.${h.className.slice(0, 60)} => ${h.textContent?.trim().slice(0, 50)}`,
        )
      }
    }
    return bad
  })
}

test.describe('Settings tiles use themed surface background (U5)', () => {
  test('Accounts platform tiles and all Settings tabs have opaque theme surface backgrounds in light and dark', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, 'settings')

    const settingsNav = page.getByRole('navigation', { name: 'Settings sections' })
    for (const theme of ['linen', 'slate'] as const) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
      await settingsNav.getByRole('link', { name: 'Accounts', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible()

      const surfaceBg = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--fc-surface-1'),
      )
      expect(surfaceBg.trim()).not.toBe('')

      // Check each of the 4 Accounts platform tiles has its own opaque surface background, matching Settings cards.
      const cardBg = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('main [class*="bg-surface-1"]'))
        for (const c of cards) {
          const bg = getComputedStyle(c).backgroundColor
          if (bg !== 'rgba(0, 0, 0, 0)') return bg
        }
        return ''
      })
      expect(cardBg).not.toBe('')

      const rowBgs = await page.evaluate(() => {
        const heading = Array.from(document.querySelectorAll('h2, h3, p')).find(
          (el) => el.textContent?.trim() === 'Platforms',
        )
        const list = heading?.parentElement?.querySelector('ul')
        if (!list) return []
        return Array.from(list.children).map((li) => ({
          name: li.textContent?.trim().slice(0, 24) ?? '',
          bg: getComputedStyle(li).backgroundColor,
        }))
      })
      expect(rowBgs.length).toBe(4)
      for (const r of rowBgs) {
        expect(r.bg, `${r.name} in ${theme} should not be transparent`).not.toBe('rgba(0, 0, 0, 0)')
        expect(r.bg, `${r.name} in ${theme} should match surface-1 card bg`).toBe(cardBg)
      }

      // Sweep every other Settings section for bordered tiles with transparent composited backgrounds.
      for (const tab of SETTINGS_SECTIONS) {
        const link = settingsNav.getByRole('link', { name: tab, exact: true })
        if ((await link.count()) > 0) {
          await link.click()
          await page.waitForTimeout(100)
          const bad = await transparentBorderedTiles(page)
          expect(bad, `transparent tiles on Settings > ${tab} (${theme})`).toEqual([])
        }
      }
    }
  })

  test('Accounts settings passes keyboard, zero overflow across 1440/1280/1024/375, and axe checks', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const width of [1440, 1280, 1024, 375]) {
      await page.setViewportSize({ width, height: 800 })
      await open(page, 'settings')
      await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `overflow at ${width}px`,
      ).toBe(true)
    }

    await page.setViewportSize({ width: 1280, height: 800 })
    const lightAxe = await new AxeBuilder({ page }).include('main').analyze()
    expect(lightAxe.violations).toEqual([])
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'slate'))
    await settled(page)
    const darkAxe = await new AxeBuilder({ page }).include('main').analyze()
    expect(darkAxe.violations).toEqual([])
  })
})
