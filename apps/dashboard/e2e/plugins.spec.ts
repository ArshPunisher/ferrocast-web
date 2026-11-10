import { expect, test, type Page } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'
import { open } from './helpers'

// Settings › Plugins on the demo engine (API.md "Plugins"; OBS-COMPETE.md §4).

const FX =
  'fn effect(uv: vec2<f32>) -> vec4<f32> { let c = pic(uv); return vec4<f32>(1.0 - c.rgb, c.a); }'

function plugin(
  id: string,
  opts: { effect?: string; extra?: Record<string, string>; version?: string } = {},
) {
  const manifest = JSON.stringify({
    id,
    name: 'Invert',
    version: opts.version ?? '1.0.0',
    author: 'Ana',
    description: 'Flips the colours.',
    kind: 'effect',
    effect: 'effect.wgsl',
  })
  const files: Record<string, Uint8Array> = {
    'plugin.json': strToU8(manifest),
    'effect.wgsl': strToU8(opts.effect ?? FX),
  }
  for (const [k, v] of Object.entries(opts.extra ?? {})) files[k] = strToU8(v)
  return Buffer.from(zipSync(files))
}

const page$ = (page: Page) => page.locator('#s-plugins')
const toasts = (page: Page) => page.getByRole('region', { name: 'Notifications' })

async function addFile(page: Page, name: string, buffer: Buffer) {
  await page$(page)
    .locator('input[type=file]')
    .setInputFiles({ name, mimeType: 'application/zip', buffer })
}

test('lists, switches off, adds, updates and removes a plugin', async ({ page }) => {
  await open(page, 'settings/plugins', 'autoplay=0&latency=0')
  const p = page$(page)
  await expect(p.getByRole('heading', { name: 'Plugins', exact: true })).toBeVisible()
  // The demo's sample plugin, on.
  await expect(p.getByText('Scanlines')).toBeVisible()
  const sample = p.getByRole('switch', { name: 'Scanlines on' })
  await expect(sample).toHaveAttribute('aria-checked', 'true')
  await sample.click()
  await expect(sample).toHaveAttribute('aria-checked', 'false')
  // Add one, then an update of it.
  await addFile(page, 'invert.zip', plugin('com.ana.invert'))
  await expect(toasts(page).getByText('Invert added.')).toBeVisible()
  await expect(p.getByText('By Ana · Flips the colours.')).toBeVisible()
  await addFile(page, 'invert-2.zip', plugin('com.ana.invert', { version: '2.0.0' }))
  await expect(p.getByText('2.0.0')).toBeVisible()
  await expect(p.getByRole('switch', { name: 'Invert on' })).toHaveCount(1)
  // Remove asks once: the bin, then a red Remove.
  await p.getByRole('button', { name: 'Remove Invert' }).click()
  await p.getByRole('button', { name: 'Sure? Remove Invert' }).click()
  await expect(toasts(page).getByText('Invert removed.')).toBeVisible()
  await expect(p.getByRole('switch', { name: 'Invert on' })).toHaveCount(0)
})

test('a file that isn’t a good plugin says why and adds nothing', async ({ page }) => {
  await open(page, 'settings/plugins', 'autoplay=0&latency=0')
  const p = page$(page)
  await expect(p.getByText('Scanlines')).toBeVisible()
  const cases: [string, Buffer, RegExp][] = [
    ['notes.zip', Buffer.from('hello'), /isn’t a Ferrocast plugin/],
    ['evil.zip', plugin('com.ana.evil', { extra: { 'run.exe': 'MZ' } }), /plugins hold only/],
    [
      'spin.zip',
      plugin('com.ana.spin', { effect: 'fn effect(uv: vec2<f32>) -> vec4<f32> { loop {} }' }),
      /loop or while/,
    ],
    ['bad-id.zip', plugin('Bad Id!'), /plugin.json is wrong/],
  ]
  for (const [name, buffer, message] of cases) {
    await addFile(page, name, buffer)
    await expect(toasts(page).getByText(message).last()).toBeVisible()
  }
  // Only the sample is there.
  await expect(p.getByRole('switch')).toHaveCount(1)
})

test('fits a 375 px phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, 'settings/plugins', 'autoplay=0&latency=0')
  await expect(page$(page).getByText('Scanlines')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
