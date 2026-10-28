import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { demo, open, settled } from './helpers'

// Go live everywhere (Studio's first tab) in the demo engine: setup, the upload check, a
// server of your own, and the health lines while OBS streams.

const panel = (page: Page, name: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })

/** The demo's OBS starts out streaming; most tests want it stopped first. */
async function obsStopped(page: Page) {
  await demo(page, '(d) => { d.studio.obs.streaming = false }')
}

test.describe('go live everywhere', () => {
  test('is Studio’s first tab and lists the platforms', { tag: '@smoke' }, async ({ page }) => {
    await open(page, 'studio')
    await expect(page.getByRole('radio', { name: 'Go live' })).toBeChecked()
    const p = panel(page, 'Your platforms')
    await expect(p.getByText('Twitch', { exact: true })).toBeVisible()
    await expect(p.getByRole('switch', { name: 'Stream to Twitch' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(p.getByRole('switch', { name: 'Stream to Kick' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    await expect(p.getByText('Going to 2 places.')).toBeVisible()
    await expect(panel(page, 'Set up once').getByText('OBS is connected')).toBeVisible()
  })

  test('set up once: point OBS here, test the upload, then put OBS back', async ({ page }) => {
    await open(page, 'studio/golive')
    const setup = panel(page, 'Set up once')
    // While OBS streams, its setting can't change.
    await expect(setup.getByRole('button', { name: 'Point OBS at Ferrocast' })).toBeDisabled()
    await obsStopped(page)
    await expect(setup.getByRole('button', { name: 'Point OBS at Ferrocast' })).toBeEnabled({
      timeout: 8000,
    })
    await setup.getByRole('button', { name: 'Point OBS at Ferrocast' }).click()
    await expect(page.getByText('OBS now streams to Ferrocast.')).toBeVisible()
    await setup.getByRole('button', { name: 'Test upload' }).click()
    const upload = panel(page, 'Your upload')
    await expect(
      upload.getByText('Your upload is 24 Mbps. 2 platforms fit, using 12 Mbps.'),
    ).toBeVisible()
    // Platforms by name; servers' addresses stay out of sight.
    await expect(upload.getByRole('cell', { name: 'YouTube' })).toBeVisible()
    await expect(upload.getByText('a.rtmps.youtube.com')).toHaveCount(0)
    // Done: the steps shrink to one line with the way back.
    const obs = panel(page, 'OBS')
    await expect(obs.getByText('OBS sends to Ferrocast')).toBeVisible()
    await obs.getByRole('button', { name: 'Put OBS back to Twitch' }).click()
    await expect(page.getByText('OBS streams to Twitch again.')).toBeVisible()
    await expect(panel(page, 'Set up once')).toBeVisible()
  })

  test('a slow upload says what fits, in words', async ({ page }) => {
    await open(page, 'studio/golive')
    await demo(page, '(d) => d.setGoLive({ upload_kbps: 9000 })')
    await panel(page, 'Set up once').getByRole('button', { name: 'Test upload' }).click()
    await expect(
      panel(page, 'Your upload').getByText(
        '2 platforms need 12 Mbps; you have 9.0 Mbps. Send 1 platform at this quality, or all 2 at about 3.6 Mbps each (lower the bitrate in OBS).',
      ),
    ).toBeVisible()
  })

  test('a server of your own: checked, added, and removed after asking', async ({ page }) => {
    await open(page, 'studio/golive')
    await page.getByRole('button', { name: 'Add a destination' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a destination' })
    await dialog.getByLabel('Name').fill('Backup PC')
    // https:// is a WebRTC server now (2.1), so a scheme nothing speaks is the wrong one.
    await dialog.getByLabel('Server').fill('ftp://example.com/live')
    await dialog.getByLabel('Stream key', { exact: true }).fill('abc123')
    await dialog.getByRole('button', { name: 'Add server' }).click()
    await expect(dialog.getByText(/must start with rtmp:\/\/, rtmps:\/\//)).toBeVisible()
    await dialog.getByLabel('Server').fill('rtmp://backup.local/live')
    await dialog.getByRole('button', { name: 'Add server' }).click()
    await expect(page.getByText('Backup PC added.')).toBeVisible()
    const p = panel(page, 'Your platforms')
    await expect(p.getByText('backup.local · video only')).toBeVisible()
    await p.getByRole('button', { name: 'Remove Backup PC' }).click()
    const ask = page.getByRole('dialog', { name: 'Remove Backup PC?' })
    await ask.getByRole('button', { name: 'Keep it' }).click()
    await expect(p.getByText('backup.local · video only')).toBeVisible()
    await p.getByRole('button', { name: 'Remove Backup PC' }).click()
    await page
      .getByRole('dialog', { name: 'Remove Backup PC?' })
      .getByRole('button', { name: 'Remove' })
      .click()
    await expect(page.getByText('Backup PC removed.')).toBeVisible()
    await expect(p.getByText('backup.local · video only')).toHaveCount(0)
  })

  test('while live: a health line per platform, and one that reconnects can be stopped', async ({
    page,
  }) => {
    await open(page, 'studio/golive')
    await demo(page, '(d) => { d.setGoLive({ points_here: true }); d.studio.obs.streaming = true }')
    await panel(page, 'Your platforms').getByRole('switch', { name: 'Stream to Kick' }).click()
    const live = page.locator('#golive-live')
    await expect(live.getByText('Twitch: Live')).toBeVisible({ timeout: 8000 })
    await expect(live.getByText(/Kick: Reconnecting, try \d/)).toBeVisible()
    // The pill at the top says so from any page.
    await expect(
      page.getByRole('link', { name: /Kick:.*Go live: stream reconnecting/ }),
    ).toBeVisible()
    await live.getByRole('button', { name: 'Stop trying' }).click()
    await expect(
      panel(page, 'Your platforms').getByRole('switch', { name: 'Stream to Kick' }),
    ).toHaveAttribute('aria-checked', 'false')
    await expect(live.getByText(/Kick:/)).toHaveCount(0)
  })

  test('a weak upload pauses the bottom platform; Resume now and the switch', async ({ page }) => {
    test.slow()
    await open(page, 'studio/golive')
    await demo(
      page,
      '(d) => { d.setGoLive({ points_here: true, upload_kbps: 9000 }); d.studio.obs.streaming = true }',
    )
    const live = page.locator('#golive-live')
    await expect(live.getByText('YouTube: Paused')).toBeVisible({ timeout: 20_000 })
    await expect(
      live.getByText('Your upload dipped, so this paused to keep Twitch smooth.', { exact: false }),
    ).toBeVisible()
    await expect(live.getByText(/Back in \d+ s at the earliest\./)).toBeVisible()
    await expect(live.getByText(/1 of 2 live · 1 paused/)).toBeVisible()
    await expect(
      page.getByRole('link', { name: /YouTube:.*stream paused to save upload/ }),
    ).toBeVisible()
    await live.getByRole('button', { name: 'Resume now' }).click()
    await expect(page.getByText('YouTube is coming back.')).toBeVisible()
    await expect(live.getByText('YouTube: Live')).toBeVisible()
    const toggle = panel(page, 'Your platforms').getByRole('switch', { name: 'Upload protection' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(page.getByText('Upload protection is off.')).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  test('Aitum Multistream: a note before going live, a warning while both send', async ({
    page,
  }) => {
    test.slow()
    await open(page, 'studio/golive')
    await demo(
      page,
      `(d) => d.setGoLive({ aitum: [
        { name: 'Twitch Output', platform: 'twitch', live: true },
        { name: 'Kick', platform: 'kick', live: false } ] })`,
    )
    // Not live yet: Kick is unticked, so only Twitch clashes.
    await obsStopped(page)
    // Switching tabs reads Go live again (with the plugin now in the pretend OBS).
    const section = page.getByRole('radiogroup', { name: 'Studio section' })
    await section.getByText('Show', { exact: true }).click()
    await section.getByText('Go live', { exact: true }).click()
    const note = page.getByRole('region', { name: 'Aitum Multistream' })
    await expect(
      note.getByText('Aitum Multistream is also set up to send to Twitch.'),
    ).toBeVisible()
    await note.getByRole('button', { name: 'Show me where in OBS' }).click()
    await expect(note.getByText(/Docks menu, Aitum Multistream/)).toBeVisible()
    await note.getByRole('button', { name: 'I use it on purpose' }).click()
    await expect(note).toHaveCount(0)
    // Live, with Aitum's Twitch output sending too: a warning, and Ferrocast's copy can stop.
    await demo(page, '(d) => { d.setGoLive({ points_here: true }); d.studio.obs.streaming = true }')
    const live = page.locator('#golive-live')
    await expect(live.getByText('Twitch is getting your stream twice')).toBeVisible({
      timeout: 20_000,
    })
    await live.getByRole('button', { name: 'Stop Ferrocast’s copy' }).click()
    await expect(
      panel(page, 'Your platforms').getByRole('switch', { name: 'Stream to Twitch' }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  test('vertical: point Aitum Vertical here, tick Shorts live, and it goes live on its own', async ({
    page,
  }) => {
    await open(page, 'studio/vertical')
    const source = panel(page, 'Picture')
    await expect(source.getByText('Aitum Vertical found')).toBeVisible()
    await source.getByRole('button', { name: 'Point Aitum Vertical at Ferrocast' }).click()
    await expect(page.getByText('Aitum Vertical now streams to Ferrocast.')).toBeVisible()
    await expect(source.getByText('Aitum Vertical sends to Ferrocast')).toBeVisible()
    const where = panel(page, 'Where it goes')
    await where.getByRole('switch', { name: 'Stream to YouTube Shorts live' }).click()
    await expect(where.getByText('Going to 1 place.')).toBeVisible()
    // The normal list doesn't show it; the Go live tab is for the normal stream.
    await demo(page, '(d) => d.setGoLive({ vertical: { streaming: true } })')
    await expect(page.locator('#vertical-live').getByText('YouTube Shorts live: Live')).toBeVisible(
      {
        timeout: 8000,
      },
    )
    await expect(source.getByText(/1080 × 1920 at 30 fps coming in/)).toBeVisible()
    await page
      .getByRole('radiogroup', { name: 'Studio section' })
      .getByText('Go live', { exact: true })
      .click()
    await expect(
      panel(page, 'Your platforms').getByRole('switch', { name: 'Stream to YouTube Shorts live' }),
    ).toHaveCount(0)
  })

  test('vertical cut from the stream: mark the boxes, pick a layout, save, and it runs', async ({
    page,
  }) => {
    await open(page, 'studio/vertical')
    const source = panel(page, 'Picture')
    await source.getByText('Cut it from your stream').click()
    await expect(
      page.getByText('Ferrocast cuts the vertical picture from your stream.'),
    ).toBeVisible()
    const editor = panel(page, 'Vertical layout')
    await expect(editor.getByRole('img', { name: 'What’s on air' })).toBeVisible()
    const camera = editor.getByRole('group', { name: /Camera box/ })
    const before = await camera.evaluate((el) => (el as HTMLElement).style.left)
    await camera.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    expect(await camera.evaluate((el) => (el as HTMLElement).style.left)).not.toBe(before)
    await editor.getByText('Game only').click()
    await expect(editor.getByRole('group', { name: /Camera box/ })).toHaveCount(0)
    await editor.getByText('Camera on top').click()
    await editor.getByRole('button', { name: 'Save layout' }).click()
    await expect(page.getByText('Layout saved.')).toBeVisible()
    await expect(editor.getByText('Tick a place on the left for it to start.')).toBeVisible()
    await panel(page, 'Where it goes')
      .getByRole('switch', { name: 'Stream to YouTube Shorts live' })
      .click()
    await demo(page, '(d) => { d.setGoLive({ points_here: true }); d.studio.obs.streaming = true }')
    await expect(
      editor.getByText('Making the vertical picture on your graphics card.'),
    ).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('YouTube Shorts live: Live')).toBeVisible({ timeout: 8000 })
  })

  test('cutting fetches ffmpeg the first time, with progress', async ({ page }) => {
    await open(page, 'studio/vertical')
    await demo(page, '(d) => d.setGoLive({ ffmpeg_missing: true })')
    await panel(page, 'Picture').getByText('Cut it from your stream').click()
    const editor = panel(page, 'Vertical layout')
    await expect(editor.getByText(/Getting ffmpeg, once \(\d+%\)/)).toBeVisible()
    await expect(editor.getByText('Tick a place on the left for it to start.')).toBeVisible({
      timeout: 8000,
    })
  })

  test('Advanced settings: the fold is remembered and adds the rule, the settings card and the numbers', async ({
    page,
  }) => {
    await open(page, 'studio/golive')
    await expect(page.locator('#golive-advanced')).toHaveCount(0)
    await page.getByRole('button', { name: 'Advanced settings' }).click()
    const card = panel(page, 'Advanced settings')
    await expect(card).toBeVisible()
    // The rule as a sentence: a bad number says so, a good one saves.
    const platforms = panel(page, 'Your platforms')
    await platforms.getByLabel('Slow share').fill('99')
    await expect(platforms.getByRole('alert')).toHaveText('50 to 95 percent.')
    await platforms.getByLabel('Slow share').fill('60')
    await platforms.getByRole('button', { name: 'Save rule' }).click()
    await expect(page.getByText('Upload protection’s rule saved.')).toBeVisible()
    // Per platform: a server of its own and retry timing.
    await card.getByRole('tab', { name: 'Twitch' }).click()
    await card.getByLabel('Server').fill('https://nope')
    await expect(card.getByRole('alert')).toContainText('rtmp:// or rtmps://')
    await card.getByLabel('Server').fill('rtmps://live-fra.twitch.tv/app')
    await card.getByLabel('First retry').fill('2')
    await card.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Advanced settings saved.')).toBeVisible()
    // The local server: a new key asks first.
    await card.getByRole('tab', { name: 'Local server' }).click()
    await card.getByRole('button', { name: 'Make a new key' }).click()
    const dialog = page.getByRole('dialog', { name: 'Make a new stream key?' })
    await dialog.getByRole('button', { name: 'Make a new key' }).click()
    await expect(page.getByText('New key made. OBS was pointed at it again.')).toBeVisible()
    // Remembered for this screen; the vertical editor shows its numbers.
    await page.reload()
    await expect(page.locator('#golive-advanced')).toBeVisible()
    const section = page.getByRole('radiogroup', { name: 'Studio section' })
    await section.getByText('Vertical', { exact: true }).click()
    await panel(page, 'Picture').getByText('Cut it from your stream').click()
    const editor = panel(page, 'Vertical layout')
    await expect(editor.getByLabel('Camera width')).toHaveValue('461')
    await editor.getByLabel('Bitrate').fill('6000')
    await editor.getByRole('button', { name: 'Save layout' }).click()
    await expect(page.getByText('Layout saved.')).toBeVisible()
    // Folded again in Go live: the extras go.
    await section.getByText('Go live', { exact: true }).click()
    await page.getByRole('button', { name: 'Advanced settings' }).click()
    await expect(page.locator('#golive-advanced')).toHaveCount(0)
    await section.getByText('Vertical', { exact: true }).click()
    await panel(page, 'Picture').getByText('Cut it from your stream').click()
    await expect(panel(page, 'Vertical layout').getByLabel('Bitrate')).toHaveCount(0)
  })

  test('the platform list reorders from the keyboard', async ({ page }) => {
    await open(page, 'studio/golive')
    const p = panel(page, 'Your platforms')
    await p.getByRole('button', { name: 'Move Twitch: arrow up or down' }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(p.locator('li b').first()).toHaveText('YouTube')
    await expect(p.locator('li b').nth(1)).toHaveText('Twitch')
  })

  test('the Show tab says where the stream goes', async ({ page }) => {
    await open(page, 'studio/show')
    await expect(
      page.getByRole('link', { name: /Going to 2 places with Go live everywhere/ }),
    ).toBeVisible()
  })

  for (const scheme of ['dark', 'light'] as const)
    test(`has no serious accessibility problems (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await open(page, 'studio/golive')
      await demo(
        page,
        '(d) => { d.setGoLive({ points_here: true }); d.studio.obs.streaming = true }',
      )
      await page.getByRole('button', { name: 'Test upload' }).click()
      await expect(page.getByText('Twitch: Live')).toBeVisible({ timeout: 8000 })
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(
        bad.map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(', ')}`,
        ),
      ).toEqual([])
    })

  for (const scheme of ['dark', 'light'] as const)
    test(`the Vertical tab has no serious accessibility problems (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await open(page, 'studio/vertical')
      await demo(page, `(d) => d.setGoLive({ vertical: { points_here: true, streaming: true } })`)
      await panel(page, 'Where it goes')
        .getByRole('switch', { name: 'Stream to YouTube Shorts live' })
        .click()
      await expect(page.getByText('YouTube Shorts live: Live')).toBeVisible({ timeout: 8000 })
      // With the cut editor open too.
      await panel(page, 'Picture').getByText('Cut it from your stream').click()
      await expect(
        panel(page, 'Vertical layout').getByRole('group', { name: /Game box/ }),
      ).toBeVisible()
      // Measure at rest: on the slower CI WebKit a bare <p> (most likely a toast still
      // fading in) read as low contrast.
      await settled(page)
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(
        bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([])
    })
})
