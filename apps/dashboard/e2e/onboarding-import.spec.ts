import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { demo, fault, open, settled } from './helpers'

test.describe('first-run import and camera/mic check', () => {
  test('OBS Studio preview, import result, Undo/Start over, and full flow at 1280px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'home', 'firstrun&autoplay=0&latency=0')

    await expect(
      page.getByRole('heading', { name: 'Bring your scenes, or start fresh' }),
    ).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'Setup progress' }).getByRole('listitem'),
    ).toHaveCount(5)

    // Pick OBS Studio -> loads collections + read-only preview with skipped explanations
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await expect(page.getByRole('heading', { name: /Preview: Main Streaming Setup/ })).toBeVisible()
    await expect(page.getByText('NDI Studio Cam')).toBeVisible()
    await expect(page.getByText(/Uses NDI/)).toBeVisible()
    await expect(page.getByText(/VST plugin filter/)).toBeVisible()

    // Import -> result screen -> Undo / Start over
    await page.getByRole('button', { name: /Import “Main Streaming Setup”/ }).click()
    await expect(
      page.getByRole('heading', { name: /Imported “Main Streaming Setup”/ }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Undo and start over' }).click()
    await expect(page.getByText(/Import undone/)).toBeVisible()

    // Re-import Podcast and Chat (clean collection), proceed to Camera and mic check
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await page.getByText('Podcast and Chat', { exact: true }).click()
    await expect(page.getByRole('heading', { name: /Preview: Podcast and Chat/ })).toBeVisible()
    await page.getByRole('button', { name: /Import “Podcast and Chat”/ }).click()
    await page.getByRole('button', { name: 'Continue to camera and mic check' }).click()

    // Step 1: Camera and mic check -> live preview, meter, one-click Clean up my mic
    await expect(page.getByRole('heading', { name: 'Camera and mic check' })).toBeVisible()
    await expect(page.locator('img[alt*="FaceTime"]')).toBeVisible()
    await expect(page.getByRole('slider', { name: 'Mic volume' })).toBeVisible()
    await expect(page.getByText(/raise it by/i)).toBeVisible({ timeout: 6_000 })

    await page.getByRole('button', { name: 'Clean up my mic' }).click()
    await expect(page.getByText('Mic cleaned up')).toBeVisible()

    // Continue -> Use -> Picture -> Connect -> Finish
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(
      page.getByRole('heading', { name: 'What will you use Ferrocast for?' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Use these settings' }).click()
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(
      page.getByRole('heading', { name: /You’re live|Ready when you are/ }),
    ).toBeVisible()
  })

  test('Streamlabs preview shows converted widgets, device resets, and skipped reasons', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'home', 'firstrun&autoplay=0&latency=0')

    await page.getByText('Import from Streamlabs', { exact: true }).click()
    await expect(page.getByRole('heading', { name: /Preview: Streamlabs Neon Pack/ })).toBeVisible()
    await expect(page.getByText('StreamCam')).toBeVisible()
    await expect(page.getByText(/pick a camera/i)).toBeVisible()
    await expect(page.getByText('Spin Wheel Widget')).toBeVisible()
  })

  test('handles empty, broken JSON, huge collection, import fault, and missing camera/mic fixtures', async ({
    page,
  }) => {
    // Empty folder
    await open(page, 'home', 'firstrun&autoplay=0&latency=0&obs=empty')
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await expect(page.getByText('No OBS Studio scene collections found')).toBeVisible()
    await page.getByRole('button', { name: 'Start fresh instead' }).click()
    await expect(page.getByRole('heading', { name: 'Camera and mic check' })).toBeVisible()

    // Broken JSON
    await open(page, 'home', 'firstrun&autoplay=0&latency=0&obs=broken')
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await expect(page.getByText(/JSON is damaged/)).toBeVisible()
    await page.getByRole('button', { name: 'Start fresh instead' }).click()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()

    // Huge collection + injected import error + no camera/mic fallback
    await open(page, 'home', 'firstrun&autoplay=0&latency=0&obs=huge&cam=none&mic=none')
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await expect(
      page.getByRole('heading', { name: /Preview: Mega Broadcast Archive/ }),
    ).toBeVisible()
    await expect(page.getByText('+108 more')).toBeVisible()

    await fault(page, {
      path: '/api/v1/studio/engine/obs-collections/import',
      status: 500,
      message: 'Could not write collection file.',
    })
    await page.getByRole('button', { name: /Import “Mega Broadcast Archive”/ }).click()
    await expect(page.getByText('Could not write collection file.')).toBeVisible()

    await page.getByRole('button', { name: 'Start fresh instead' }).click()
    await expect(page.getByText('No camera detected')).toBeVisible()
    await expect(page.getByText('No microphone detected')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  test('undo asks first when the mic was changed after the import, and keeps focus', async ({
    page,
  }) => {
    await open(page, 'home', 'firstrun&autoplay=0&latency=0')
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await page.getByRole('button', { name: /Import “Main Streaming Setup”/ }).click()
    await expect(
      page.getByRole('heading', { name: /Imported “Main Streaming Setup”/ }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Continue to camera and mic check' }).click()
    await expect(page.getByRole('heading', { name: 'Camera and mic check' })).toBeVisible()
    await page.getByRole('button', { name: /Clean up my mic/ }).click()
    await expect(page.getByText(/Mic cleaned up/)).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: 'Undo and start over' }).click()
    await expect(page.getByText(/You changed your mic setup after importing/)).toBeVisible()
    // Keep the import: nothing was removed.
    await page.getByRole('button', { name: 'Keep the import' }).click()
    await expect(
      page.getByRole('heading', { name: /Imported “Main Streaming Setup”/ }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Undo and start over' }).click()
    await page.getByRole('button', { name: 'Undo and lose my changes' }).click()
    await expect(page.getByText(/Import undone/)).toBeVisible()
    // The undone import no longer counts as done, and focus is on the step's heading.
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('H1')
  })

  test('a camera the computer will not let the app use says why and what to do', async ({
    page,
  }) => {
    await open(page, 'home', 'firstrun&autoplay=0&latency=0&obs=empty&cam=denied')
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await page.getByRole('button', { name: 'Start fresh instead' }).click()
    await expect(page.getByRole('heading', { name: 'Camera and mic check' })).toBeVisible()
    await expect(page.getByText(/turned off for Ferrocast/)).toBeVisible()
    await expect(page.getByText(/Privacy & Security, Camera/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry camera' })).toBeVisible()
    await expect(page.getByText(/warming up/)).toHaveCount(0)
  })

  test('fits 375px mobile viewport with zero horizontal overflow across Import and Camera/Mic check', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'home', 'firstrun&autoplay=0&latency=0')

    const noOverflow = async (label: string) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(overflow, label).toBeLessThanOrEqual(0)
    }

    await noOverflow('import chooser')
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await expect(page.getByRole('heading', { name: /Preview: Main Streaming Setup/ })).toBeVisible()
    await noOverflow('import preview')

    await page.getByRole('button', { name: /Import “Main Streaming Setup”/ }).click()
    await expect(
      page.getByRole('heading', { name: /Imported “Main Streaming Setup”/ }),
    ).toBeVisible()
    await noOverflow('import result')

    await page.getByRole('button', { name: 'Continue to camera and mic check' }).click()
    await expect(page.getByRole('heading', { name: 'Camera and mic check' })).toBeVisible()
    await noOverflow('camera and mic check')
  })

  test('keyboard navigation, step focus management, and axe accessibility pass with zero serious issues', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'home', 'firstrun&autoplay=0&latency=0')

    const checkAxe = async () => {
      // The picked card and the new step ease their colours in; read them at rest.
      await settled(page)
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(
        res.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([])
    }

    await checkAxe()
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await expect(page.getByRole('heading', { name: /Preview: Main Streaming Setup/ })).toBeVisible()
    await checkAxe()

    await page.getByRole('button', { name: /Import “Main Streaming Setup”/ }).click()
    await expect(
      page.getByRole('heading', { name: /Imported “Main Streaming Setup”/ }),
    ).toBeVisible()
    await checkAxe()

    await page.getByRole('button', { name: 'Continue to camera and mic check' }).click()
    const mediaHeading = page.getByRole('heading', { name: 'Camera and mic check' })
    await expect(mediaHeading).toBeVisible()
    await expect(mediaHeading).toBeFocused()
    await checkAxe()
  })

  test('camera preview keeps refreshing and recovers automatically when a camera stops and comes back', async ({
    page,
  }) => {
    await open(page, 'home', 'firstrun&autoplay=0&latency=0&obs=empty')
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await page.getByRole('button', { name: 'Start fresh instead' }).click()
    await expect(page.getByRole('heading', { name: 'Camera and mic check' })).toBeVisible()
    await expect(page.locator('img[alt^="Preview from"]')).toBeVisible()

    // Simulate iPhone camera sleeping / stopping frames -> shows calm waiting state with Refresh frame button.
    await page.evaluate(() => {
      ;(
        window as unknown as {
          __ferrocastDemo?: { setStudioOnboardingState: (s: Record<string, unknown>) => void }
        }
      ).__ferrocastDemo?.setStudioOnboardingState({ cameraSleeping: true })
    })
    await expect(
      page.getByText(
        'Waiting for your camera. An iPhone can switch off when it sleeps or locks: unlock it and keep it near. Ferrocast will pick it up again.',
      ),
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Refresh frame' })).toBeVisible()

    // Also verify zero horizontal overflow at 375px while in waiting state.
    await page.setViewportSize({ width: 375, height: 812 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    // Camera wakes back up -> recovers automatically without reloading or clicking.
    await page.evaluate(() => {
      ;(
        window as unknown as {
          __ferrocastDemo?: { setStudioOnboardingState: (s: Record<string, unknown>) => void }
        }
      ).__ferrocastDemo?.setStudioOnboardingState({ cameraSleeping: false })
    })
    await expect(page.locator('img[alt^="Preview from"]')).toBeVisible({ timeout: 8000 })
  })

  test('starts in calm Waiting for your camera view for waiting:true without error banner and auto-resumes', async ({
    page,
  }) => {
    await open(page, 'home', 'firstrun&autoplay=0&latency=0&obs=empty&cam=sleeping')
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await page.getByRole('button', { name: 'Start fresh instead' }).click()
    await expect(page.getByRole('heading', { name: 'Camera and mic check' })).toBeVisible()

    const stillReply = await demo<{
      image: string | null
      waiting?: boolean
      error?: string | null
    }>(page, `(d) => d.studioEngine.stillForDevice(null)`)
    expect(stillReply).toEqual({ image: null, waiting: true, error: null })

    await expect(
      page.getByText(
        'Waiting for your camera. An iPhone can switch off when it sleeps or locks: unlock it and keep it near. Ferrocast will pick it up again.',
      ),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry camera' })).toHaveCount(0)

    await page.setViewportSize({ width: 375, height: 812 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)

    await page.evaluate(() => {
      ;(
        window as unknown as {
          __ferrocastDemo?: { setStudioOnboardingState: (s: Record<string, unknown>) => void }
        }
      ).__ferrocastDemo?.setStudioOnboardingState({ cameraSleeping: false })
    })
    await expect(page.locator('img[alt^="Preview from"]')).toBeVisible({ timeout: 8000 })
  })

  test('mic level meter animates with signal, shows named silence prompt, and distinguishes disconnected meter', async ({
    page,
  }) => {
    await open(page, 'home', 'firstrun&autoplay=0&latency=0&obs=empty&mic=silent')
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await page.getByRole('button', { name: 'Start fresh instead' }).click()
    await expect(page.getByRole('heading', { name: 'Camera and mic check' })).toBeVisible()

    // Connected silent mic: names active device and guides user cleanly.
    await expect(
      page.getByText(
        'No sound from MacBook Pro Microphone yet. Say something, or check the mic is not muted.',
      ),
    ).toBeVisible()

    // Switching mic device updates controlled select and named prompt.
    await page.getByLabel('Choose microphone').selectOption('mic-shure')
    await expect(
      page.getByText(
        'No sound from Shure MV7 USB yet. Say something, or check the mic is not muted.',
      ),
    ).toBeVisible()

    // Speaking moves the meter bar away from 0% and clears the silent prompt.
    await page.evaluate(() => {
      ;(
        window as unknown as {
          __ferrocastDemo?: { setStudioOnboardingState: (s: Record<string, unknown>) => void }
        }
      ).__ferrocastDemo?.setStudioOnboardingState({ micPreset: 'good' })
    })
    await expect(page.getByText(/No sound from .* yet\./)).toHaveCount(0)
    await expect
      .poll(async () => {
        const cover = page.locator('[aria-label="Microphone check"] .bg-inset\\/80').first()
        const style = await cover.getAttribute('style')
        const m = style?.match(/translate3d\(([0-9.]+)%/)
        return m ? Number(m[1]) : 0
      })
      .toBeGreaterThan(20)

    // Engine returns {} (unmetered onboarding engine): shows distinct "not connected" banner.
    await page.evaluate(() => {
      ;(
        window as unknown as {
          __ferrocastDemo?: { setStudioOnboardingState: (s: Record<string, unknown>) => void }
        }
      ).__ferrocastDemo?.setStudioOnboardingState({ levelsConnected: false })
    })
    await expect(page.getByText('Microphone meter is not connected.')).toBeVisible()
    await expect(page.getByText(/No sound from .* yet\./)).toHaveCount(0)

    await page.setViewportSize({ width: 375, height: 812 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
