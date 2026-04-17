import { expect, test } from '@playwright/test'
import { open } from './helpers'

// break-ui: the worst data a stream can throw at the dashboard.
const NAMES = [
  'x'.repeat(3000),
  'Z̵̢̛̛̹̟͓̞̬͈̙̓̿͒̈́̽̓a̴̧̛͉̠͙̺̤̓̏̍̀̕͝l̸̡̗̺̮̹̭̋̈́̊̈́̓g̵̢͎͍̙̫͎̃͗̾̈̚o̶̰̫͓̓',
  '‮evil.exe',
  'مرحبا بالعالم',
  '<img src=x onerror="window.__pwned=1">',
  '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥',
  'a',
]

test('hostile names and messages render as text, without breaking the layout', async ({ page }) => {
  await open(page, 'chat')
  await page.evaluate((names) => {
    const d = window.__ferrocastDemo
    if (!d) throw new Error('demo')
    for (const n of names) {
      const actor = {
        platform: 'twitch' as const,
        id: `u-${n.length}`,
        login: 'x',
        display_name: n,
        avatar_url: null,
        color: '#000000',
        roles: 1023,
        badges: [],
        anonymous: false,
      }
      d.inject(
        {
          type: 'chat_message',
          actor,
          content: {
            text: `${n} <script>window.__pwned=2</script> ${'w'.repeat(400)}`,
            fragments: [],
          },
          reply_to: null,
          is_action: false,
        },
        'twitch',
      )
      d.inject(
        {
          type: 'tip',
          actor: { ...actor, platform: 'tips' },
          money: { minor: 999999999999, currency: 'INR' },
          message: n,
          provider: 'razorpay',
          payment_ref: 'p',
          status: 'captured',
        },
        'tips',
      )
      d.inject({ type: 'raid', from: actor, viewers: 4294967295 }, 'twitch')
    }
  }, NAMES)
  await expect(page.getByText('مرحبا بالعالم').first()).toBeVisible()
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined()
  expect(await page.locator('main img[src="x"]').count()).toBe(0)
  for (const route of ['chat', 'home']) {
    await page.goto(`./?autoplay=0&latency=0#/${route}`)
    await page.evaluate((names) => {
      const d = window.__ferrocastDemo
      for (const n of names)
        d?.inject(
          {
            type: 'follow',
            actor: {
              platform: 'twitch',
              id: 'z',
              login: 'z',
              display_name: n,
              avatar_url: null,
              color: null,
              roles: 0,
              badges: [],
              anonymous: false,
            },
          },
          'twitch',
        )
    }, NAMES)
    await page.waitForTimeout(300)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow, route).toBeLessThanOrEqual(0)
  }
})

test('zero of everything still looks intentional', async ({ page }) => {
  await open(page, 'home', 'firstrun&autoplay=0&latency=0')
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await page.getByRole('button', { name: 'Use this look' }).click()
  await page.getByRole('button', { name: 'I’ll do it later' }).click()
  await expect(page.getByText('Nothing playing')).toBeVisible()
  await expect(page.getByText('Chat is quiet')).toBeVisible()
})
