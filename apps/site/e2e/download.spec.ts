import { expect, test } from '@playwright/test'
import { compareVersions, pickBeta, pickStable } from '../src/data/releases'

const GH = 'https://github.com/ArshPunisher/ferrocast'
const dl = (tag: string, name: string) => ({
  name,
  browser_download_url: `${GH}/releases/download/${tag}/${name}`,
  size: 12_400_000,
})

test.describe('download page', () => {
  test('each system card carries its own download and install tip', async ({ page }) => {
    await page.goto('/download/')
    // Stable first; before the first stable release the beta section takes its place.
    const stable = (await page.locator('#get').count()) > 0
    const main = page.locator(stable ? '#get' : '#beta')
    await expect(main.getByRole('note')).toContainText(
      stable ? /stable release/ : /test build|first beta/,
    )
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      stable ? 'Download Ferrocast' : 'Ferrocast is almost here.',
    )
    for (const os of ['mac', 'windows', 'linux']) {
      const card = main.locator(`.os[data-os="${os}"]`)
      await expect(card.locator('a[data-beta-download], .soon').first()).toBeVisible()
    }
    if ((await main.locator('.os[data-os="mac"] a[data-beta-download]').count()) > 0) {
      await expect(main.getByText('right-click Ferrocast')).toBeVisible()
      await expect(main.getByText('Run anyway')).toBeVisible()
    }
    const downloads = main.locator('a[data-beta-download]')
    const tag = stable ? String.raw`v\d+\.\d+\.\d+/` : String.raw`v\d+\.\d+\.\d+-`
    if ((await downloads.count()) > 0) {
      for (const href of await downloads.evaluateAll((as) =>
        as.map((a) => a.getAttribute('href')),
      )) {
        expect(href).toMatch(new RegExp(`^${GH}/releases/download/${tag}`))
      }
    } else {
      await expect(main.getByText('The first beta isn’t out yet.')).toBeVisible()
      await expect(main.locator('a[data-beta-releases]')).toHaveAttribute('href', `${GH}/releases`)
    }
  })

  test('fits a 375 px phone without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/download/')
    await expect(page.locator('#get, #beta').first()).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('picking the beta from GitHub releases', () => {
  test('takes the newest published prerelease and its files', () => {
    const tag = 'v0.1.0-beta.2'
    const r = pickBeta([
      { tag_name: 'beta', prerelease: true, draft: false, assets: [dl('beta', 'latest.json')] },
      {
        tag_name: tag,
        prerelease: true,
        draft: false,
        html_url: `${GH}/releases/tag/${tag}`,
        published_at: '2026-10-20T10:00:00Z',
        assets: [
          dl(tag, 'Ferrocast_0.1.0-beta.2_universal.dmg'),
          dl(tag, 'Ferrocast_0.1.0-beta.2_x64-setup.exe'),
          dl(tag, 'Ferrocast_0.1.0-beta.2_amd64.AppImage'),
          dl(tag, 'Ferrocast_0.1.0-beta.2_amd64.deb'),
          dl(tag, 'Ferrocast-0.1.0-beta.2-1.x86_64.rpm'),
          dl(tag, 'SHA256SUMS.txt'),
          dl(tag, 'latest.json'),
        ],
      },
      { tag_name: 'v0.1.0-beta.1', prerelease: true, draft: false, assets: [] },
    ])
    expect(r?.version).toBe('0.1.0-beta.2')
    expect(r?.assets.map((a) => a.os)).toEqual(['mac', 'windows', 'linux', 'linux', 'linux'])
    expect(r?.checksums).toBe(`${GH}/releases/download/${tag}/SHA256SUMS.txt`)
  })

  test('picks the highest beta, not the first GitHub lists', () => {
    // GitHub orders by the tagged commit's date, which can put an older beta first.
    const r = pickBeta(
      ['v0.1.0-beta.2', 'v0.1.0-beta.10', 'v0.1.0-beta.4'].map((tag_name) => ({
        tag_name,
        prerelease: true,
        draft: false,
        assets: [],
      })),
    )
    expect(r?.tag).toBe('v0.1.0-beta.10')
    expect(compareVersions('v0.1.0-beta.1.2', 'v0.1.0-beta.3')).toBe(-1)
    expect(compareVersions('v0.1.0', 'v0.1.0-beta.9')).toBe(1)
    expect(compareVersions('v0.2.0-beta.1', 'v0.1.9')).toBe(1)
  })

  test('ignores stable releases, drafts, foreign links and junk', () => {
    expect(
      pickBeta([{ tag_name: 'v0.1.0', prerelease: false, draft: false, assets: [] }]),
    ).toBeNull()
    expect(pickBeta([{ tag_name: 'v0.2.0-beta.1', prerelease: true, draft: true }])).toBeNull()
    expect(pickBeta({ message: 'API rate limit exceeded' })).toBeNull()
    expect(pickBeta([])).toBeNull()
    const evil = pickBeta([
      {
        tag_name: 'v0.2.0-beta.1',
        prerelease: true,
        html_url: 'https://evil.example/x',
        assets: [
          { name: 'Ferrocast_universal.dmg', browser_download_url: 'https://evil.example/f.dmg' },
        ],
      },
    ])
    expect(evil?.assets).toEqual([])
    expect(evil?.url).toBe(`${GH}/releases/tag/v0.2.0-beta.1`)
  })
})

test.describe('picking the stable release from GitHub releases', () => {
  test('takes the newest published non-prerelease and its files', () => {
    const tag = 'v1.0.0'
    const r = pickStable([
      { tag_name: 'v1.0.1-beta.1', prerelease: true, draft: false, assets: [] },
      {
        tag_name: tag,
        prerelease: false,
        draft: false,
        html_url: `${GH}/releases/tag/${tag}`,
        published_at: '2026-10-20T12:00:00Z',
        assets: [
          dl(tag, 'Ferrocast_1.0.0_universal.dmg'),
          dl(tag, 'Ferrocast_1.0.0_x64-setup.exe'),
          dl(tag, 'Ferrocast_1.0.0_amd64.AppImage'),
          dl(tag, 'Ferrocast_1.0.0_amd64.deb'),
          dl(tag, 'SHA256SUMS.txt'),
          dl(tag, 'latest.json'),
        ],
      },
      { tag_name: 'v1.0.0-beta.9', prerelease: true, draft: false, assets: [] },
    ])
    expect(r?.version).toBe('1.0.0')
    expect(r?.assets.map((a) => a.os)).toEqual(['mac', 'windows', 'linux', 'linux'])
    expect(r?.checksums).toBe(`${GH}/releases/download/${tag}/SHA256SUMS.txt`)
  })

  test('picks the highest stable, not the first GitHub lists', () => {
    const r = pickStable(
      ['v1.0.2', 'v1.0.10', 'v1.0.4'].map((tag_name) => ({
        tag_name,
        prerelease: false,
        draft: false,
        assets: [],
      })),
    )
    expect(r?.tag).toBe('v1.0.10')
  })

  test('ignores betas, drafts, foreign links and junk', () => {
    expect(
      pickStable([{ tag_name: 'v1.0.0-beta.1', prerelease: true, draft: false, assets: [] }]),
    ).toBeNull()
    expect(pickStable([{ tag_name: 'v1.0.0', prerelease: false, draft: true }])).toBeNull()
    expect(pickStable({ message: 'API rate limit exceeded' })).toBeNull()
    expect(pickStable([])).toBeNull()
    expect(pickStable([{ tag_name: 'v1.0.0', prerelease: false, assets: [null] }])?.assets).toEqual(
      [],
    )
    const evil = pickStable([
      {
        tag_name: 'v1.0.0',
        prerelease: false,
        html_url: 'https://evil.example/x',
        assets: [
          { name: 'Ferrocast_universal.dmg', browser_download_url: 'https://evil.example/f.dmg' },
        ],
      },
    ])
    expect(evil?.assets).toEqual([])
    expect(evil?.url).toBe(`${GH}/releases/tag/v1.0.0`)
  })
})
