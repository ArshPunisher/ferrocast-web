import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fault, open } from './helpers'

// Pro "Dashboard anywhere": pairing on the PC (Settings), and the dashboard as a phone
// through Ferrocast's servers (`?remote=owner|mod`): the strip, hidden screens, PC offline.
const PRO = 'autoplay=0&latency=0&pro=active&pro_features=on'
const panel = (page: Page) => page.locator('#remote')

async function noSideScroll(page: Page): Promise<void> {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(wide).toBe(false)
}

test.describe('Dashboard anywhere on the PC', () => {
  test('hidden without the feature; one calm line on sale without Pro', async ({ page }) => {
    await open(page, 'settings/remote', 'autoplay=0&latency=0')
    await expect(page.locator('#s-appearance')).toBeVisible()
    await expect(panel(page)).toHaveCount(0)
    await open(page, 'settings/remote', 'autoplay=0&latency=0&pro=open&pro_features=on')
    await expect(panel(page).getByTestId('pro-line')).toContainText('part of Pro')
    await expect(panel(page).getByRole('button', { name: 'Add my phone' })).toHaveCount(0)
  })

  test('lists devices with their role, and removes one', async ({ page }) => {
    await open(page, 'settings/remote', PRO)
    const p = panel(page)
    const list = p.getByRole('list', { name: 'Paired devices' })
    await expect(list.locator('li')).toHaveCount(2)
    await expect(list.locator('li').filter({ hasText: 'Pixel 8' })).toContainText('Owner')
    await expect(list.locator('li').filter({ hasText: 'Meera (mod)' })).toContainText('Mod')
    await expect(p.getByTestId('remote-counts')).toHaveText('1 of 5 own devices, 1 of 10 mods')
    await expect(p.getByTestId('remote-tunnel')).toContainText('Phones can reach this PC')
    await expect(p.getByText('Timed someone out')).toBeVisible()
    await expect(p.getByText('by Meera (mod)').first()).toBeVisible()
    await p.getByRole('button', { name: 'Remove Meera (mod)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Remove Meera (mod)?' })
    await expect(dialog).toContainText('signed out at once')
    await dialog.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Meera (mod) removed.')).toBeVisible()
    await expect(list.locator('li')).toHaveCount(1)
    await expect(p.getByText('Removed', { exact: true })).toBeVisible()
  })

  test('Add my phone shows a QR code and a one-time link, and closes when it pairs', async ({
    page,
  }) => {
    await open(page, 'settings/remote', PRO)
    await panel(page).getByRole('button', { name: 'Add my phone' }).click()
    const dialog = page.getByRole('dialog', { name: 'Scan with your phone' })
    await expect(dialog.getByTestId('remote-qr')).toBeVisible()
    const link = dialog.getByRole('textbox', { name: 'Pairing link' })
    await expect(link).toHaveValue(
      /^https:\/\/remote\.clearcraftlabs\.com\/app\/#pair=[2-9A-Z]{10}$/,
    )
    await expect(dialog).toContainText(/Works once, for (10:00|9:5\d) more\./)
    // The phone opens the link: the dialog sees the new device and closes.
    await page.evaluate(() => window.__ferrocastDemo?.remoteDevices.pairNewest())
    await expect(page.getByText('My phone is paired.')).toBeVisible({ timeout: 8_000 })
    await expect(dialog).toBeHidden()
    await expect(
      panel(page).getByRole('list', { name: 'Paired devices' }).locator('li'),
    ).toHaveCount(3)
  })

  test('Invite a mod asks for a name first, then the link', async ({ page }) => {
    await open(page, 'settings/remote', PRO)
    await panel(page).getByRole('button', { name: 'Invite a mod' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite a mod' })
    await expect(dialog.getByTestId('remote-qr')).toHaveCount(0)
    await dialog.getByLabel('Mod’s name').fill('Kabir')
    await dialog.getByRole('button', { name: 'Make link' }).click()
    await expect(dialog.getByTestId('remote-qr')).toBeVisible()
    await expect(dialog).toContainText('They can chat-moderate, nothing else.')
    const a11y = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(a11y.violations).toEqual([])
  })

  test('the relay’s limit reaches the dialog in words', async ({ page }) => {
    await open(page, 'settings/remote', PRO)
    await fault(page, {
      path: '/api/v1/pro/remote/codes',
      status: 409,
      code: 'too_many_devices',
      message: 'This PC already has 5 of your own devices.',
      hint: 'Remove one in Settings › Dashboard anywhere first.',
    })
    await panel(page).getByRole('button', { name: 'Add my phone' }).click()
    const alert = page.getByRole('dialog').getByRole('alert')
    await expect(alert).toContainText('This PC already has 5 of your own devices.')
    await expect(alert).toContainText('Remove one')
  })
})

test.describe('The dashboard on a mod’s phone', () => {
  test('a strip on top, only chat and moderation, nothing greyed', async ({ page }) => {
    await open(page, 'chat', 'autoplay=0&latency=0&remote=mod')
    const strip = page.getByTestId('remote-strip')
    await expect(strip).toHaveText(/Through Ferrocast’s servers · PC online/)
    await expect(strip).toContainText('Mod')
    const nav = page.getByRole('navigation', { name: 'Main' }).first()
    for (const hidden of ['Home', 'Alerts', 'Settings', 'Bot', 'Tips', 'Overlays'])
      await expect(page.getByRole('link', { name: hidden, exact: true })).toHaveCount(0)
    await expect(nav).toBeAttached()
    // Chat: read and moderate, no composer, no events pane.
    await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Events' })).toHaveCount(0)
    await expect(page.getByPlaceholder(/Message|Say something/i)).toHaveCount(0)
    // Another screen's address opens chat instead.
    await page.evaluate(() => (location.hash = '#/settings'))
    await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0)
    // Moderation: panic and bans, not the filters or the panic plan.
    await page.evaluate(() => (location.hash = '#/moderation'))
    await expect(page.getByRole('heading', { name: /Panic mode/ })).toBeVisible()
    await expect(page.getByText('Followers-only chat')).toHaveCount(0)
    await expect(page.getByText('Words and phrases')).toHaveCount(0)
  })

  test('the strip says when the PC goes off and comes back', async ({ page }) => {
    await open(page, 'chat', 'autoplay=0&latency=0&remote=mod')
    const strip = page.getByTestId('remote-strip')
    await expect(strip).toHaveAttribute('data-online', 'yes')
    await page.evaluate(() => window.__ferrocastDemo?.setRemotePc(false))
    await expect(strip).toHaveText(/PC offline/)
    await expect(strip).toHaveAttribute('data-online', 'no')
    await page.evaluate(() => window.__ferrocastDemo?.setRemotePc(true))
    await expect(strip).toHaveText(/PC online/)
  })
})

test.describe('A phone only asks for what its role may do', () => {
  test('a mod’s phone boots chat and moderation without one refused call', async ({ page }) => {
    await open(page, 'chat', 'autoplay=0&latency=0&remote=mod')
    await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
    await page.evaluate(() => (location.hash = '#/moderation'))
    await expect(page.getByRole('heading', { name: /Panic mode/ })).toBeVisible()
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__ferrocastDemo?.remoteRefused)).toEqual([])
  })

  test('an owner’s phone boots home and settings without one refused call', async ({ page }) => {
    await open(page, 'home', 'autoplay=0&latency=0&remote=owner')
    await page.evaluate(() => (location.hash = '#/settings'))
    await expect(page.locator('#s-appearance')).toBeVisible()
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__ferrocastDemo?.remoteRefused)).toEqual([])
    // Installing an update needs the PC itself.
    await expect(page.locator('#s-updates').getByRole('button', { name: /^Update$/ })).toHaveCount(
      0,
    )
  })
})

test.describe('The relay closes a phone’s live socket', () => {
  test('removed (4401): pair again, and the token is forgotten', async ({ page }) => {
    await open(page, 'chat', 'autoplay=0&latency=0&remote=mod')
    await page.evaluate(() => localStorage.setItem('fc-remote', '{"api":"x","token":"t"}'))
    await page.evaluate(() => window.__ferrocastDemo?.closeRemoteLive(4401))
    await expect(page.getByRole('heading', { name: 'Pair this phone' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('fc-remote'))).toBeNull()
  })

  test('Pro paused (4402): says so and keeps the phone paired', async ({ page }) => {
    await open(page, 'chat', 'autoplay=0&latency=0&remote=mod')
    await page.evaluate(() => localStorage.setItem('fc-remote', '{"api":"x","token":"t"}'))
    await page.evaluate(() => window.__ferrocastDemo?.closeRemoteLive(4402))
    await expect(page.getByRole('heading', { name: 'Pro is paused' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('fc-remote'))).not.toBeNull()
  })

  test('too many tabs (4409): says it’s open elsewhere', async ({ page }) => {
    await open(page, 'chat', 'autoplay=0&latency=0&remote=owner')
    await page.evaluate(() => window.__ferrocastDemo?.closeRemoteLive(4409))
    await expect(page.getByRole('heading', { name: 'Open in another tab' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use it here' })).toBeVisible()
  })

  test('fell behind (4408): reconnects by itself', async ({ page }) => {
    await open(page, 'chat', 'autoplay=0&latency=0&remote=mod')
    await page.evaluate(() => window.__ferrocastDemo?.closeRemoteLive(4408))
    await expect(page.getByTestId('remote-strip')).toHaveText(/PC online/)
    await expect(page.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
    await expect(page.getByTestId('remote-gate')).toHaveCount(0)
  })
})

test.describe('The dashboard on the streamer’s phone', () => {
  test('everything but accounts, secrets, Pro, export and import', async ({ page }) => {
    await open(page, 'settings', 'autoplay=0&latency=0&remote=owner')
    await expect(page.getByTestId('remote-strip')).toContainText('PC online')
    await expect(page.getByTestId('remote-strip')).not.toContainText('Mod')
    await expect(page.locator('#s-appearance')).toBeVisible()
    for (const gone of ['#s-accounts', '#s-discord', '#s-data', '#s-pro', '#s-advanced', '#remote'])
      await expect(page.locator(gone)).toHaveCount(0)
    const sections = page.getByRole('navigation', { name: 'Settings sections' })
    await expect(sections.getByRole('link', { name: 'Accounts' })).toHaveCount(0)
    await expect(sections.getByRole('link', { name: 'Appearance' })).toBeVisible()
    await page.evaluate(() => (location.hash = '#/alerts'))
    await expect(page.getByRole('heading', { name: 'Alerts', exact: true }).first()).toBeVisible()
  })
})

test.describe('Dashboard anywhere at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the mod phone fits, with the strip and two tabs', async ({ page }) => {
    await open(page, 'chat', 'autoplay=0&latency=0&remote=mod')
    await expect(page.getByTestId('remote-strip')).toBeVisible()
    const tabs = page.getByRole('navigation', { name: 'Main' }).last()
    await expect(tabs.getByRole('link')).toHaveCount(2)
    await expect(tabs.getByRole('link', { name: 'Chat' })).toBeVisible()
    await expect(tabs.getByRole('link', { name: 'Mod' })).toBeVisible()
    await noSideScroll(page)
  })

  test('the pairing dialog fits a phone', async ({ page }) => {
    await open(page, 'settings/remote', PRO)
    await panel(page).getByRole('button', { name: 'Add my phone' }).click()
    const qr = page.getByRole('dialog').getByTestId('remote-qr')
    await expect(qr).toBeVisible()
    const box = await qr.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 375).toBe(true)
    await noSideScroll(page)
  })
})

test.describe('A real phone page (config from the relay, relay answers mocked)', () => {
  async function asPhone(page: Page, me: 'none' | 'offline' | 'unpaired'): Promise<string[]> {
    const calls: string[] = []
    await page.addInitScript(() => {
      window.__FERROCAST__ = { api: `${location.origin}/r`, remote: true }
    })
    await page.route('**/r/v1/**', async (route) => {
      const url = new URL(route.request().url())
      calls.push(`${route.request().method()} ${url.pathname}`)
      if (url.pathname.endsWith('/v1/pair')) {
        const code = (route.request().postDataJSON() as { code: string }).code
        if (code !== 'K7M2QXABCD')
          return route.fulfill({
            status: 404,
            json: {
              error: {
                code: 'not_found',
                message: 'That link has expired or was already used.',
                hint: 'Make a new one on the streaming PC: Settings › Dashboard anywhere.',
              },
            },
          })
        return route.fulfill({
          json: {
            token: 'fcr_dv_1.s',
            device_id: 'dv_1',
            role: 'mod',
            name: 'Kabir',
            expires_at: 1,
          },
        })
      }
      if (me === 'unpaired')
        return route.fulfill({
          status: 401,
          json: {
            error: {
              code: 'unauthorized',
              message: 'This device isn’t paired any more.',
              hint: null,
            },
          },
        })
      return route.fulfill({
        json: { device_id: 'dv_1', name: 'Kabir', role: 'mod', expires_at: 1, pc_online: false },
      })
    })
    return calls
  }

  test('not paired yet: says where to scan', async ({ page }) => {
    await asPhone(page, 'none')
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Pair this phone' })).toBeVisible()
    await expect(page.getByText('Settings › Dashboard anywhere')).toBeVisible()
    await noSideScroll(page)
  })

  test('a link pairs once, then a PC that is off says so with the strip', async ({ page }) => {
    const calls = await asPhone(page, 'offline')
    await page.goto('./#pair=K7M2QXABCD')
    await expect(page.getByRole('heading', { name: 'Your streaming PC is off.' })).toBeVisible()
    await expect(page.getByTestId('remote-strip')).toHaveText(/PC offline/)
    expect(calls).toEqual(['POST /r/v1/pair', 'GET /r/v1/me'])
    expect(await page.evaluate(() => location.hash)).toBe('#/')
    expect(await page.evaluate(() => localStorage.getItem('fc-remote'))).toContain('fcr_dv_1.s')
  })

  test('a used link: the relay’s words, and the code is dropped', async ({ page }) => {
    await asPhone(page, 'none')
    await page.goto('./#pair=USEDCODE22')
    await expect(
      page.getByRole('heading', { name: 'That link has expired or was already used.' }),
    ).toBeVisible()
    await expect(page.getByText('Make a new one on the streaming PC')).toBeVisible()
    expect(await page.evaluate(() => location.hash)).toBe('')
  })

  test('Pro paused (402): a calm screen, and the token stays', async ({ page }) => {
    await page.addInitScript(() => {
      window.__FERROCAST__ = { api: `${location.origin}/r`, remote: true }
      localStorage.setItem(
        'fc-remote',
        JSON.stringify({ api: `${location.origin}/r`, token: 'fcr_dv_1.s' }),
      )
    })
    await page.route('**/r/v1/me', (route) =>
      route.fulfill({
        status: 402,
        json: { error: { code: 'pro_required', message: 'Pro is paused.', hint: null } },
      }),
    )
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Pro is paused' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('fc-remote'))).toContain('fcr_dv_1.s')
  })

  test('PC off: looks again quietly, nothing on screen moves until it changes', async ({
    page,
  }) => {
    await page.clock.install()
    const calls = await asPhone(page, 'offline')
    await page.addInitScript(() =>
      localStorage.setItem(
        'fc-remote',
        JSON.stringify({ api: `${location.origin}/r`, token: 'fcr_dv_1.s' }),
      ),
    )
    await page.goto('./')
    const heading = page.getByRole('heading', { name: 'Your streaming PC is off.' })
    await expect(heading).toBeVisible()
    const button = page.getByRole('button', { name: 'Check now' })
    await button.focus()
    await page.evaluate(() => {
      ;(window as unknown as { gateEl: Element | null }).gateEl = document.querySelector(
        '[data-testid="remote-gate"]',
      )
    })
    await page.clock.runFor(31_000)
    await expect.poll(() => calls.filter((c) => c === 'GET /r/v1/me').length).toBeGreaterThan(2)
    // The same element, still focused: no splash, no remount, nothing announced again.
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { gateEl: Element | null }).gateEl ===
          document.querySelector('[data-testid="remote-gate"]'),
      ),
    ).toBe(true)
    await expect(button).toBeFocused()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('a removed phone forgets its token', async ({ page }) => {
    await asPhone(page, 'unpaired')
    await page.addInitScript(() =>
      localStorage.setItem(
        'fc-remote',
        JSON.stringify({ api: `${location.origin}/r`, token: 'fcr_dv_1.s' }),
      ),
    )
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Pair this phone' })).toBeVisible()
  })
})
