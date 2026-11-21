import { expect, test } from '@playwright/test'
import { mountStudioWithOverlayDemo, runImportFlow } from './overlay-pack-mock'

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`overlay pack import (375px phone, ${scheme})`, () => {
    test.use({ viewport: { width: 375, height: 812 }, colorScheme: scheme })

    test('full pick -> preview -> import -> result -> undo fits at 375px without overflow', async ({
      page,
    }) => {
      const { consoleErrors, setAllowExpectedUploadReject } = await mountStudioWithOverlayDemo(page)
      await runImportFlow(page, setAllowExpectedUploadReject)
      expect(consoleErrors).toEqual([])
    })
  })
}
