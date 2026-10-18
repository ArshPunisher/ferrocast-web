import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fault, open } from './helpers'

// Pro cloud backups in Settings › Your data, on the demo's backups.
const PRO = 'autoplay=0&latency=0&pro=active&pro_features=on'
const panel = (page: Page) => page.locator('#cloud-backups')
const KEY = 'AGE-SECRET-KEY-1QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7LQPZRY9X8GF2TVDW0S3JN54KHC'

test.describe('Cloud backups', () => {
  test('hidden when the relay lacks it; one calm line on sale without Pro', async ({ page }) => {
    await open(page, 'settings/data', 'autoplay=0&latency=0')
    await expect(page.locator('#s-data')).toBeVisible()
    await expect(panel(page)).toHaveCount(0)
    await open(page, 'settings/data', 'autoplay=0&latency=0&pro=open&pro_features=on')
    await expect(panel(page).getByTestId('pro-line')).toContainText('part of Pro')
    await expect(panel(page).getByRole('button', { name: 'Back up now' })).toHaveCount(0)
  })

  test('402 from the relay says what to do', async ({ page }) => {
    await open(page, 'home', PRO)
    await fault(page, {
      path: '/api/v1/pro/backups',
      status: 402,
      code: 'pro_required',
      message: 'This runs on Ferrocast’s servers and is part of Pro.',
      hint: 'See Settings › Pro. Everything free in Ferrocast stays free.',
      times: 1,
    })
    await page.evaluate(() => (location.hash = '#/settings/data'))
    const alert = panel(page).getByRole('alert')
    await expect(alert).toContainText('part of Pro')
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(panel(page).getByTestId('cloud-list')).toBeVisible()
  })

  test('first time: save the key, then back up', async ({ page }) => {
    await open(page, 'settings/data', `${PRO}&cloud=empty`)
    const p = panel(page)
    await expect(p.getByTestId('cloud-empty')).toHaveText(
      'No cloud backups yet. They’re encrypted on this PC before upload.',
    )
    const save = p.getByTestId('cloud-save-key')
    await expect(save).toContainText('If you lose it, your backups are lost.')
    const turnOn = save.getByRole('button', { name: 'Turn on cloud backups' })
    await expect(turnOn).toBeDisabled()
    await expect(save.getByRole('checkbox')).toBeDisabled()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      save.getByRole('button', { name: 'Download key' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('ferrocast-recovery-key.txt')
    await save.getByRole('checkbox').check()
    await turnOn.click()
    await expect(p.getByTestId('cloud-key-status')).toContainText('Recovery key saved')
    await p.getByRole('button', { name: 'Back up now' }).click()
    await expect(page.getByText('Backed up to the cloud.')).toBeVisible()
    await expect(p.getByTestId('cloud-list').locator('li')).toHaveCount(1)
    await expect(p.getByTestId('cloud-usage')).toContainText('1 of 7 backups')
  })

  test('restore asks first, then restores', async ({ page }) => {
    await open(page, 'settings/data', PRO)
    const p = panel(page)
    const rows = p.getByTestId('cloud-list').locator('li')
    await expect(rows).toHaveCount(3)
    await rows.first().getByRole('button', { name: 'Restore' }).click()
    const dialog = page.getByRole('dialog', { name: 'Restore this backup?' })
    await expect(dialog).toContainText('Your current setup is backed up on this PC first')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await rows.first().getByRole('button', { name: 'Restore' }).click()
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByText('Backup restored.')).toBeVisible()
    await expect(dialog).toBeHidden()
  })

  test('delete and passphrase', async ({ page }) => {
    await open(page, 'settings/data', PRO)
    const p = panel(page)
    const rows = p.getByTestId('cloud-list').locator('li')
    await expect(rows).toHaveCount(3)
    await rows
      .first()
      .getByRole('button', { name: /^Delete the backup/ })
      .click()
    const del = page.getByRole('dialog', { name: 'Delete this cloud backup?' })
    await del.getByRole('button', { name: 'Delete' }).click()
    await expect(rows).toHaveCount(2)
    await p.getByRole('button', { name: 'Add passphrase' }).click()
    const dlg = page.getByRole('dialog', { name: 'Add a passphrase' })
    await dlg.getByLabel('Passphrase').fill('short')
    await dlg.getByRole('button', { name: 'Save passphrase' }).click()
    await expect(dlg.getByRole('alert')).toContainText('at least 12')
    await dlg.getByLabel('Passphrase').fill('river stone lantern')
    await dlg.getByRole('button', { name: 'Save passphrase' }).click()
    await expect(p.getByTestId('cloud-key-status')).toContainText(
      'A passphrase opens new backups too.',
    )
  })

  test('a new PC uses its newest backup from another PC', async ({ page }) => {
    await open(page, 'settings/data', `${PRO}&cloud=new-pc`)
    const p = panel(page)
    const offer = p.getByTestId('cloud-new-pc')
    await expect(offer).toContainText('Use your newest backup from another PC')
    await offer.getByRole('button', { name: 'Use this backup' }).click()
    const dialog = page.getByRole('dialog', { name: 'Restore this backup?' })
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(dialog.getByRole('alert')).toContainText('needs its recovery key or passphrase')
    await dialog.getByRole('textbox', { name: 'Recovery key' }).fill(KEY.slice(0, -4) + 'QQQQ')
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(dialog.getByRole('alert')).toContainText('doesn’t open this backup')
    await dialog.getByRole('radio', { name: 'Passphrase' }).check({ force: true })
    await dialog.locator('input[type=password]').fill('river stone lantern')
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByText('Backup restored.')).toBeVisible()
    await expect(p.getByTestId('cloud-key-status')).toContainText('Recovery key saved')
    await expect(p.getByTestId('cloud-new-pc')).toHaveCount(0)
  })

  test('has no accessibility violations', async ({ page }) => {
    await open(page, 'settings/data', `${PRO}&cloud=empty`)
    await expect(panel(page).getByTestId('cloud-save-key')).toBeVisible()
    const r = await new AxeBuilder({ page }).include('#cloud-backups').analyze()
    expect(r.violations).toEqual([])
  })
})

test.describe('Cloud backups at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const mode of ['', '&cloud=new-pc']) {
    test(`fits the phone width${mode ? ' (new PC)' : ''}`, async ({ page }) => {
      await open(page, 'settings/data', `${PRO}${mode}`)
      await expect(panel(page).getByRole('heading', { name: 'Cloud backups' })).toBeVisible()
      await panel(page).scrollIntoViewIfNeeded()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
      const box = await panel(page).boundingBox()
      expect(box && box.x + box.width).toBeLessThanOrEqual(375)
    })
  }
})
