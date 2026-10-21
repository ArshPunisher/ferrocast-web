import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

// Pro "Dashboard anywhere" with the streaming PC off (M10): the cloud bot stands in, so a
// phone still gets chat, bans and history (`?remote=owner|mod&pc=off&cloud=on|paused`).
const OFF = 'autoplay=0&latency=0&pro=active&pro_features=on&pc=off'
const SHOTS = process.env.FC_SHOTS

async function noSideScroll(page: Page): Promise<void> {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(wide).toBe(false)
}

/**
 * The chat screen fits the phone: no page scroll (the chat scrolls inside), the composer
 * line and the tab bar on screen, and the banner's words on one line.
 */
async function fitsVertically(page: Page): Promise<void> {
  const m = await page.evaluate(() => {
    const doc = document.documentElement
    const works = document.querySelector('[data-testid="limited-works"]')
    const line = works ? parseFloat(getComputedStyle(works).lineHeight) || 20 : 0
    const tabs = [...document.querySelectorAll('nav[aria-label="Main"]')].at(-1)
    return {
      over: doc.scrollHeight - doc.clientHeight,
      worksLines: works ? Math.round(works.getBoundingClientRect().height / line) : 1,
      tabsBottom: tabs ? tabs.getBoundingClientRect().bottom : 0,
      vh: window.innerHeight,
    }
  })
  expect(m.over, 'no vertical page scroll').toBeLessThanOrEqual(1)
  expect(m.worksLines, 'the banner fits on one line').toBe(1)
  expect(m.tabsBottom).toBeLessThanOrEqual(m.vh + 1)
}

async function refused(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__ferrocastDemo?.remoteRefused ?? [])
}

const strip = (page: Page) => page.getByTestId('remote-strip')
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Main' }).last()

test.describe('A phone whose PC is off, the cloud bot standing in', () => {
  test('a mod gets chat and moderation, with a clear banner', async ({ page }) => {
    await open(page, 'chat', `${OFF}&remote=mod&cloud=on`)
    await expect(strip(page)).toHaveAttribute('data-limited', 'yes')
    await expect(strip(page)).toContainText('Your PC is off')
    // A mod has no history: the words say what works for them.
    await expect(page.getByTestId('limited-works')).toHaveText('Chat and bans still work.')
    await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
    await expect(page.locator('#main li').first()).toBeVisible()
    // Nothing that needs the PC: no panic button, no events pane, no held filter.
    await expect(page.getByRole('button', { name: /panic/i })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Events' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Held/ })).toHaveCount(0)
    await page.evaluate(() => (location.hash = '#/moderation'))
    await expect(page.getByRole('heading', { name: 'Moderate from chat' })).toBeVisible()
    await expect(page.getByTestId('needs-pc')).toContainText('need your PC')
    await page.evaluate(() => (location.hash = '#/settings'))
    await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
    expect(await refused(page)).toEqual([])
  })

  test('deleting a line goes through the cloud bot', async ({ page, isMobile }) => {
    await open(page, 'chat', `${OFF}&remote=mod&cloud=on`)
    // A viewer's line (the streamer's own have no actions).
    const lines = page.locator('#main li.group')
    await expect(lines.first()).toBeVisible()
    if (isMobile) {
      // Touch: a tap opens the line's actions in a sheet.
      await lines.last().tap()
      const sheet = page.getByRole('dialog')
      await expect(sheet.getByRole('button', { name: /^Ban on / })).toBeVisible()
      await expect(sheet.getByRole('button', { name: 'Viewer card' })).toHaveCount(0)
      await expect(sheet.getByRole('button', { name: /^Reply/ })).toHaveCount(0)
      await sheet.getByRole('button', { name: 'Delete message' }).click()
      await expect(page.getByText('Message deleted.').first()).toBeVisible()
      return
    }
    let line = lines.last()
    for (let i = (await lines.count()) - 1; i >= 0; i--) {
      line = lines.nth(i)
      await line.hover()
      if (await line.getByRole('button', { name: 'Delete message' }).isVisible()) break
    }
    await line.getByRole('button', { name: 'Delete message' }).click()
    await expect(page.getByText('Message deleted.').first()).toBeVisible()
    // No viewer card or reply while the PC is off.
    await line.hover()
    await expect(line.getByRole('button', { name: 'Viewer card' })).toHaveCount(0)
    await expect(line.getByRole('button', { name: 'Reply on the same platform' })).toHaveCount(0)
  })

  test('without the moderation opt-in, no bans are offered and the words say so', async ({
    page,
    isMobile,
  }) => {
    await open(page, 'chat', `${OFF}&remote=mod&cloud=on&cloud_mod=off`)
    await expect(page.getByTestId('limited-works')).toHaveText('Chat still works.')
    const lines = page.locator('#main li.group')
    await expect(lines.first()).toBeVisible()
    if (isMobile) {
      await lines.last().tap()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    } else {
      await lines.last().hover()
      for (const name of ['Delete message', 'Time out for 10 minutes', /^Ban on /])
        await expect(lines.last().getByRole('button', { name })).toHaveCount(0)
    }
    await page.goto(`./?${OFF}&remote=owner&cloud=on&cloud_mod=off#/chat`)
    await expect(page.getByTestId('limited-works')).toHaveText('Chat and history still work.')
  })

  test('a ban from the phone shows on the PC’s ban list once it’s back', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'hover toolbar; the sheet is covered above')
    await open(page, 'chat', `${OFF}&remote=owner&cloud=on`)
    await expect(page.getByTestId('limited-works')).toHaveText('Chat, bans and history still work.')
    const lines = page.locator('#main li.group')
    await expect(lines.first()).toBeVisible()
    const line = lines.last()
    await line.hover()
    await line.getByRole('button', { name: /^Ban on / }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /^Ban on / }).click()
    await expect(dialog).toHaveCount(0)
    await page.evaluate(() => window.__ferrocastDemo?.setRemotePc(true))
    await expect(strip(page)).toHaveText(/PC online/)
    await page.evaluate(() => (location.hash = '#/moderation'))
    await expect(page.getByText('From your phone while the PC was off').first()).toBeVisible()
  })

  test('an owner gets chat, moderation and history; sending needs the PC', async ({ page }) => {
    await open(page, 'chat', `${OFF}&remote=owner&cloud=on`)
    await expect(page.getByTestId('needs-pc')).toHaveText('Sending messages needs your PC.')
    await expect(page.getByRole('textbox', { name: /message/i })).toHaveCount(0)
    await page.evaluate(() => (location.hash = '#/history'))
    await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible()
    await expect(page.getByTestId('history-tiles')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0)
    await page.evaluate(() => (location.hash = '#/settings'))
    await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
    expect(await refused(page)).toEqual([])
  })

  test('pausing the cloud bot ends it; switching it on opens chat again', async ({ page }) => {
    await open(page, 'chat', `${OFF}&remote=owner&cloud=on`)
    await strip(page).getByRole('button', { name: 'Pause bot' }).click()
    const dialog = page.getByRole('dialog', { name: 'Pause the cloud bot?' })
    await dialog.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByRole('heading', { name: 'Your streaming PC is off.' })).toBeVisible()
    await expect(page.getByText('The cloud bot is paused.')).toBeVisible()
    await page.getByRole('button', { name: 'Switch cloud bot on' }).click()
    await expect(strip(page)).toHaveAttribute('data-limited', 'yes')
    await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
  })

  test('paused at start: an owner can switch it on, a mod just waits', async ({ page }) => {
    await page.goto(`./?${OFF}&remote=owner&cloud=paused#/chat`)
    await expect(page.getByTestId('remote-gate')).toHaveAttribute('data-problem', 'cloud_paused')
    await expect(page.getByRole('button', { name: 'Switch cloud bot on' })).toBeVisible()
    await page.goto(`./?${OFF}&remote=mod&cloud=paused#/chat`)
    await expect(page.getByTestId('remote-gate')).toHaveAttribute('data-problem', 'pc_offline')
    await expect(page.getByRole('button', { name: 'Switch cloud bot on' })).toHaveCount(0)
  })

  test('the PC coming back hands over, and going off hands back', async ({ page }) => {
    await open(page, 'chat', `${OFF}&remote=owner&cloud=on`)
    await page.evaluate(() => window.__ferrocastDemo?.setRemotePc(true))
    await expect(strip(page)).toHaveText(/PC online/)
    await expect(page.getByTestId('needs-pc')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /panic/i }).first()).toBeVisible()
    await page.evaluate(() => window.__ferrocastDemo?.setRemotePc(false))
    await expect(strip(page)).toHaveAttribute('data-limited', 'yes')
    await expect(page.getByTestId('needs-pc')).toBeVisible()
  })

  test('no accessibility problems in the limited chat', async ({ page }) => {
    await open(page, 'chat', `${OFF}&remote=owner&cloud=on`)
    await expect(strip(page)).toBeVisible()
    const a11y = await new AxeBuilder({ page })
      .include('#main')
      .include('[data-testid="remote-strip"]')
      .analyze()
    expect(a11y.violations).toEqual([])
  })
})

test.describe('The moderation opt-in on the PC', () => {
  test('Turn on signs the bot in again with the moderator scopes', async ({ page }) => {
    await open(page, 'bot', 'autoplay=0&latency=0&pro=active&pro_features=on')
    const row = page.getByTestId('cloud-bot-twitch-moderation')
    await expect(row).toContainText('Let the cloud bot moderate when this PC is off')
    await row.getByRole('button', { name: 'Turn on' }).click()
    const link = page.getByTestId('cloud-bot-twitch-link')
    await expect(link.getByRole('link', { name: /Open Twitch/ })).toHaveAttribute(
      'href',
      /moderator%3Amanage%3Abanned_users/,
    )
    await link.getByRole('button', { name: 'Check again' }).click()
    await expect(row).toContainText('On.')
  })
})

test.describe('Offline remote mode at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const scheme of ['light', 'dark'] as const) {
    test(`the limited chat and the gate fit (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await open(page, 'chat', `${OFF}&remote=owner&cloud=on`)
      await expect(strip(page)).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
      await expect(tabs(page).getByRole('link')).toHaveCount(3)
      await expect(tabs(page).getByRole('link', { name: 'Insights' })).toBeVisible()
      await noSideScroll(page)
      await fitsVertically(page)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/chat-owner-${scheme}.png` })
      await page.evaluate(() => (location.hash = '#/moderation'))
      await expect(page.getByRole('heading', { name: 'Moderate from chat' })).toBeVisible()
      await noSideScroll(page)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/moderation-${scheme}.png` })
      await page.goto(`./?${OFF}&remote=owner&cloud=paused#/chat`)
      await expect(page.getByTestId('remote-gate')).toBeVisible()
      await noSideScroll(page)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/gate-paused-${scheme}.png` })
      await page.goto(`./?${OFF}&remote=mod&cloud=on#/chat`)
      await expect(strip(page)).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
      await expect(tabs(page).getByRole('link')).toHaveCount(2)
      await noSideScroll(page)
      await fitsVertically(page)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/chat-mod-${scheme}.png` })
    })
  }
})
