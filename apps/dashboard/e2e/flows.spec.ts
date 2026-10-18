import { expect, test } from '@playwright/test'
import { demo, open } from './helpers'

test.describe('home', () => {
  test('shows connections, the queue, stats and recent events', async ({ page }) => {
    await open(page)
    await expect(
      page.getByRole('heading', { name: /You’re live|Ready when you are/ }),
    ).toBeVisible()
    const strip = page.getByRole('list', { name: 'Connections' }).first()
    for (const p of ['Twitch', 'YouTube', 'Kick', 'OBS'])
      await expect(strip.getByRole('link', { name: new RegExp(`^${p}:`) })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Alert queue' })).toBeVisible()
    await expect(page.getByText('Watching now')).toBeVisible()
    await expect(page.getByText('BitBaron')).toBeVisible()
  })

  test('test alert is two clicks and plays in the queue', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Test alert' }).click()
    await page.getByRole('menuitem', { name: /Tip/ }).click()
    await expect(page.getByText(/Test tip sent/)).toBeVisible()
    await expect(page.getByText('Asha tipped ₹500!').first()).toBeVisible()
  })

  test('pause and resume alerts in one click each', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Pause alerts' }).click()
    await expect(page.getByText(/Paused\. Alerts keep arriving/)).toBeVisible()
    await page.getByRole('button', { name: 'Resume alerts' }).click()
    await expect(page.getByText(/Paused\. Alerts keep arriving/)).toBeHidden()
  })

  test('why did this not alert explains Twitch hiding a follow', async ({ page }) => {
    await open(page, 'chat')
    const row = page.getByRole('listitem').filter({ hasText: 'quietfan_2009' })
    await row.hover()
    await row.getByRole('button', { name: /Why did or didn't/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Twitch hid this follow')
  })

  test('copies the overlay URL', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permission is Chromium-only in Playwright')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page)
    await page.getByRole('button', { name: 'Copy overlay URL' }).click()
    await expect(page.getByText(/Copied the “Main scene” overlay URL/)).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /\/o\/[0-9a-f]{32}\/$/,
    )
  })
})

test.describe('chat', () => {
  test('sends a message to every platform', async ({ page }) => {
    await open(page, 'chat')
    const box = page.getByRole('textbox', { name: 'Message' })
    await box.fill('hello from the dashboard')
    await box.press('Enter')
    await expect(
      page.getByRole('log', { name: 'Merged chat' }).getByText('hello from the dashboard'),
    ).toHaveCount(3)
  })

  test('reply goes only to the source platform', async ({ page }) => {
    await open(page, 'chat')
    const line = page
      .getByRole('log', { name: 'Merged chat' })
      .getByRole('listitem')
      .filter({ has: page.getByRole('img', { name: 'YouTube' }) })
      .last()
    await line.getByRole('button').first().focus()
    await line.getByRole('button', { name: 'Reply on the same platform' }).click()
    await expect(page.getByText(/on YouTube only/)).toBeVisible()
    await page.getByRole('textbox', { name: 'Message' }).fill('thanks!')
    await page.getByRole('textbox', { name: 'Message' }).press('Enter')
    await expect(page.getByRole('log', { name: 'Merged chat' }).getByText('thanks!')).toHaveCount(1)
  })

  test('ban everywhere in three clicks', async ({ page }) => {
    await open(page, 'chat')
    const line = page
      .getByRole('log', { name: 'Merged chat' })
      .getByRole('listitem')
      .filter({ hasNot: page.getByText('Streamer') })
      .last()
    await line.getByRole('button').first().focus()
    await line.getByRole('button', { name: 'Ban everywhere' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Ban everywhere' }).click()
    await expect(page.getByText(/is banned on Twitch, YouTube, Kick/)).toBeVisible()
  })

  test('held messages are marked for review', async ({ page }) => {
    await open(page, 'chat')
    await demo(page, '(d) => d.holdSpam("twitch")')
    await expect(page.getByText('Held for review')).toBeVisible()
  })

  test('viewer card saves a note', async ({ page }) => {
    await open(page, 'chat')
    const name = page
      .getByRole('log', { name: 'Merged chat' })
      .getByRole('listitem')
      .last()
      .getByRole('button')
      .first()
    await name.click()
    const note = page.getByRole('dialog').getByLabel(/Note/)
    await note.fill('Regular from Sunday streams')
    await note.blur()
    await expect(page.getByText('Note saved.')).toBeVisible()
  })
})

test.describe('alerts', () => {
  test('editing the headline updates the preview and saves', async ({ page }) => {
    await open(page, 'alerts/follow')
    const headline = page.getByLabel('Headline', { exact: true })
    await headline.fill('{name} joined the crew!')
    await expect(page.getByText('Unsaved changes')).toBeVisible()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/“Follows” saved/)).toBeVisible()
  })

  test('a broken template is explained and cannot be saved', async ({ page }) => {
    await open(page, 'alerts/follow')
    await page.getByLabel('Headline', { exact: true }).fill('{name followed')
    await expect(page.getByText(/is never closed/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  })

  test('add a look for big tips', async ({ page }) => {
    await open(page, 'alerts/tip')
    await page.getByRole('button', { name: 'Add a look' }).click()
    await expect(page.getByLabel('Use this look when')).toBeVisible()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/“Tips” saved/)).toBeVisible()
  })

  test('turning a rule off is one click from its editor', async ({ page }) => {
    await open(page, 'alerts')
    await page
      .getByRole('navigation', { name: 'Alert rules' })
      .getByRole('link', { name: /Raids/ })
      .click()
    await page.getByRole('switch', { name: 'Raids alert' }).click()
    await expect(page.getByText(/Raids off/)).toBeVisible()
  })

  test('upload errors state the limit (413) and allowed types (415)', async ({ page }) => {
    await open(page, 'alerts/follow')
    const input = page.locator('input[type=file]').first()
    await input.setInputFiles({
      name: 'long.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 10),
    })
    await expect(page.getByText('Sounds can be up to 5 MB.')).toBeVisible()
    await input.setInputFiles({
      name: 'tool.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ'),
    })
    await expect(page.getByText('That file type isn’t supported.')).toBeVisible()
  })
})

test.describe('overlays', () => {
  test('add to OBS is one click', async ({ page }) => {
    await open(page, 'overlays')
    await page.getByRole('button', { name: 'Add to OBS' }).first().click()
    await expect(page.getByText('Added to OBS.')).toBeVisible()
  })

  test('when OBS is not connected it falls back to the 3-step guide', async ({ page }) => {
    await open(page, 'overlays')
    await demo(
      page,
      `(d) => d.addFault({ path: /add-to-obs/, status: 422, message: 'OBS isn’t connected.' })`,
    )
    await page.getByRole('button', { name: 'Add to OBS' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Add it to OBS by hand' })).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('Browser')
  })

  test('URLs are blurred until shown, and can be regenerated', async ({ page }) => {
    await open(page, 'overlays')
    await expect(page.getByText('Overlay URL hidden').first()).toBeAttached()
    await page.getByRole('button', { name: 'More for Main scene' }).click()
    await page.getByRole('menuitem', { name: /New URL/ }).click()
    await page.getByRole('button', { name: 'Make new URL' }).click()
    await expect(page.getByText('New URL ready. Update it in OBS.')).toBeVisible()
  })

  test('create an overlay, then name conflicts are explained (409)', async ({ page }) => {
    await open(page, 'overlays')
    await page.getByRole('button', { name: 'New overlay' }).click()
    await page.getByLabel('Name', { exact: true }).fill('Main scene')
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText(/already have an overlay called/)).toBeVisible()
    await page.getByLabel('Name', { exact: true }).fill('Starting soon')
    await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('heading', { name: 'Starting soon' })).toBeVisible()
  })

  test('layout editor: keyboard moves a widget and saving works', async ({ page }) => {
    await open(page, 'overlays/ov-brb')
    const w = page.getByRole('button', { name: /Alerts widget at/ })
    await w.focus()
    await w.press('ArrowRight')
    await w.press('Shift+ArrowDown')
    await expect(w).toHaveAccessibleName(/at 568, 120/)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Overlay saved. OBS updates by itself.')).toBeVisible()
  })

  test('layout editor: the live view renders the real overlay', async ({ page }) => {
    await open(page, 'overlays/ov-main')
    await expect
      .poll(() =>
        page.evaluate(() => {
          const host = [...document.querySelectorAll('div')].find((d) =>
            d.shadowRoot?.querySelector('.fc-ov'),
          )
          const r = host?.getBoundingClientRect()
          return r ? Math.round(r.height) : 0
        }),
      )
      .toBeGreaterThan(100)
  })

  test('layout editor: drag a widget', async ({ page }) => {
    await open(page, 'overlays/ov-brb')
    const w = page.getByRole('button', { name: /Alerts widget at/ })
    const box = await w.boundingBox()
    if (!box) throw new Error('no box')
    await page.mouse.move(box.x + 30, box.y + 30)
    await page.mouse.down()
    await page.mouse.move(box.x + 130, box.y + 80, { steps: 5 })
    await page.mouse.up()
    await expect(page.getByText(/Unsaved layout/)).toBeVisible()
  })
})

test.describe('moderation and bot', () => {
  test('panic mode: one click on, one click off, and the hotkey', async ({ page }) => {
    await open(page, 'moderation')
    await page.getByRole('button', { name: 'Start panic mode' }).click()
    await expect(page.getByText('Panic mode is on.').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Panic on/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.keyboard.press('Control+Alt+Shift+KeyP')
    await expect(page.getByRole('button', { name: /^Panic/ }).first()).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('panic on, off, on: one toast with the latest state and no banners', async ({ page }) => {
    await open(page, 'moderation')
    const panic = page.getByRole('button', { name: /^(Start panic mode|Panic)/ }).first()
    for (const pressed of ['true', 'false', 'true']) {
      await panic.click()
      await expect(panic).toHaveAttribute('aria-pressed', pressed)
    }
    const toasts = page.getByRole('region', { name: 'Notifications' })
    await expect(toasts.getByText(/Panic mode is on/)).toHaveCount(1)
    await expect(toasts.getByText(/Panic mode is off/)).toHaveCount(0)
    // Nothing about panic anywhere else on the page: no stacked top banners.
    await expect(page.getByText(/Panic mode is (on|off)/)).toHaveCount(1)
  })

  test('the OBS chip says Connected in words, like the platforms', async ({ page }) => {
    await open(page, 'home')
    const chip = page.locator('header a[href$="settings/obs"]').first()
    await expect(chip).toContainText('Connected')
  })

  test('unban from the shared list', async ({ page }) => {
    await open(page, 'moderation')
    const row = page.getByRole('listitem').filter({ hasText: 'raid_bot_4421' })
    await row.getByRole('button', { name: 'Unban' }).click()
    await expect(page.getByText(/raid_bot_4421 is unbanned/)).toBeVisible()
    await expect(row).toBeHidden()
  })

  test('a bad command name is explained under the field (400)', async ({ page }) => {
    await open(page, 'bot')
    await page.getByRole('button', { name: 'New command' }).click()
    await page.getByLabel('Command', { exact: true }).fill('discord')
    await page.getByLabel('Reply', { exact: true }).fill('join us')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(/^Commands start with !/)).toBeVisible()
    await page.getByLabel('Command', { exact: true }).fill('!discord2')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('!discord2')).toBeVisible()
  })

  test('a duplicate command is a friendly conflict (409)', async ({ page }) => {
    await open(page, 'bot')
    await page.getByRole('button', { name: 'New command' }).click()
    await page.getByLabel('Command', { exact: true }).fill('!specs')
    await page.getByLabel('Reply', { exact: true }).fill('dup')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(/!specs already exists/)).toBeVisible()
  })
})

test.describe('tips and settings', () => {
  test('tip page promises the legal name stays private', async ({ page }) => {
    await open(page, 'tips')
    await expect(page.getByText(/legal name stays off the page/)).toBeVisible()
    await page.getByLabel('Name viewers see').fill('')
    await page.getByRole('button', { name: 'Save changes' }).first().click()
    await expect(page.getByText('The display name must be 1 to 40 characters.')).toBeVisible()
  })

  test('export downloads a ferropack', async ({ page }) => {
    await open(page, 'settings/data')
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    expect((await dl).suggestedFilename()).toMatch(/\.ferropack$/)
  })

  test('importing a Ferrocast file shows a report of what came over', async ({ page }) => {
    await open(page, 'settings/data')
    await page.locator('input[type=file]').setInputFiles({
      name: 'old-pc.ferropack',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK'),
    })
    await expect(page.getByRole('dialog', { name: 'Import finished' })).toContainText('commands')
  })

  test('OBS wrong password is a clear 422', async ({ page }) => {
    await open(page, 'settings/obs')
    await page.getByLabel('Password', { exact: true }).fill('wrong')
    await page.getByRole('button', { name: 'Connect OBS' }).click()
    await expect(page.getByText(/OBS rejected that password/)).toBeVisible()
  })

  test('never update while live', async ({ page }) => {
    await open(page, 'settings/updates')
    await expect(page.getByRole('button', { name: 'After stream' })).toBeDisabled()
  })

  test('the main currency is saved and the TTS minimum uses it', async ({ page }) => {
    await open(page, 'settings/appearance')
    await page.getByLabel('Main currency').selectOption('USD')
    await expect(page.getByLabel('Main currency')).toHaveValue('USD')
    // The TTS minimum's hint follows straight away, without a reload.
    await expect(page.getByText('In USD (set in Appearance).')).toBeVisible()
    await page.getByRole('link', { name: 'Text-to-speech' }).click()
    await expect(page.getByLabel('Main currency')).toHaveValue('USD')
  })
})

test.describe('first run', () => {
  test('connect, pick a look, add to OBS, done', async ({ page }) => {
    // Waits on the simulated sign-in (a few seconds), so give slow CI runners room.
    test.slow()
    await open(page, 'home', 'firstrun&autoplay=0&latency=0')
    await expect(page.getByRole('heading', { name: 'Connect where you stream' })).toBeVisible()
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Twitch' })
      .getByRole('button', { name: 'Connect' })
      .click()
    await expect(page.getByText('FRRO-4821')).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('Connected', { timeout: 10_000 })
    // The dialog closes itself a moment after the account connects.
    await expect(page.getByRole('dialog', { name: /Twitch/ })).toBeHidden({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByText('Arcade').click()
    await page.getByRole('button', { name: 'Use this look' }).click()
    await expect(page.getByRole('heading', { name: 'Add it to OBS' })).toBeVisible()
    await page.getByRole('button', { name: 'Add to OBS' }).click()
    await expect(page.getByRole('dialog', { name: 'Add it to OBS by hand' })).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: 'I’ll do it later' }).click()
    await expect(
      page.getByRole('heading', { name: /You’re live|Ready when you are/ }),
    ).toBeVisible()
  })
})
