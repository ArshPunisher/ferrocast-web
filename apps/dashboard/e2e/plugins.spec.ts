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
  // Only the samples are there.
  await expect(p.getByRole('switch')).toHaveCount(2)
})

test('fits a 375 px phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, 'settings/plugins', 'autoplay=0&latency=0')
  await expect(page$(page).getByText('Scanlines')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('a logic plugin says what it may do; a panel opens in a sandbox and asks for steps', async ({
  page,
}) => {
  await open(page, 'settings/plugins', 'autoplay=0&latency=0')
  const p = page$(page)
  await expect(p.getByText('Big buttons', { exact: true })).toBeVisible()
  // A logic plugin: a WebAssembly module and the steps it may ask for, shown.
  const manifest = JSON.stringify({
    id: 'com.ana.raid',
    name: 'Raid scene',
    version: '1.0.0',
    kind: 'logic',
    module: 'plugin.wasm',
    actions: ['scene', 'chat'],
  })
  const wasm = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])
  const zip = (files: Record<string, Uint8Array>) => Buffer.from(zipSync(files))
  await addFile(page, 'raid.zip', zip({ 'plugin.json': strToU8(manifest), 'plugin.wasm': wasm }))
  await expect(toasts(page).getByText('Raid scene added.')).toBeVisible()
  await expect(p.getByText(/Logic · Can switch scenes and say in chat\./)).toBeVisible()
  // Not WebAssembly, or asking for what plugins can't have: refused with why.
  await addFile(
    page,
    'bad.zip',
    zip({ 'plugin.json': strToU8(manifest.replace('raid', 'bad')), 'plugin.wasm': strToU8('MZ') }),
  )
  await expect(toasts(page).getByText(/isn’t WebAssembly/)).toBeVisible()
  await addFile(
    page,
    'greedy.zip',
    zip({
      'plugin.json': strToU8(manifest.replace('"chat"', '"secrets"').replace('raid', 'greedy')),
      'plugin.wasm': wasm,
    }),
  )
  await expect(toasts(page).getByText(/isn’t an action plugins can have/)).toBeVisible()
  // The panel: its page in a sandboxed frame, with no network.
  await p.getByRole('button', { name: 'Open Big buttons' }).click()
  const frame = page.frameLocator('iframe[title="Big buttons"]')
  const el = page.locator('iframe[title="Big buttons"]')
  await expect(el).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(el).toHaveAttribute('srcdoc', /Content-Security-Policy.*default-src 'none'/)
  // A step it listed runs; the page hears "done".
  await frame.getByRole('button', { name: 'Save replay' }).click()
  await expect(frame.getByText('Done.')).toBeVisible()
})

test('a panel that sends its frame to another page is closed, not heard', async ({ page }) => {
  await open(page, 'settings/plugins', 'autoplay=0&latency=0')
  const p = page$(page)
  const manifest = JSON.stringify({
    id: 'com.ana.wander',
    name: 'Wanderer',
    version: '1.0.0',
    kind: 'panel',
    panel: 'panel.html',
    actions: ['scene'],
  })
  // It sends its own frame elsewhere (a sandboxed frame still may), here without a script.
  const html = '<meta http-equiv="refresh" content="0.2;url=about:blank"><p>here</p>'
  await addFile(
    page,
    'wander.zip',
    Buffer.from(zipSync({ 'plugin.json': strToU8(manifest), 'panel.html': strToU8(html) })),
  )
  await expect(toasts(page).getByText('Wanderer added.')).toBeVisible()
  await p.getByRole('button', { name: 'Open Wanderer' }).click()
  await expect(page.getByRole('alert').getByText(/tried to open another page/)).toBeVisible()
  await expect(page.locator('iframe[title="Wanderer"]')).toHaveCount(0)
})

test('the catalog adds a plugin and updates one in a click', async ({ page }) => {
  await open(page, 'settings/plugins', 'autoplay=0&latency=0')
  const p = page$(page)
  const grain = p.getByRole('button', { name: 'Install', exact: true })
  await expect(p.getByText('Film grain', { exact: true })).toBeVisible()
  await expect(p.getByText(/Effect · By Ferrocast · Soft moving grain/)).toBeVisible()
  await grain.click()
  await expect(toasts(page).getByText('Film grain added.')).toBeVisible()
  // Marked installed in the catalog, and listed with the others.
  await expect(p.getByText('Installed', { exact: true }).first()).toBeVisible()
  await expect(p.getByRole('switch', { name: /Film grain/ })).toBeVisible()
  // Big buttons has a later version: one click updates it.
  await p.getByRole('button', { name: 'Update', exact: true }).click()
  await expect(toasts(page).getByText('Big buttons updated to 1.1.0.')).toBeVisible()
  await expect(p.getByRole('button', { name: 'Update', exact: true })).toHaveCount(0)
})
