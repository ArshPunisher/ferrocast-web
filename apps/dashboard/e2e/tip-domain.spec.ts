import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fault, open } from './helpers'

// Pro: the tip page on the streamer's own address (API.md §9.2). The demo starts like the
// real relay (off sale, no Pro); `?pro=` switches it. Each check in the demo moves a new
// address one step on, as Cloudflare would.
const PRO = 'autoplay=0&latency=0&pro=active&pro_features=on'
const panel = (page: Page) => page.locator('#tip-domain')

async function setDomain(page: Page, s: Record<string, unknown>) {
  await page.evaluate((x) => window.__ferrocastDemo?.setTipDomain(x as never), s)
}

test.describe('tips: your own address', () => {
  test('hidden without Pro, one calm line while on sale', async ({ page }) => {
    await open(page, 'tips')
    await expect(page.locator('#tip-page')).toBeVisible()
    await expect(panel(page)).toHaveCount(0)
    await open(page, 'tips', 'autoplay=0&latency=0&pro=open&pro_features=on')
    await expect(panel(page).getByTestId('pro-line')).toContainText(
      'Runs on Ferrocast’s servers, part of Pro.',
    )
    await expect(panel(page).getByLabel('Your address')).toHaveCount(0)
  })

  test('add an address, see the record, go from pending to live, remove it', async ({ page }) => {
    await open(page, 'tips', PRO)
    const p = panel(page)
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(p.getByText('Type the address, like tips.yourchannel.com.')).toBeVisible()
    await p.getByLabel('Your address').fill('mychannel.com')
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(p.getByText('Use a subdomain, like tips.mychannel.com.')).toBeVisible()
    await p.getByLabel('Your address').fill('Tips.MyChannel.com')
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(page.getByText('Address added. Now add the two DNS records.')).toBeVisible()
    await expect(p.getByText('tips.mychannel.com', { exact: true }).first()).toBeVisible()
    await expect(p.getByText('Pending', { exact: true })).toBeVisible()
    await expect(p.getByText('CNAME', { exact: true })).toBeVisible()
    await expect(p.getByText('tip.clearcraftlabs.com', { exact: true })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Copy name' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Copy target' })).toBeVisible()
    await expect(p.getByText('custom hostname does not CNAME to this zone.')).toBeVisible()
    // Finding 2: the TXT proof is a required step with its own copy buttons.
    const txt = p.getByRole('region', { name: 'Record 2 of 2: TXT, required' })
    await expect(txt.getByText('Required', { exact: true })).toBeVisible()
    await expect(txt.getByText('_ferrocast.tips', { exact: true })).toBeVisible()
    await expect(txt.getByRole('button', { name: 'Copy TXT name' })).toBeVisible()
    await expect(txt.getByRole('button', { name: 'Copy TXT value' })).toBeVisible()
    await expect(
      p.getByText('The TXT record _ferrocast.tips.mychannel.com isn’t there yet.'),
    ).toBeVisible()
    // Finding 13: screen readers hear where each step is.
    await expect(p.getByRole('listitem').filter({ hasText: 'DNS records' })).toContainText(
      'DNS records, current step',
    )
    await expect(p.getByRole('listitem').filter({ hasText: 'Live' })).toContainText('Live, not yet')
    await page.waitForTimeout(1100)
    await p.getByRole('button', { name: 'Check again' }).click()
    await expect(p.getByText('Verifying certificate', { exact: true })).toBeVisible()
    await expect(txt.getByText('Found', { exact: true })).toBeVisible()
    await expect(p.getByRole('listitem').filter({ hasText: 'DNS records' })).toContainText(
      'DNS records, done',
    )
    await page.waitForTimeout(1100)
    await p.getByRole('button', { name: 'Check again' }).click()
    await expect(p.getByText('Live', { exact: true }).first()).toBeVisible()
    await expect(p.getByText('Your tip page is on your own address', { exact: true })).toBeVisible()
    await expect(p.getByText('https://tips.mychannel.com', { exact: true })).toBeVisible()
    await expect(p.getByText(/Keep the TXT record/)).toBeVisible()
    await p.getByRole('button', { name: 'Remove address' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Address removed.')).toBeVisible()
    await expect(p.getByLabel('Your address')).toBeVisible()
  })

  test('errors show with what to do', async ({ page }) => {
    await open(page, 'tips', PRO)
    const p = panel(page)
    await p.getByLabel('Your address').fill('taken.mychannel.com')
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(p.getByRole('alert')).toContainText('taken.mychannel.com is already in use.')
    await expect(p.getByRole('alert')).toContainText('remove it from the other Ferrocast first')
    await fault(page, {
      path: '/api/v1/pro/tips/domain',
      method: 'PUT',
      status: 502,
      code: 'cloudflare_unavailable',
      message: 'Cloudflare didn’t answer, so nothing changed.',
      hint: 'Try again in a few minutes.',
    })
    await p.getByLabel('Your address').fill('tips.mychannel.com')
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(p.getByRole('alert')).toContainText(
      'Cloudflare didn’t answer, so nothing changed.',
    )
    await expect(p.getByRole('alert')).toContainText('Try again in a few minutes.')
  })

  test('an address already on Cloudflare shows the TXT record to prove it, then adds', async ({
    page,
  }) => {
    await open(page, 'tips', PRO)
    const p = panel(page)
    await p.getByLabel('Your address').fill('elsewhere.mychannel.com')
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(p.getByRole('alert')).toContainText(
      'That address is set up somewhere else on Cloudflare.',
    )
    const proof = p.getByRole('region', { name: 'TXT record to prove it’s yours' })
    await expect(proof.getByText('_ferrocast.elsewhere', { exact: true })).toBeVisible()
    await expect(proof.getByRole('button', { name: 'Copy TXT name' })).toBeVisible()
    await expect(proof.getByRole('button', { name: 'Copy TXT value' })).toBeVisible()
    await setDomain(page, { proofPublished: true })
    await p.getByRole('button', { name: 'Try again' }).click()
    await expect(p.getByText('Pending', { exact: true })).toBeVisible()
    await expect(p.getByText('elsewhere.mychannel.com', { exact: true }).first()).toBeVisible()
  })

  test('402 and the relay offline reach the streamer as plain messages', async ({ page }) => {
    await open(page, 'tips', PRO)
    const p = panel(page)
    await fault(page, {
      path: '/api/v1/pro/tips/domain',
      method: 'PUT',
      status: 402,
      code: 'pro_required',
      message: 'This runs on Ferrocast’s servers and is part of Pro.',
      hint: 'See Settings › Pro.',
    })
    await p.getByLabel('Your address').fill('tips.mychannel.com')
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(p.getByRole('alert')).toContainText(
      'This runs on Ferrocast’s servers and is part of Pro.',
    )
    await fault(page, {
      path: '/api/v1/pro/tips/domain',
      method: 'PUT',
      status: 502,
      code: 'relay_unreachable',
      message: 'Can’t reach Ferrocast’s servers right now.',
      hint: 'Check your internet connection and try again.',
    })
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(p.getByRole('alert')).toContainText('Can’t reach Ferrocast’s servers right now.')
    await page.evaluate(() => window.__ferrocastDemo?.setOffline(true))
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(p.getByRole('alert')).toBeVisible()
    await page.evaluate(() => window.__ferrocastDemo?.setOffline(false))
  })

  test('while pending it checks again every 15 s by itself', async ({ page }) => {
    await page.clock.install()
    await open(page, 'tips', PRO)
    const p = panel(page)
    await p.getByLabel('Your address').fill('tips.mychannel.com')
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(p.getByText('Pending', { exact: true })).toBeVisible()
    await page.clock.fastForward(16_000)
    await expect(p.getByText('Verifying certificate', { exact: true })).toBeVisible()
    await page.clock.fastForward(16_000)
    await expect(p.getByText('Live', { exact: true }).first()).toBeVisible()
  })

  test('an international address shows in its own letters', async ({ page }) => {
    await open(page, 'tips', PRO)
    const p = panel(page)
    await p.getByLabel('Your address').fill('tips.bücher.de')
    await p.getByRole('button', { name: 'Add address' }).click()
    await expect(p.getByText('tips.bücher.de', { exact: true })).toBeVisible()
    await expect(p.getByText(/In DNS it’s written/)).toContainText('tips.xn--bcher-kva.de')
  })

  test('a removed TXT record says so and shows it again', async ({ page }) => {
    await open(page, 'tips', PRO)
    const p = panel(page)
    await p.getByLabel('Your address').fill('tips.mychannel.com')
    await p.getByRole('button', { name: 'Add address' }).click()
    await setDomain(page, { status: 'proof_missing', advance: false })
    await p.getByRole('button', { name: 'Check again' }).click()
    await expect(p.getByText('TXT record missing', { exact: true })).toBeVisible()
    await expect(p.getByText(/was removed, so this address stopped/)).toBeVisible()
    await expect(p.getByRole('button', { name: 'Copy TXT value' })).toBeVisible()
  })

  test('a lapsed address says when it stops', async ({ page }) => {
    await open(page, 'tips', PRO)
    await panel(page).getByLabel('Your address').fill('tips.mychannel.com')
    await panel(page).getByRole('button', { name: 'Add address' }).click()
    await setDomain(page, { status: 'live', lapsed: true })
    await panel(page).getByRole('button', { name: 'Check again' }).click()
    await expect(panel(page).getByText('Live', { exact: true }).first()).toBeVisible()
    await expect(panel(page).getByText(/Pro ended\. This address stops on/)).toBeVisible()
  })

  test('has no accessibility violations', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium')
    await open(page, 'tips', PRO)
    await expect(panel(page).getByLabel('Your address')).toBeVisible()
    let r = await new AxeBuilder({ page }).include('#tip-domain').analyze()
    expect(r.violations).toEqual([])
    await panel(page).getByLabel('Your address').fill('tips.mychannel.com')
    await panel(page).getByRole('button', { name: 'Add address' }).click()
    await expect(panel(page).getByText('CNAME', { exact: true })).toBeVisible()
    r = await new AxeBuilder({ page }).include('#tip-domain').analyze()
    expect(r.violations).toEqual([])
    await page.emulateMedia({ colorScheme: 'dark' })
    // Let the theme's colour transitions finish before measuring contrast.
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== 'running'),
    )
    await page.waitForTimeout(100)
    r = await new AxeBuilder({ page }).include('#tip-domain').analyze()
    expect(r.violations).toEqual([])
  })
})

test.describe('tips: your own address at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const scheme of ['light', 'dark'] as const) {
    test(`both records, the status and "Checked" fit the phone width (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await open(page, 'tips', PRO)
      const p = panel(page)
      await p.getByLabel('Your address').fill('live.tips.averyveryverylongchannelname.co.uk')
      await p.getByRole('button', { name: 'Add address' }).click()
      await expect(p.getByText('CNAME', { exact: true })).toBeVisible()
      await expect(p.getByRole('button', { name: 'Copy TXT value' })).toBeVisible()
      // Finding 13: "Checked … ago" shows on a phone too.
      await expect(p.getByText(/^Checked /)).toBeVisible()
      await p.scrollIntoViewIfNeeded()
      const box = await p.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= 375).toBe(true)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
      await p.screenshot({ path: test.info().outputPath(`own-address-375-${scheme}.png`) })
    })
  }
})
